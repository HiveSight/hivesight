import { gunzipSync } from "zlib";
import type { PersonRecord } from "@/types";

const HF_BASE_URL =
  "https://huggingface.co/datasets/policyengine/hivesight-persona-data/resolve/main";

// LRU cache for loaded district/state data
const cache = new Map<string, { data: PersonRecord[]; timestamp: number }>();
const MAX_CACHE_SIZE = 30;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function evictOldest() {
  if (cache.size < MAX_CACHE_SIZE) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [key, entry] of cache) {
    if (entry.timestamp < oldestTime) {
      oldestTime = entry.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

async function fetchAndDecompress(url: string): Promise<PersonRecord[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const decompressed = gunzipSync(buffer);
  const json = JSON.parse(decompressed.toString("utf-8"));
  return json.persons as PersonRecord[];
}

async function loadCached(fileId: string): Promise<PersonRecord[]> {
  const cached = cache.get(fileId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${HF_BASE_URL}/districts/${fileId}.json.gz`;
  const data = await fetchAndDecompress(url);

  evictOldest();
  cache.set(fileId, { data, timestamp: Date.now() });

  return data;
}

/**
 * Load person records for a congressional district.
 * @param districtId e.g., "NY-17", "CA-52"
 */
export async function loadDistrictPersons(
  districtId: string
): Promise<PersonRecord[]> {
  return loadCached(districtId);
}

/**
 * Load person records for a state.
 * @param stateAbbrev e.g., "NY", "CA"
 */
export async function loadStatePersons(
  stateAbbrev: string
): Promise<PersonRecord[]> {
  return loadCached(stateAbbrev);
}

/**
 * Load person records for the national sample.
 */
export async function loadNationalPersons(): Promise<PersonRecord[]> {
  return loadCached("US");
}
