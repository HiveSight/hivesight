/**
 * Individual elicitation mode (opt-in): estimates built from simulated
 * people instead of population cells. Each person drawn from the
 * geography's sample pool reports how likely they are to give each answer;
 * estimates average those distributions.
 *
 * The design, the number of people per run and the accuracy shown with each
 * run come from the registered individual-simulation study
 * (paper/pap-individual-sim-2026-10.md), whose analysis writes
 * paper/artifacts/individual-sim.json. Never edit those numbers by hand.
 */

import { ageBand, earnedIncomeBand, sampleMatchesFilters } from "./bands";
import type { LlmClient } from "./elicit";
import { LlmRequestError, mapLimit, parseDistribution } from "./elicit";
import { describePersona, PERSONA_SYSTEM_PROMPT, personaProbUserPrompt } from "./prompts";
import type {
  AudienceSpec,
  CellTable,
  Distribution,
  EstimateCore,
  ResponseFormat,
  RunProgress,
  RunSpec,
  SampleRecord,
  SubgroupEstimate,
} from "./types";
import { optionIds } from "./types";
import { mulberry32 } from "./verbatims";
import { INDIVIDUAL_PEOPLE } from "./individual-study";

export {
  individualBenchmarkFor,
  INDIVIDUAL_MODELS,
  INDIVIDUAL_PEOPLE,
  individualModeEnabled,
} from "./individual-study";

export const INDIVIDUAL_PROMPT_VERSION = "prompts:v4.2-persona-prob";

/** Fewest answering people behind any estimate or subgroup shown (the study's bin rule). */
export const MIN_PEOPLE = 10;

const ELICIT_CONCURRENCY = 32;

/**
 * Up to k of the audience's pool records, drawn with equal probability
 * without replacement (seeded partial Fisher-Yates), in pool order.
 */
