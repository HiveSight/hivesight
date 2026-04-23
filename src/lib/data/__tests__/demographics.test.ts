import { describe, it, expect } from "vitest";
import { formatPersonDescription, formatSexLabel, formatTenureLabel } from "../demographics";
import type { LocationFilter, PersonRecord } from "@/types";

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

function makeLocation(
  overrides: Partial<LocationFilter> = {}
): LocationFilter {
  return {
    type: "state",
    value: "NY",
    label: "New York",
    ...overrides,
  };
}

describe("formatPersonDescription", () => {
  it("keeps the default no-options path minimal", () => {
    const desc = formatPersonDescription(makePerson());

    expect(desc).toContain("adult in their 30s");
    expect(desc).toContain("United States");
    expect(desc).not.toContain("White");
    expect(desc).not.toContain("man");
    expect(desc).not.toContain("SNAP");
    expect(desc).not.toContain("10701");
  });

  it("uses banded core context by default", () => {
    const desc = formatPersonDescription(makePerson(), {
      question: "Should the minimum wage increase?",
      location: makeLocation(),
    });

    expect(desc).toContain("adult in their 30s");
    expect(desc).toContain("living in New York");
    expect(desc).toContain("software developer");
    expect(desc).toContain("middle income");
    expect(desc).toContain("rent their home");
    expect(desc).toContain("2 children");
    expect(desc).not.toContain("$65,000");
    expect(desc).not.toContain("White");
    expect(desc).not.toContain("man");
    expect(desc).not.toContain("10701");
    expect(desc).not.toContain("142.5");
  });

  it("includes race and sex for identity-relevant questions", () => {
    const desc = formatPersonDescription(makePerson({ is_female: true }), {
      question: "Do women of different racial backgrounds face discrimination at work?",
      location: makeLocation(),
    });

    expect(desc).toContain("They are a woman");
    expect(desc).toContain("identify as White");
  });

  it("keeps student status in the core summary", () => {
    const desc = formatPersonDescription(
      makePerson({ is_in_college: true, employment_income: 0, age: 20 }),
      {
        question: "Should tuition at public universities be lower?",
        location: makeLocation(),
      }
    );

    expect(desc).toContain("college student");
    expect(desc).toContain("no current earned income");
  });

  it("adds disability and public coverage for healthcare questions", () => {
    const desc = formatPersonDescription(
      makePerson({ is_disabled: true, has_medicaid: true }),
      {
        question: "Should Medicaid cover more mental health treatment?",
        location: makeLocation(),
      }
    );

    expect(desc).toContain("disability");
    expect(desc).toContain("Medicaid");
  });

  it("uses retired instead of unemployed when the profile suggests it", () => {
    const desc = formatPersonDescription(
      makePerson({
        age: 70,
        employment_income: 0,
        self_employment_income: 0,
        receives_social_security: true,
        has_medicare: true,
      }),
      {
        question: "Should Social Security benefits increase?",
        location: makeLocation(),
      }
    );

    expect(desc).toContain("retired");
    expect(desc).not.toContain("not currently working");
  });

  it("includes exact ZIP only for local questions without a narrower selected location", () => {
    const desc = formatPersonDescription(makePerson(), {
      question: "How safe do you feel in your local neighborhood?",
      location: {
        type: "national",
        value: "US",
        label: "United States",
      },
    });

    expect(desc).toContain("ZIP 10701");
  });

  it("uses selected ZIP audiences directly when that is the requested geography", () => {
    const desc = formatPersonDescription(
      makePerson(),
      {
        question: "Should bus service improve?",
        location: makeLocation({
          type: "zip",
          value: "10701",
          label: "Yonkers, NY 10701",
        }),
      }
    );

    expect(desc).toContain("ZIP 10701");
  });

  it("includes benefits only for benefits-relevant questions", () => {
    const desc = formatPersonDescription(
      makePerson({ receives_snap: true, receives_social_security: true }),
      {
        question: "Should SNAP benefits be expanded?",
        location: makeLocation(),
      }
    );

    expect(desc).toContain("SNAP");
    expect(desc).toContain("Social Security");
  });

  it("omits benefits for unrelated questions", () => {
    const desc = formatPersonDescription(
      makePerson({ receives_snap: true, receives_social_security: true }),
      {
        question: "Should new apartment construction be easier?",
        location: makeLocation(),
      }
    );

    expect(desc).not.toContain("SNAP");
    expect(desc).not.toContain("Social Security");
  });

  it("does not treat family-business language as a gender signal", () => {
    const desc = formatPersonDescription(makePerson({ is_female: true }), {
      question: "Should family businesses get a tax credit?",
      location: makeLocation(),
    });

    expect(desc).not.toContain("woman");
  });

  it("does not treat black-box language as a race signal", () => {
    const desc = formatPersonDescription(makePerson(), {
      question: "Should black box testing be required for AI systems?",
      location: makeLocation(),
    });

    expect(desc).not.toContain("identify as");
    expect(desc).not.toContain("White");
  });

  it("does not treat non-health insurance language as a health cue", () => {
    const desc = formatPersonDescription(makePerson(), {
      question: "Should car insurance rates be regulated more tightly?",
      location: makeLocation(),
    });

    expect(desc).not.toContain("Medicare");
    expect(desc).not.toContain("health coverage");
  });

  it("does not expose ZIP for national rent policy questions", () => {
    const desc = formatPersonDescription(makePerson(), {
      question: "Should rent control be national policy?",
      location: {
        type: "national",
        value: "US",
        label: "United States",
      },
    });

    expect(desc).not.toContain("10701");
  });

  it("uses clear Medicare or Medicaid wording for non-recipients", () => {
    const desc = formatPersonDescription(makePerson(), {
      question: "Should health insurance coverage be expanded?",
      location: makeLocation(),
    });

    expect(desc).toContain("not enrolled in Medicare or Medicaid");
    expect(desc).not.toContain("Their health coverage is not enrolled");
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
