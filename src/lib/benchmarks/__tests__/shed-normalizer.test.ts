import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeShedCsvText } from "../../../../scripts/normalize-shed-2024.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../../../..");
const fixturePath = path.resolve(testDir, "../__fixtures__/shed-2024-sample.csv");
const scriptPath = path.resolve(rootDir, "scripts/normalize-shed-2024.mjs");

describe("normalize-shed-2024", () => {
  it("maps SHED rows into benchmark slices and normalized benchmark fields", () => {
    const csvText = fs.readFileSync(fixturePath, "utf8");
    const normalized = normalizeShedCsvText(csvText, fixturePath);

    expect(normalized.datasetId).toBe("shed_2024");
    expect(normalized.rows).toHaveLength(4);

    expect(normalized.rows[0]).toMatchObject({
      respondentId: "row-1",
      slices: {
        age_band: "18-29",
        income_band: "$25k-$74,999",
        children_flag: "has_children",
        benefits_status: "receives_benefits",
        employment_status: "working_full_time",
        metro_proxy: "metro",
      },
      benchmarkFields: {
        financial_wellbeing: 1,
        can_cover_400_expense: 1,
        financial_change_vs_last_year: 1,
        housing_cost_stress: 1,
      },
    });

    expect(normalized.rows[1]).toMatchObject({
      respondentId: "row-2",
      slices: {
        age_band: "65+",
        income_band: "$150k+",
        tenure_type: "homeowner",
        metro_proxy: "non_metro",
      },
      benchmarkFields: {
        financial_wellbeing: 1,
        financial_change_vs_last_year: 0.5,
        housing_cost_stress: 1,
      },
    });

    expect(normalized.rows[3]).toMatchObject({
      respondentId: "row-4",
      slices: {
        age_band: "45-64",
        income_band: "$75k-$149,999",
      },
      benchmarkFields: {
        financial_wellbeing: 0,
        financial_change_vs_last_year: 0,
        housing_cost_stress: 0,
      },
    });
  });

  it("writes the normalized JSON artifact from CLI input", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shed-normalizer-"));
    const outputPath = path.join(tempDir, "shed-2024.json");

    execFileSync("node", [scriptPath, "--input", fixturePath, "--out", outputPath], {
      cwd: rootDir,
      stdio: "pipe",
    });

    const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));

    expect(written.datasetId).toBe("shed_2024");
    expect(written.source.inputPath).toBe(fixturePath);
    expect(written.rows).toHaveLength(4);
    expect(written.normalization.confirmatorySliceFamilies).toEqual([
      "age_band",
      "income_band",
    ]);
  });
});
