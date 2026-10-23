/**
 * What the registered individual-simulation study
 * (paper/pap-individual-sim-2026-10.md) fixes for the product's individual
 * mode, read from the artifact its analysis writes
 * (paper/artifacts/individual-sim.json). Never edit those numbers by hand.
 * Kept free of engine imports so pages and forms can read it.
 */

import study from "../../paper/artifacts/individual-sim.json";
import type { RunResult } from "./types";

interface IndividualBenchmark {
  topline: number;
  subgroup: number;
  items: number;
  people: number;
}

/** Models that passed the study's gate, with their measured accuracy at K* people. */
const BENCHMARKS = study.individualBenchmark as Record<string, IndividualBenchmark>;

/** Served models the study supports the individual mode for. */
export const INDIVIDUAL_MODELS: string[] = Object.keys(BENCHMARKS);

/** People asked per run: K* from the registered rule, or 0 when no model passed the gate. */
export const INDIVIDUAL_PEOPLE: number = INDIVIDUAL_MODELS.length
  ? ((study.productRule as { people: number | null }).people ?? 0)
  : 0;

/**
 * Whether the product offers the mode: the study must support it, and the
 * server setting HIVESIGHT_INDIVIDUAL_MODE must be "on". Off by default;
 * turning it on is a product decision, not a consequence of the results.
 */
export function individualModeEnabled(): boolean {
  return INDIVIDUAL_PEOPLE > 0 && process.env.HIVESIGHT_INDIVIDUAL_MODE === "on";
}

export const INDIVIDUAL_BENCHMARK_SOURCE =
  "63-item anchor bank (GSS 2024 + SHED 2024, national), October 2026 individual-simulation study";

export function individualBenchmarkFor(model: string): RunResult["benchmarkError"] {
  const measured = BENCHMARKS[model];
  return measured && INDIVIDUAL_PEOPLE > 0
    ? {
        topline: measured.topline,
        subgroup: measured.subgroup,
        items: measured.items,
        people: measured.people,
        source: INDIVIDUAL_BENCHMARK_SOURCE,
      }
    : null;
}
