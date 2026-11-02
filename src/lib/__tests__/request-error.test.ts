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

  it("shows the route's error when it sent one, and otherwise explains the status", () => {
    const tooMany = "Your network sent too many requests in the last minute. Please wait a minute and try again.";
    fc.assert(
      fc.property(fc.integer({ min: 400, max: 599 }), fc.anything(), (status, data) => {
        const message = requestErrorMessage(status, data);
        const body = data as { error?: unknown; details?: Array<{ message?: unknown }> } | null;
        const error = body?.error;
        if (typeof error === "string") {
          const detail = Array.isArray(body?.details) ? body.details[0]?.message : undefined;
          expect(message).toBe(typeof detail === "string" && detail ? `${error}: ${detail}` : error);
        } else {
          expect(message).toBe(status === 429 ? tooMany : `Request failed (${status})`);
        }
      })
    );
  });

  it("keeps the route's error when its detail is empty or not text", () => {
    expect(requestErrorMessage(400, { error: "Invalid request", details: [{ message: "" }] })).toBe("Invalid request");
    expect(requestErrorMessage(400, { error: "Invalid request", details: [{ message: 7 }] })).toBe("Invalid request");
    expect(requestErrorMessage(400, { error: "Invalid request", details: [{}, { message: "second" }] })).toBe(
      "Invalid request"
    );
  });

  it("doesn't call a platform refusal of another status a rate limit", () => {
    expect(requestErrorMessage(413, "Request Entity Too Large")).toBe("Request failed (413)");
    expect(requestErrorMessage(403, null)).toBe("Request failed (403)");
  });
});
