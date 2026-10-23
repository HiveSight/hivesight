import { readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as runner from "../../../evals/run-anchor-bank-v2.mjs";
import study from "../../../paper/artifacts/individual-sim.json";
import type { LlmClient } from "../elicit";
import { LlmRequestError } from "../elicit";
import {
  drawPeople,
  elicitIndividuals,
  individualBenchmarkFor,
  INDIVIDUAL_MODELS,
  INDIVIDUAL_PEOPLE,
  individualModeEnabled,
  meanDistribution,
  MIN_PEOPLE,
  personBreakdowns,
} from "../individual";
import { describePersona, PERSONA_SYSTEM_PROMPT, personaProbUserPrompt } from "../prompts";
import { runEstimate } from "../run";
import type { AudienceSpec, ResponseFormat, SampleRecord } from "../types";
import { RunRequestSchema } from "@/lib/schema";

const ROOT = path.join(__dirname, "..", "..", "..");
const us = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "v1", "US.json"), "utf-8"));
const bank = JSON.parse(readFileSync(path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v2.json"), "utf-8"));
const national = { type: "national" as const, value: "US", label: "United States" };
const everyone: AudienceSpec = { geography: national, filters: {} };

function person(overrides: Partial<SampleRecord> = {}): SampleRecord {
  return {
    age: 35, is_female: true, employment_income: 50000, self_employment_income: 0, tenure_type: 1,
    children_count: 0, receives_snap: false, receives_ssi: false, receives_tanf: false,
    receives_social_security: false, receives_unemployment: false, is_in_college: false,
    is_disabled: false, weight: 1, ...overrides,
  };
}

describe("individual mode speaks for the benchmarked prompts", () => {
  it("uses the runner's persona system prompt and description for national audiences", () => {
    for (const p of us.samples.slice(0, 200)) {
      expect(PERSONA_SYSTEM_PROMPT + describePersona(p, national)).toBe(runner.personaSystemFor(p));
    }
  });

  it("asks the runner's persona-prob question for bank items without volunteered options or notes", () => {
    const items = bank.items.filter(
      (i: { volunteered?: number[]; universeNote?: string | null }) => !i.volunteered?.length && !i.universeNote
    );
    expect(items.length).toBeGreaterThan(40);
    for (const item of items) {
      const format: ResponseFormat = { kind: "choice", options: item.options };
      expect(personaProbUserPrompt(item.wording, format)).toBe(runner.personaProbPrompt(item));
    }
  });

  it("names the state for state audiences", () => {
    expect(describePersona(person(), { type: "state", value: "MI", label: "Michigan" })).toContain(
      "living in Michigan."
    );
  });

  it("asks yes/no questions as the Yes/No choice and covers listed nonresponse options", () => {
    expect(personaProbUserPrompt("Do you vote?", { kind: "binary" })).toContain("option_0: Yes\noption_1: No");
    const dk = personaProbUserPrompt("Pick one", { kind: "choice", options: ["A", "Don't know"] });
    expect(dk).toContain("including any don't-know or refusal answer");
    expect(dk).not.toContain("no share for don't know");
  });
});

describe("drawing people", () => {
  const pool = Array.from({ length: 300 }, (_, i) => person({ age: 18 + (i % 70), weight: 1 + (i % 4) }));

  it("draws k distinct eligible records, in pool order, reproducibly", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), fc.integer(), (k, seed) => {
        const a = drawPeople(pool, everyone, k, seed);
        const b = drawPeople(pool, everyone, k, seed);
        const idx = a.people.map((p) => pool.indexOf(p));
        return (
          a.people.length === Math.min(k, pool.length) &&
          new Set(idx).size === idx.length &&
          idx.every((v, i) => i === 0 || v > idx[i - 1]) &&
          a.people.every((p, i) => p === b.people[i])
        );
      })
    );
  });

  it("respects audience filters", () => {
    const old: AudienceSpec = { geography: national, filters: { ageBands: ["65+"] } };
    const { eligible, people } = drawPeople(pool, old, 20, 7);
    expect(eligible.every((p) => p.age >= 65)).toBe(true);
    expect(people.every((p) => p.age >= 65)).toBe(true);
    expect(people).toHaveLength(20);
  });

  it("draws with equal probability, ignoring weights", () => {
    const hits = new Array(pool.length).fill(0);
    for (let seed = 0; seed < 3000; seed++) {
      for (const p of drawPeople(pool, everyone, 30, seed).people) hits[pool.indexOf(p)]++;
    }
    const heavy = hits.filter((_, i) => pool[i].weight === 4);
    const light = hits.filter((_, i) => pool[i].weight === 1);
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    // Expected 3000 * 30 / 300 = 300 draws per record either way.
    expect(mean(heavy)).toBeGreaterThan(285);
    expect(mean(heavy)).toBeLessThan(315);
    expect(mean(light)).toBeGreaterThan(285);
    expect(mean(light)).toBeLessThan(315);
  });
});

