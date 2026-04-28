import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import OpenAI from "openai";

const HF_BASE_URL =
  "https://huggingface.co/datasets/MaxGhenis/hivesight-persona-data/resolve/main";
const MODEL = process.env.BENCHMARK_MODEL ?? "gpt-5-mini";
const SAMPLE_SIZE = Number(process.env.BENCHMARK_SAMPLE_SIZE ?? 12);
const SEED = Number(process.env.BENCHMARK_SEED ?? 20260426);
const MICRODATA_STATES = (process.env.BENCHMARK_MICRODATA_STATES ?? "CA,TX,NY,FL")
  .split(",")
  .map((state) => state.trim().toUpperCase())
  .filter(Boolean);
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "src/lib/benchmarks/data/results/shed-2024-mini-comparison-v1.json"
);
const COMPARISON_LABELS = {
  naive_llm: "naive direct estimate",
  basic_persona: "basic persona",
  hivesight_microdata: "HiveSight microdata",
};
const COMPARISON_ORDER = Object.keys(COMPARISON_LABELS);

const QUESTIONS = [
  {
    questionId: "doing_okay",
    benchmarkField: "financial_wellbeing",
    prompt: "I am doing okay financially.",
    scoring: "positive_agreement",
  },
  {
    questionId: "expense_shock",
    benchmarkField: "can_cover_400_expense",
    prompt: "I could cover a $400 emergency expense using cash or its equivalent.",
    scoring: "positive_agreement",
  },
  {
    questionId: "better_worse_year",
    benchmarkField: "financial_change_vs_last_year",
    prompt: "My finances are better than they were a year ago.",
    scoring: "ordered_mean",
  },
  {
    questionId: "housing_cost_stress",
    benchmarkField: "housing_cost_stress",
    prompt:
      "Housing costs caused a serious hardship for my household, such as falling behind on rent or mortgage, facing foreclosure or eviction risk, or needing housing assistance.",
    scoring: "positive_agreement",
  },
];

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function samplePersons(persons, count, random) {
  if (count >= persons.length) return [...persons];

  const totalWeight = persons.reduce((sum, person) => sum + person.weight, 0);
  const interval = totalWeight / count;
  const start = random() * interval;
  const selected = [];
  let cumulativeWeight = 0;
  let nextThreshold = start;

  for (const person of persons) {
    cumulativeWeight += person.weight;
    while (nextThreshold < cumulativeWeight && selected.length < count) {
      selected.push(person);
      nextThreshold += interval;
    }
    if (selected.length >= count) break;
  }

  while (selected.length < count) {
    selected.push(persons[Math.floor(random() * persons.length)]);
  }

  return selected;
}

function incomeBand(person) {
  const income = person.employment_income + person.self_employment_income;
  if (income <= 0) return "no current earned income";
  if (income < 25000) return "lower earned income";
  if (income < 75000) return "middle earned income";
  if (income < 150000) return "upper-middle earned income";
  return "high earned income";
}

function occupationGroup(person) {
  const code = Number(person.occupation_code ?? 0);
  if (code <= 0) return "no current occupation";
  if (code < 1000) return "management, business, or finance";
  if (code < 2000) return "professional, technical, or scientific work";
  if (code < 3000) return "education, legal, community, arts, or media work";
  if (code < 4000) return "healthcare or protective services";
  if (code < 5000) return "service, sales, or personal care work";
  if (code < 6000) return "office or administrative work";
  if (code < 8000) return "construction, extraction, installation, or repair work";
  if (code < 9000) return "production or manufacturing work";
  if (code < 9800) return "transportation or material moving work";
  return "military work";
}

function ageBand(age) {
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 65) return "45-64";
  return "65+";
}

function raceLabel(person) {
  if (person.is_hispanic) return "Hispanic/Latino";
  if (person.cps_race === 1) return "White";
  if (person.cps_race === 2) return "Black";
  if (person.cps_race === 3) return "American Indian/Alaskan Native";
  if (person.cps_race === 4) return "Asian";
  if (person.cps_race === 5) return "Hawaiian/Pacific Islander";
  if (person.cps_race >= 6 && person.cps_race <= 24) return "Multiracial";
  return "Other race/ethnicity";
}

function basicPersona(person) {
  return [
    `Age band: ${ageBand(person.age)}.`,
    `Sex: ${person.is_female ? "Female" : "Male"}.`,
    `Race/ethnicity: ${raceLabel(person)}.`,
    `Income: ${incomeBand(person)}.`,
    "Geography: United States.",
  ].join(" ");
}

