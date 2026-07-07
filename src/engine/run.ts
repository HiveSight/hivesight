import {
  headlineFromDistribution,
  subgroupBreakdowns,
  weightedDistribution,
} from "./aggregate";
import { cellMatchesFilters } from "./bands";
import { loadGeography, DATASET_VERSION } from "./data";
import type { LlmClient } from "./elicit";
import { mapLimit, parseDistribution } from "./elicit";
import { CELL_SYSTEM_PROMPT, cellUserPrompt, PROMPT_VERSION } from "./prompts";
import { generateVerbatims } from "./verbatims";
import type { CellEstimate, RunProgress, RunResult, RunSpec } from "./types";

export const ENGINE_VERSION = "engine:v1-cells";

/**
 * Benchmark-measured typical error, from evals/results (SHED 2024 powered
 * comparison). Surfaced with results so users see measured accuracy context,
 * not implied precision. Update when the eval artifact is regenerated.
 */
export const BENCHMARK_ERROR = {
  source: "SHED 2024 powered comparison (4 questions, national)",
  topline: 0.17,
  subgroup: 0.062,
};

const ELICIT_CONCURRENCY = 16;

export async function runEstimate(
  spec: RunSpec,
  llm: LlmClient,
  onProgress?: (p: RunProgress) => void
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const seed = spec.seed ?? Math.floor(Math.random() * 0xffffffff);

  onProgress?.({
    stage: "resolving",
    completed: 0,
    total: 1,
    message: `Loading the calibrated population for ${spec.audience.geography.label}`,
  });

  const { table, samples } = await loadGeography(spec.audience.geography);
  const cells = table.cells.filter((c) => cellMatchesFilters(c, spec.audience.filters));
  if (cells.length === 0) {
    throw new Error(
      "No population cells match this audience. Try removing a filter — undetailed cells cannot satisfy tenure, children, or benefits filters."
    );
  }
  const eligibleWeight = cells.reduce((s, c) => s + c.weight, 0);

  let completed = 0;
  const estimates: CellEstimate[] = [];
  let failures = 0;
  const results = await mapLimit(cells, ELICIT_CONCURRENCY, async (cell) => {
    const content = await llm.complete({
      system: CELL_SYSTEM_PROMPT,
      user: cellUserPrompt(cell, spec.audience.geography, spec.question, spec.format),
      model: spec.model,
    });
    completed++;
    onProgress?.({
      stage: "eliciting",
      completed,
      total: cells.length,
      message: `Estimating response distributions (${completed}/${cells.length} population cells)`,
    });
    return { cell, dist: parseDistribution(content, spec.format) };
  });
  for (const r of results) {
    if (r.dist) estimates.push({ cell: r.cell, dist: r.dist });
    else failures++;
  }
  if (estimates.length === 0) throw new Error("All cell elicitations failed.");

  onProgress?.({
    stage: "aggregating",
    completed: cells.length,
    total: cells.length,
    message: "Aggregating with calibrated population weights",
  });
  const topline = weightedDistribution(estimates, spec.format);
  const subgroups = subgroupBreakdowns(estimates, spec.format);

  onProgress?.({
    stage: "verbatims",
    completed: 0,
    total: spec.verbatimCount ?? 6,
    message: "Writing illustrative synthetic verbatims",
  });
  const verbatims = await generateVerbatims({
    llm,
    model: spec.model,
    samples,
    audience: spec.audience,
    question: spec.question,
    format: spec.format,
    count: spec.verbatimCount ?? 6,
    seed,
  });

  const result: RunResult = {
    question: spec.question,
    format: spec.format,
    audience: spec.audience,
    topline,
    headline: headlineFromDistribution(topline, spec.format),
    subgroups,
    verbatims,
    provenance: {
      engineVersion: ENGINE_VERSION,
      promptVersion: PROMPT_VERSION,
      datasetVersion: table.datasetVersion ?? DATASET_VERSION,
      model: spec.model,
      seed,
      cellCount: estimates.length,
      cellFailures: failures,
      eligibleWeight,
      populationShare: eligibleWeight / table.totalWeight,
      startedAt,
      completedAt: new Date().toISOString(),
    },
    benchmarkError: {
      topline: spec.format.kind === "likert5" ? BENCHMARK_ERROR.topline : null,
      subgroup: spec.format.kind === "likert5" ? BENCHMARK_ERROR.subgroup : null,
      source: BENCHMARK_ERROR.source,
    },
  };

  onProgress?.({
    stage: "complete",
    completed: 1,
    total: 1,
    message: "Estimate complete",
  });
  return result;
}
