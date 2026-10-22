import type { Distribution, ResponseFormat } from "@/engine/types";
import { optionIds } from "@/engine/types";

/**
 * Whole percents per option that total exactly 100 (largest remainder). The
 * chart, its legend and the headline all use this, so they always agree.
 */
export function allocatePercents(dist: Distribution, format: ResponseFormat): number[] {
  const raw = optionIds(format).map((id) => (dist[id] ?? 0) * 100);
  const counts = raw.map(Math.floor);
  let remaining = 100 - counts.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remaining <= 0) break;
    counts[i]++;
    remaining--;
  }
  return counts;
}
