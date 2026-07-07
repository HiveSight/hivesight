import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM module, no types
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
