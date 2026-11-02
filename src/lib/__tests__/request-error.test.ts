import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { requestErrorMessage } from "../request-error";

describe("requestErrorMessage", () => {
  it("shows the route's own message and its first detail", () => {
    expect(requestErrorMessage(429, { error: "Your network has used today's 20 free estimates." })).toBe(
      "Your network has used today's 20 free estimates."
    );
    expect(
      requestErrorMessage(400, { error: "Invalid request", details: [{ message: "Too short" }] })
    ).toBe("Invalid request: Too short");
  });

  it("explains a firewall refusal, whose body names no error", () => {
    for (const data of [null, "Too Many Requests", { error: { code: "rate_limited" } }]) {
      expect(requestErrorMessage(429, data)).toMatch(/too many requests in the last minute/);
    }
  });

  it("falls back to the status for anything else", () => {
    expect(requestErrorMessage(502, null)).toBe("Request failed (502)");
  });

  it("shows the route's error when it sent one, and a fallback otherwise", () => {
    fc.assert(
      fc.property(fc.integer({ min: 400, max: 599 }), fc.anything(), (status, data) => {
        const message = requestErrorMessage(status, data);
        const error = (data as { error?: unknown } | null)?.error;
        if (typeof error === "string") expect(message.startsWith(error)).toBe(true);
        else expect([requestErrorMessage(status, null)]).toContain(message);
      })
    );
  });
});
