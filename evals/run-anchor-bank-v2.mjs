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
 *
 * Model refresh (paper/pap-model-refresh-2026-10.md): current models, persona
 * arm, separate artifact, spend cap.
 *   node evals/run-anchor-bank-v2.mjs --model gpt-6-luna --arms cells,naive,persona \
 *     --items all --artifact model-refresh-run.json --max-usd 10
 *
 * Individual simulation (paper/pap-individual-sim-2026-10.md): every person in
 * a 1,200-record pool reports how likely they are to give each answer.
 *   node evals/run-anchor-bank-v2.mjs --model gpt-6-luna --arms persona-prob-pool \
 *     --items all --artifact individual-sim-gpt-6-luna-pool.json --max-usd 6
 *
 * Request settings per model (reasoning effort, thinking) come from
 * evals/models.mjs; the provider follows from the model.
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { anthropicText, costUsd, modelConfig, requestExtras } from "./models.mjs";

const ARGS = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = ARGS.indexOf(name);
  return i >= 0 ? ARGS[i + 1] : dflt;
};

const MODEL = arg("--model", "gpt-5-mini");
const PROVIDER = modelConfig(MODEL).provider;
if (arg("--provider", PROVIDER) !== PROVIDER) {
  throw new Error(`--provider ${arg("--provider")} disagrees with ${MODEL}'s provider ${PROVIDER}`);
}
const ARMS = arg("--arms", "cells,naive").split(",");
const ITEMS_SEL = arg("--items", "all");
const VARIANT = arg("--variant", "default");
const REPLICATE = arg("--replicate", "0");
const GRANULARITY = Number(arg("--granularity", "149"));
const CONCURRENCY = Number(arg("--concurrency", "25"));
const MAX_USD = Number(arg("--max-usd", "Infinity"));
const PERSONA_N = 150;
const SEED = 20260707 + Number(REPLICATE);

const PROMPT_VERSION = "prompts:v4-conditional-substantive";
const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(import.meta.dirname, "results");
const LOG_DIR = path.join(OUT_DIR, "logs");
const ARTIFACT = path.join(OUT_DIR, arg("--artifact", "anchor-bank-run-v2.json"));

// The OpenAI endpoint. Tests may point the runner at a local stand-in; any
// other host would receive the API key, so only localhost is accepted.
export const OFFICIAL_OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_BASE = process.env.EVAL_OPENAI_BASE_URL ?? OFFICIAL_OPENAI_BASE;
if (OPENAI_BASE !== OFFICIAL_OPENAI_BASE && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(OPENAI_BASE)) {
  throw new Error(`EVAL_OPENAI_BASE_URL must be a localhost URL, not ${OPENAI_BASE}`);
}
const API_BASE = PROVIDER === "anthropic" ? "https://api.anthropic.com/v1" : OPENAI_BASE;
// SHA-256 of evals/anchor-bank/fresh-pools-US.json.gz, as registered.
export const FRESH_POOLS_SHA256 = "24cf78d3bad16ab633510ce55945a53ddb651e89c72825ae45dbd694f4db50fa";

const SUBSET20 = [
  "gss_happy", "gss_health", "gss_satfin", "gss_trust", "gss_cappun",
  "gss_grass", "gss_confed", "gss_consci", "gss_natsoc", "gss_nateduc",
  "gss_polviews", "gss_fefam", "shed_b2", "shed_b3", "shed_400cash",
  "shed_ef1", "shed_ef7", "shed_bk1", "shed_work", "shed_housing_stress",
];
// Odd-indexed items of subset20 in itemId sort order (PAP v3 addendum).
export const PARAPHRASE10 = [...SUBSET20].sort().filter((_, i) => i % 2 === 1);
const VOLUNTEERED6 = ["gss_trust", "gss_fair", "gss_helpful", "gss_getahead", "gss_courts", "gss_divlaw"];

