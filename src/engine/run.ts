import {
  headlineFromDistribution,
  subgroupBreakdowns,
  weightedDistribution,
} from "./aggregate";
import { cellMatchesFilters } from "./bands";
import { loadGeography, DATASET_VERSION } from "./data";
import type { LlmClient } from "./elicit";
import { LlmRequestError, mapLimit, parseDistribution } from "./elicit";
import { CELL_SYSTEM_PROMPT, cellUserPrompt, PROMPT_VERSION } from "./prompts";
import { generateVerbatims } from "./verbatims";
import refresh from "../../paper/artifacts/model-refresh.json";
import type { CellEstimate, RunProgress, RunResult, RunSpec } from "./types";

export const ENGINE_VERSION = "engine:v1-cells";

/**
 * Benchmark-measured typical error for each served model, from the
 * registered model refresh (paper/pap-model-refresh-2026-10.md): cells-arm
 * absolute error of the designated answer share on the 63-item anchor bank
 * (GSS 2024 + SHED 2024, national), subgroups pooled across bins. Surfaced
 * with results so users see measured accuracy, not implied precision. The
 * analysis script writes the artifact; never edit these numbers by hand.
 */
export const BENCHMARK_SOURCE =
  "63-item anchor bank (GSS 2024 + SHED 2024, national), October 2026 model refresh";

export function benchmarkErrorFor(model: string): RunResult["benchmarkError"] {
  const measured = (
    refresh.servedBenchmark as Record<string, { topline: number; subgroup: number; items: number }>
  )[model];
  return measured
    ? {
        topline: measured.topline,
        subgroup: measured.subgroup,
        items: measured.items,
        source: BENCHMARK_SOURCE,
      }
    : null;
}

const ELICIT_CONCURRENCY = 16;

export async function runEstimate(
  spec: RunSpec,
  llm: LlmClient,
  onProgress?: (p: RunProgress) => void,
  signal?: AbortSignal
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const seed = spec.seed ?? Math.floor(Math.random() * 0xffffffff);

  onProgress?.({
    stage: "resolving",
    completed: 0,
    total: 1,
    message: `Loading the calibrated population for ${spec.audience.geography.label}`,
  });

  const { table, samples, samplePool } = await loadGeography(spec.audience.geography, signal);
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
  let elicitedWeight = 0;
  let firstError: unknown = null;
  // A cell whose call fails after retries counts as a failed cell; it must
  // not abort the other cells' work. A rejected request (bad key, unknown
  // model) would fail every cell, and a cancelled run must stop spending, so
  // both stop the run at once.
  async function elicitCell(cell: (typeof cells)[number]) {
    let content = "";
    try {
      content = await llm.complete({
        system: CELL_SYSTEM_PROMPT,
        user: cellUserPrompt(cell, spec.audience.geography, spec.question, spec.format),
        model: spec.model,
        signal,
      });
    } catch (err) {
      if (err instanceof LlmRequestError || signal?.aborted) throw err;
      firstError ??= err;
    }
    completed++;
    onProgress?.({
      stage: "eliciting",
      completed,
      total: cells.length,
      message: `Estimating response distributions (${completed}/${cells.length} population cells)`,
    });
    return { cell, dist: parseDistribution(content, spec.format) };
  }
  const results = await mapLimit(cells, ELICIT_CONCURRENCY, elicitCell, signal);
  for (const r of results) {
    if (r.dist) {
      estimates.push({ cell: r.cell, dist: r.dist });
      elicitedWeight += r.cell.weight;
    } else failures++;
  }
  if (estimates.length === 0) {
    // Provider messages can echo request details; log them, show a plain one.
    if (firstError) console.error("cell elicitation failed:", firstError);
    throw new Error("All cell elicitations failed.");
  }

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
    samplePool,
    audience: spec.audience,
    question: spec.question,
    format: spec.format,
    count: spec.verbatimCount ?? 6,
    seed,
    signal,
  });
  signal?.throwIfAborted();

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
      elicitedWeight,
      elicitedShare: elicitedWeight / eligibleWeight,
      populationShare: eligibleWeight / table.totalWeight,
      startedAt,
      completedAt: new Date().toISOString(),
    },
    benchmarkError: benchmarkErrorFor(spec.model),
  };

  onProgress?.({
    stage: "complete",
    completed: 1,
    total: 1,
    message: "Estimate complete",
  });
  return result;
}