describe("aggregating people", () => {
  const binary: ResponseFormat = { kind: "binary" };
  const est = (p: Partial<SampleRecord>, yes: number) => ({ person: person(p), dist: { yes, no: 1 - yes } });

  it("weights a pps pool equally and a population pool by record weight", () => {
    const list = [est({ weight: 3 }, 1), est({ weight: 1 }, 0)];
    expect(meanDistribution(list, binary, "pps").yes).toBeCloseTo(0.5, 12);
    expect(meanDistribution(list, binary, "population").yes).toBeCloseTo(0.75, 12);
  });

  it("breaks down by every person attribute and hides groups under 10 people", () => {
    const list = [
      ...Array.from({ length: 12 }, () => est({ age: 25 }, 0.8)),
      ...Array.from({ length: 9 }, () => est({ age: 70 }, 0.2)),
    ];
    const subs = personBreakdowns(list, binary, "pps");
    const age = subs.filter((s) => s.dimension === "Age");
    expect(age.map((s) => s.label)).toEqual(["18-29"]);
    expect(age[0].dist.yes).toBeCloseTo(0.8, 12);
    expect(age[0].weightShare).toBeCloseTo(12 / 21, 12);
    expect(age[0].coverage).toBe(1);
    // Every person is a homeowner: one group, no breakdown.
    expect(subs.some((s) => s.dimension === "Housing")).toBe(false);
  });

  it("topline and subgroups are distributions within the range of individual answers", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ age: fc.integer({ min: 18, max: 90 }), yes: fc.double({ min: 0, max: 1, noNaN: true }), weight: fc.double({ min: 0.1, max: 5, noNaN: true }) }), { minLength: 1, maxLength: 80 }),
        fc.constantFrom("pps" as const, "population" as const),
        (rows, pool) => {
          const list = rows.map((r) => est({ age: r.age, weight: r.weight }, r.yes));
          const lo = Math.min(...rows.map((r) => r.yes)) - 1e-12;
          const hi = Math.max(...rows.map((r) => r.yes)) + 1e-12;
          const top = meanDistribution(list, binary, pool);
          if (Math.abs(top.yes + top.no - 1) > 1e-9 || top.yes < lo || top.yes > hi) return false;
          return personBreakdowns(list, binary, pool).every(
            (s) => Math.abs(s.dist.yes + s.dist.no - 1) < 1e-9 && s.dist.yes >= lo && s.dist.yes <= hi
          );
        }
      )
    );
  });
});

