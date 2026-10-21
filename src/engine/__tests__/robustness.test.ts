import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseDistribution } from "../elicit";
import type { LlmClient } from "../elicit";
import { runEstimate } from "../run";
import { sampleForVerbatims } from "../verbatims";
import type { ResponseFormat, SampleRecord } from "../types";
import { optionIds } from "../types";
import { canonicalGeography, STATES } from "@/lib/geographies";
import { RunRequestSchema } from "@/lib/schema";

const binary: ResponseFormat = { kind: "binary" };
const delaware = { type: "state" as const, value: "DE", label: "Delaware" };

/** An LLM stub answering each call from `reply(callIndex)`. */
function stubLlm(reply: (i: number) => string | Error): LlmClient {
  let i = 0;
  return {
    async complete() {
      const r = reply(i++);
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe("parseDistribution", () => {
  it.each(["null", "[]", "[1, 2]", "5", '"yes"', "true", "", "{"])(
    "returns null for %j instead of throwing",
    (content) => {
      expect(parseDistribution(content, binary)).toBeNull();
    }
  );

  it("keeps huge finite values from overflowing", () => {
    expect(parseDistribution('{"yes": 9e307, "no": 9e307}', binary)).toEqual({ yes: 0.5, no: 0.5 });
  });

  it("rejects all-zero and negative replies", () => {
    expect(parseDistribution('{"yes": 0, "no": 0}', binary)).toBeNull();
    expect(parseDistribution('{"yes": -1, "no": 2}', binary)).toBeNull();
  });

  // Invariant: any reply covering the options with non-negative finite
  // numbers and positive mass parses to a distribution proportional to it.
  it("returns a proportional probability distribution for every valid reply", () => {
    const formats: ResponseFormat[] = [
      binary,
      { kind: "likert5" },
      { kind: "choice", options: ["a", "b", "c"] },
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...formats),
        fc.array(fc.double({ min: 0, max: 1e300, noNaN: true }), { minLength: 5, maxLength: 5 }),
        (format, raw) => {
          const ids = optionIds(format);
          const values = raw.slice(0, ids.length);
          fc.pre(Math.max(...values) > 0);
          const dist = parseDistribution(JSON.stringify(Object.fromEntries(ids.map((id, i) => [id, values[i]]))), format);
          expect(dist).not.toBeNull();
          const total = ids.reduce((s, id) => s + dist![id], 0);
          expect(total).toBeCloseTo(1, 9);
          const max = Math.max(...values);
          ids.forEach((id, i) => {
            expect(dist![id]).toBeGreaterThanOrEqual(0);
            expect(dist![id] * total).toBeCloseTo((values[i] / max) / values.reduce((s, v) => s + v / max, 0), 9);
          });
        }
      )
    );
  });
});

describe("runEstimate failure handling", () => {
  const spec = {
    question: "Do you support a four-day work week?",
    format: binary,
    audience: { geography: delaware, filters: {} },
    model: "gpt-6-luna",
    verbatimCount: 0,
    seed: 1,
  };

  it("survives a null reply and a thrown call, and discloses the weight it rests on", async () => {
    const llm = stubLlm((i) =>
      i === 0 ? "null" : i === 1 ? new Error("upstream 500") : '{"yes": 60, "no": 40}'
    );
    const result = await runEstimate(spec, llm);
    const p = result.provenance;
    expect(p.cellFailures).toBe(2);
    expect(p.elicitedWeight).toBeLessThan(p.eligibleWeight);
    expect(p.elicitedShare).toBeCloseTo(p.elicitedWeight / p.eligibleWeight, 12);
    expect(result.topline.yes).toBeCloseTo(0.6, 12);
  });

  it("reports full coverage when every cell succeeds", async () => {
    const result = await runEstimate(spec, stubLlm(() => '{"yes": 1, "no": 3}'));
    expect(result.provenance.cellFailures).toBe(0);
    expect(result.provenance.elicitedShare).toBeCloseTo(1, 12);
  });

  it("fails with a plain message, not the provider's, when every cell fails", async () => {
    const llm = stubLlm(() => new Error("Incorrect API key provided: sk-proj-****abcd"));
    await expect(runEstimate(spec, llm)).rejects.toThrow(/^All cell elicitations failed\.$/);
  });

  // Invariant: 0 <= elicitedShare <= 1 and the topline is a distribution,
  // whichever cells fail.
  it("keeps coverage and the topline well formed under any failure pattern", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.boolean(), { minLength: 1, maxLength: 64 }), async (fails) => {
        fc.pre(fails.some((f) => !f));
        const llm = stubLlm((i) => (fails[i % fails.length] ? "not json" : '{"yes": 3, "no": 1}'));
        const result = await runEstimate(spec, llm).catch(() => null);
        fc.pre(result !== null);
        const p = result!.provenance;
        expect(p.elicitedShare).toBeGreaterThan(0);
        expect(p.elicitedShare).toBeLessThanOrEqual(1 + 1e-12);
        expect(result!.topline.yes + result!.topline.no).toBeCloseTo(1, 12);
      }),
      { numRuns: 25 }
    );
  });
});

describe("geography", () => {
  const request = (geography: Record<string, string>) => ({
    question: "Do you support a four-day work week?",
    format: binary,
    audience: { geography },
  });

  it("derives the label from the value, ignoring the caller's label", () => {
    const parsed = RunRequestSchema.parse(request({ type: "state", value: "CA", label: "New York" }));
    expect(parsed.audience.geography).toEqual({ type: "state", value: "CA", label: "California" });
    const national = RunRequestSchema.parse(request({ type: "national", value: "US", label: "California" }));
    expect(national.audience.geography.label).toBe("United States");
  });

  it("normalizes district codes and rejects unknown places", () => {
    expect(RunRequestSchema.parse(request({ type: "district", value: "ca-12" })).audience.geography).toEqual({
      type: "district",
      value: "CA-12",
      label: "Congressional district CA-12",
    });
    for (const g of [
      { type: "state", value: "ZZ" },
      { type: "district", value: "ZZ-1" },
      { type: "district", value: "CA" },
      { type: "national", value: "CA" },
    ]) {
      expect(RunRequestSchema.safeParse(request(g)).success).toBe(false);
    }
  });

  // Invariant: canonicalization is idempotent and independent of label input.
  it("is idempotent for every state", () => {
    for (const s of STATES) {
      const once = canonicalGeography("state", s.value.toLowerCase())!;
      expect(canonicalGeography(once.type, once.value)).toEqual(once);
      expect(once.label).toBe(s.label);
    }
  });
});

describe("verbatim sampling", () => {
  const record = (age: number, weight: number): SampleRecord => ({
    age,
    is_female: false,
    employment_income: 0,
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
    weight,
  });
  // Half the pool carries 9x the weight of the other half.
  const pool = [
    ...Array.from({ length: 100 }, () => record(25, 9)),
    ...Array.from({ length: 100 }, () => record(70, 1)),
  ];
  const audience = { geography: delaware, filters: {} };

  it("draws a PPS pool with equal probability", () => {
    const picked = sampleForVerbatims(pool, audience, 20, 3, "pps");
    expect(picked.filter((p) => p.age === 25)).toHaveLength(10);
  });

  it("draws a full-population pool in proportion to weight", () => {
    const picked = sampleForVerbatims(pool, audience, 20, 3, "population");
    expect(picked.filter((p) => p.age === 25)).toHaveLength(18);
  });
});
