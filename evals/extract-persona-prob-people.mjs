/**
 * Rebuilds each person's reply in the model refresh's persona-prob runs
 * (amendment 2: 150 people per item, 20-item subset) from the committed
 * per-call logs, keyed by the person's index in the released pool. The
 * individual-simulation study asks the same people again in its census of the
 * pool (persona-prob-pool), so the analysis can compare a person's two
 * replies (paper/pap-individual-sim-2026-10.md, descriptive check D1).
 *
 * Every log line is checked against the runner: the system prompt must be the
 * one the runner builds for that pool record and the user prompt the item's
 * persona-prob prompt, and the rebuilt people must reproduce the refresh
 * artifact's persona-prob topline.
 *
 * Output: evals/results/persona-prob-subset20-people.json
 * Run: node evals/extract-persona-prob-people.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  aggregateIndividuals,
  parseDist,
  personaProbPrompt,
  personaSystemFor,
  probPeople,
} from "./run-anchor-bank-v2.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const MODELS = ["gpt-6-luna", "gpt-6.1-sol"];
const TAG = "default:g149";

const bank = JSON.parse(readFileSync(path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v2.json"), "utf-8"));
const items = Object.fromEntries(bank.items.map((i) => [i.itemId, i]));
const us = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "v1", "US.json"), "utf-8"));
const refresh = JSON.parse(readFileSync(path.join(ROOT, "evals", "results", "model-refresh-run.json"), "utf-8"));

const out = { generatedFrom: "evals/extract-persona-prob-people.mjs", models: {} };
for (const model of MODELS) {
  const log = `v2-openai-${model}-persona-prob-subset20-${TAG}.jsonl`;
  const byItem = {};
  for (const line of readFileSync(path.join(ROOT, "evals", "results", "logs", log), "utf-8").split("\n")) {
    if (!line) continue;
    const row = JSON.parse(line);
    const item = items[row.itemId];
    const person = probPeople("persona-prob", item, us.samples)[row.recordIdx];
    if (row.system !== personaSystemFor(person.p)) throw new Error(`${log}: ${row.itemId}#${row.recordIdx} system prompt differs`);
    if (row.user !== personaProbPrompt(item)) throw new Error(`${log}: ${row.itemId}#${row.recordIdx} user prompt differs`);
    const people = (byItem[row.itemId] ??= {});
    if (people[row.recordIdx]) throw new Error(`${log}: ${row.itemId}#${row.recordIdx} appears twice`);
    people[row.recordIdx] = { p: person.p, poolIdx: person.poolIdx, dist: row.content == null ? null : parseDist(row.content, item) };
  }
  out.models[model] = { log, items: {} };
  for (const [itemId, people] of Object.entries(byItem)) {
    const list = Object.values(people);
    const expected = refresh.results[itemId][`persona-prob:openai:${model}:${TAG}`].topline;
    const rebuilt = aggregateIndividuals(items[itemId], list).topline;
    if (list.length !== 150 || rebuilt.some((v, i) => Math.abs(v - expected[i]) > 1e-12)) {
      throw new Error(`${model} ${itemId}: rebuilt people do not reproduce the refresh topline`);
    }
    out.models[model].items[itemId] = list.map((r) => [r.poolIdx, r.dist ? r.dist.map((v) => Number(v.toFixed(6))) : null]);
  }
  console.log(`${model}: ${Object.keys(byItem).length} items rebuilt and checked`);
}
writeFileSync(path.join(ROOT, "evals", "results", "persona-prob-subset20-people.json"), JSON.stringify(out) + "\n");
