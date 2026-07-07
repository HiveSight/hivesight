import type { AudienceFilters, Cell, SampleRecord } from "./types";

/**
 * Band definitions shared by the engine and the data-release pipeline
 * (pipeline/build_cell_release.py mirrors these; parity is pinned by tests).
 */

export const AGE_BANDS = ["18-29", "30-44", "45-64", "65+"] as const;

export const INCOME_BANDS = [
  "$0 earned",
  "$1-$24,999",
  "$25k-$74,999",
  "$75k-$149,999",
  "$150k+",
] as const;

export const SEXES = ["women", "men"] as const;
export const TENURES = ["homeowners", "renters or other housing"] as const;
export const CHILDREN = ["with children at home", "without children at home"] as const;
export const BENEFITS = [
  "receiving means-tested benefits",
  "not receiving means-tested benefits",
] as const;

export function ageBand(age: number): string {
  if (age < 30) return "18-29";
  if (age < 45) return "30-44";
  if (age < 65) return "45-64";
  return "65+";
}

export function earnedIncomeBand(earned: number): string {
  if (earned <= 0) return "$0 earned";
  if (earned < 25_000) return "$1-$24,999";
  if (earned < 75_000) return "$25k-$74,999";
  if (earned < 150_000) return "$75k-$149,999";
  return "$150k+";
}

/** Whether a cell passes the audience filters. Undetailed cells fail
 * detailed-dimension filters (they carry no tenure/children/benefits info). */
export function cellMatchesFilters(cell: Cell, filters: AudienceFilters): boolean {
  if (filters.ageBands?.length && !filters.ageBands.includes(cell.age)) return false;
  if (filters.incomeBands?.length && !filters.incomeBands.includes(cell.income)) return false;
  if (filters.sexes?.length && !filters.sexes.includes(cell.sex)) return false;
  for (const [key, field] of [
    ["tenure", "tenure"],
    ["children", "children"],
    ["benefits", "benefits"],
  ] as const) {
    const wanted = filters[key];
    if (wanted?.length) {
      if (!cell.detailed) return false;
      if (!wanted.includes(cell[field] as string)) return false;
    }
  }
  return true;
}

export function sampleMatchesFilters(p: SampleRecord, filters: AudienceFilters): boolean {
  const earned = p.employment_income + p.self_employment_income;
  if (filters.ageBands?.length && !filters.ageBands.includes(ageBand(p.age))) return false;
  if (filters.incomeBands?.length && !filters.incomeBands.includes(earnedIncomeBand(earned)))
    return false;
  if (filters.sexes?.length && !filters.sexes.includes(p.is_female ? "women" : "men"))
    return false;
  if (
    filters.tenure?.length &&
    !filters.tenure.includes(p.tenure_type === 1 ? "homeowners" : "renters or other housing")
  )
    return false;
  if (
    filters.children?.length &&
    !filters.children.includes(
      p.children_count > 0 ? "with children at home" : "without children at home"
    )
  )
    return false;
  if (filters.benefits?.length) {
    const label =
      p.receives_snap || p.receives_ssi || p.receives_tanf
        ? "receiving means-tested benefits"
        : "not receiving means-tested benefits";
    if (!filters.benefits.includes(label)) return false;
  }
  return true;
}
