import { describe, it, expect } from "vitest";
import { getRaceLabel, CPS_RACE_MAP } from "../race-codes";

describe("getRaceLabel", () => {
  it("returns White for code 1", () => {
    expect(getRaceLabel(1, false)).toBe("White");
  });

  it("returns Black for code 2", () => {
    expect(getRaceLabel(2, false)).toBe("Black");
  });

  it("returns Asian for code 4", () => {
    expect(getRaceLabel(4, false)).toBe("Asian");
  });

  it("prepends Hispanic/Latino when isHispanic is true", () => {
    expect(getRaceLabel(1, true)).toBe("Hispanic/Latino (White)");
  });

  it("handles Hispanic with non-White race", () => {
    expect(getRaceLabel(2, true)).toBe("Hispanic/Latino (Black)");
  });

  it("returns Unknown for invalid code", () => {
    expect(getRaceLabel(999, false)).toBe("Unknown");
  });

  it("has entries for all documented CPS race codes 1-26", () => {
    for (let i = 1; i <= 26; i++) {
      expect(CPS_RACE_MAP[i]).toBeDefined();
    }
  });
});
