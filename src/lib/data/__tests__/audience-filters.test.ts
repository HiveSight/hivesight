import { describe, expect, it } from "vitest";
import {
  filterPersonsForAudience,
  getAudienceFilterSummary,
  getPersonRaceEthnicityCategory,
} from "../audience-filters";
import type { PersonRecord } from "@/types";

function makePerson(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    age: 35,
    is_female: false,
    cps_race: 1,
    is_hispanic: false,
    employment_income: 65000,
    self_employment_income: 0,
    occupation_code: 1020,
    tenure_type: 2,
    children_count: 2,
    is_in_college: false,
    is_disabled: false,
    has_medicaid: false,
    has_medicare: false,
    receives_ssi: false,
    receives_snap: false,
    receives_tanf: false,
    receives_unemployment: false,
    receives_social_security: false,
    zcta: "10701",
    weight: 1,
    ...overrides,
  };
}

describe("audience filters", () => {
  it("filters people across typed demographic and household fields", () => {
    const people = [
      makePerson({ age: 28, is_female: true, is_hispanic: true, tenure_type: 1 }),
      makePerson({ age: 55, is_female: false, cps_race: 2, tenure_type: 2 }),
      makePerson({ age: 34, is_female: true, cps_race: 4, tenure_type: 2 }),
    ];

    const filtered = filterPersonsForAudience(people, {
      ageRange: [25, 40],
      sex: "female",
      housingTenure: ["owner", "renter"],
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((person) => person.is_female)).toBe(true);
  });

  it("maps CPS race and Hispanic origin to audience categories", () => {
    expect(getPersonRaceEthnicityCategory(makePerson({ is_hispanic: true }))).toBe(
      "hispanic"
    );
    expect(getPersonRaceEthnicityCategory(makePerson({ cps_race: 2 }))).toBe(
      "black"
    );
    expect(getPersonRaceEthnicityCategory(makePerson({ cps_race: 7 }))).toBe(
      "multiracial"
    );
  });

  it("summarizes filters for provenance UI", () => {
    expect(
      getAudienceFilterSummary({
        incomeRange: [0, 50000],
        insurance: ["medicaid"],
        occupationQuery: "nurse",
      })
    ).toEqual([
      "Earned income $0-$50,000",
      "Medicaid",
      "Occupation contains \"nurse\"",
    ]);
  });
});
