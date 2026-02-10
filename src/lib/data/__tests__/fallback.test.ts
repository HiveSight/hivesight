import { describe, it, expect, vi } from "vitest";
import { generateSyntheticPersons } from "../fallback";
import type { LocationFilter, PersonRecord } from "@/types";

describe("generateSyntheticPersons", () => {
  it("generates the requested number of persons", () => {
    const location: LocationFilter = {
      type: "state",
      value: "NY",
      label: "New York",
    };
    const persons = generateSyntheticPersons(25, location);
    expect(persons).toHaveLength(25);
  });

  it("returns valid PersonRecord objects", () => {
    const location: LocationFilter = {
      type: "national",
      value: "US",
      label: "United States",
    };
    const persons = generateSyntheticPersons(10, location);

    for (const p of persons) {
      expect(p.age).toBeGreaterThanOrEqual(18);
      expect(p.age).toBeLessThanOrEqual(85);
      expect(typeof p.is_female).toBe("boolean");
      expect(p.cps_race).toBeGreaterThanOrEqual(1);
      expect(p.cps_race).toBeLessThanOrEqual(6);
      expect(typeof p.employment_income).toBe("number");
      expect(p.weight).toBeGreaterThan(0);
      expect(typeof p.zcta).toBe("string");
    }
  });

  it("produces varied demographics", () => {
    const location: LocationFilter = {
      type: "national",
      value: "US",
      label: "United States",
    };
    const persons = generateSyntheticPersons(100, location);

    const ages = new Set(persons.map((p) => p.age));
    const races = new Set(persons.map((p) => p.cps_race));
    const genders = new Set(persons.map((p) => p.is_female));

    expect(ages.size).toBeGreaterThan(10);
    expect(races.size).toBeGreaterThan(1);
    expect(genders.size).toBe(2);
  });
});
