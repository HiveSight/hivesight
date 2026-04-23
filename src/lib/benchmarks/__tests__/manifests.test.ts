import { describe, expect, it } from "vitest";
import { benchmarkManifests, benchmarkManifestBySuiteId } from "../manifests";

describe("benchmarkManifests", () => {
  it("loads starter manifests for each initial benchmark suite", () => {
    expect(benchmarkManifests).toHaveLength(3);
    expect(Object.keys(benchmarkManifestBySuiteId)).toEqual(
      expect.arrayContaining([
        "gss_2024_evergreen",
        "shed_2024_household_finance",
        "sdcpc_2024_consumer_choice",
      ])
    );
    expect(benchmarkManifestBySuiteId.gss_2024_evergreen.questions.length).toBeGreaterThan(0);
  });

  it("freezes confirmatory slice families for each starter question", () => {
    for (const manifest of benchmarkManifests) {
      for (const question of manifest.questions) {
        expect(question.confirmatorySlices.length).toBeGreaterThan(0);
        expect(question.confirmatorySlices.every((slice) => question.targetSlices.includes(slice))).toBe(
          true
        );
      }
    }
  });
});
