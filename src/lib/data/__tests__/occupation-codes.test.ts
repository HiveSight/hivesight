import { describe, it, expect } from "vitest";
import { getOccupationLabel } from "../occupation-codes";

describe("getOccupationLabel", () => {
  it("returns exact match for known code", () => {
    expect(getOccupationLabel(1020)).toBe("Software developer");
  });

  it("returns Chief executive for code 10", () => {
    expect(getOccupationLabel(10)).toBe("Chief executive");
  });

  it("returns closest lower match for unknown code", () => {
    // Code 1025 should match 1020 (Software developer)
    expect(getOccupationLabel(1025)).toBe("Software developer");
  });

  it("handles military codes", () => {
    expect(getOccupationLabel(9830)).toBe("Military enlisted");
  });

  it("handles food service codes", () => {
    expect(getOccupationLabel(4050)).toBe("Waiter/waitress");
  });
});