// Meaning-preserving stem rewrites for the paraphrase probe.
export const PARAPHRASES = {
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

let calls = 0, tokIn = 0, tokOut = 0, failedCalls = 0, spentUsd = 0;
let logPath = null;

function logCall(record) {
  appendFileSync(logPath, JSON.stringify({ api: API_BASE, ...record }) + "\n");
}

/** Replace a file in one step, so a crash mid-write cannot corrupt a resume file. */
function writeAtomic(file, text) {
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
}

/**
 * Calls, tokens and USD already in this run's log from earlier passes, so a
 * resumed run's counts and spend cap are cumulative. A line cut off by a
 * crash mid-write is kept, skipped and counted (the next pass starts on a new
 * line); every complete line must have gone to this run's endpoint.
 */
function priorUsage(file) {
  const prior = { calls: 0, failedCalls: 0, tokIn: 0, tokOut: 0, usd: 0, truncatedLines: 0 };
  if (!existsSync(file)) return prior;
  const text = readFileSync(file, "utf-8");
  for (const line of text.split("\n").filter(Boolean)) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      prior.truncatedLines++;
      continue;
    }
    if (row.api !== API_BASE) throw new Error(`${path.basename(file)} has calls to ${row.api}, not ${API_BASE}`);
    if (row.usage) {
      prior.calls++;
      prior.tokIn += row.usage.in;
      prior.tokOut += row.usage.out;
      prior.usd += costUsd(MODEL, row.usage.in, row.usage.out);
    } else prior.failedCalls++;
  }
  if (text && !text.endsWith("\n")) appendFileSync(file, "\n");
  return prior;
}

// What an individual-simulation run reads: the commit it ran from, whether
// those inputs differed from that commit, and their hashes.
const RUN_INPUTS = [
  "evals/run-anchor-bank-v2.mjs", "evals/models.mjs", "evals/anchor-bank/anchor-bank-v2.json",
  "evals/anchor-bank/fresh-pools-US.json.gz", "public/data/v1/US.json",
];

function provenance() {
  const sha = (f) => createHash("sha256").update(readFileSync(path.join(ROOT, f))).digest("hex");
  let commit = "unknown";
  try {
    const git = (cmd) => execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const head = git("git rev-parse HEAD");
    const dirty = git(`git status --porcelain --untracked-files=no -- ${RUN_INPUTS.join(" ")}`);
    commit = dirty ? `${head}-inputs-modified` : head;
  } catch {}
  return { commit, inputs: Object.fromEntries(RUN_INPUTS.map((f) => [f, sha(f)])) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 8;

function requestFor(system, user, json, maxTokens) {
  if (PROVIDER === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: {
        model: MODEL, max_tokens: maxTokens, system,
        messages: [{ role: "user", content: user }],
        ...requestExtras(MODEL),
      },
    };
  }
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_completion_tokens: maxTokens,
    ...requestExtras(MODEL),
  };
  if (json) body.response_format = { type: "json_object" };
  return {
    url: `${OPENAI_BASE}/chat/completions`,
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body,
  };
}

/**
 * One elicitation. Rate limits, server errors and network failures retry with
 * backoff; after MAX_ATTEMPTS the call is logged as failed and returns "" so
 * the arm counts it as a failed elicitation, or, with `strict` (the
 * individual-simulation arms), throws so the run stops and the item reruns on
 * resume. A request the API rejects (bad parameter, unknown model, exhausted
 * quota) stops the run: retrying cannot fix it.
 */
async function llm(system, user, meta, { json = true, maxTokens = 700, strict = false } = {}) {
  if (spentUsd > MAX_USD) {
    throw new Error(`spend cap reached: $${spentUsd.toFixed(2)} > --max-usd ${MAX_USD}`);
  }
  const req = requestFor(system, user, json, maxTokens);
  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(Math.min(30000, 1500 * 2 ** (attempt - 1)));
    let res, data;
    try {
      res = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body) });
      data = await res.json();
    } catch (err) {
      lastError = String(err);
      continue;
    }
    if (data?.error?.code === "insufficient_quota") throw new Error(`${MODEL}: ${data.error.message}`);
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}: ${data?.error?.message ?? ""}`;
      continue;
    }
    if (data.error) throw new Error(`${MODEL}: ${data.error.message}`);
    const content = PROVIDER === "anthropic" ? anthropicText(data) : data.choices?.[0]?.message?.content ?? "";
    const usage = PROVIDER === "anthropic"
      ? { in: data.usage?.input_tokens ?? 0, out: data.usage?.output_tokens ?? 0 }
      : { in: data.usage?.prompt_tokens ?? 0, out: data.usage?.completion_tokens ?? 0 };
    const stop = PROVIDER === "anthropic" ? data.stop_reason : data.choices?.[0]?.finish_reason;
    calls++;
    tokIn += usage.in;
    tokOut += usage.out;
    spentUsd += costUsd(MODEL, usage.in, usage.out);
    logCall({ at: new Date().toISOString(), responseId: data.id ?? null, system, user, content, usage, stop, ...meta });
    return content;
  }
  failedCalls++;
  logCall({ at: new Date().toISOString(), responseId: null, system, user, content: null, error: lastError, ...meta });
  if (strict) {
    throw new Error(`${MODEL}: a call failed ${MAX_ATTEMPTS} times (${lastError}); ${meta.itemId} is not saved and reruns on resume`);
  }
  return "";
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

export const DK_LINE =
  "Estimate shares among respondents who give a substantive answer; do not allocate any share to don't know or refused.";

export function cellPrompt(cell, item) {
  const { text, shape } = optionsBlock(item);
  const universe = item.universeNote ? ` ${item.universeNote}` : "";
  return `Survey question: "${wordingFor(item)}"
