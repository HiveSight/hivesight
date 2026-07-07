/**
 * Small-area validation: state-level estimates for BRFSS items across 49
 * states, three arms (PAP v2 small-area section):
 *   state-cells    — coarse age x sex cells (8) from each state's cell table,
 *                    state named in the group description, weighted aggregate
 *   state-naive    — one direct estimate per state
 *   national-const — the national cells estimate applied to every state
 *
 * ~4 items x 49 states x (8 + 1) calls + 4 x 9 national calls ~= 1,800 calls.
 *
 * Usage: node evals/run-brfss-states.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const MODEL = "gpt-5-mini";
const CONCURRENCY = 25;
const ROOT = path.join(import.meta.dirname, "..");
const TARGETS = path.join(ROOT, "paper", "artifacts", "brfss-state-targets.json");
const OUT = path.join(import.meta.dirname, "results", "brfss-states-run-v1.json");

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "the District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

let calls = 0, tokIn = 0, tokOut = 0;

async function llm(system, user) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_completion_tokens: 700,
          reasoning_effort: "minimal",
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
        continue;
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      calls++;
      tokIn += data.usage?.prompt_tokens ?? 0;
      tokOut += data.usage?.completion_tokens ?? 0;
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
}

const SYSTEM = `You are an expert survey methodologist estimating how specific groups of US adults respond to survey questions. Ground your estimates in empirical survey research, government statistics, and economic data about the group described — not stereotypes. Account for within-group diversity: distributions are rarely extreme. Reply with JSON only.`;

function keysFor(item) {
  return item.options.length === 2 && item.options[0] === "Yes"
    ? ["yes", "no"]
    : item.options.map((_, i) => `option_${i}`);
}

function optionsBlock(item) {
  const keys = keysFor(item);
  if (keys[0] === "yes") return { text: "Response options: yes, no.", shape: `{"yes": n, "no": n}` };
  return {
    text: "Response options:\n" + item.options.map((o, i) => `${keys[i]}: ${o}`).join("\n"),
    shape: `{${keys.map((k) => `"${k}": n`).join(", ")}}`,
  };
}

function parseShares(content, item) {
  let raw;
  try {
    raw = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { raw = JSON.parse(m[0]); } catch { return null; }
  }
  const keys = keysFor(item);
  const vals = keys.map((k) => (typeof raw[k] === "number" && raw[k] >= 0 ? raw[k] : null));
  if (vals.some((v) => v == null)) return null;
  const total = vals.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  return vals.map((v) => v / total);
}

function posShare(dist, item) {
  return item.positiveOptions.reduce((s, oi) => s + dist[oi], 0);
}

async function estimateGroups(item, groups, place) {
  const { text, shape } = optionsBlock(item);
  const results = await Promise.all(
    groups.map(async ({ label, weight }) => {
      const user = `Survey question: "${item.wording}"
Estimate the percentage of the group below choosing each response option.

Group: Adults in ${place} who are ${label}.

${text}

Reply with JSON only, integer percentages summing to 100:
${shape}`;
      const dist = parseShares(await llm(SYSTEM, user), item);
      return { weight, dist };
    })
  );
  const ok = results.filter((r) => r.dist);
  if (!ok.length) return null;
  const w = ok.reduce((s, r) => s + r.weight, 0);
  return ok.reduce((s, r) => s + (r.weight / w) * posShare(r.dist, item), 0);
}

async function estimateDirect(item, place) {
  const { text, shape } = optionsBlock(item);
  const user = `Survey question: "${item.wording}"
Estimate the percentage of adults in ${place} choosing each response option.

${text}

Reply with JSON only, integer percentages summing to 100:
${shape}`;
  const dist = parseShares(await llm(SYSTEM, user), item);
  return dist ? posShare(dist, item) : null;
}

function coarseGroups(table) {
  const groups = new Map();
  for (const cell of table.cells) {
    const key = `aged ${cell.age}, ${cell.sex}`;
    groups.set(key, (groups.get(key) ?? 0) + cell.weight);
  }
  return [...groups.entries()].map(([label, weight]) => ({ label, weight }));
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

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const targets = JSON.parse(readFileSync(TARGETS, "utf-8"));
  mkdirSync(path.dirname(OUT), { recursive: true });
  const artifact = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf-8"))
    : { version: "brfss-states-v1", model: MODEL, items: {} };

  for (const [itemId, item] of Object.entries(targets.items)) {
    artifact.items[itemId] ??= { states: {} };
    const rec = artifact.items[itemId];

    if (rec.nationalCells == null) {
      const us = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "v1", "US.json"), "utf-8"));
      rec.nationalCells = await estimateGroups(item, coarseGroups(us.table), "the United States");
      rec.nationalNaive = await estimateDirect(item, "the United States");
      writeFileSync(OUT, JSON.stringify(artifact, null, 1));
    }

    const states = Object.keys(item.states).filter((st) => !rec.states[st]);
    await mapLimit(states, 6, async (st) => {
      const table = JSON.parse(
        readFileSync(path.join(ROOT, "public", "data", "v1", `${st}.json`), "utf-8")
      ).table;
      const place = STATE_NAMES[st];
      const [cellsEst, naiveEst] = await Promise.all([
        estimateGroups(item, coarseGroups(table), place),
        estimateDirect(item, place),
      ]);
      rec.states[st] = { cells: cellsEst, naive: naiveEst, human: item.states[st].share };
      writeFileSync(OUT, JSON.stringify(artifact, null, 1));
    });
    console.log(`${itemId}: ${Object.keys(rec.states).length} states done`);
  }

  artifact.usage = { calls, tokIn, tokOut, at: new Date().toISOString() };
  writeFileSync(OUT, JSON.stringify(artifact, null, 1));
  console.log(`done: ${calls} calls, tokens ${tokIn}/${tokOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
