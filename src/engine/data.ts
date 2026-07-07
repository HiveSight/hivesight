import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Cell, CellTable, SampleRecord } from "./types";
import { ageBand, earnedIncomeBand } from "./bands";

export const DATASET_VERSION = "hivesight-cells:v1";
const HF_BASE =
  "https://huggingface.co/datasets/MaxGhenis/hivesight-persona-data/resolve/f27f20ae7d9dd255bd9d93b4ffaf3f057685c813";

export interface GeographyData {
  table: CellTable;
  samples: SampleRecord[];
}

// Small in-memory cache; cell tables are tiny, district reductions modest.
const cache = new Map<string, { data: GeographyData; at: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 40;

function cacheGet(key: string): GeographyData | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  return null;
}

function cacheSet(key: string, data: GeographyData) {
  if (cache.size >= CACHE_MAX) {
    let oldest: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of cache) if (v.at < oldestAt) ((oldestAt = v.at), (oldest = k));
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, at: Date.now() });
}

/**
 * Load pre-reduced cells + samples for national/state geographies from the
 * data release shipped in public/data/v1 (built by pipeline/build_cell_release.py).
 */
async function loadReleased(geo: string): Promise<GeographyData> {
  const file = path.join(process.cwd(), "public", "data", "v1", `${geo}.json`);
  const parsed = JSON.parse(await readFile(file, "utf-8"));
  return { table: parsed.table, samples: parsed.samples };
}

/**
 * Districts are reduced at runtime from the per-district microdata file
 * (small enough to parse in-process), using the same banding as the pipeline.
 */
async function reduceDistrict(districtId: string): Promise<GeographyData> {
  const res = await fetch(`${HF_BASE}/districts/${districtId}.json.gz`);
  if (!res.ok) throw new Error(`district data fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const persons = JSON.parse(gunzipSync(buf).toString("utf-8")).persons as Array<
    SampleRecord & { [k: string]: unknown }
  >;
  return {
    table: reduceToCells(persons, districtId),
    samples: systematicSample(persons, 1200),
  };
}

export function reduceToCells(persons: SampleRecord[], geography: string): CellTable {
  const totalWeight = persons.reduce((s, p) => s + p.weight, 0);
  const refineMin = totalWeight * 0.0025;

  const refined = new Map<string, { weight: number; n: number }>();
  for (const p of persons) {
    const earned = p.employment_income + p.self_employment_income;
    const key = JSON.stringify([
      ageBand(p.age),
      earnedIncomeBand(earned),
      p.is_female ? "women" : "men",
      p.tenure_type === 1 ? "homeowners" : "renters or other housing",
      p.children_count > 0 ? "with children at home" : "without children at home",
      p.receives_snap || p.receives_ssi || p.receives_tanf
        ? "receiving means-tested benefits"
        : "not receiving means-tested benefits",
      p.receives_social_security ? "receiving Social Security" : "not receiving Social Security",
    ]);
    const cur = refined.get(key) ?? { weight: 0, n: 0 };
    cur.weight += p.weight;
    cur.n += 1;
    refined.set(key, cur);
  }

  const merged = new Map<string, Cell>();
  for (const [key, v] of refined) {
    const [age, income, sex, tenure, children, benefits, social_security] = JSON.parse(key);
    const useDetail = v.weight >= refineMin;
    const outKey = useDetail ? key : JSON.stringify([age, income, sex]);
    const cur =
      merged.get(outKey) ??
      (useDetail
        ? { age, income, sex, tenure, children, benefits, social_security, weight: 0, n: 0, detailed: true }
        : { age, income, sex, weight: 0, n: 0, detailed: false });
    cur.weight += v.weight;
    cur.n += v.n;
    merged.set(outKey, cur);
  }

  return {
    datasetVersion: DATASET_VERSION,
    geography,
    totalWeight,
    cells: [...merged.values()].sort((a, b) => b.weight - a.weight),
  };
}

export function systematicSample<T extends { weight: number }>(
  persons: T[],
  n: number,
  offset = 0.5
): T[] {
  const total = persons.reduce((s, p) => s + p.weight, 0);
  if (persons.length <= n) return [...persons];
  const step = total / n;
  let target = offset * step;
  let acc = 0;
  const out: T[] = [];
  for (const p of persons) {
    acc += p.weight;
    while (acc >= target && out.length < n) {
      out.push(p);
      target += step;
    }
    if (out.length >= n) break;
  }
  return out;
}

export async function loadGeography(geo: {
  type: "national" | "state" | "district";
  value: string;
}): Promise<GeographyData> {
  const key = `${geo.type}:${geo.value}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const data =
    geo.type === "district"
      ? await reduceDistrict(geo.value)
      : await loadReleased(geo.type === "national" ? "US" : geo.value);
  cacheSet(key, data);
  return data;
}
