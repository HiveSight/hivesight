/**
 * Powered SHED 2024 comparison: naive direct vs persona roleplay vs cell-based
 * distribution elicitation over calibrated microdata.
 *
 * Arms:
 *  A. naive          — direct verbalized estimate, topline + per-subgroup calls
 *  B. persona        — one roleplay call per sampled microdata record (n/question)
 *  C. cells          — one distribution call per post-stratification cell,
 *                      aggregated with calibrated weights
 *
 * Usage:
 *   OPENAI_API_KEY=... node evals/run-shed-powered.mjs [--dry-run] [--persona-n 150]
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";

// ---------- config ----------

const MODEL = "gpt-5-mini";
const REASONING_EFFORT = "minimal";
const CONCURRENCY = 25;
const PERSONA_N = Number(getArg("--persona-n") ?? 150);
const SEED = 20260707;
const DATA_PATH =
  process.env.US_PERSONA_PATH ??
  "/private/tmp/claude-501/-Users-maxghenis/4b986211-4583-4bc2-b435-9fa459f2ce1e/scratchpad/US.json.gz";
const OUT_DIR = path.join(import.meta.dirname, "results");
const RAW_LOG = path.join(OUT_DIR, "shed-powered-raw-calls.jsonl");
const DRY_RUN = process.argv.includes("--dry-run");

const QUESTIONS = [
  {
    questionId: "doing_okay",
    prompt: "I am doing okay financially.",
    scoring: "positive_agreement",
    human: 0.729,
    slices: {
      family: "income_band",
      targets: [
        { label: "<$25k", human: 0.399 },
        { label: "$25k-$74,999", human: 0.599 },
        { label: "$75k-$149,999", human: 0.795 },
        { label: "$150k+", human: 0.895 },
      ],
    },
    stabilityParaphrase: true,
  },
  {
    questionId: "expense_shock",
    prompt: "I could cover a $400 emergency expense using cash or its equivalent.",
    scoring: "positive_agreement",
    human: 0.627,
    slices: {
      family: "income_band",
      targets: [
        { label: "<$25k", human: 0.231 },
        { label: "$25k-$74,999", human: 0.477 },
        { label: "$75k-$149,999", human: 0.694 },
        { label: "$150k+", human: 0.836 },
      ],
    },
  },
  {
    questionId: "better_worse_year",
    prompt: "My finances are better than they were a year ago.",
    scoring: "ordered_mean",
    human: 0.471,
    slices: {
      family: "age_band",
      targets: [
        { label: "18-29", human: 0.505 },
        { label: "30-44", human: 0.471 },
        { label: "45-64", human: 0.444 },
        { label: "65+", human: 0.481 },
      ],
    },
  },
  {
    questionId: "housing_cost_stress",
    prompt:
      "Housing costs caused a serious hardship for my household, such as falling behind on rent or mortgage, facing foreclosure or eviction risk, or needing housing assistance.",
    scoring: "positive_agreement",
    human: 0.187,
    slices: {
      family: "income_band",
      targets: [
        { label: "<$25k", human: 0.484 },
        { label: "$25k-$74,999", human: 0.29 },
        { label: "$75k-$149,999", human: 0.125 },
        { label: "$150k+", human: 0.054 },
      ],
    },
  },
];

// ---------- utilities ----------

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
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
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

let callCount = 0;
let tokensIn = 0;
let tokensOut = 0;

async function llm(messages, { json = false, maxTokens = 700, tag = "" } = {}) {
  if (DRY_RUN) return json ? "{}" : "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const body = {
        model: MODEL,
        messages,
        max_completion_tokens: maxTokens,
        reasoning_effort: REASONING_EFFORT,
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
      const content = data.choices?.[0]?.message?.content ?? "";
      callCount++;
      tokensIn += data.usage?.prompt_tokens ?? 0;
      tokensOut += data.usage?.completion_tokens ?? 0;
      appendFileSync(
        RAW_LOG,
        JSON.stringify({ tag, messages, content, usage: data.usage }) + "\n"
      );
      return content;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  throw new Error("unreachable");
}

// ---------- microdata ----------

function ageBand(age) {
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 65) return "45-64";
  return "65+";
}

function earnedIncomeBand(earned) {
  if (earned <= 0) return "$0 earned";
  if (earned < 25000) return "$1-$24,999";
  if (earned < 75000) return "$25k-$74,999";
  if (earned < 150000) return "$75k-$149,999";
  return "$150k+";
}

// Map earned-income cell bands onto SHED household-income slice labels.
// Construct caveat: SHED slices are HOUSEHOLD income; microdata bands are
// PERSONAL EARNED income. $0-earners (retirees, nonworkers) are assigned to
// "<$25k", which overstates that slice's true low-household-income share.
function sliceLabelForCell(cell, family) {
  if (family === "age_band") return cell.age;
  const b = cell.income;
  if (b === "$0 earned" || b === "$1-$24,999") return "<$25k";
  return b;
}

function loadPrep() {
  // Produced by prep_shed_data.py (the raw national JSON exceeds Node's
  // max string length, so reduction happens in Python).
  const prep = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "results", "prep-shed.json"), "utf-8")
  );
  console.log(
    `Loaded prep: ${prep.cells.length} cells, ${prep.samples.length} persona samples of n=${prep.personaN}`
  );
  return prep;
}

function describeCell(cell) {
  const parts = [`aged ${cell.age}`, cell.sex];
  parts.push(
    cell.income === "$0 earned"
      ? "with no wage or self-employment income this year"
      : `with personal earned income of ${cell.income} per year`
  );
  if (cell.detailed) {
    parts.push(cell.tenure, cell.children, cell.benefits, cell.social_security);
  }
  return `US adults who are ${parts.join(", ")}.`;
}

function describePerson(p) {
  const earned = Math.round(p.employment_income + p.self_employment_income);
  const parts = [
    `You are a ${p.age}-year-old ${p.is_female ? "woman" : "man"} living in the United States`,
    earned > 0
      ? `with personal earned income of about $${earned.toLocaleString()} per year`
      : "with no personal earned income this year",
    p.tenure_type === 1 ? "You own your home" : "You rent your home",
    p.children_count > 0
      ? `You have ${p.children_count} child${p.children_count > 1 ? "ren" : ""} at home`
      : "You have no children at home",
  ];
  const benefits = [];
  if (p.receives_snap) benefits.push("SNAP");
  if (p.receives_ssi) benefits.push("SSI");
  if (p.receives_social_security) benefits.push("Social Security");
  if (p.receives_unemployment) benefits.push("unemployment insurance");
  if (benefits.length) parts.push(`You receive ${benefits.join(", ")}`);
  if (p.is_in_college) parts.push("You are in college");
  if (p.is_disabled) parts.push("You have a disability");
  return parts.join(". ") + ".";
}

// ---------- scoring ----------

const LIKERT_KEYS = ["strongly_disagree", "disagree", "neither", "agree", "strongly_agree"];

function scoreDistribution(dist, scoring) {
  const total = LIKERT_KEYS.reduce((s, k) => s + (dist[k] ?? 0), 0);
  if (total <= 0) return null;
  const p = Object.fromEntries(LIKERT_KEYS.map((k) => [k, (dist[k] ?? 0) / total]));
  if (scoring === "ordered_mean") {
    return p.neither * 0.5 + p.agree + p.strongly_agree;
  }
  return p.agree + p.strongly_agree;
}

function parseLikertLabel(text) {
  const t = text.toLowerCase();
  const m = t.match(/response:\s*([a-z_ -]+)/);
  const scope = m ? m[1] : t;
  if (/strongly[\s_-]+disagree/.test(scope)) return "strongly_disagree";
  if (/strongly[\s_-]+agree/.test(scope)) return "strongly_agree";
  if (/\bdisagree\b/.test(scope)) return "disagree";
  if (/\bneither\b|\bneutral\b/.test(scope)) return "neither";
  if (/\bagree\b/.test(scope)) return "agree";
  return null;
}

function scoreLikertLabel(label, scoring) {
  if (label == null) return null;
  if (scoring === "ordered_mean") {
    if (label === "neither") return 0.5;
    return label === "agree" || label === "strongly_agree" ? 1 : 0;
  }
  return label === "agree" || label === "strongly_agree" ? 1 : 0;
}

// ---------- arms ----------

const CELL_SYSTEM = `You are an expert survey methodologist estimating how specific groups of US adults respond to survey questions. Ground your estimates in empirical survey research, government statistics, and economic data about the group described — not stereotypes. Account for within-group diversity: distributions are rarely extreme. Reply with JSON only.`;

function cellUserPrompt(cell, question, paraphrase = false) {
  const stem = paraphrase
    ? `Consider this survey statement shown to respondents: "${question.prompt}"\nFor the group below, estimate what percentage would pick each answer.`
    : `Survey statement: "${question.prompt}"\nEstimate the percentage of the group below choosing each response option.`;
  return `${stem}

Group: ${describeCell(cell)}

Response options: strongly disagree, disagree, neither agree nor disagree, agree, strongly agree.

Reply with JSON only, integer percentages summing to 100:
{"strongly_disagree": n, "disagree": n, "neither": n, "agree": n, "strongly_agree": n}`;
}

async function runCellsArm(cells, totalWeight, question, { paraphrase = false } = {}) {
  const results = await mapLimit(cells, CONCURRENCY, async (cell) => {
    const content = await llm(
      [
        { role: "system", content: CELL_SYSTEM },
        { role: "user", content: cellUserPrompt(cell, question, paraphrase) },
      ],
      { json: true, maxTokens: 700, tag: `cells:${question.questionId}${paraphrase ? ":p2" : ""}` }
    );
    let dist = null;
    try {
      dist = JSON.parse(content);
    } catch {
      dist = null;
    }
    const score = dist ? scoreDistribution(dist, question.scoring) : null;
    return { cell, score };
  });

  const ok = results.filter((r) => r.score != null);
  const failures = results.length - ok.length;
  const wSum = ok.reduce((s, r) => s + r.cell.weight, 0);
  const estimate = ok.reduce((s, r) => s + r.cell.weight * r.score, 0) / wSum;

  const bySlice = {};
  for (const r of ok) {
    for (const family of ["income_band", "age_band"]) {
      const label = sliceLabelForCell(r.cell, family);
      bySlice[family] ??= {};
      bySlice[family][label] ??= { w: 0, sum: 0 };
      bySlice[family][label].w += r.cell.weight;
      bySlice[family][label].sum += r.cell.weight * r.score;
    }
  }
  const slices = {};
  for (const [family, groups] of Object.entries(bySlice)) {
    slices[family] = Object.fromEntries(
      Object.entries(groups).map(([label, { w, sum }]) => [label, sum / w])
    );
  }
  return { estimate, slices, cellCount: results.length, parseFailures: failures };
}

const PERSONA_SYSTEM_PREFIX = `You are answering a survey as a specific American adult. Answer as this person honestly would, based on their circumstances.

`;

async function runPersonaArm(sample, question) {
  const results = await mapLimit(sample, CONCURRENCY, async (p) => {
    const content = await llm(
      [
        { role: "system", content: PERSONA_SYSTEM_PREFIX + describePerson(p) },
        {
          role: "user",
          content: `Please indicate your level of agreement with this statement:\n\n"${question.prompt}"\n\nRespond with exactly:\nRESPONSE: [strongly_disagree, disagree, neither, agree, or strongly_agree]\nREASONING: [one short sentence]`,
        },
      ],
      { maxTokens: 700, tag: `persona:${question.questionId}` }
    );
    const label = parseLikertLabel(content);
    return { p, score: scoreLikertLabel(label, question.scoring) };
  });

  const ok = results.filter((r) => r.score != null);
  const wSum = ok.reduce((s, r) => s + r.p.weight, 0);
  const estimate = ok.reduce((s, r) => s + r.p.weight * r.score, 0) / wSum;

  const bySlice = {};
  for (const r of ok) {
    const fams = {
      income_band: sliceLabelForCell(
        { income: earnedIncomeBand(r.p.employment_income + r.p.self_employment_income) },
        "income_band"
      ),
      age_band: ageBand(r.p.age),
    };
    for (const [family, label] of Object.entries(fams)) {
      bySlice[family] ??= {};
      bySlice[family][label] ??= { w: 0, sum: 0, n: 0 };
      bySlice[family][label].w += r.p.weight;
      bySlice[family][label].sum += r.p.weight * r.score;
      bySlice[family][label].n += 1;
    }
  }
  const slices = {};
  const sliceNs = {};
  for (const [family, groups] of Object.entries(bySlice)) {
    slices[family] = Object.fromEntries(
      Object.entries(groups).map(([label, { w, sum }]) => [label, sum / w])
    );
    sliceNs[family] = Object.fromEntries(
      Object.entries(groups).map(([label, { n }]) => [label, n])
    );
  }
  return { estimate, slices, sliceNs, n: PERSONA_N, parseFailures: results.length - ok.length };
}

async function runNaiveArm(question) {
  const ask = (audience) =>
    question.scoring === "ordered_mean"
      ? `Estimate the normalized mean response among ${audience} for this survey statement: "${question.prompt}". Use 0 for disagree/strongly disagree, 0.5 for neither, and 1 for agree/strongly agree. Reply with JSON only: {"estimate": x} where x is between 0 and 1.`
      : `Estimate the share of ${audience} who would agree or strongly agree with this survey statement: "${question.prompt}". Reply with JSON only: {"estimate": x} where x is between 0 and 1.`;

  async function estimateFor(audience, tag) {
    const content = await llm(
      [
        {
          role: "system",
          content:
            "You are an expert survey methodologist. Ground estimates in empirical survey research and government statistics. Reply with JSON only.",
        },
        { role: "user", content: ask(audience) },
      ],
      { json: true, maxTokens: 600, tag }
    );
    try {
      const v = JSON.parse(content).estimate;
      return typeof v === "number" ? v : null;
    } catch {
      return null;
    }
  }

  const topline = await estimateFor("US adults", `naive:${question.questionId}`);
  const sliceAudience = {
    "<$25k": "US adults with household income under $25,000",
    "$25k-$74,999": "US adults with household income between $25,000 and $74,999",
    "$75k-$149,999": "US adults with household income between $75,000 and $149,999",
    "$150k+": "US adults with household income of $150,000 or more",
    "18-29": "US adults aged 18-29",
    "30-44": "US adults aged 30-44",
    "45-64": "US adults aged 45-64",
    "65+": "US adults aged 65 or older",
  };
  const slices = {};
  const family = question.slices.family;
  slices[family] = {};
  await mapLimit(question.slices.targets, 8, async (t) => {
    slices[family][t.label] = await estimateFor(
      sliceAudience[t.label],
      `naive-slice:${question.questionId}:${t.label}`
    );
  });
  return { estimate: topline, slices };
}

// ---------- main ----------

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const prep = loadPrep();
  const { cells, totalWeight } = prep;

  const artifact = {
    version: 2,
    suiteId: "shed_2024_household_finance",
    resultType: "powered_model_comparison",
    generatedAt: new Date().toISOString(),
    model: MODEL,
    reasoningEffort: REASONING_EFFORT,
    seed: SEED,
    personaN: PERSONA_N,
    cellCount: cells.length,
    datasetVersion: "MaxGhenis/hivesight-persona-data:main:US",
    cellDescriptionVersion: "cell-desc:v2-social-security",
    notes:
      "Powered comparison over the full national calibrated file. Caveat: SHED income slices are household income; microdata income bands are personal earned income (identical proxy used by all microdata-based arms, so arms are comparable but income-slice errors include construct mismatch). Age slices are construct-clean.",
    questions: [],
  };

  const CELLS_ONLY = process.argv.includes("--cells-only");
  const prior = CELLS_ONLY
    ? JSON.parse(
        readFileSync(path.join(OUT_DIR, "shed-2024-powered-comparison-v2.json"), "utf-8")
      )
    : null;

  for (const [qi, q] of QUESTIONS.entries()) {
    console.log(`\n=== ${q.questionId} ===`);
    const priorArms = prior?.questions.find((x) => x.questionId === q.questionId)?.arms;
    const [naive, persona, cellsRes] = await Promise.all([
      CELLS_ONLY ? priorArms.naive : runNaiveArm(q),
      CELLS_ONLY ? priorArms.persona : runPersonaArm(prep.samples[qi], q),
      runCellsArm(cells, totalWeight, q),
    ]);
    let stability = null;
    if (q.stabilityParaphrase) {
      const p2 = await runCellsArm(cells, totalWeight, q, { paraphrase: true });
      stability = { paraphraseEstimate: p2.estimate, delta: p2.estimate - cellsRes.estimate };
    }

    const arms = { naive, persona, cells: cellsRes };
    const scored = {};
    for (const [armId, arm] of Object.entries(arms)) {
      const family = q.slices.family;
      const sliceErrors = q.slices.targets
        .map((t) => {
          const est = arm.slices?.[family]?.[t.label];
          return est == null ? null : { label: t.label, estimate: est, human: t.human, absError: Math.abs(est - t.human) };
        })
        .filter(Boolean);
      scored[armId] = {
        ...arm,
        toplineHuman: q.human,
        toplineAbsError: arm.estimate == null ? null : Math.abs(arm.estimate - q.human),
        sliceErrors,
        sliceMAE: sliceErrors.length
          ? sliceErrors.reduce((s, e) => s + e.absError, 0) / sliceErrors.length
          : null,
      };
      console.log(
        `  ${armId.padEnd(8)} topline ${arm.estimate?.toFixed(3)} (human ${q.human}, err ${scored[armId].toplineAbsError?.toFixed(3)}), slice MAE ${scored[armId].sliceMAE?.toFixed(3)}`
      );
    }
    artifact.questions.push({ questionId: q.questionId, prompt: q.prompt, scoring: q.scoring, sliceFamily: q.slices.family, arms: scored, stability });
    writeFileSync(path.join(OUT_DIR, "shed-2024-powered-comparison-v2.json"), JSON.stringify(artifact, null, 2));
  }

  // Pooled summary
  const pooled = {};
  for (const armId of ["naive", "persona", "cells"]) {
    const qs = artifact.questions;
    pooled[armId] = {
      toplineMAE: avg(qs.map((q) => q.arms[armId].toplineAbsError)),
      sliceMAE: avg(qs.map((q) => q.arms[armId].sliceMAE)),
    };
  }
  artifact.pooled = pooled;
  artifact.usage = { calls: callCount, tokensIn, tokensOut };
  writeFileSync(path.join(OUT_DIR, "shed-2024-powered-comparison-v2.json"), JSON.stringify(artifact, null, 2));
  console.log("\nPooled:", JSON.stringify(pooled, null, 1));
  console.log(`Calls: ${callCount}, tokens in/out: ${tokensIn}/${tokensOut}`);
}

function avg(xs) {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