function richMicrodataPersona(person) {
  const tenure =
    person.tenure_type === 1
      ? "owns their home"
      : person.tenure_type === 2
      ? "rents their home"
      : "has unspecified housing tenure";
  const children =
    person.children_count === 0
      ? "no children in the household"
      : `${person.children_count} child${person.children_count === 1 ? "" : "ren"} in the household`;
  const student = person.is_in_college ? "is in college" : "is not in college";
  const publicCoverage =
    person.has_medicare && person.has_medicaid
      ? "has Medicare and Medicaid"
      : person.has_medicare
      ? "has Medicare"
      : person.has_medicaid
      ? "has Medicaid"
      : "does not have Medicare or Medicaid";
  const benefits = [
    person.receives_snap ? "SNAP" : null,
    person.receives_ssi ? "SSI" : null,
    person.receives_tanf ? "TANF" : null,
    person.receives_unemployment ? "unemployment benefits" : null,
    person.receives_social_security ? "Social Security" : null,
  ].filter(Boolean);

  return [
    `Age band: ${ageBand(person.age)}.`,
    "Lives in the United States.",
    `Income: ${incomeBand(person)}.`,
    `Housing: ${tenure}; ${children}.`,
    `Education/work context: ${student}; broad occupation group is ${occupationGroup(person)}.`,
    `Health/benefit context: ${person.is_disabled ? "has a disability" : "does not have a disability"}; ${publicCoverage}; ${
      benefits.length > 0 ? `receives ${benefits.join(", ")}` : "does not receive the tracked benefits"
    }.`,
  ].join(" ");
}

function parseLikert(content) {
  const match = content.match(/RESPONSE:\s*([^\n\r]+)/i);
  const text = match?.[1] ?? content;
  const normalized = text.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("strongly_disagree")) return "strongly_disagree";
  if (normalized.includes("strongly_agree")) return "strongly_agree";
  if (/\bdisagree\b/.test(normalized)) return "disagree";
  if (/\bneutral\b/.test(normalized)) return "neutral";
  if (/\bagree\b/.test(normalized)) return "agree";
  return null;
}

function scoreLikert(response, scoring) {
  if (response === null) return null;

  if (scoring === "ordered_mean") {
    if (response === "strongly_disagree" || response === "disagree") return 0;
    if (response === "neutral") return 0.5;
    if (response === "agree" || response === "strongly_agree") return 1;
    return null;
  }

  return response === "agree" || response === "strongly_agree" ? 1 : 0;
}

function summarizeMeanAbsoluteErrors(questions) {
  return Object.fromEntries(
    COMPARISON_ORDER.map((comparisonId) => {
      const errors = questions.flatMap((question) =>
        (question.modelResults ?? [])
          .filter((result) => result.comparisonId === comparisonId)
          .map((result) => result.absoluteError)
      );
      const meanError =
        errors.reduce((sum, error) => sum + error, 0) / Math.max(errors.length, 1);
      return [comparisonId, Number(meanError.toFixed(3))];
    })
  );
}

function formatPoints(value) {
  return (value * 100).toFixed(1);
}

async function loadStatePersons(state) {
  const response = await fetch(`${HF_BASE_URL}/districts/${state}.json.gz`);
  if (!response.ok) {
    throw new Error(`Failed to load ${state} microdata: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return JSON.parse(gunzipSync(buffer).toString("utf8")).persons;
}

async function loadMicrodataSample(count, random) {
  const perState = Math.max(1, Math.ceil(count / MICRODATA_STATES.length));
  const sampled = [];

  for (const state of MICRODATA_STATES) {
    const persons = await loadStatePersons(state);
    sampled.push(...samplePersons(persons, perState, random));
  }

  return sampled.slice(0, count);
}

function loadHumanTarget(field) {
  const inputPath =
    process.env.SHED_2024_DATA_PATH ??
    path.resolve(process.cwd(), ".benchmarks/input/shed-2024.json");
  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  let weight = 0;
  let weightedSum = 0;
  let unweightedN = 0;

  for (const row of data.rows) {
    const value = row.benchmarkFields?.[field];
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      continue;
    }
    const rowWeight = Number(row.weight ?? 1);
    weight += rowWeight;
    weightedSum += rowWeight * Number(value);
    unweightedN++;
  }

  return {
    unweightedN,
    weightedMean: Number((weightedSum / weight).toFixed(3)),
  };
}

async function likertCall(openai, systemPrompt, statement) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Please indicate your level of agreement with this statement:\n\n"${statement}"\n\nRespond with exactly:\nRESPONSE: [strongly_disagree, disagree, neutral, agree, or strongly_agree]\nREASONING: [one short sentence]`,
      },
    ],
    max_completion_tokens: 1000,
  });
  return parseLikert(completion.choices[0]?.message?.content ?? "");
}

