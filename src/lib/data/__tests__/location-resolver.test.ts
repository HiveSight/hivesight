import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAndSampleForLocation } from "../location-resolver";
import type { PersonRecord } from "@/types";

function gzipJson(value: unknown) {
  return gzipSync(JSON.stringify(value));
}

function makePerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    age: 35,
    is_female: false,
    cps_race: 1,
    is_hispanic: false,
    employment_income: 50000,
    self_employment_income: 0,
    occupation_code: 1020,
    tenure_type: 2,
    children_count: 0,
    is_in_college: false,
    is_disabled: false,
    has_medicaid: false,
    has_medicare: false,
    receives_ssi: false,
    receives_snap: false,
    receives_tanf: false,
    receives_unemployment: false,
    receives_social_security: false,
    zcta: "10001",
    weight: 1,
    ...overrides,
  };
}

describe("loadAndSampleForLocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses labeled synthetic fallback instead of district records when ZIP records are missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("lookup/zcta_to_district.json.gz")) {
          return new Response(
            gzipJson({ "99999": [{ district: "NY-17", share: 1 }] })
          );
        }
        if (url.includes("districts/NY-17.json.gz")) {
          return new Response(gzipJson({
            persons: [makePerson({ zcta: "10001" })],
          }));
        }
        return new Response(null, { status: 404 });
      })
    );

    const result = await loadAndSampleForLocation(
      { type: "zip", value: "99999", label: "ZIP 99999" },
      3
    );

    expect(result.synthetic).toBe(true);
    expect(result.persons).toHaveLength(3);
    expect(result.persons.every((person) => person.zcta === "99999")).toBe(
      true
    );
  });
});