export function drawPeople(
  samples: SampleRecord[],
  audience: AudienceSpec,
  k: number,
  seed: number
): { eligible: SampleRecord[]; people: SampleRecord[] } {
  const eligible = samples.filter((p) => sampleMatchesFilters(p, audience.filters));
  if (eligible.length <= k) return { eligible, people: eligible };
  const rng = mulberry32(seed);
  const idx = eligible.map((_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const chosen = idx.slice(0, k).sort((a, b) => a - b);
  return { eligible, people: chosen.map((i) => eligible[i]) };
}

/** Each person's subgroup labels, in the cells breakdown's dimensions and wording. */
const PERSON_DIMENSIONS: Array<{ dimension: string; get: (p: SampleRecord) => string }> = [
  { dimension: "Age", get: (p) => ageBand(p.age) },
  { dimension: "Earned income", get: (p) => earnedIncomeBand(p.employment_income + p.self_employment_income) },
  { dimension: "Sex", get: (p) => (p.is_female ? "women" : "men") },
  { dimension: "Housing", get: (p) => (p.tenure_type === 1 ? "homeowners" : "renters or other housing") },
  {
    dimension: "Children at home",
    get: (p) => (p.children_count > 0 ? "with children at home" : "without children at home"),
  },
  {
    dimension: "Means-tested benefits",
    get: (p) =>
      p.receives_snap || p.receives_ssi || p.receives_tanf
        ? "receiving means-tested benefits"
        : "not receiving means-tested benefits",
  },
];

export interface PersonEstimate {
  person: SampleRecord;
  dist: Distribution;
}

/**
 * Mean of individual distributions. A "pps" pool is a weight-proportional
 * sample, so people count equally; a "population" pool is every record and
 * each counts by its weight.
 */
export function meanDistribution(
  estimates: PersonEstimate[],
  format: ResponseFormat,
  pool: "pps" | "population"
): Distribution {
  const ids = optionIds(format);
  const acc = Object.fromEntries(ids.map((id) => [id, 0]));
  let wSum = 0;
  for (const { person, dist } of estimates) {
    const w = pool === "pps" ? 1 : person.weight;
    wSum += w;
    for (const id of ids) acc[id] += w * (dist[id] ?? 0);
  }
  if (wSum <= 0) return acc;
  for (const id of ids) acc[id] /= wSum;
  return acc;
}

/** Subgroup breakdowns over people; groups with fewer than MIN_PEOPLE are not shown. */
export function personBreakdowns(
  estimates: PersonEstimate[],
  format: ResponseFormat,
  pool: "pps" | "population"
): SubgroupEstimate[] {
  const weightOf = (e: PersonEstimate) => (pool === "pps" ? 1 : e.person.weight);
  const total = estimates.reduce((s, e) => s + weightOf(e), 0);
  const out: SubgroupEstimate[] = [];
  for (const { dimension, get } of PERSON_DIMENSIONS) {
    const groups = new Map<string, PersonEstimate[]>();
    for (const e of estimates) {
      const label = get(e.person);
      const list = groups.get(label) ?? [];
      list.push(e);
      groups.set(label, list);
    }
    if (groups.size < 2) continue;
    for (const [label, list] of groups) {
      if (list.length < MIN_PEOPLE) continue;
      out.push({
        dimension,
        label,
        weightShare: list.reduce((s, e) => s + weightOf(e), 0) / total,
        dist: meanDistribution(list, format, pool),
        coverage: 1,
      });
    }
  }
  return out;
}

export interface IndividualElicitation {
  estimates: PersonEstimate[];
  /** The audience's pool records, of which `asked` were drawn. */
  eligible: SampleRecord[];
  asked: SampleRecord[];
}

/**
 * Asks up to INDIVIDUAL_PEOPLE of the audience's pool records. A person whose
 * call fails after retries counts as a failure without stopping the others;
 * a rejected request or a cancelled run stops the run.
 */
export async function elicitIndividuals(args: {
  llm: LlmClient;
  model: string;
  question: string;
  format: ResponseFormat;
  audience: AudienceSpec;
  samples: SampleRecord[];
  seed: number;
  people?: number;
  onProgress?: (p: RunProgress) => void;
  signal?: AbortSignal;
}): Promise<IndividualElicitation> {
  const k = args.people ?? INDIVIDUAL_PEOPLE;
  if (!(k > 0)) throw new Error("Individual mode is not available.");
  const { eligible, people } = drawPeople(args.samples, args.audience, k, args.seed);
  if (people.length < MIN_PEOPLE) {
    throw new Error(
      `Only ${people.length} simulated people match this audience; individual mode needs at least ${MIN_PEOPLE}. Widen the filters or use population cells.`
    );
  }
  const user = personaProbUserPrompt(args.question, args.format);
  let completed = 0;
  let firstError: unknown = null;
  const results = await mapLimit(
    people,
    ELICIT_CONCURRENCY,
    async (person) => {
      let content = "";
      try {
        content = await args.llm.complete({
          system: PERSONA_SYSTEM_PROMPT + describePersona(person, args.audience.geography),
          user,
          model: args.model,
          signal: args.signal,
        });
      } catch (err) {
        if (err instanceof LlmRequestError || args.signal?.aborted) throw err;
        firstError ??= err;
      }
      completed++;
      args.onProgress?.({
        stage: "eliciting",
        completed,
        total: people.length,
        message: `Asking simulated people (${completed}/${people.length})`,
      });
      return { person, dist: parseDistribution(content, args.format) };
    },
    args.signal
  );
  const estimates = results.filter((r): r is PersonEstimate => r.dist != null);
  if (estimates.length < MIN_PEOPLE) {
    if (firstError) console.error("individual elicitation failed:", firstError);
    throw new Error("Too few simulated people returned a usable answer.");
  }
  return { estimates, eligible, asked: people };
}

/**
 * Individual elicitation for a run: asks the audience's people, averages
 * their answers, and accounts for the weight they stand for. A "pps" record
 * stands for an equal share of the geography's adults; a "population" record
 * for its own weight.
 */
export async function estimateFromPeople(args: {
  spec: RunSpec;
  table: CellTable;
  samples: SampleRecord[];
  samplePool: "pps" | "population";
  seed: number;
  llm: LlmClient;
  onProgress?: (p: RunProgress) => void;
  signal?: AbortSignal;
}): Promise<EstimateCore> {
  const { spec, table, samples, samplePool } = args;
  const r = await elicitIndividuals({
    llm: args.llm,
    model: spec.model,
    question: spec.question,
    format: spec.format,
    audience: spec.audience,
    samples,
    seed: args.seed,
    onProgress: args.onProgress,
    signal: args.signal,
  });
  args.onProgress?.({
    stage: "aggregating",
    completed: r.asked.length,
    total: r.asked.length,
    message: "Averaging the simulated people's answers",
  });
  const weightOf = (p: SampleRecord) => (samplePool === "pps" ? table.totalWeight / samples.length : p.weight);
  const eligibleWeight = r.eligible.reduce((s, p) => s + weightOf(p), 0);
  const askedWeight = r.asked.reduce((s, p) => s + weightOf(p), 0);
  const answeredWeight = r.estimates.reduce((s, e) => s + weightOf(e.person), 0);
  return {
    topline: meanDistribution(r.estimates, spec.format, samplePool),
    subgroups: personBreakdowns(r.estimates, spec.format, samplePool),
    provenance: {
      cellCount: 0,
      cellFailures: 0,
      eligibleWeight,
      elicitedWeight: askedWeight > 0 ? (eligibleWeight * answeredWeight) / askedWeight : 0,
      people: {
        eligible: r.eligible.length,
        asked: r.asked.length,
        answered: r.estimates.length,
        pool: samplePool,
      },
    },
  };
}