Estimate the percentage of the group below choosing each response option. ${DK_LINE}

Group: ${describeCell(cell)}${universe}

${text}

Reply with JSON only, integer percentages summing to 100:
${shape}`;
}

export function parseDist(content, item) {
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
  // Never checkpoint an item no cell answered: its aggregate would be NaN.
  if (ok.length === 0) throw new Error(`${item.itemId}: every cell elicitation failed`);
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

// ------------------------------------------------- persona arm (refresh)

// Ported from the v1 runner (PAP v2 persona arm) onto the v4 instrument:
// corrected wordings, the same presented options as cells and direct
// (volunteered options marked), universe notes. Records are drawn per item
// from a seed fixed by item and replicate, so every model answers as the
// same 150 people.
//
// Two sampling designs (model-refresh addendum, amendment 1):
//  - "persona": the released sample pool is already a weight-proportional
//    (PPS) sample of the population, so each pool record stands for the same
//    share of adults. Draw 150 with equal probability, weight draws equally.
//  - "persona-july": the July design, kept to measure the correction: draw
//    in proportion to weight, then weight each draw by its weight again,
//    which weights pool records by weight squared.
const PERSONA_SYSTEM = `You are answering a survey as a specific American adult. Answer as this person honestly would, based on their circumstances.

`;

/** System prompt for one person: the roleplay frame and their description. */
export function personaSystemFor(p) {
  return PERSONA_SYSTEM + describeSample(p);
}

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

/** Systematic weighted sample of n records (weight-proportional, one random start). */
export function weightedSample(records, n, rng) {
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

/** Equal-probability systematic sample of n records (one random start). */
export function equalProbabilitySample(records, n, rng) {
  if (records.length <= n) return [...records];
  const step = records.length / n;
  const start = rng() * step;
  return Array.from({ length: n }, (_, i) => records[Math.floor(start + i * step)]);
}

/** FNV-1a: a stable 32-bit seed per item, independent of run order. */
export function itemSeed(itemId, base) {
  let h = 0x811c9dc5;
  for (const ch of `${base}:${itemId}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const LETTERS = "ABCDEFGHIJ";

export function personaPrompt(item) {
  const opts = presentedOptions(item);
  const list = opts.map((o, pos) =>
    `${LETTERS[pos]}. ${o.label}${o.volunteered ? " (not read to respondents — some volunteer it)" : ""}`
  ).join("\n");
  const universe = item.universeNote ? `\n${item.universeNote}` : "";
  return {
    opts,
    text: `Survey question: "${wordingFor(item)}"${universe}

${list}

Respond with exactly:
RESPONSE: [the letter of your choice]
REASONING: [one short sentence]`,
  };
}

/**
 * Individual-probability prompt (amendment 2): the same person reports how
 * likely they are to give each answer, instead of naming one.
 */
export function personaProbPrompt(item) {
  const { text, shape } = optionsBlock(item);
  const universe = item.universeNote ? `\n${item.universeNote}` : "";
  return `Survey question: "${wordingFor(item)}"${universe}

${text}

How likely are you to give each of these answers? Reply with JSON only: integer percentages summing to 100, with no share for don't know or refused.
${shape}`;
}

