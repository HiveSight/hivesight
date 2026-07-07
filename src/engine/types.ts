/**
 * Core types for the HiveSight estimator engine.
 *
 * The engine estimates how a defined population would answer a survey
 * question by eliciting a response distribution per post-stratification
 * cell and aggregating cells with calibrated microdata weights.
 */

export type ResponseFormat =
  | { kind: "likert5" }
  | { kind: "binary" }
  | { kind: "choice"; options: string[] };

export const LIKERT5_OPTIONS = [
  "strongly_disagree",
  "disagree",
  "neither",
  "agree",
  "strongly_agree",
] as const;

export const BINARY_OPTIONS = ["yes", "no"] as const;

export interface GeographyRef {
  type: "national" | "state" | "district";
  value: string; // "US", "CA", "NY-17"
  label: string;
}

export interface AudienceFilters {
  ageBands?: string[];
  incomeBands?: string[];
  sexes?: string[]; // "women" | "men"
  tenure?: string[]; // "homeowners" | "renters or other housing"
  children?: string[]; // "with children at home" | "without children at home"
  benefits?: string[]; // "receiving means-tested benefits" | "not receiving means-tested benefits"
}

export interface AudienceSpec {
  geography: GeographyRef;
  filters: AudienceFilters;
}

/** A post-stratification cell from the data release. */
export interface Cell {
  age: string;
  income: string;
  sex: string;
  weight: number;
  n: number;
  detailed: boolean;
  tenure?: string;
  children?: string;
  benefits?: string;
  social_security?: string;
}

export interface CellTable {
  datasetVersion: string;
  geography: string;
  totalWeight: number;
  cells: Cell[];
}

/** A sampled microdata record used for illustrative verbatims. */
export interface SampleRecord {
  age: number;
  is_female: boolean;
  employment_income: number;
  self_employment_income: number;
  tenure_type: number;
  children_count: number;
  receives_snap: boolean;
  receives_ssi: boolean;
  receives_tanf: boolean;
  receives_social_security: boolean;
  receives_unemployment: boolean;
  is_in_college: boolean;
  is_disabled: boolean;
  weight: number;
}

/** Normalized probability over option ids; keys depend on format. */
export type Distribution = Record<string, number>;

export interface CellEstimate {
  cell: Cell;
  dist: Distribution;
}

export interface SubgroupEstimate {
  dimension: string;
  label: string;
  weightShare: number;
  dist: Distribution;
  /** Share of this subgroup's weight carried by cells that encode the dimension. */
  coverage: number;
}

export interface Verbatim {
  personaDescription: string;
  choice: string | null;
  text: string;
}

export interface RunProvenance {
  engineVersion: string;
  promptVersion: string;
  datasetVersion: string;
  model: string;
  seed: number;
  cellCount: number;
  cellFailures: number;
  eligibleWeight: number;
  populationShare: number; // eligible weight / geography total weight
  startedAt: string;
  completedAt: string;
}

export interface RunResult {
  question: string;
  format: ResponseFormat;
  audience: AudienceSpec;
  topline: Distribution;
  /** Convenience scalar: agree-share for likert5, yes-share for binary, max option for choice. */
  headline: { label: string; value: number };
  subgroups: SubgroupEstimate[];
  verbatims: Verbatim[];
  provenance: RunProvenance;
  /** Benchmark-derived typical absolute error, if the eval artifact covers this format. */
  benchmarkError: { topline: number | null; subgroup: number | null; source: string } | null;
}

export interface RunProgress {
  stage: "resolving" | "eliciting" | "aggregating" | "verbatims" | "complete";
  completed: number;
  total: number;
  message: string;
}

export interface RunSpec {
  question: string;
  format: ResponseFormat;
  audience: AudienceSpec;
  model: string;
  seed?: number;
  verbatimCount?: number;
}

export function optionIds(format: ResponseFormat): string[] {
  if (format.kind === "likert5") return [...LIKERT5_OPTIONS];
  if (format.kind === "binary") return [...BINARY_OPTIONS];
  return format.options.map((_, i) => `option_${i}`);
}

export function optionLabel(format: ResponseFormat, id: string): string {
  if (format.kind === "choice") {
    const idx = Number(id.replace("option_", ""));
    return format.options[idx] ?? id;
  }
  return id.replace(/_/g, " ");
}
