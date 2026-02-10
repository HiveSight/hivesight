import { describe, it, expect } from "vitest";
import { formatPersonDescription, formatSexLabel, formatTenureLabel } from "../demographics";
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
    weight: 142.5,
    ...overrides,
  };
}

describe("formatPersonDescription", () => {
  it("generates description for typical employed person", () => {
    const desc = formatPersonDescription(makePerson());
    expect(desc).toContain("35-year-old");
    expect(desc).toContain("White");
    expect(desc).toContain("man");
    expect(desc).toContain("software developer");
    expect(desc).toContain("$65,000");
    expect(desc).toContain("renter");
    expect(desc).toContain("2 children");
    expect(desc).toContain("10701");
  });

  it("describes female correctly", () => {
    const desc = formatPersonDescription(makePerson({ is_female: true }));
    expect(desc).toContain("woman");
  });

  it("includes Hispanic ethnicity", () => {
    const desc = formatPersonDescription(
      makePerson({ is_hispanic: true })
    );
    expect(desc).toContain("Hispanic/Latino");
  });

  it("describes college student", () => {
    const desc = formatPersonDescription(
      makePerson({ is_in_college: true, employment_income: 0, age: 20 })
    );
    expect(desc).toContain("college student");
  });

  it("describes disabled person", () => {
    const desc = formatPersonDescription(
      makePerson({ is_disabled: true })
    );
    expect(desc).toContain("disability");
  });

  it("describes unemployed person", () => {
    const desc = formatPersonDescription(
      makePerson({ employment_income: 0, self_employment_income: 0 })
    );
    expect(desc).toContain("not currently employed");
  });

  it("includes homeowner status", () => {
    const desc = formatPersonDescription(makePerson({ tenure_type: 1 }));
    expect(desc).toContain("homeowner");
  });

  it("includes Medicare insurance", () => {
    const desc = formatPersonDescription(
      makePerson({ has_medicare: true })
    );
    expect(desc).toContain("Medicare");
  });

  it("includes Medicaid insurance", () => {
    const desc = formatPersonDescription(
      makePerson({ has_medicaid: true })
    );
    expect(desc).toContain("Medicaid");
  });

  it("includes benefits", () => {
    const desc = formatPersonDescription(
      makePerson({ receives_snap: true, receives_social_security: true })
    );
    expect(desc).toContain("SNAP");
    expect(desc).toContain("Social Security");
  });

  it("handles single child", () => {
    const desc = formatPersonDescription(makePerson({ children_count: 1 }));
    expect(desc).toContain("1 child");
    expect(desc).not.toContain("children");
  });

  it("handles no children", () => {
    const desc = formatPersonDescription(makePerson({ children_count: 0 }));
    expect(desc).not.toContain("child");
  });
});

describe("formatSexLabel", () => {
  it("returns Female for true", () => {
    expect(formatSexLabel(true)).toBe("Female");
  });

  it("returns Male for false", () => {
    expect(formatSexLabel(false)).toBe("Male");
  });
});

describe("formatTenureLabel", () => {
  it("returns homeowner for 1", () => {
    expect(formatTenureLabel(1)).toBe("homeowner");
  });

  it("returns renter for 2", () => {
    expect(formatTenureLabel(2)).toBe("renter");
  });

  it("returns Unknown for other values", () => {
    expect(formatTenureLabel(99)).toBe("Unknown");
  });
});
