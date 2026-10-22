import { readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as runner from "../../../evals/run-anchor-bank-v2.mjs";
import {
  AGE_BANDS,
  BENEFITS,
  CHILDREN,
  INCOME_BANDS,
  SEXES,
  TENURES,
  cellMatchesFilters,
  normalizeFilters,
} from "../bands";
import { mapLimit } from "../elicit";
import { cellUserPrompt, verbatimUserPrompt } from "../prompts";
import { runEstimate } from "../run";
import type { AudienceFilters, Cell, CellTable, ResponseFormat } from "../types";
import { FormatSchema, RunRequestSchema } from "@/lib/schema";

const national = { type: "national" as const, value: "US", label: "United States" };

describe("mapLimit", () => {
  it("starts no new work after a call fails", async () => {
    const started: number[] = [];
    await expect(
      mapLimit(Array.from({ length: 50 }, (_, i) => i), 4, async (i) => {
        started.push(i);
        if (i === 0) throw new Error("fatal");
        await new Promise((r) => setTimeout(r, 1));
        return i;
      })
    ).rejects.toThrow("fatal");
    expect(started.length).toBeLessThan(10);
  });

  it("starts no new work after the signal aborts", async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const run = mapLimit(
      Array.from({ length: 50 }, (_, i) => i),
      4,
      async (i) => {
        started.push(i);
        if (started.length === 6) controller.abort();
        await new Promise((r) => setTimeout(r, 1));
        return i;
      },
      controller.signal
    );
    await expect(run).rejects.toBeDefined();
    expect(started.length).toBeLessThan(12);
  });

  // Invariant: with no failures, results keep input order for any limit.
  it("preserves order for any limit", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer(), { maxLength: 40 }), fc.integer({ min: 1, max: 16 }), async (xs, limit) => {
        const out = await mapLimit(xs, limit, async (x) => x * 2);
        expect(out).toEqual(xs.map((x) => x * 2));
      }),
      { numRuns: 50 }
    );
  });
});

describe("runEstimate cancellation", () => {
  it("stops calling the model once the run is aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    const llm = {
      async complete({ signal }: { signal?: AbortSignal }) {
        calls++;
        if (calls === 20) controller.abort();
        signal?.throwIfAborted();
        return '{"yes": 1, "no": 1}';
      },
    };
    await expect(
      runEstimate(
        {
          question: "Do you support a four-day work week?",
          format: { kind: "binary" },
          audience: { geography: national, filters: {} },
          model: "gpt-6-luna",
          verbatimCount: 0,
        },
        llm,
        undefined,
        controller.signal
      )
    ).rejects.toBeDefined();
    // At most one more call per concurrent worker after the abort.
    expect(calls).toBeLessThanOrEqual(20 + 16);
  });
});

describe("filters", () => {
  const domains: Record<keyof AudienceFilters, readonly string[]> = {
    ageBands: AGE_BANDS,
    incomeBands: INCOME_BANDS,
    sexes: SEXES,
    tenure: TENURES,
    children: CHILDREN,
    benefits: BENEFITS,
  };
  const tables = ["US", "NJ", "WY", "CA"].map(
    (geo) =>
      JSON.parse(
        readFileSync(path.join(process.cwd(), "public", "data", "v1", `${geo}.json`), "utf-8")
      ).table as CellTable
  );
  const weightOf = (cells: Cell[]) => cells.reduce((s, c) => s + c.weight, 0);

  // Invariant: selecting every category of a dimension restricts nothing.
  it.each(Object.keys(domains) as Array<keyof AudienceFilters>)(
    "a full %s selection selects the same cells as no selection",
    (key) => {
      for (const table of tables) {
        const all = table.cells.filter((c) => cellMatchesFilters(c, {}));
        const full = table.cells.filter((c) => cellMatchesFilters(c, { [key]: [...domains[key]] }));
        expect(full.length).toBe(all.length);
        expect(weightOf(full)).toBeCloseTo(weightOf(all), 6);
      }
    }
  );

  it("still excludes undetailed cells for a proper subset of a detailed dimension", () => {
    const us = tables[0];
    const owners = us.cells.filter((c) => cellMatchesFilters(c, { tenure: ["homeowners"] }));
    expect(owners.every((c) => c.detailed && c.tenure === "homeowners")).toBe(true);
  });

  it("normalizeFilters drops empty and full selections only", () => {
    expect(
      normalizeFilters({ sexes: ["women", "men"], ageBands: [], tenure: ["homeowners"] })
    ).toEqual({ tenure: ["homeowners"] });
  });

  const request = (filters: unknown) => ({
    question: "Do you support a four-day work week?",
    format: { kind: "binary" },
    audience: { geography: national, filters },
  });

  it("rejects unknown filter keys and values instead of widening the audience", () => {
    expect(RunRequestSchema.safeParse(request({ sex: ["women"] })).success).toBe(false);
    expect(RunRequestSchema.safeParse(request({ sexes: ["female"] })).success).toBe(false);
    expect(RunRequestSchema.safeParse(request({ sexes: ["women"], tenure: ["renters or other housing"] })).success).toBe(true);
  });
});

describe("choice formats", () => {
  it("trims labels and rejects duplicates and blanks", () => {
    expect(FormatSchema.safeParse({ kind: "choice", options: ["Bus", "Bus"] }).success).toBe(false);
    expect(FormatSchema.safeParse({ kind: "choice", options: ["Bus", " bus "] }).success).toBe(false);
    expect(FormatSchema.safeParse({ kind: "choice", options: ["Bus", "   "] }).success).toBe(false);
    expect(FormatSchema.parse({ kind: "choice", options: [" Bus", "Car "] })).toEqual({
      kind: "choice",
      options: ["Bus", "Car"],
    });
  });

  const cell: Cell = { age: "30-44", income: "$25k-$74,999", sex: "women", weight: 1, n: 1, detailed: false };

  it("keeps the benchmarked substantive-answer instruction for ordinary options", () => {
    for (const format of [
      { kind: "likert5" },
      { kind: "binary" },
      { kind: "choice", options: ["Bus", "Car"] },
    ] as ResponseFormat[]) {
      expect(cellUserPrompt(cell, national, "How do you travel?", format)).toContain(runner.DK_LINE);
    }
  });

  it.each([["Yes", "No", "Don’t know"], ["Yes", "No", "Refused"], ["A", "B", "Not sure"]])(
    "does not forbid the asker's own nonresponse option (%j)",
    (...options) => {
      const prompt = cellUserPrompt(cell, national, "Q?", { kind: "choice", options });
      expect(prompt).not.toContain("do not allocate any share");
      expect(prompt).toContain("including any don't-know or refusal option");
    }
  );

  it("gives verbatim writers the option labels, so order matters", () => {
    const a = verbatimUserPrompt("A 35-year-old woman.", "How do you travel?", {
      kind: "choice",
      options: ["Bus", "Car"],
    });
    const b = verbatimUserPrompt("A 35-year-old woman.", "How do you travel?", {
      kind: "choice",
      options: ["Car", "Bus"],
    });
    expect(a).toContain("option_0: Bus");
    expect(b).toContain("option_0: Car");
    expect(a).not.toBe(b);
  });
});
