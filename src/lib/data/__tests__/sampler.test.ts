import { describe, it, expect } from "vitest";
import { samplePersons, sampleAcrossDistricts, filterByZcta } from "../sampler";
import type { PersonRecord } from "@/types";

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
    weight: 100,
    ...overrides,
  };
}

describe("samplePersons", () => {
  it("returns empty array for empty input", () => {
    expect(samplePersons([], 10)).toEqual([]);
  });

  it("returns all persons when count exceeds population", () => {
    const persons = [makePerson(), makePerson(), makePerson()];
    const result = samplePersons(persons, 10);
    expect(result).toHaveLength(3);
  });

  it("returns exactly the requested count", () => {
    const persons = Array.from({ length: 100 }, () => makePerson());
    const result = samplePersons(persons, 25);
    expect(result).toHaveLength(25);
  });

  it("respects weights - heavier persons appear more often", () => {
    const heavy = makePerson({ weight: 900, age: 20 });
    const light = makePerson({ weight: 100, age: 80 });
    const persons = [heavy, light];

    // Sample many times to check distribution
    let heavyCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      const sample = samplePersons(persons, 1);
      if (sample[0].age === 20) heavyCount++;
    }

    // heavy should be picked ~90% of the time (900/1000)
    expect(heavyCount / total).toBeGreaterThan(0.75);
    expect(heavyCount / total).toBeLessThan(0.99);
  });

  it("handles zero weights with uniform fallback", () => {
    const persons = [
      makePerson({ weight: 0, age: 20 }),
      makePerson({ weight: 0, age: 40 }),
      makePerson({ weight: 0, age: 60 }),
    ];
    const result = samplePersons(persons, 2);
    expect(result).toHaveLength(2);
  });
});

describe("sampleAcrossDistricts", () => {
  it("samples proportionally across districts", () => {
    const district1 = Array.from({ length: 50 }, () =>
      makePerson({ zcta: "10001" })
    );
    const district2 = Array.from({ length: 50 }, () =>
      makePerson({ zcta: "10002" })
    );

    const result = sampleAcrossDistricts(
      [
        { persons: district1, share: 0.7 },
        { persons: district2, share: 0.3 },
      ],
      100
    );

    expect(result).toHaveLength(100);

    const fromD1 = result.filter((p) => p.zcta === "10001").length;
    const fromD2 = result.filter((p) => p.zcta === "10002").length;

    // Should be roughly 70/30 (with some tolerance)
    expect(fromD1).toBeGreaterThan(55);
    expect(fromD2).toBeGreaterThan(20);
  });

  it("handles single district", () => {
    const persons = Array.from({ length: 50 }, () => makePerson());
    const result = sampleAcrossDistricts(
      [{ persons, share: 1.0 }],
      10
    );
    expect(result).toHaveLength(10);
  });
});

describe("filterByZcta", () => {
  it("filters to matching ZCTA", () => {
    const persons = [
      makePerson({ zcta: "10001" }),
      makePerson({ zcta: "10002" }),
      makePerson({ zcta: "10001" }),
      makePerson({ zcta: "10003" }),
    ];

    const result = filterByZcta(persons, "10001");
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.zcta === "10001")).toBe(true);
  });

  it("returns empty array when no matches", () => {
    const persons = [makePerson({ zcta: "10001" })];
    expect(filterByZcta(persons, "99999")).toHaveLength(0);
  });
});
