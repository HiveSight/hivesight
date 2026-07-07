import { describe, expect, it } from "vitest";
import {
  headlineFromDistribution,
  subgroupBreakdowns,
  weightedDistribution,
} from "../aggregate";
import {
  ageBand,
  cellMatchesFilters,
  earnedIncomeBand,
  sampleMatchesFilters,
} from "../bands";
import { parseDistribution } from "../elicit";
import { cellUserPrompt, describeCell } from "../prompts";
import { reduceToCells, systematicSample } from "../data";
import { sampleForVerbatims } from "../verbatims";
import type { Cell, ResponseFormat, SampleRecord } from "../types";

const likert: ResponseFormat = { kind: "likert5" };

function cell(overrides: Partial<Cell>): Cell {
  return {
    age: "30-44",
    income: "$25k-$74,999",
    sex: "women",
    weight: 100,
    n: 10,
    detailed: false,
    ...overrides,
  };
}

function person(overrides: Partial<SampleRecord>): SampleRecord {
  return {
    age: 35,
    is_female: true,
    employment_income: 50000,
    self_employment_income: 0,
    tenure_type: 1,
    children_count: 0,
    receives_snap: false,
    receives_ssi: false,
    receives_tanf: false,
    receives_social_security: false,
    receives_unemployment: false,
    is_in_college: false,
    is_disabled: false,
    weight: 1,
    ...overrides,
  };
}

describe("bands", () => {
  it("assigns age bands at boundaries", () => {
    expect(ageBand(18)).toBe("18-29");
    expect(ageBand(29)).toBe("18-29");
    expect(ageBand(30)).toBe("30-44");
    expect(ageBand(45)).toBe("45-64");
    expect(ageBand(64)).toBe("45-64");
    expect(ageBand(65)).toBe("65+");
  });

  it("assigns income bands at boundaries", () => {
    expect(earnedIncomeBand(0)).toBe("$0 earned");
    expect(earnedIncomeBand(1)).toBe("$1-$24,999");
    expect(earnedIncomeBand(24999)).toBe("$1-$24,999");
    expect(earnedIncomeBand(25000)).toBe("$25k-$74,999");
    expect(earnedIncomeBand(150000)).toBe("$150k+");
  });

  it("undetailed cells fail detailed-dimension filters", () => {
    const c = cell({ detailed: false });
    expect(cellMatchesFilters(c, { tenure: ["homeowners"] })).toBe(false);
    expect(cellMatchesFilters(c, { ageBands: ["30-44"] })).toBe(true);
  });

  it("detailed cells match detailed filters", () => {
    const c = cell({
      detailed: true,
      tenure: "homeowners",
      children: "with children at home",
      benefits: "not receiving means-tested benefits",
    });
    expect(cellMatchesFilters(c, { tenure: ["homeowners"] })).toBe(true);
    expect(cellMatchesFilters(c, { tenure: ["renters or other housing"] })).toBe(false);
  });

  it("sample filters align with cell band logic", () => {
    const p = person({ age: 67, employment_income: 0 });
    expect(sampleMatchesFilters(p, { ageBands: ["65+"] })).toBe(true);
    expect(sampleMatchesFilters(p, { incomeBands: ["$0 earned"] })).toBe(true);
    expect(sampleMatchesFilters(p, { incomeBands: ["$150k+"] })).toBe(false);
  });
});

describe("parseDistribution", () => {
  it("parses and normalizes integer percentages", () => {
    const dist = parseDistribution(
      '{"strongly_disagree": 10, "disagree": 20, "neither": 30, "agree": 30, "strongly_agree": 10}',
      likert
    );
    expect(dist).not.toBeNull();
    expect(dist!.agree).toBeCloseTo(0.3);
    const total = Object.values(dist!).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1);
  });

  it("normalizes when values do not sum to 100", () => {
    const dist = parseDistribution('{"yes": 3, "no": 1}', { kind: "binary" });
    expect(dist!.yes).toBeCloseTo(0.75);
  });

  it("rejects missing options and negative mass", () => {
    expect(parseDistribution('{"yes": 50}', { kind: "binary" })).toBeNull();
    expect(parseDistribution('{"yes": -5, "no": 105}', { kind: "binary" })).toBeNull();
    expect(parseDistribution("not json", likert)).toBeNull();
  });

  it("accepts label-keyed replies for choice formats", () => {
    const format: ResponseFormat = { kind: "choice", options: ["Bus", "Car"] };
    const dist = parseDistribution('{"Bus": 40, "Car": 60}', format);
    expect(dist!.option_0).toBeCloseTo(0.4);
  });
});

