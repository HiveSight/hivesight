import { describe, expect, it, vi } from "vitest";
import type { LlmClient } from "../elicit";
import { runEstimate } from "../run";

/**
 * The individual mode end to end on the national pool. The study module is
 * stubbed with K* = 150 so the path stays tested whatever the registered
 * artifact supports (paper/artifacts/individual-sim.json).
 */
vi.mock("../individual-study", () => ({
  INDIVIDUAL_PEOPLE: 150,
  INDIVIDUAL_MODELS: ["gpt-6-luna"],
  individualModeEnabled: () => true,
  INDIVIDUAL_BENCHMARK_SOURCE: "stub",
  individualBenchmarkFor: (model: string) =>
    model === "gpt-6-luna" ? { topline: 0.09, subgroup: 0.1, items: 63, people: 150, source: "stub" } : null,
}));

function stubLlm(reply: (system: string) => string): LlmClient & { calls: number } {
  const client = {
    calls: 0,
    async complete({ system }: { system: string }) {
      client.calls++;
      return reply(system);
    },
  };
  return client;
}

const national = { type: "national" as const, value: "US", label: "United States" };

describe("individual mode, end to end", () => {
  it("asks K* people from the national pool, averages them, and shows its own benchmark", async () => {
    const llm = stubLlm((system) => (system.includes("woman") ? '{"option_0": 80, "option_1": 20}' : '{"option_0": 40, "option_1": 60}'));
    const result = await runEstimate(
      {
        question: "Do you support a four-day work week?",
        format: { kind: "binary" },
        audience: { geography: national, filters: {} },
        model: "gpt-6-luna",
        mode: "individual",
        seed: 3,
        verbatimCount: 0,
      },
      llm
    );
    const p = result.provenance;
    expect(llm.calls).toBe(150);
    expect(p.mode).toBe("individual");
    expect(p.engineVersion).toBe("engine:v1-individual");
    expect(p.people).toEqual({ eligible: 1200, asked: 150, answered: 150, pool: "pps" });
    expect(p.elicitedShare).toBeCloseTo(1, 12);
    expect(p.populationShare).toBeCloseTo(1, 12);
    const women = result.subgroups.find((s) => s.dimension === "Sex" && s.label === "women")!;
    const men = result.subgroups.find((s) => s.dimension === "Sex" && s.label === "men")!;
    expect(women.dist.yes).toBeCloseTo(0.8, 12);
    expect(men.dist.yes).toBeCloseTo(0.4, 12);
    // The topline is the people-weighted mix of the two groups.
    expect(result.topline.yes).toBeCloseTo(0.8 * women.weightShare + 0.4 * men.weightShare, 12);
    expect(result.benchmarkError).toEqual({ topline: 0.09, subgroup: 0.1, items: 63, people: 150, source: "stub" });
  });

  it("asks everyone eligible when the audience has fewer records than K*", async () => {
    const llm = stubLlm(() => '{"option_0": 50, "option_1": 50}');
    const result = await runEstimate(
      {
        question: "Do you support a four-day work week?",
        format: { kind: "binary" },
        audience: { geography: national, filters: { ageBands: ["65+"], sexes: ["women"] } },
        model: "gpt-6-luna",
        mode: "individual",
        seed: 3,
        verbatimCount: 0,
      },
      llm
    );
    const people = result.provenance.people!;
    expect(people.eligible).toBeLessThan(150);
    expect(people.asked).toBe(people.eligible);
    expect(llm.calls).toBe(people.eligible);
    expect(result.provenance.populationShare).toBeCloseTo(people.eligible / 1200, 12);
  });
});
