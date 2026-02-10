import { gunzipSync } from "zlib";
import type { LocationFilter, PersonRecord } from "@/types";
import {
  loadDistrictPersons,
  loadStatePersons,
  loadNationalPersons,
} from "./persona-loader";
import { samplePersons, sampleAcrossDistricts, filterByZcta } from "./sampler";
import { generateSyntheticPersons } from "./fallback";

const HF_BASE_URL =
  "https://huggingface.co/datasets/policyengine/hivesight-persona-data/resolve/main";

// ZCTA-to-district lookup, loaded once and cached
let zctalookup: Record<
  string,
  Array<{ district: string; share: number }>
> | null = null;

// Locations list for autocomplete
let locationsList: Array<{
  type: string;
  id: string;
  label: string;
}> | null = null;

async function fetchGzJson<T>(path: string): Promise<T> {
  const url = `${HF_BASE_URL}/${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const decompressed = gunzipSync(buffer);
  return JSON.parse(decompressed.toString("utf-8"));
}

async function getZctaLookup() {
  if (!zctalookup) {
    zctalookup = await fetchGzJson<typeof zctalookup>(
      "lookup/zcta_to_district.json.gz"
    );
  }
  return zctalookup!;
}

export async function getLocationsList() {
  if (!locationsList) {
    locationsList = await fetchGzJson<typeof locationsList>(
      "lookup/locations.json.gz"
    );
  }
  return locationsList!;
}

export interface ResolvedLocation {
  districts: Array<{ id: string; share: number }>;
  label: string;
  zcta?: string; // for ZIP-level filtering
}

/**
 * Resolve a location input to one or more district/state file IDs.
 */
export async function resolveLocation(
  location: LocationFilter
): Promise<ResolvedLocation> {
  switch (location.type) {
    case "national":
      return { districts: [{ id: "US", share: 1 }], label: "United States" };

    case "state":
      return {
        districts: [{ id: location.value, share: 1 }],
        label: location.label,
      };

    case "district":
      return {
        districts: [{ id: location.value, share: 1 }],
        label: location.label,
      };

    case "zip": {
      const lookup = await getZctaLookup();
      const districts = lookup[location.value];
      if (!districts || districts.length === 0) {
        throw new Error(`No district data found for ZIP ${location.value}`);
      }
      return {
        districts: districts.map((d) => ({ id: d.district, share: d.share })),
        label: location.label,
        zcta: location.value,
      };
    }

    case "city":
      // Cities resolve to state-level for now
      return {
        districts: [{ id: location.value, share: 1 }],
        label: location.label,
      };

    default:
      throw new Error(`Unknown location type: ${location.type}`);
  }
}

/**
 * Load and sample persons for a given location.
 * Falls back to synthetic generation if HuggingFace data is unavailable.
 */
export async function loadAndSampleForLocation(
  location: LocationFilter,
  count: number
): Promise<{ persons: PersonRecord[]; synthetic: boolean }> {
  try {
    const persons = await loadRealPersons(location, count);
    return { persons, synthetic: false };
  } catch (error) {
    console.warn(
      `Real persona data unavailable for ${location.label}, using synthetic fallback:`,
      error instanceof Error ? error.message : error
    );
    return { persons: generateSyntheticPersons(count, location), synthetic: true };
  }
}

async function loadRealPersons(
  location: LocationFilter,
  count: number
): Promise<PersonRecord[]> {
  const resolved = await resolveLocation(location);

  if (resolved.districts.length === 1 && !resolved.zcta) {
    const districtId = resolved.districts[0].id;
    let persons: PersonRecord[];

    if (districtId === "US") {
      persons = await loadNationalPersons();
    } else if (districtId.length === 2) {
      persons = await loadStatePersons(districtId);
    } else {
      persons = await loadDistrictPersons(districtId);
    }

    return samplePersons(persons, count);
  }

  // Multi-district (ZIP spanning districts) or ZIP-level filtering
  const districtData: Array<{ persons: PersonRecord[]; share: number }> = [];

  for (const { id, share } of resolved.districts) {
    let persons = await loadDistrictPersons(id);

    // Filter to matching ZCTA if this is a ZIP lookup
    if (resolved.zcta) {
      const filtered = filterByZcta(persons, resolved.zcta);
      if (filtered.length > 0) {
        persons = filtered;
      }
    }

    districtData.push({ persons, share });
  }

  return sampleAcrossDistricts(districtData, count);
}
