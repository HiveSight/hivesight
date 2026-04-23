import { describe, expect, it } from "vitest";
import { getSurveyPersonaSourceMeta } from "../survey-source";

describe("getSurveyPersonaSourceMeta", () => {
  it("returns calibrated microdata metadata", () => {
    expect(getSurveyPersonaSourceMeta("microdata")).toMatchObject({
      label: "Calibrated microdata",
      shortLabel: "Microdata",
    });
  });

  it("returns fallback metadata", () => {
    expect(getSurveyPersonaSourceMeta("synthetic_fallback")).toMatchObject({
      label: "Synthetic fallback",
      shortLabel: "Fallback",
    });
  });

  it("returns null for unknown sources", () => {
    expect(getSurveyPersonaSourceMeta("mystery")).toBeNull();
    expect(getSurveyPersonaSourceMeta(null)).toBeNull();
  });
});
