import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as runner from "../../../evals/run-anchor-bank-v2.mjs";

/**
 * Runner arms of the individual-simulation study
 * (paper/pap-individual-sim-2026-10.md): who is asked, and how individual
 * replies aggregate.
 */

const ROOT = path.join(__dirname, "..", "..", "..");
const us = JSON.parse(readFileSync(path.join(ROOT, "public", "data", "v1", "US.json"), "utf-8"));
const bank = JSON.parse(readFileSync(path.join(ROOT, "evals", "anchor-bank", "anchor-bank-v2.json"), "utf-8"));
const happy = bank.items.find((i: { itemId: string }) => i.itemId === "gss_happy");

describe("who each individual-probability arm asks", () => {
  it("persona-prob keeps amendment 2's 150 equal-probability draws", () => {
    const people = runner.probPeople("persona-prob", happy, us.samples);
    let s = runner.itemSeed("gss_happy", 20260707) >>> 0;
    // mulberry32, as the runner seeds it
    const rng = () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const expected = runner.equalProbabilitySample(us.samples, 150, rng);
    expect(people.map((x: { p: unknown }) => x.p)).toEqual(expected);
    for (const { p, poolIdx } of people) expect(us.samples[poolIdx]).toBe(p);
  });

  it("persona-prob-pool asks every record of the released pool, in order", () => {
    const people = runner.probPeople("persona-prob-pool", happy, us.samples);
    expect(people).toHaveLength(1200);
    people.forEach(({ p, poolIdx }: { p: unknown; poolIdx: number }, i: number) => {
      expect(poolIdx).toBe(i);
      expect(p).toBe(us.samples[i]);
    });
  });

  it("persona-prob-fresh asks the item's own pool and refuses without one", () => {
    const fresh = JSON.parse(
      gunzipSync(readFileSync(path.join(ROOT, "evals", "anchor-bank", "fresh-pools-US.json.gz"))).toString("utf-8")
    );
    expect(Object.keys(fresh.items).sort()).toEqual(bank.items.map((i: { itemId: string }) => i.itemId).sort());
    const people = runner.probPeople("persona-prob-fresh", happy, us.samples, fresh);
    expect(people).toHaveLength(1200);
    expect(people[0].p).toEqual(fresh.items.gss_happy.records[0]);
    // Independent draws per item: two items' pools barely overlap.
    const a = new Set(fresh.items.gss_happy.frameIdx);
    const shared = fresh.items.gss_trust.frameIdx.filter((i: number) => a.has(i)).length;
    expect(shared).toBeLessThan(60);
    expect(() => runner.probPeople("persona-prob-fresh", happy, us.samples, null)).toThrow(/no fresh pool/);
    expect(() => runner.probPeople("persona", happy, us.samples)).toThrow(/not an individual-probability arm/);
  });
});

describe("aggregating individual distributions", () => {
  const item = {
    itemId: "toy",
    options: ["A", "B", "C"],
    targets: { slices: { sex: { women: {}, men: {} }, age_band: { "18-29": {} } } },
  };
  const person = (female: boolean, age = 40) => ({
    age, is_female: female, employment_income: 0, self_employment_income: 0, tenure_type: 1,
  });

  it("weights people equally, skips failures, and drops bins under 10 people", () => {
    const results = [
      ...Array.from({ length: 12 }, () => ({ p: person(true), dist: [1, 0, 0] })),
      ...Array.from({ length: 9 }, () => ({ p: person(false, 20), dist: [0, 1, 0] })),
      { p: person(false), dist: null },
    ];
    const res = runner.aggregateIndividuals(item, results) as {
      topline: number[];
      slices: Record<string, Record<string, number[] | undefined>>;
      n: number;
      failures: number;
    };
    expect(res.n).toBe(22);
    expect(res.failures).toBe(1);
    expect(res.topline[0]).toBeCloseTo(12 / 21, 12);
    expect(res.topline[1]).toBeCloseTo(9 / 21, 12);
    expect(res.slices.sex.women).toEqual([1, 0, 0]);
    expect(res.slices.sex.men).toBeUndefined(); // 9 answering men
    expect(res.slices.age_band["18-29"]).toBeUndefined();
  });

  it("has no topline when nobody answered", () => {
    expect(runner.aggregateIndividuals(item, [{ p: person(true), dist: null }]).topline).toBeNull();
  });

  const distArb = fc
    .array(fc.integer({ min: 0, max: 100 }), { minLength: 3, maxLength: 3 })
    .filter((v) => v.some((x) => x > 0))
    .map((v) => v.map((x) => x / v.reduce((s, y) => s + y, 0)));
  const resultsArb = fc.array(
    fc.record({ female: fc.boolean(), age: fc.integer({ min: 18, max: 90 }), dist: fc.option(distArb, { nil: null }) }),
    { minLength: 1, maxLength: 60 }
  );

  it("estimates are distributions bounded by the individual replies, whatever the order", () => {
    fc.assert(
      fc.property(resultsArb, fc.integer(), (rows, shift) => {
        const results = rows.map((r) => ({ p: person(r.female, r.age), dist: r.dist }));
        const res = runner.aggregateIndividuals(item, results);
        const ok = results.filter((r) => r.dist);
        if (!ok.length) return res.topline === null;
        const sum = res.topline.reduce((s: number, v: number) => s + v, 0);
        if (Math.abs(sum - 1) > 1e-9) return false;
        for (let oi = 0; oi < 3; oi++) {
          const vals = ok.map((r) => r.dist![oi]);
          if (res.topline[oi] < Math.min(...vals) - 1e-12 || res.topline[oi] > Math.max(...vals) + 1e-12) return false;
        }
        const k = ((shift % results.length) + results.length) % results.length;
        const rotated = runner.aggregateIndividuals(item, [...results.slice(k), ...results.slice(0, k)]);
        return rotated.topline.every((v: number, i: number) => Math.abs(v - res.topline[i]) < 1e-12);
      })
    );
  });
});
