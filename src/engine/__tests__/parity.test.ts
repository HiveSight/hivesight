import { describe, expect, it } from "vitest";
import * as runner from "../../../evals/run-anchor-bank-v2.mjs";
import { CELL_SYSTEM_PROMPT, describeCell } from "../prompts";
import type { Cell } from "../types";

/**
 * The evaluation runner and the production engine must elicit under the same
 * core frame: identical system prompt and identical cell descriptions, so
 * benchmark accuracy speaks for the shipped product.
 */

const cell: Cell = {
  age: "30-44",
  income: "$25k-$74,999",
  sex: "women",
  weight: 100,
  n: 10,
  detailed: true,
  tenure: "homeowners",
  children: "with children at home",
  benefits: "not receiving means-tested benefits",
  social_security: "not receiving Social Security",
};

describe("engine/runner parity", () => {
  it("system prompts are identical", () => {
    expect(runner.CELL_SYSTEM).toBe(CELL_SYSTEM_PROMPT);
  });

  it("cell descriptions are identical for national audiences", () => {
    const engineDesc = describeCell(cell, {
      type: "national",
      value: "US",
      label: "United States",
    });
    expect(runner.describeCell(cell)).toBe(engineDesc);
  });
});

describe("persona arm (model refresh)", () => {
  const item = {
    itemId: "gss_trust",
    wording: "Generally speaking, would you say that most people can be trusted?",
    options: ["Can trust", "Can't be too careful", "Depends"],
    volunteered: [2],
  };

  it("draws the same records for an item regardless of run order", () => {
    expect(runner.itemSeed("gss_trust", 20260707)).toBe(runner.itemSeed("gss_trust", 20260707));
    expect(runner.itemSeed("gss_trust", 20260707)).not.toBe(runner.itemSeed("gss_happy", 20260707));
    expect(runner.itemSeed("gss_trust", 20260707)).not.toBe(runner.itemSeed("gss_trust", 20260708));
  });

  it("samples records in proportion to weight", () => {
    const records = Array.from({ length: 100 }, (_, i) => ({ id: i, weight: i < 50 ? 3 : 1 }));
    let s = 1;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const picked = runner.weightedSample(records, 40, rng) as Array<{ id: number }>;
    expect(picked).toHaveLength(40);
    expect(picked.filter((r) => r.id < 50).length).toBe(30);
  });

  it("presents the same options as the cells arm, volunteered ones marked", () => {
    const { text, opts } = runner.personaPrompt(item);
    expect(text).toContain("A. Can trust");
    expect(text).toContain("C. Depends (not read to respondents — some volunteer it)");
    expect(opts.map((o: { idx: number }) => o.idx)).toEqual([0, 1, 2]);
  });

  it.each([
    ["RESPONSE: B\nREASONING: careful.", 1],
    ["RESPONSE: **A**\nREASONING: yes", 0],
    ["RESPONSE: [C]", 2],
    ["I'd say can't be too careful.", 1],
    ["RESPONSE: Z", null],
    ["", null],
  ])("parses %j as option %s", (reply, expected) => {
    const { opts } = runner.personaPrompt(item);
    expect(runner.parsePersonaChoice(reply, item, opts)).toBe(expected);
  });
});

describe("persona sampling designs", () => {
  // A PPS pool: every record stands for the same share of adults.
  const pool = Array.from({ length: 1200 }, (_, i) => ({ id: i, weight: i < 600 ? 10 : 1 }));
  const heavyCount = (picked: Array<{ id: number }>) => picked.filter((p) => p.id < 600).length;

  it("equal-probability sampling ignores weights and covers the pool evenly", () => {
    let s = 7;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const picked = runner.equalProbabilitySample(pool, 150, rng) as Array<{ id: number }>;
    expect(picked).toHaveLength(150);
    expect(new Set(picked.map((p) => p.id)).size).toBe(150);
    expect(heavyCount(picked)).toBe(75);
  });

  it("the July design over-represents heavy records", () => {
    let s = 7;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const picked = runner.weightedSample(pool, 150, rng) as Array<{ id: number }>;
    // 6000 of 6600 weight units are heavy: about 136 of 150 draws.
    expect(heavyCount(picked)).toBeGreaterThan(130);
  });
});

describe("registered paraphrase probe", () => {
  // gss_nateduc was listed in the probe but had no paraphrase, so the July
  // run sent its original stem. The table is left as registered; the runner
  // now refuses such a run, and this records the gap.
  it("has a paraphrase for every probe item except the known gss_nateduc gap", () => {
    const missing = runner.PARAPHRASE10.filter((id: string) => !(id in runner.PARAPHRASES));
    expect(missing).toEqual(["gss_nateduc"]);
  });
});