/** An LLM stub answering each call from `reply(user, system, callIndex)`. */
function stubLlm(reply: (args: { system: string; user: string }, i: number) => string | Error): LlmClient & { calls: number } {
  const client = {
    calls: 0,
    async complete(args: { system: string; user: string }) {
      const r = reply(args, client.calls++);
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return client;
}

describe("elicitIndividuals", () => {
  const pool = Array.from({ length: 60 }, (_, i) => person({ age: 20 + i }));
  const binary: ResponseFormat = { kind: "binary" };

  it("asks each drawn person once and drops unparsed replies", async () => {
    const llm = stubLlm((_, i) => (i % 10 === 0 ? "garbled" : '{"option_0": 70, "option_1": 30}'));
    const r = await elicitIndividuals({ llm, model: "m", question: "Do you vote?", format: binary, audience: everyone, samples: pool, seed: 1, people: 40 });
    expect(llm.calls).toBe(40);
    expect(r.asked).toHaveLength(40);
    expect(r.estimates).toHaveLength(36);
    expect(r.estimates[0].dist.yes).toBeCloseTo(0.7, 12);
  });

  it("refuses audiences with too few people, and stops on a rejected request", async () => {
    const llm = stubLlm(() => '{"option_0": 1, "option_1": 1}');
    const few: AudienceSpec = { geography: national, filters: { ageBands: ["18-29"] } };
    await expect(
      elicitIndividuals({ llm, model: "m", question: "q", format: binary, audience: few, samples: pool.slice(0, MIN_PEOPLE - 1), seed: 1, people: 40 })
    ).rejects.toThrow(/needs at least/);
    const rejecting = stubLlm(() => new LlmRequestError("bad key"));
    await expect(
      elicitIndividuals({ llm: rejecting, model: "m", question: "q", format: binary, audience: everyone, samples: pool, seed: 1, people: 40 })
    ).rejects.toBeInstanceOf(LlmRequestError);
  });
});

describe("registered study wiring", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never ships a mock-mode artifact", () => {
    expect(study).not.toHaveProperty("MOCK_DATA");
  });

  it("takes people per run and displayed accuracy from the study artifact", () => {
    const rule = study.productRule as { people: number | null; gate: { byModel: Record<string, { passes: boolean }> } };
    const passing = Object.entries(rule.gate.byModel).filter(([, g]) => g.passes).map(([m]) => m);
    expect([...INDIVIDUAL_MODELS].sort()).toEqual(passing.sort());
    expect(INDIVIDUAL_PEOPLE).toBe(passing.length ? rule.people : 0);
    for (const model of INDIVIDUAL_MODELS) {
      const b = individualBenchmarkFor(model)!;
      expect(b.items).toBe(63);
      expect(b.people).toBe(INDIVIDUAL_PEOPLE);
      expect(b.topline).toBeGreaterThan(0);
      expect(b.subgroup).toBeGreaterThan(0);
    }
  });

  const request = {
    question: "Do you support a four-day work week?",
    format: { kind: "binary" },
    audience: { geography: national },
  };

  it("keeps population cells the default and the mode off unless the server turns it on", () => {
    expect(RunRequestSchema.parse(request).mode).toBe("cells");
    expect(individualModeEnabled()).toBe(false);
    for (const model of ["gpt-6-luna", "gpt-6.1-sol"]) {
      expect(RunRequestSchema.safeParse({ ...request, model, mode: "individual" }).success).toBe(false);
    }
    vi.stubEnv("HIVESIGHT_INDIVIDUAL_MODE", "on");
    expect(individualModeEnabled()).toBe(INDIVIDUAL_PEOPLE > 0);
    for (const model of ["gpt-6-luna", "gpt-6.1-sol"]) {
      const ok = RunRequestSchema.safeParse({ ...request, model, mode: "individual" }).success;
      expect(ok).toBe(INDIVIDUAL_MODELS.includes(model));
    }
    expect(RunRequestSchema.safeParse({ ...request, mode: "people" }).success).toBe(false);
  });

  it("leaves cells runs unchanged", async () => {
    const llm = stubLlm(() => '{"option_0": 50, "option_1": 50}');
    const result = await runEstimate(
      { question: "Do you support a four-day work week?", format: { kind: "binary" }, audience: everyone, model: "gpt-6-luna", seed: 3, verbatimCount: 0 },
      llm
    );
    expect(result.provenance.mode).toBe("cells");
    expect(result.provenance.engineVersion).toBe("engine:v1-cells");
    expect(result.provenance.people).toBeUndefined();
    expect(llm.calls).toBe(149);
  });
});