describe("aggregation", () => {
  it("weights cell distributions by population weight", () => {
    const estimates = [
      { cell: cell({ weight: 300 }), dist: { yes: 1, no: 0 } },
      { cell: cell({ weight: 100 }), dist: { yes: 0, no: 1 } },
    ];
    const dist = weightedDistribution(estimates, { kind: "binary" });
    expect(dist.yes).toBeCloseTo(0.75);
  });

  it("computes subgroup breakdowns with coverage", () => {
    const estimates = [
      { cell: cell({ age: "18-29", weight: 100 }), dist: { yes: 0.8, no: 0.2 } },
      { cell: cell({ age: "65+", weight: 100 }), dist: { yes: 0.2, no: 0.8 } },
    ];
    const subs = subgroupBreakdowns(estimates, { kind: "binary" });
    const young = subs.find((s) => s.dimension === "Age" && s.label === "18-29");
    expect(young!.dist.yes).toBeCloseTo(0.8);
    expect(young!.weightShare).toBeCloseTo(0.5);
  });

  it("skips dimensions cells do not encode", () => {
    const estimates = [
      { cell: cell({ detailed: false }), dist: { yes: 1, no: 0 } },
      { cell: cell({ age: "65+", detailed: false }), dist: { yes: 1, no: 0 } },
    ];
    const subs = subgroupBreakdowns(estimates, { kind: "binary" });
    expect(subs.some((s) => s.dimension === "Housing")).toBe(false);
  });

  it("derives headlines per format", () => {
    expect(
      headlineFromDistribution(
        { strongly_disagree: 0.1, disagree: 0.1, neither: 0.2, agree: 0.4, strongly_agree: 0.2 },
        likert
      )
    ).toEqual({ label: "agree or strongly agree", value: expect.closeTo(0.6) });
    const choice = headlineFromDistribution(
      { option_0: 0.7, option_1: 0.3 },
      { kind: "choice", options: ["Bus", "Car"] }
    );
    expect(choice.label).toBe("Bus");
  });
});

describe("reduceToCells", () => {
  it("merges sub-threshold cells into base cells and conserves weight", () => {
    const persons = Array.from({ length: 1000 }, (_, i) =>
      person({
        age: 20 + (i % 50),
        employment_income: (i % 5) * 30000,
        is_female: i % 2 === 0,
        tenure_type: i % 3 === 0 ? 1 : 2,
        weight: 10,
      })
    );
    const table = reduceToCells(persons, "test");
    const cellWeight = table.cells.reduce((s, c) => s + c.weight, 0);
    expect(cellWeight).toBeCloseTo(table.totalWeight);
    expect(table.cells.every((c) => c.weight > 0)).toBe(true);
  });
});

describe("sampling", () => {
  it("systematic sample respects weights approximately", () => {
    const persons = [
      ...Array.from({ length: 100 }, () => person({ age: 25, weight: 9 })),
      ...Array.from({ length: 100 }, () => person({ age: 70, weight: 1 })),
    ];
    const sample = systematicSample(persons, 50);
    const young = sample.filter((p) => p.age === 25).length;
    expect(young).toBeGreaterThan(40);
  });

  it("verbatim sampling is seeded and filter-aware", () => {
    const samples = Array.from({ length: 200 }, (_, i) =>
      person({ age: i % 2 === 0 ? 25 : 70, weight: 1 + (i % 3) })
    );
    const audience = {
      geography: { type: "national" as const, value: "US", label: "United States" },
      filters: { ageBands: ["65+"] },
    };
    const a = sampleForVerbatims(samples, audience, 5, 42);
    const b = sampleForVerbatims(samples, audience, 5, 42);
    expect(a).toEqual(b);
    expect(a.every((p) => p.age === 70)).toBe(true);
  });
});

describe("prompts", () => {
  it("describes undetailed and detailed cells", () => {
    const base = describeCell(cell({}), {
      type: "national",
      value: "US",
      label: "United States",
    });
    expect(base).toContain("aged 30-44");
    expect(base).toContain("$25k-$74,999");
    expect(base).not.toContain("homeowners");

    const detailed = describeCell(
      cell({
        detailed: true,
        tenure: "homeowners",
        children: "without children at home",
        benefits: "not receiving means-tested benefits",
        social_security: "receiving Social Security",
      }),
      { type: "state", value: "MI", label: "Michigan" }
    );
    expect(detailed).toContain("Michigan");
    expect(detailed).toContain("receiving Social Security");
  });

  it("choice prompts enumerate options with stable ids", () => {
    const prompt = cellUserPrompt(
      cell({}),
      { type: "national", value: "US", label: "United States" },
      "Which do you prefer?",
      { kind: "choice", options: ["Bus", "Car"] }
    );
    expect(prompt).toContain("option_0: Bus");
    expect(prompt).toContain('"option_1": n');
  });
});
