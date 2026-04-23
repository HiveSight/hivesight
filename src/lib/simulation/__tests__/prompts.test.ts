import { describe, expect, it } from "vitest";
import { parseLikertResponse } from "../prompts";

describe("parseLikertResponse", () => {
  it("parses strongly agree before agree in fallback text", () => {
    expect(parseLikertResponse("I strongly agree with this.").likert).toBe(
      "strongly_agree"
    );
  });

  it("parses structured responses that use spaces instead of underscores", () => {
    expect(
      parseLikertResponse("RESPONSE: strongly agree\nREASONING: It fits.").likert
    ).toBe("strongly_agree");
  });

  it("parses strongly disagree before disagree in fallback text", () => {
    expect(parseLikertResponse("I strongly disagree with this.").likert).toBe(
      "strongly_disagree"
    );
  });
});
