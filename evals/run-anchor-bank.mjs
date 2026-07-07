/**
 * Anchor-bank elicitation runner. Arms and metrics registered in
 * paper/pap-v2.md; human targets in evals/anchor-bank/anchor-bank-v1.json.
 *
 * Usage:
 *   node evals/run-anchor-bank.mjs --arms cells,naive --model gpt-5-mini
 *   node evals/run-anchor-bank.mjs --arms persona --model gpt-5-mini --items subset20
 *   node evals/run-anchor-bank.mjs --arms cells --model gpt-5.2 --items subset20
 *   node evals/run-anchor-bank.mjs --arms cells --provider anthropic --model claude-haiku-4-5-20251001 --items subset20
 *
 * Checkpointed per item+arm+model in the artifact; safe to re-run.
 * Cell-level predictions append to anchor-cells-predictions.jsonl for PPI.
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";

const ARGS = process.argv.slice(2);
function arg(name, dflt) {
  const i = ARGS.indexOf(name);
  return i >= 0 ? ARGS[i + 1] : dflt;
}

const PROVIDER = arg("--provider", "openai");
const MODEL = arg("--model", "gpt-5-mini");
const ARMS = arg("--arms", "cells,naive").split(",");
const ITEMS_SEL = arg("--items", "all");
const PERSONA_N = 150;
const CONCURRENCY = Number(arg("--concurrency", "25"));
const SEED = 20260707;

const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(import.meta.dirname, "results");
const ARTIFACT = path.join(OUT_DIR, "anchor-bank-run-v1.json");
const CELL_PRED_LOG = path.join(OUT_DIR, "anchor-cells-predictions.jsonl");

const SUBSET20 = [
  "gss_happy", "gss_health", "gss_satfin", "gss_trust", "gss_cappun",
  "gss_grass", "gss_confed", "gss_consci", "gss_natsoc", "gss_nateduc",
  "gss_polviews", "gss_fefam", "shed_b2", "shed_b3", "shed_400cash",
  "shed_ef1", "shed_ef7", "shed_bk1", "shed_work", "shed_housing_stress",
];

// ------------------------------------------------------------------- utils

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

let calls = 0, tokIn = 0, tokOut = 0;

async function llm(system, user, { json = true, maxTokens = 700 } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let res, content;
      if (PROVIDER === "anthropic") {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
          }),
        });
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
          continue;
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        content = data.content?.[0]?.text ?? "";
        tokIn += data.usage?.input_tokens ?? 0;
        tokOut += data.usage?.output_tokens ?? 0;
      } else {
        const body = {
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_completion_tokens: maxTokens,
          reasoning_effort: "minimal",
        };
        if (json) body.response_format = { type: "json_object" };
        res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
          continue;
        }
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        content = data.choices?.[0]?.message?.content ?? "";
        tokIn += data.usage?.prompt_tokens ?? 0;
        tokOut += data.usage?.completion_tokens ?? 0;
      }
      calls++;
      return content;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { return null; }
    }
    return null;
  }
}

// -------------------------------------------------------- formats + prompts
// Parity with src/engine/prompts.ts (prompts:v3-expert-cell).

const CELL_SYSTEM = `You are an expert survey methodologist estimating how specific groups of US adults respond to survey questions. Ground your estimates in empirical survey research, government statistics, and economic data about the group described — not stereotypes. Account for within-group diversity: distributions are rarely extreme. Reply with JSON only.`;

function isBinary(item) {
  return item.options.length === 2 && item.options[0] === "Yes" && item.options[1] === "No";
}

function optionKeys(item) {
  return isBinary(item) ? ["yes", "no"] : item.options.map((_, i) => `option_${i}`);
}

function optionsBlock(item) {
  if (isBinary(item)) return { text: "Response options: yes, no.", shape: `{"yes": n, "no": n}` };
  const keys = optionKeys(item);
  return {
    text: "Response options:\n" + item.options.map((o, i) => `${keys[i]}: ${o}`).join("\n"),
    shape: `{${keys.map((k) => `"${k}": n`).join(", ")}}`,
  };
}

function describeCell(cell) {
  const parts = [`aged ${cell.age}`, cell.sex];
  parts.push(
    cell.income === "$0 earned"
      ? "with no wage or self-employment income this year"
      : `with personal earned income of ${cell.income} per year`
  );
  if (cell.detailed) {
    parts.push(cell.tenure, cell.children, cell.benefits);
    if (cell.social_security) parts.push(cell.social_security);
  }
  return `US adults who are ${parts.join(", ")}.`;
}

function cellPrompt(cell, item) {
  const { text, shape } = optionsBlock(item);
  return `Survey question: "${item.wording}"
Estimate the percentage of the group below choosing each response option.

Group: ${describeCell(cell)}

${text}

Reply with JSON only, integer percentages summing to 100:
${shape}`;
}

function parseDist(content, item) {
  const raw = extractJson(content);
  if (!raw) return null;
  const keys = optionKeys(item);
  let vals = keys.map((k) => (typeof raw[k] === "number" && raw[k] >= 0 ? raw[k] : null));
  if (vals.some((v) => v == null)) {
    vals = item.options.map((label) =>
      typeof raw[label] === "number" && raw[label] >= 0 ? raw[label] : null
    );
    if (vals.some((v) => v == null)) return null;
  }
  const total = vals.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  return vals.map((v) => v / total);
}

// --------------------------------------------------------------- audiences

const SLICE_PHRASES = {
  age_band: (l) => `US adults aged ${l}`,
  sex: (l) => (l === "women" ? "US women (adults)" : "US men (adults)"),
  income_band: (l) => ({
    "<$25k": "US adults with household income under $25,000",
    "$25k-$74,999": "US adults with household income between $25,000 and $74,999",
    "$75k-$149,999": "US adults with household income between $75,000 and $149,999",
    "$150k+": "US adults with household income of $150,000 or more",
  })[l],
  tenure: (l) =>
    l === "homeowners"
      ? "US adults who own their home"
      : "US adults who rent their home or have another housing arrangement",
};

function cellSliceLabel(cell, family) {
  if (family === "age_band") return cell.age;
  if (family === "sex") return cell.sex;
  if (family === "income_band")
    return cell.income === "$0 earned" || cell.income === "$1-$24,999" ? "<$25k" : cell.income;
  if (family === "tenure") return cell.detailed ? cell.tenure : null;
  return null;
}

// -------------------------------------------------------------------- arms

async function runCellsArm(item, cells) {
  const results = await mapLimit(cells, CONCURRENCY, async (cell, idx) => {
    const content = await llm(CELL_SYSTEM, cellPrompt(cell, item));
    const dist = parseDist(content, item);
    if (dist) {
      appendFileSync(
        CELL_PRED_LOG,
        JSON.stringify({ itemId: item.itemId, model: MODEL, provider: PROVIDER, cellIdx: idx, dist }) + "\n"
      );
    }
    return { cell, dist };
  });
  const ok = results.filter((r) => r.dist);
  const agg = (list) => {
    const w = list.reduce((s, r) => s + r.cell.weight, 0);
    return item.options.map((_, oi) =>
      list.reduce((s, r) => s + r.cell.weight * r.dist[oi], 0) / w
    );
  };
  const slices = {};
  for (const family of Object.keys(item.targets.slices ?? {})) {
    const byLabel = new Map();
    for (const r of ok) {
      const label = cellSliceLabel(r.cell, family);
      if (!label) continue;
      (byLabel.get(label) ?? byLabel.set(label, []).get(label)).push(r);
    }
    slices[family] = Object.fromEntries(
      [...byLabel.entries()].map(([label, list]) => [label, agg(list)])
    );
  }
  return {
    topline: agg(ok),
    slices,
    cellCount: results.length,
    failures: results.length - ok.length,
  };
}

async function runNaiveArm(item) {
  const { text } = optionsBlock(item);
  const keys = optionKeys(item);
  const ask = (audience) =>
    `Survey question: "${item.wording}"
Estimate the percentage of ${audience} choosing each response option.

${text}

Reply with JSON only, integer percentages summing to 100:
{${keys.map((k) => `"${k}": n`).join(", ")}}`;

  async function estimate(audience) {
    const content = await llm(CELL_SYSTEM, ask(audience));
    return parseDist(content, item);
  }

  const topline = await estimate("US adults");
  const slices = {};
  for (const [family, bins] of Object.entries(item.targets.slices ?? {})) {
    slices[family] = {};
    await mapLimit(Object.keys(bins), 6, async (label) => {
      const phrase = SLICE_PHRASES[family]?.(label);
      if (!phrase) return;
      slices[family][label] = await estimate(phrase);
    });
  }
  return { topline, slices };
}

const PERSONA_SYSTEM = `You are answering a survey as a specific American adult. Answer as this person honestly would, based on their circumstances.

`;

function describeSample(p) {
  const earned = Math.round(p.employment_income + p.self_employment_income);
  const parts = [
    `You are a ${p.age}-year-old ${p.is_female ? "woman" : "man"} living in the United States`,
    earned > 0
      ? `with personal earned income of about $${earned.toLocaleString()} per year`
      : "with no wage or self-employment income this year",
    p.tenure_type === 1 ? "You own your home" : "You rent your home",
    p.children_count > 0
      ? `You have ${p.children_count} child${p.children_count > 1 ? "ren" : ""} at home`
      : "You have no children at home",
  ];
  const b = [];
  if (p.receives_snap) b.push("SNAP");
  if (p.receives_ssi) b.push("SSI");
  if (p.receives_social_security) b.push("Social Security");
  if (p.receives_unemployment) b.push("unemployment insurance");
  if (b.length) parts.push(`You receive ${b.join(", ")}`);
  if (p.is_in_college) parts.push("You are in college");
  if (p.is_disabled) parts.push("You have a disability");
  return parts.join(". ") + ".";
}

function weightedSample(records, n, rng) {
  const total = records.reduce((s, p) => s + p.weight, 0);
  const step = total / n;
  let target = rng() * step, acc = 0;
  const out = [];
  for (const p of records) {
    acc += p.weight;
    while (acc >= target && out.length < n) {
      out.push(p);
      target += step;
    }
    if (out.length >= n) break;
  }
  return out;
}

async function runPersonaArm(item, samples, rng) {
  const sample = weightedSample(samples, PERSONA_N, rng);
  const letters = "ABCDEFG";
  const optionList = item.options.map((o, i) => `${letters[i]}. ${o}`).join("\n");
  const results = await mapLimit(sample, CONCURRENCY, async (p) => {
    const content = await llm(
      PERSONA_SYSTEM + describeSample(p),
      `Survey question: "${item.wording}"

${optionList}

Respond with exactly:
RESPONSE: [the letter of your choice]
REASONING: [one short sentence]`,
      { json: false }
    );
    const m = content.match(/RESPONSE:\s*([A-G])/i);
    let oi = m ? letters.indexOf(m[1].toUpperCase()) : -1;
    if (oi < 0 || oi >= item.options.length) {
      oi = item.options.findIndex((o) => content.toLowerCase().includes(o.toLowerCase()));
    }
    return { p, oi: oi >= 0 && oi < item.options.length ? oi : null };
  });
  const ok = results.filter((r) => r.oi != null);
  const agg = (list) => {
    const w = list.reduce((s, r) => s + r.p.weight, 0);
    return item.options.map((_, oi) =>
      list.reduce((s, r) => s + (r.oi === oi ? r.p.weight : 0), 0) / w
    );
  };
  const sliceOf = {
    age_band: (p) => (p.age < 30 ? "18-29" : p.age < 45 ? "30-44" : p.age < 65 ? "45-64" : "65+"),
    sex: (p) => (p.is_female ? "women" : "men"),
    income_band: (p) => {
      const e = p.employment_income + p.self_employment_income;
      return e < 25000 ? "<$25k" : e < 75000 ? "$25k-$74,999" : e < 150000 ? "$75k-$149,999" : "$150k+";
    },
    tenure: (p) => (p.tenure_type === 1 ? "homeowners" : "renters or other housing"),
  };
  const slices = {};
  for (const family of Object.keys(item.targets.slices ?? {})) {
    const byLabel = new Map();
    for (const r of ok) {
      const label = sliceOf[family]?.(r.p);
      if (!label) continue;
      (byLabel.get(label) ?? byLabel.set(label, []).get(label)).push(r);
    }
    slices[family] = Object.fromEntries(
      [...byLabel.entries()]
        .filter(([, list]) => list.length >= 10)
        .map(([label, list]) => [label, agg(list)])
    );
  }
  return { topline: agg(ok), slices, n: PERSONA_N, failures: results.length - ok.length };
}

// -------------------------------------------------------------------- main

async function main() {
  if (PROVIDER === "openai" && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  if (PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  mkdirSync(OUT_DIR, { recursive: true });

  const bank = JSON.parse(readFileSync(path.join(import.meta.dirname, "anchor-bank", "anchor-bank-v1.json"), "utf-8"));
  const us = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "v1", "US.json"), "utf-8"));
  const cells = us.table.cells;
  const samples = us.samples;

  let items = bank.items;
  if (ITEMS_SEL === "subset20") items = items.filter((i) => SUBSET20.includes(i.itemId));
  else if (ITEMS_SEL !== "all") items = items.filter((i) => ITEMS_SEL.split(",").includes(i.itemId));

  const artifact = existsSync(ARTIFACT)
    ? JSON.parse(readFileSync(ARTIFACT, "utf-8"))
    : { version: "anchor-run-v1", bank: bank.version, cellTable: "US:v1", results: {} };

  const rng = mulberry32(SEED);
  for (const item of items) {
    artifact.results[item.itemId] ??= {};
    for (const arm of ARMS) {
      const key = `${arm}:${PROVIDER}:${MODEL}`;
      if (artifact.results[item.itemId][key]) continue;
      const t0 = Date.now();
      let res;
      if (arm === "cells") res = await runCellsArm(item, cells);
      else if (arm === "naive") res = await runNaiveArm(item);
      else if (arm === "persona") res = await runPersonaArm(item, samples, rng);
      else throw new Error(`unknown arm ${arm}`);
      artifact.results[item.itemId][key] = { ...res, ms: Date.now() - t0 };
      writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 1));
      const pos = item.positiveOptions.reduce((s, oi) => s + (res.topline?.[oi] ?? 0), 0);
      const human = item.positiveOptions.reduce((s, oi) => s + item.targets.overall.dist[oi], 0);
      console.log(
        `${item.itemId} ${key}: est ${pos.toFixed(3)} vs human ${human.toFixed(3)} (err ${(Math.abs(pos - human)).toFixed(3)})`
      );
    }
  }
  artifact.usage ??= {};
  artifact.usage[`${PROVIDER}:${MODEL}:${ARMS.join("+")}:${ITEMS_SEL}`] = { calls, tokIn, tokOut, at: new Date().toISOString() };
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 1));
  console.log(`\ndone: ${calls} calls, tokens ${tokIn}/${tokOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
