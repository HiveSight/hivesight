import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeGssCsvText } from "../../../../scripts/normalize-gss-2024.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../../../..");
const fixturePath = path.resolve(testDir, "../__fixtures__/gss-2024-sample.csv");
const scriptPath = path.resolve(rootDir, "scripts/normalize-gss-2024.mjs");

describe("normalize-gss-2024", () => {
  it("maps GSS rows into benchmark slices and normalized benchmark fields", () => {
    const csvText = fs.readFileSync(fixturePath, "utf8");
    const normalized = normalizeGssCsvText(csvText, fixturePath);

    expect(normalized.datasetId).toBe("gss_2024");
    expect(normalized.rows).toHaveLength(6);
    expect(normalized.normalization.confirmatorySliceFamilies).toEqual([
      "age_band",
      "income_band",
    ]);
    expect(normalized.normalization.incomeMultiplier).toBeCloseTo(2.862);

    expect(normalized.rows[0]).toMatchObject({
      respondentId: "gss-1",
      weight: 1.1,
      slices: {
        age_band: "18-29",
        income_band: "<$25k",
        sex: "Female",
        race_ethnicity: "Hispanic",
        tenure_type: "renter",
        education_proxy: "high_school",
        children_flag: "has_children",
        region: "South Atlantic",
      },
      benchmarkFields: {
        trust_general: 1,
        helpfulness_general: 1,
        fairness_general: null,
        redistribution_support: 5 / 6,
      },
    });

    expect(normalized.rows[1]).toMatchObject({
      respondentId: "gss-2",
      slices: {
        age_band: "30-44",
        income_band: "$25k-$74,999",
        sex: "Male",
        race_ethnicity: "White, Non-Hispanic",
        tenure_type: "homeowner",
        education_proxy: "bachelor",
      },
      benchmarkFields: {
        trust_general: 0,
        helpfulness_general: 0,
        fairness_general: 1,
        redistribution_support: 0.5,
      },
    });

    expect(normalized.rows[2]).toMatchObject({
      respondentId: "gss-3",
      slices: {
        age_band: "65+",
        income_band: "$75k-$149,999",
        race_ethnicity: "Black, Non-Hispanic",
      },
      benchmarkFields: {
        trust_general: 1,
        helpfulness_general: 0,
        fairness_general: 1,
        redistribution_support: 0,
      },
    });

    expect(normalized.rows[3]).toMatchObject({
      respondentId: "gss-4",
      slices: {
        age_band: "45-64",
        income_band: "$150k+",
        race_ethnicity: "Asian, Non-Hispanic",
        region: "Pacific",
      },
      benchmarkFields: {
        trust_general: null,
        helpfulness_general: 1,
        fairness_general: 1,
        redistribution_support: 1,
      },
    });

    expect(normalized.rows[4]).toMatchObject({
      respondentId: "gss-5",
      slices: {
        age_band: "45-64",
        income_band: null,
        race_ethnicity: null,
        tenure_type: "other",
        education_proxy: "associate",
        children_flag: null,
      },
      benchmarkFields: {
        trust_general: null,
        helpfulness_general: null,
        fairness_general: null,
        redistribution_support: null,
      },
    });

    expect(normalized.rows[5]).toMatchObject({
      respondentId: "gss-6",
      slices: {
        age_band: "65+",
        income_band: "$25k-$74,999",
      },
      benchmarkFields: {
        trust_general: 1,
        helpfulness_general: 1,
        fairness_general: 0,
        redistribution_support: 4 / 6,
      },
    });
  });

  it("respects a custom --income-multiplier when passed through the API", () => {
    const csvText = fs.readFileSync(fixturePath, "utf8");
    const normalized = normalizeGssCsvText(csvText, fixturePath, {
      incomeMultiplier: 1,
    });

    expect(normalized.normalization.incomeMultiplier).toBe(1);
    // With multiplier 1, CONINC of 7000 stays at $7k => <$25k bin still.
    expect(normalized.rows[0].slices.income_band).toBe("<$25k");
    // CONINC 60000 no longer reaches $150k+ when multiplier is 1; it lands in $25k-$74,999.
    expect(normalized.rows[3].slices.income_band).toBe("$25k-$74,999");
  });

  it("uses the GSS RACE codebook when RACECEN1 is absent", () => {
    const csvText = [
      "ID_,WTSSPS,AGE,SEX,RACE,HISPANIC,CONINC,DWELOWN,DEGREE,CHILDS,REGION,TRUST,HELPFUL,FAIR,EQWLTH",
      "race-other,1,40,1,3,1,20000,2,1,0,5,1,1,1,4",
    ].join("\n");
    const normalized = normalizeGssCsvText(csvText, "race-only.csv");

    expect(normalized.rows[0].slices.race_ethnicity).toBe(
      "Other, Non-Hispanic"
    );
    expect(normalized.rows[0].rawFields.race_source).toBe("RACE");
  });

  it("writes the normalized JSON artifact from CLI input", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gss-normalizer-"));
    const outputPath = path.join(tempDir, "gss-2024.json");

    execFileSync("node", [scriptPath, "--input", fixturePath, "--out", outputPath], {
      cwd: rootDir,
      stdio: "pipe",
    });

    const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));

    expect(written.datasetId).toBe("gss_2024");
    expect(written.source.inputPath).toBe(fixturePath);
    expect(written.rows).toHaveLength(6);
    expect(written.normalization.benchmarkFields.trust_general).toMatch(
      /Binary positive share/
    );
    expect(written.normalization.incomeMultiplier).toBeCloseTo(2.862);
  });
});
