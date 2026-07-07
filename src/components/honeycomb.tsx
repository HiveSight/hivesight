"use client";

import type { Distribution, ResponseFormat } from "@/engine/types";
import { optionIds, optionLabel } from "@/engine/types";

const SCALE_VARS = [
  "var(--color-scale-1)",
  "var(--color-scale-2)",
  "var(--color-scale-3)",
  "var(--color-scale-4)",
  "var(--color-scale-5)",
];

export function colorsForFormat(format: ResponseFormat): string[] {
  if (format.kind === "likert5") return SCALE_VARS;
  if (format.kind === "binary") return [SCALE_VARS[4], SCALE_VARS[0]];
  const n = format.kind === "choice" ? format.options.length : 2;
  // Spread distinct scale stops for categorical options.
  return Array.from({ length: n }, (_, i) => SCALE_VARS[i % SCALE_VARS.length]);
}

/**
 * The signature chart: 100 hexagons, each one percent of the weighted
 * audience, filled in option order. A waffle chart in the hive's geometry.
 */
export function Honeycomb({
  dist,
  format,
  animate = true,
}: {
  dist: Distribution;
  format: ResponseFormat;
  animate?: boolean;
}) {
  const ids = optionIds(format);
  const colors = colorsForFormat(format);

  // Largest-remainder allocation of 100 hexes across options.
  const raw = ids.map((id) => (dist[id] ?? 0) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const counts = [...floors];
  for (const { i } of order) {
    if (remaining <= 0) break;
    counts[i]++;
    remaining--;
  }

  const cellColors: string[] = [];
  counts.forEach((count, i) => {
    for (let k = 0; k < count; k++) cellColors.push(colors[i]);
  });

  // Pointy-top hex grid, 10 per row, odd rows offset.
  const R = 10;
  const W = Math.sqrt(3) * R;
  const H = 1.5 * R;
  const COLS = 10;
  const rows = Math.ceil(cellColors.length / COLS);
  const width = COLS * W + W / 2 + 2;
  const height = rows * H + R / 2 + 2;

  function hexPath(cx: number, cy: number): string {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${(cx + (R - 0.7) * Math.cos(a)).toFixed(2)},${(cy + (R - 0.7) * Math.sin(a)).toFixed(2)}`;
    });
    return `M${pts.join("L")}Z`;
  }

  return (
    <figure aria-label="Honeycomb chart: each hexagon is one percent of the weighted audience">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-xs"
        role="img"
      >
        {cellColors.map((color, i) => {
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          const cx = col * W + (row % 2 === 1 ? W : W / 2) + 1;
          const cy = row * H + R + 1;
          return (
            <path
              key={i}
              d={hexPath(cx, cy)}
              fill={color}
              className={animate ? "hex-pop" : undefined}
              style={animate ? { animationDelay: `${i * 6}ms` } : undefined}
            />
          );
        })}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {ids.map((id, i) => (
          <span key={id} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[2px]"
              style={{ background: colors[i] }}
              aria-hidden
            />
            {optionLabel(format, id)} {Math.round((dist[id] ?? 0) * 100)}%
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