/** Canonical option index chosen in a persona reply, or null. */
export function parsePersonaChoice(content, item, opts) {
  const m = content.match(/RESPONSE:\s*\**\s*\[?([A-J])\b/i);
  let pos = m ? LETTERS.indexOf(m[1].toUpperCase()) : -1;
  if (pos < 0 || pos >= opts.length) {
    const lower = content.toLowerCase();
    pos = opts.findIndex((o) => lower.includes(o.label.toLowerCase()));
  }
  return pos >= 0 && pos < opts.length ? opts[pos].idx : null;
}

const PERSONA_SLICE = {
  age_band: (p) => (p.age < 30 ? "18-29" : p.age < 45 ? "30-44" : p.age < 65 ? "45-64" : "65+"),
  sex: (p) => (p.is_female ? "women" : "men"),
  income_band: (p) => {
    const e = p.employment_income + p.self_employment_income;
    return e < 25000 ? "<$25k" : e < 75000 ? "$25k-$74,999" : e < 150000 ? "$75k-$149,999" : "$150k+";
  },
  tenure: (p) => (p.tenure_type === 1 ? "homeowners" : "renters or other housing"),
};

async function runPersonaArm(item, samples, design) {
  const rng = mulberry32(itemSeed(item.itemId, SEED));
  const july = design === "persona-july";
  const sample = july
    ? weightedSample(samples, PERSONA_N, rng)
    : equalProbabilitySample(samples, PERSONA_N, rng);
  const weightOf = (p) => (july ? p.weight : 1);
  const { opts, text } = personaPrompt(item);
  const results = await mapLimit(sample, CONCURRENCY, async (p, idx) => {
    const content = await llm(PERSONA_SYSTEM + describeSample(p), text, {
      arm: design, itemId: item.itemId, recordIdx: idx, variant: VARIANT, replicate: REPLICATE,
    }, { json: false });
    return { p, oi: parsePersonaChoice(content, item, opts) };
  });
  const ok = results.filter((r) => r.oi != null);
  const agg = (list) => {
    const w = list.reduce((s, r) => s + weightOf(r.p), 0);
    return item.options.map((_, oi) =>
      list.reduce((s, r) => s + (r.oi === oi ? weightOf(r.p) : 0), 0) / w
    );
  };
  const slices = {};
  if (VARIANT === "default") {
    for (const family of Object.keys(item.targets.slices ?? {})) {
      const byLabel = new Map();
      for (const r of ok) {
        const label = PERSONA_SLICE[family]?.(r.p);
        if (!label) continue;
        (byLabel.get(label) ?? byLabel.set(label, []).get(label)).push(r);
      }
      slices[family] = Object.fromEntries(
        [...byLabel.entries()]
          .filter(([, list]) => list.length >= 10)
          .map(([label, list]) => [label, agg(list)])
      );
    }
  }
  return { topline: ok.length ? agg(ok) : null, slices, n: PERSONA_N, failures: results.length - ok.length };
}

// Individual-probability arms. "persona-prob" (model refresh, amendment 2)
// asks 150 people drawn with equal probability from the released pool. The
// individual-simulation study (paper/pap-individual-sim-2026-10.md) adds
// "persona-prob-pool", which asks every record of the released pool, and
// "persona-prob-fresh", which asks every record of an independent pool drawn
// for the item from the full frame (pipeline/build_fresh_pools.py). Every
// pool is a weight-proportional sample, so people are weighted equally.
export const POOL_ARMS = ["persona-prob-pool", "persona-prob-fresh"];

/** The people an individual-probability arm asks for an item: [{p, poolIdx}]. */
export function probPeople(arm, item, samples, freshPools) {
  if (arm === "persona-prob") {
    const rng = mulberry32(itemSeed(item.itemId, SEED));
    return equalProbabilitySample(samples.map((p, poolIdx) => ({ p, poolIdx })), PERSONA_N, rng);
  }
  if (arm === "persona-prob-pool") return samples.map((p, poolIdx) => ({ p, poolIdx }));
  if (arm === "persona-prob-fresh") {
    const pool = freshPools?.items?.[item.itemId]?.records;
    if (!pool?.length) throw new Error(`${item.itemId}: no fresh pool (run pipeline/build_fresh_pools.py)`);
    return pool.map((p, poolIdx) => ({ p, poolIdx }));
  }
  throw new Error(`not an individual-probability arm: ${arm}`);
}

/**
 * Equal-weight estimates from individual distributions [{p, dist}] (dist null
 * when the reply did not parse): the topline averages everyone who answered,
 * each slice bin averages the people in it, and bins with fewer than 10
 * people are not reported.
 */
export function aggregateIndividuals(item, results) {
  const ok = results.filter((r) => r.dist);
  const agg = (list) => item.options.map((_, oi) => list.reduce((s, r) => s + r.dist[oi], 0) / list.length);
  const slices = {};
  if (VARIANT === "default") {
    for (const family of Object.keys(item.targets.slices ?? {})) {
      const byLabel = new Map();
      for (const r of ok) {
        const label = PERSONA_SLICE[family]?.(r.p);
        if (!label) continue;
        (byLabel.get(label) ?? byLabel.set(label, []).get(label)).push(r);
      }
      slices[family] = Object.fromEntries(
        [...byLabel.entries()]
          .filter(([, list]) => list.length >= 10)
          .map(([label, list]) => [label, agg(list)])
      );
    }
  }
  return { topline: ok.length ? agg(ok) : null, slices, n: results.length, failures: results.length - ok.length };
}

async function runPersonaProbArm(item, samples, arm, freshPools) {
  const people = probPeople(arm, item, samples, freshPools);
  const user = personaProbPrompt(item);
  const results = await mapLimit(people, CONCURRENCY, async ({ p, poolIdx }, idx) => {
    const content = await llm(personaSystemFor(p), user, {
      arm, itemId: item.itemId, recordIdx: idx,
      ...(arm === "persona-prob" ? {} : { poolIdx }),
      variant: VARIANT, replicate: REPLICATE,
    }, { strict: POOL_ARMS.includes(arm) });
    return { p, poolIdx, dist: parseDist(content, item) };
  });
  const res = aggregateIndividuals(item, results);
  // The pool arms keep every person's distribution, so the analysis can
  // subsample people (registered K-curve) and check these aggregates.
  if (POOL_ARMS.includes(arm)) {
    res.people = results.map((r) => [r.poolIdx, r.dist ? r.dist.map((v) => Number(v.toFixed(6))) : null]);
  }
  return res;
}

// -------------------------------------------------------------------- main

async function main() {
  if (PROVIDER === "openai" && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  if (PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
  mkdirSync(LOG_DIR, { recursive: true });

  const bank = JSON.parse(readFileSync(path.join(import.meta.dirname, "anchor-bank", "anchor-bank-v2.json"), "utf-8"));
  const us = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "v1", "US.json"), "utf-8"));
  const cells = coarsenCells(us.table.cells, GRANULARITY);
  let freshPools = null;
  if (ARMS.includes("persona-prob-fresh")) {
    const raw = readFileSync(path.join(import.meta.dirname, "anchor-bank", "fresh-pools-US.json.gz"));
    const sha = createHash("sha256").update(raw).digest("hex");
    if (sha !== FRESH_POOLS_SHA256) throw new Error(`fresh-pools-US.json.gz is not the registered file (SHA-256 ${sha})`);
    freshPools = JSON.parse(gunzipSync(raw).toString("utf-8"));
  }

  // Individual-simulation runs (paper/pap-individual-sim-2026-10.md): one arm
  // per run, the registered artifact name, all items, the default variant,
  // replicate and granularity, and a spend cap.
  const poolArm = ARMS.find((a) => POOL_ARMS.includes(a));
  if (poolArm) {
    const expected = `individual-sim-${MODEL}-${poolArm.replace("persona-prob-", "")}.json`;
    if (ARMS.length !== 1) throw new Error(`run ${poolArm} on its own, not with ${ARMS.join(",")}`);
    if (path.basename(ARTIFACT) !== expected) throw new Error(`${poolArm} writes --artifact ${expected}`);
    if (ITEMS_SEL !== "all") throw new Error(`${poolArm} runs --items all`);
    if (VARIANT !== "default" || REPLICATE !== "0" || GRANULARITY !== 149) {
      throw new Error(`${poolArm} runs the default variant, replicate 0 and granularity 149`);
    }
    if (!Number.isFinite(MAX_USD)) throw new Error(`${poolArm} needs --max-usd`);
  }
  console.log(`bank v2: ${bank.items.length} items; cells at granularity ${GRANULARITY}: ${cells.length}`);

  let items = bank.items;
  if (ITEMS_SEL === "subset20") items = items.filter((i) => SUBSET20.includes(i.itemId));
  else if (ITEMS_SEL === "paraphrase10") items = items.filter((i) => PARAPHRASE10.includes(i.itemId));
  else if (ITEMS_SEL === "volunteered6") items = items.filter((i) => VOLUNTEERED6.includes(i.itemId));
  else if (ITEMS_SEL !== "all") items = items.filter((i) => ITEMS_SEL.split(",").includes(i.itemId));
  if (VARIANT === "paraphrase") {
    // wordingFor() falls back to the original stem, which silently turned one
    // registered paraphrase item (gss_nateduc) into an unparaphrased rerun.
    const missing = items.filter((i) => !PARAPHRASES[i.itemId]).map((i) => i.itemId);
    if (missing.length) throw new Error(`no paraphrase for: ${missing.join(", ")}`);
  }

  const runTag = [VARIANT, `g${GRANULARITY}`, REPLICATE !== "0" ? `rep${REPLICATE}` : null]
    .filter(Boolean).join(":");
  logPath = path.join(LOG_DIR, `v2-${PROVIDER}-${MODEL}-${ARMS.join("+")}-${ITEMS_SEL}-${runTag}.jsonl`.replaceAll("/", "_"));

  const artifact = existsSync(ARTIFACT)
    ? JSON.parse(readFileSync(ARTIFACT, "utf-8"))
    : { version: "anchor-run-v2", bank: bank.version, promptVersion: PROMPT_VERSION, results: {} };
  if (poolArm) {
    if (existsSync(`${logPath}.gz`)) throw new Error(`${path.basename(logPath)}.gz exists: this run was finished and compressed`);
    artifact.api ??= API_BASE;
    if (artifact.api !== API_BASE) throw new Error(`${path.basename(ARTIFACT)} was written against ${artifact.api}, not ${API_BASE}`);
    const prior = priorUsage(logPath);
    ({ calls, failedCalls, tokIn, tokOut } = prior);
    spentUsd = prior.usd;
    if (spentUsd > 0) console.log(`resuming: $${spentUsd.toFixed(2)} already spent in ${path.basename(logPath)}`);
    // Every pass (first run or resume) records when it started and what it ran from.
    artifact.passes = [...(artifact.passes ?? []), {
      startedAt: new Date().toISOString(), ...provenance(), priorTruncatedLogLines: prior.truncatedLines,
    }];
    writeAtomic(ARTIFACT, JSON.stringify(artifact, null, 1));
  }

  for (const item of items) {
    artifact.results[item.itemId] ??= {};
    for (const arm of ARMS) {
      const key = `${arm}:${PROVIDER}:${MODEL}:${runTag}`;
      if (artifact.results[item.itemId][key]) continue;
      const t0 = Date.now();
      let res;
      if (arm === "cells") res = await runCellsArm(item, cells);
      else if (arm === "naive") res = await runNaiveArm(item);
      else if (arm === "persona" || arm === "persona-july") res = await runPersonaArm(item, us.samples, arm);
      else if (arm === "persona-prob" || POOL_ARMS.includes(arm)) res = await runPersonaProbArm(item, us.samples, arm, freshPools);
      else throw new Error(`arm ${arm} not supported in v2 runner`);
      artifact.results[item.itemId][key] = { ...res, ms: Date.now() - t0 };
      writeAtomic(ARTIFACT, JSON.stringify(artifact, null, 1));
      const pos = item.positiveOptions.reduce((s, oi) => s + (res.topline?.[oi] ?? 0), 0);
      const human = item.positiveOptions.reduce((s, oi) => s + item.targets.overall.dist[oi], 0);
      console.log(`${item.itemId} ${key}: est ${pos.toFixed(3)} vs human ${human.toFixed(3)} (err ${Math.abs(pos - human).toFixed(3)})`);
    }
  }
  artifact.usage ??= {};
  artifact.usage[`${PROVIDER}:${MODEL}:${ARMS.join("+")}:${ITEMS_SEL}:${runTag}`] = {
    calls, failedCalls, tokIn, tokOut, usd: Number(spentUsd.toFixed(4)),
    request: requestExtras(MODEL), at: new Date().toISOString(), log: path.basename(logPath),
    // Pool arms count every pass in the log, not only this one.
    ...(poolArm ? { api: API_BASE, ...provenance(), cumulative: true } : {}),
  };
  writeAtomic(ARTIFACT, JSON.stringify(artifact, null, 1));
  console.log(`done: ${calls} calls (${failedCalls} failed), tokens ${tokIn}/${tokOut}, ~$${spentUsd.toFixed(2)}, log ${path.basename(logPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
