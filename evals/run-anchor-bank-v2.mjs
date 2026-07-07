/**
 * Anchor-bank v2 runner (PAP v3 addendum). Differences from v1:
 *  - bank v2 (instrument-corrected wordings, volunteered flags, universe notes)
 *  - prompts:v4 — conditional-on-substantive-answer instruction; volunteered
 *    options marked "not read to respondents"; universe notes appended
 *  - FULL per-call logs for every arm: evals/results/logs/<runKey>.jsonl
 *  - variants: default | no-volunteered | order-reversed | paraphrase
 *  - replicates via --replicate N (separate artifact keys)
 *  - granularity ablation via --granularity 1|8|40 (149 = default table)
 *
 * Usage examples:
 *   node evals/run-anchor-bank-v2.mjs --arms cells,naive --items all
 *   node evals/run-anchor-bank-v2.mjs --arms cells,naive --items subset20 --replicate 2
 *   node evals/run-anchor-bank-v2.mjs --arms cells --items subset20 --variant order-reversed
 *   node evals/run-anchor-bank-v2.mjs --arms cells --items paraphrase10 --variant paraphrase
 *   node evals/run-anchor-bank-v2.mjs --arms cells --items volunteered6 --variant no-volunteered
 *   node evals/run-anchor-bank-v2.mjs --arms cells --items all --granularity 8
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ARGS = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = ARGS.indexOf(name);
  return i >= 0 ? ARGS[i + 1] : dflt;
};

const PROVIDER = arg("--provider", "openai");
const MODEL = arg("--model", "gpt-5-mini");
const ARMS = arg("--arms", "cells,naive").split(",");
const ITEMS_SEL = arg("--items", "all");
const VARIANT = arg("--variant", "default");
const REPLICATE = arg("--replicate", "0");
const GRANULARITY = Number(arg("--granularity", "149"));
const CONCURRENCY = Number(arg("--concurrency", "25"));
const PERSONA_N = 150;
const SEED = 20260707 + Number(REPLICATE);

const PROMPT_VERSION = "prompts:v4-conditional-substantive";
const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(import.meta.dirname, "results");
const LOG_DIR = path.join(OUT_DIR, "logs");
const ARTIFACT = path.join(OUT_DIR, "anchor-bank-run-v2.json");

const SUBSET20 = [
  "gss_happy", "gss_health", "gss_satfin", "gss_trust", "gss_cappun",
  "gss_grass", "gss_confed", "gss_consci", "gss_natsoc", "gss_nateduc",
  "gss_polviews", "gss_fefam", "shed_b2", "shed_b3", "shed_400cash",
  "shed_ef1", "shed_ef7", "shed_bk1", "shed_work", "shed_housing_stress",
];
// Odd-indexed items of subset20 in itemId sort order (PAP v3 addendum).
const PARAPHRASE10 = [...SUBSET20].sort().filter((_, i) => i % 2 === 1);
const VOLUNTEERED6 = ["gss_trust", "gss_fair", "gss_helpful", "gss_getahead", "gss_courts", "gss_divlaw"];

// Meaning-preserving stem rewrites for the paraphrase probe.
const PARAPHRASES = {
  gss_confed: "Thinking about the people running the executive branch of the federal government: would you say you have a great deal of confidence, only some confidence, or hardly any confidence at all in them?",
  gss_fefam: "Please say whether you strongly agree, agree, disagree, or strongly disagree with the following statement: things work out better for everyone when the man earns the money outside the home and the woman looks after the home and family.",
  gss_happy: "Considering your life these days as a whole, would you describe yourself as very happy, pretty happy, or not too happy?",
  gss_natsoc: "Thinking about government spending on Social Security: do you think the country is currently spending too much money on it, too little money, or about the right amount?",
  gss_polviews: "People often describe political views on a seven-point scale running from extremely liberal (point 1) to extremely conservative (point 7). Where on that scale would you place yourself?",
  gss_trust: "In general, do you feel that most people can be trusted, or do you feel that you can't be too careful when dealing with people?",
  shed_b2: "Which one of the following comes closest to describing how you are getting along financially these days?",
  shed_bk1: "At present, do you (or your spouse or partner) have a checking account, savings account, or money market account?",
  shed_ef7: "Given your finances right now, what is the largest emergency expense you could cover using only money you have saved?",
  shed_work: "During the last month, did you do any work for pay or profit?",
};

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
let logPath = null;

function logCall(record) {
  appendFileSync(logPath, JSON.stringify(record) + "\n");
}

async function llm(system, user, meta, { json = true, maxTokens = 700 } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let content, usage, responseId = null;
      if (PROVIDER === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL, max_tokens: maxTokens, system,
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
        usage = { in: data.usage?.input_tokens ?? 0, out: data.usage?.output_tokens ?? 0 };
        responseId = data.id ?? null;
      } else {
        const effort = MODEL.startsWith("gpt-5.") ? "none" : "minimal";
        const body = {
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_completion_tokens: maxTokens,
          reasoning_effort: effort,
        };
        if (json) body.response_format = { type: "json_object" };
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
        usage = { in: data.usage?.prompt_tokens ?? 0, out: data.usage?.completion_tokens ?? 0 };
        responseId = data.id ?? null;
      }
      calls++;
      tokIn += usage.in;
      tokOut += usage.out;
      logCall({ at: new Date().toISOString(), responseId, system, user, content, usage, ...meta });
      return content;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
}

function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ------------------------------------------------------- prompts (v4)

export const CELL_SYSTEM = `You are an expert survey methodologist estimating how specific groups of US adults respond to survey questions. Ground your estimates in empirical survey research, government statistics, and economic data about the group described — not stereotypes. Account for within-group diversity: distributions are rarely extreme. Reply with JSON only.`;

function presentedOptions(item) {
  // Returns [{idx (canonical), label, volunteered}] in presentation order.
  let opts = item.options.map((label, idx) => ({
    idx, label, volunteered: (item.volunteered ?? []).includes(idx),
  }));
  if (VARIANT === "no-volunteered") opts = opts.filter((o) => !o.volunteered);
  if (VARIANT === "order-reversed") opts = [...opts].reverse();
  return opts;
}

function wordingFor(item) {
  if (VARIANT === "paraphrase" && PARAPHRASES[item.itemId]) return PARAPHRASES[item.itemId];
  return item.wording;
}

function keyFor(pos) {
  return `option_${pos}`; // position key in PRESENTED order; mapped back on parse
}

function optionsBlock(item) {
  const opts = presentedOptions(item);
  const lines = opts.map((o, pos) =>
    `${keyFor(pos)}: ${o.label}${o.volunteered ? " (not read to respondents — some volunteer it)" : ""}`
  );
  return {
    text: "Response options:\n" + lines.join("\n"),
    shape: `{${opts.map((_, pos) => `"${keyFor(pos)}": n`).join(", ")}}`,
    opts,
  };
}

const DK_LINE =
  "Estimate shares among respondents who give a substantive answer; do not allocate any share to don't know or refused.";

function cellPrompt(cell, item) {
  const { text, shape } = optionsBlock(item);
  const universe = item.universeNote ? ` ${item.universeNote}` : "";
  return `Survey question: "${wordingFor(item)}"
Estimate the percentage of the group below choosing each response option. ${DK_LINE}

Group: ${describeCell(cell)}${universe}

${text}

Reply with JSON only, integer percentages summing to 100:
${shape}`;
}

function parseDist(content, item) {
  const raw = extractJson(content);
  if (!raw) return null;
  const { opts } = optionsBlock(item);
  const valsByPos = opts.map((_, pos) => {
    const v = raw[keyFor(pos)];
    return typeof v === "number" && v >= 0 ? v : null;
  });
  if (valsByPos.some((v) => v == null)) {
    // tolerate label-keyed replies
    const byLabel = opts.map((o) => {
      const v = raw[o.label];
      return typeof v === "number" && v >= 0 ? v : null;
    });
    if (byLabel.some((v) => v == null)) return null;
    return normalizeToCanonical(byLabel, opts, item);
  }
  return normalizeToCanonical(valsByPos, opts, item);
}

function normalizeToCanonical(valsByPos, opts, item) {
  const total = valsByPos.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const dist = new Array(item.options.length).fill(0);
  opts.forEach((o, pos) => {
    dist[o.idx] = valsByPos[pos] / total;
  });
  return dist; // canonical order; omitted (no-volunteered) options carry 0
}

export function describeCell(cell) {
  const parts = [];
  if (cell.age) parts.push(`aged ${cell.age}`);
  if (cell.sex) parts.push(cell.sex);
  if (cell.income) {
    parts.push(
      cell.income === "$0 earned"
        ? "with no wage or self-employment income this year"
        : `with personal earned income of ${cell.income} per year`
    );
  }
  if (cell.detailed) {
    parts.push(cell.tenure, cell.children, cell.benefits);
    if (cell.social_security) parts.push(cell.social_security);
  }
  return parts.length ? `US adults who are ${parts.join(", ")}.` : "US adults.";
}

// --------------------------------------------------- audiences + slices

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
  if (family === "age_band") return cell.age ?? null;
  if (family === "sex") return cell.sex ?? null;
  if (family === "income_band") {
    if (!cell.income) return null;
    return cell.income === "$0 earned" || cell.income === "$1-$24,999" ? "<$25k" : cell.income;
  }
  if (family === "tenure") return cell.detailed ? cell.tenure : null;
  return null;
}

function coarsenCells(cells, granularity) {
  if (granularity >= 149) return cells;
  const keyFns = {
    1: () => [],
    8: (c) => [c.age, c.sex],
    40: (c) => [c.age, c.income, c.sex],
  };
  const keyFn = keyFns[granularity];
  const groups = new Map();
  for (const c of cells) {
    const keyParts = keyFn(c);
    const key = JSON.stringify(keyParts);
    const cur = groups.get(key) ?? {
      age: keyParts.includes(c.age) ? c.age : undefined,
      sex: keyParts.includes(c.sex) ? c.sex : undefined,
      income: keyParts.includes(c.income) ? c.income : undefined,
      detailed: false, weight: 0, n: 0,
    };
    cur.weight += c.weight;
    cur.n += c.n;
    groups.set(key, cur);
  }
  return [...groups.values()];
}

// -------------------------------------------------------------------- arms

async function runCellsArm(item, cells) {
  const results = await mapLimit(cells, CONCURRENCY, async (cell, idx) => {
    const content = await llm(CELL_SYSTEM, cellPrompt(cell, item), {
      arm: "cells", itemId: item.itemId, cellIdx: idx, variant: VARIANT,
      granularity: GRANULARITY, replicate: REPLICATE,
    });
    return { cell, dist: parseDist(content, item) };
  });
  const ok = results.filter((r) => r.dist);
  const agg = (list) => {
    const w = list.reduce((s, r) => s + r.cell.weight, 0);
    return item.options.map((_, oi) =>
      list.reduce((s, r) => s + r.cell.weight * r.dist[oi], 0) / w
    );
  };
  const slices = {};
  if (GRANULARITY >= 149 && VARIANT !== "no-volunteered") {
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
  }
  return { topline: agg(ok), slices, cellCount: results.length, failures: results.length - ok.length };
}

async function runNaiveArm(item) {
  const { text, shape } = optionsBlock(item);
  const universe = item.universeNote ? ` ${item.universeNote}` : "";
  const ask = (audience) =>
    `Survey question: "${wordingFor(item)}"
Estimate the percentage of ${audience} choosing each response option. ${DK_LINE}${universe}

${text}

Reply with JSON only, integer percentages summing to 100:
${shape}`;

  const estimate = async (audience, meta) =>
    parseDist(await llm(CELL_SYSTEM, ask(audience), meta), item);

  const topline = await estimate("US adults", {
    arm: "naive", itemId: item.itemId, audience: "US adults", variant: VARIANT, replicate: REPLICATE,
  });
  const slices = {};
  if (VARIANT === "default") {
    for (const [family, bins] of Object.entries(item.targets.slices ?? {})) {
      slices[family] = {};
      await mapLimit(Object.keys(bins), 6, async (label) => {
        const phrase = SLICE_PHRASES[family]?.(label);
        if (!phrase) return;
        slices[family][label] = await estimate(phrase, {
          arm: "naive", itemId: item.itemId, audience: phrase, variant: VARIANT, replicate: REPLICATE,
        });
      });
    }
  }
  return { topline, slices };
}

// -------------------------------------------------------------------- main

async function main() {
  if (PROVIDER === "openai" && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  if (PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  mkdirSync(LOG_DIR, { recursive: true });

  const bank = JSON.parse(readFileSync(path.join(import.meta.dirname, "anchor-bank", "anchor-bank-v2.json"), "utf-8"));
  const us = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "v1", "US.json"), "utf-8"));
  const cells = coarsenCells(us.table.cells, GRANULARITY);
  console.log(`bank v2: ${bank.items.length} items; cells at granularity ${GRANULARITY}: ${cells.length}`);

  let items = bank.items;
  if (ITEMS_SEL === "subset20") items = items.filter((i) => SUBSET20.includes(i.itemId));
  else if (ITEMS_SEL === "paraphrase10") items = items.filter((i) => PARAPHRASE10.includes(i.itemId));
  else if (ITEMS_SEL === "volunteered6") items = items.filter((i) => VOLUNTEERED6.includes(i.itemId));
  else if (ITEMS_SEL !== "all") items = items.filter((i) => ITEMS_SEL.split(",").includes(i.itemId));

  const runTag = [VARIANT, `g${GRANULARITY}`, REPLICATE !== "0" ? `rep${REPLICATE}` : null]
    .filter(Boolean).join(":");
  logPath = path.join(LOG_DIR, `v2-${PROVIDER}-${MODEL}-${ARMS.join("+")}-${ITEMS_SEL}-${runTag}.jsonl`.replaceAll("/", "_"));

  const artifact = existsSync(ARTIFACT)
    ? JSON.parse(readFileSync(ARTIFACT, "utf-8"))
    : { version: "anchor-run-v2", bank: bank.version, promptVersion: PROMPT_VERSION, results: {} };

  for (const item of items) {
    artifact.results[item.itemId] ??= {};
    for (const arm of ARMS) {
      const key = `${arm}:${PROVIDER}:${MODEL}:${runTag}`;
      if (artifact.results[item.itemId][key]) continue;
      const t0 = Date.now();
      let res;
      if (arm === "cells") res = await runCellsArm(item, cells);
      else if (arm === "naive") res = await runNaiveArm(item);
      else throw new Error(`arm ${arm} not supported in v2 runner`);
      artifact.results[item.itemId][key] = { ...res, ms: Date.now() - t0 };
      writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 1));
      const pos = item.positiveOptions.reduce((s, oi) => s + (res.topline?.[oi] ?? 0), 0);
      const human = item.positiveOptions.reduce((s, oi) => s + item.targets.overall.dist[oi], 0);
      console.log(`${item.itemId} ${key}: est ${pos.toFixed(3)} vs human ${human.toFixed(3)} (err ${Math.abs(pos - human).toFixed(3)})`);
    }
  }
  artifact.usage ??= {};
  artifact.usage[`${PROVIDER}:${MODEL}:${ARMS.join("+")}:${ITEMS_SEL}:${runTag}`] =
    { calls, tokIn, tokOut, at: new Date().toISOString(), log: path.basename(logPath) };
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 1));
  console.log(`done: ${calls} calls, tokens ${tokIn}/${tokOut}, log ${path.basename(logPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
