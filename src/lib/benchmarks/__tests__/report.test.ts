import { describe, expect, it } from "vitest";
import { benchmarkExecutionSpec } from "../execution";
import { benchmarkProgram } from "../report";
import { benchmarkResultSnapshots } from "../results";

describe("benchmarkProgram", () => {
  it("contains starter suites, comparisons, and metrics", () => {
    expect(benchmarkProgram.version).toBe(1);
    expect(benchmarkProgram.suites.length).toBeGreaterThan(0);
    expect(benchmarkProgram.comparisons.map((item) => item.id)).toContain(
      "hivesight_local_population"
    );
    expect(benchmarkProgram.metrics.map((item) => item.id)).toContain(
      "prompt_stability"
    );
  });

  it("freezes the execution model and arm specs for the first run", () => {
    expect(benchmarkExecutionSpec.model.id).toBe("gpt-5-mini");
    expect(benchmarkExecutionSpec.promptTemplates.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(benchmarkExecutionSpec.promptTemplates.personaFormatterSha256).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(benchmarkExecutionSpec.promptTemplates.dependencyFiles.length).toBeGreaterThan(0);
    expect(benchmarkExecutionSpec.analysisPlan.confirmatorySuites).toEqual([
      "gss_2024_evergreen",
      "shed_2024_household_finance",
    ]);
    expect(
      benchmarkExecutionSpec.analysisPlan.confirmatorySliceDefinitions.age_band.bins.map(
        (bin) => bin.id
      )
    ).toEqual(["age_18_29", "age_30_44", "age_45_64", "age_65_plus"]);
    expect(
      benchmarkExecutionSpec.armSpecs.map((item) => item.comparisonId)
    ).toContain("rich_nonlocal_microdata");
  });

  it("hash-freezes every normalizer script in the data pipeline", () => {
    const files = benchmarkExecutionSpec.dataPipeline.normalizerFiles;
    expect(files.map((item) => item.file)).toEqual(
      expect.arrayContaining([
        "scripts/normalize-common.mjs",
        "scripts/normalize-shed-2024.mjs",
        "scripts/normalize-gss-2024.mjs",
      ])
    );
    for (const entry of files) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("publishes the first measured human target snapshot", () => {
    const shedSnapshot = benchmarkResultSnapshots.find(
      (snapshot) => snapshot.suiteId === "shed_2024_household_finance"
    );

    expect(shedSnapshot).toBeDefined();
    expect(shedSnapshot?.resultType).toBe("human_targets");
    expect(shedSnapshot?.sourceRows).toBeGreaterThan(10000);
    expect(
      shedSnapshot?.questions.map((question) => question.benchmarkField)
    ).toContain("can_cover_400_expense");
  });
});
