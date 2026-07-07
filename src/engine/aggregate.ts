import type {
  Cell,
  CellEstimate,
  Distribution,
  ResponseFormat,
  SubgroupEstimate,
} from "./types";
import { optionIds, optionLabel } from "./types";

export function weightedDistribution(
  estimates: CellEstimate[],
  format: ResponseFormat
): Distribution {
  const ids = optionIds(format);
  const acc = Object.fromEntries(ids.map((id) => [id, 0]));
  let wSum = 0;
  for (const { cell, dist } of estimates) {
    wSum += cell.weight;
    for (const id of ids) acc[id] += cell.weight * (dist[id] ?? 0);
  }
  if (wSum <= 0) return acc;
  for (const id of ids) acc[id] /= wSum;
  return acc;
}

/** Dimensions a cell can be broken down by, with an accessor per cell. */
const SUBGROUP_DIMENSIONS: Array<{
  dimension: string;
  get: (cell: Cell) => string | undefined;
}> = [
  { dimension: "Age", get: (c) => c.age },
  { dimension: "Earned income", get: (c) => c.income },
  { dimension: "Sex", get: (c) => c.sex },
  { dimension: "Housing", get: (c) => c.tenure },
  { dimension: "Children at home", get: (c) => c.children },
  { dimension: "Means-tested benefits", get: (c) => c.benefits },
];

export function subgroupBreakdowns(
  estimates: CellEstimate[],
  format: ResponseFormat
): SubgroupEstimate[] {
  const totalWeight = estimates.reduce((s, e) => s + e.cell.weight, 0);
  const out: SubgroupEstimate[] = [];
  for (const { dimension, get } of SUBGROUP_DIMENSIONS) {
    const groups = new Map<string, CellEstimate[]>();
    let coveredWeight = 0;
    for (const est of estimates) {
      const label = get(est.cell);
      if (label == null) continue;
      coveredWeight += est.cell.weight;
      const list = groups.get(label) ?? [];
      list.push(est);
      groups.set(label, list);
    }
    if (groups.size < 2) continue;
    for (const [label, list] of groups) {
      const w = list.reduce((s, e) => s + e.cell.weight, 0);
      out.push({
        dimension,
        label,
        weightShare: w / totalWeight,
        dist: weightedDistribution(list, format),
        coverage: coveredWeight / totalWeight,
      });
    }
  }
  return out;
}

/** The single number a reader takes away, per format. */
export function headlineFromDistribution(
  dist: Distribution,
  format: ResponseFormat
): { label: string; value: number } {
  if (format.kind === "likert5") {
    return {
      label: "agree or strongly agree",
      value: (dist.agree ?? 0) + (dist.strongly_agree ?? 0),
    };
  }
  if (format.kind === "binary") {
    return { label: "yes", value: dist.yes ?? 0 };
  }
  const ids = optionIds(format);
  let best = ids[0];
  for (const id of ids) if ((dist[id] ?? 0) > (dist[best] ?? 0)) best = id;
  return { label: optionLabel(format, best), value: dist[best] ?? 0 };
}