async function runSimulatedRespondentArm(openai, question, persons, formatter) {
  const responses = await Promise.all(
    persons.map((person) =>
      likertCall(
        openai,
        `You are simulating one American adult respondent. Answer as the person described here would answer.\n\n${formatter(person)}`,
        question.prompt
      )
    )
  );

  const scores = responses
    .map((response) => scoreLikert(response, question.scoring))
    .filter((score) => score !== null);
  const estimate =
    scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null;

  if (estimate === null) {
    throw new Error(`No parseable simulated responses for ${question.questionId}.`);
  }

  return {
    simulatedN: responses.length,
    estimate: Number(estimate.toFixed(3)),
    parseFailures: responses.filter((response) => response === null).length,
  };
}

async function runNaiveArm(openai, question) {
  const estimatePrompt =
    question.scoring === "ordered_mean"
      ? `Estimate the normalized mean response among US adults for this statement: "${question.prompt}". Use 0 for disagree/strongly disagree, 0.5 for neutral or about the same, and 1 for agree/strongly agree.`
      : `Estimate the share of US adults who would agree or strongly agree with this statement: "${question.prompt}"`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You estimate current US adult survey toplines. Return only JSON with an estimate field between 0 and 1.",
      },
      {
        role: "user",
        content: estimatePrompt,
      },
    ],
    max_completion_tokens: 1000,
  });
  const content = completion.choices[0]?.message?.content ?? "";
  const match = content.match(/0?\.\d+|1(?:\.0+)?|0(?:\.0+)?/);
  const estimate = match ? Number(match[0]) : null;

  if (estimate === null || Number.isNaN(estimate)) {
    throw new Error(`Could not parse naive estimate from: ${content}`);
  }

  return {
    simulatedN: 1,
    estimate: Number(Math.min(1, Math.max(0, estimate)).toFixed(3)),
    parseFailures: 0,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const persons = await loadMicrodataSample(SAMPLE_SIZE, createSeededRandom(SEED));

  const questions = [];

  for (const question of QUESTIONS) {
    const target = loadHumanTarget(question.benchmarkField);
    const arms = [
      {
        comparisonId: "naive_llm",
        label: "Naive LLM direct estimate",
        ...(await runNaiveArm(openai, question)),
      },
      {
        comparisonId: "basic_persona",
        label: "Basic demographic persona",
        ...(await runSimulatedRespondentArm(openai, question, persons, basicPersona)),
      },
      {
        comparisonId: "hivesight_microdata",
        label: "HiveSight microdata prompt",
        ...(await runSimulatedRespondentArm(
          openai,
          question,
          persons,
          richMicrodataPersona
        )),
      },
    ].map((arm) => ({
      ...arm,
      absoluteError: Number(Math.abs(arm.estimate - target.weightedMean).toFixed(3)),
    }));

    questions.push({
      ...question,
      unweightedN: target.unweightedN,
      missingRows: 0,
      weightedMean: target.weightedMean,
      sliceHighlights: [],
      modelResults: arms,
    });
  }

  const averageErrors = summarizeMeanAbsoluteErrors(questions);
  const bestComparisonId = COMPARISON_ORDER.reduce((bestId, comparisonId) =>
    averageErrors[comparisonId] < averageErrors[bestId] ? comparisonId : bestId
  );
  const comparisonReadout = `Average absolute errors in this run: naive direct estimate ${formatPoints(
    averageErrors.naive_llm
  )} pts, basic persona ${formatPoints(
    averageErrors.basic_persona
  )} pts, HiveSight microdata ${formatPoints(
    averageErrors.hivesight_microdata
  )} pts. ${
    bestComparisonId === "hivesight_microdata"
      ? "HiveSight microdata has the lowest error in this run."
      : `HiveSight microdata does not yet beat the lowest-error arm, ${COMPARISON_LABELS[bestComparisonId]}.`
  }`;

  const snapshot = {
    version: 1,
    suiteId: "shed_2024_household_finance",
    datasetId: "shed_2024",
    datasetLabel: "SHED 2024",
    resultType: "model_comparison",
    status: "partial",
    generatedAt: new Date().toISOString(),
    sourceRows: loadHumanTarget(QUESTIONS[0].benchmarkField).unweightedN,
    notes:
      `Small first-pass model comparison on ${QUESTIONS.length} SHED 2024 household-finance questions. This is intentionally directional: ${SAMPLE_SIZE} simulated respondents per persona arm, one direct naive estimate per question, and calibrated microdata sampled from ${MICRODATA_STATES.join(", ")} rather than the full national file. ${comparisonReadout}`,
    execution: {
      model: MODEL,
      seed: SEED,
      simulatedRespondentsPerPersonaArm: SAMPLE_SIZE,
      microdataStates: MICRODATA_STATES,
      generatedBy: "scripts/run-shed-mini-comparison.mjs",
      sampleStrategy:
        "Weighted systematic sample with an even per-state allocation across configured microdata state files.",
      questionCount: QUESTIONS.length,
      directEstimateCalls: QUESTIONS.length,
      simulatedResponseCalls: QUESTIONS.length * 2 * SAMPLE_SIZE,
    },
    questions,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(JSON.stringify(averageErrors, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
