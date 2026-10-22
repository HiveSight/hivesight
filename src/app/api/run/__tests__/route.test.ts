import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequestError } from "@/engine/elicit";
import { POST } from "../route";

// The route's own behavior (admission, cancellation, error messages) is under
// test; the estimator is replaced by a stub that waits until aborted.
const runEstimate = vi.fn();
vi.mock("@/engine/run", () => ({ runEstimate: (...args: unknown[]) => runEstimate(...args) }));
vi.mock("@/lib/store", () => ({ saveRun: async () => null }));

const body = JSON.stringify({
  question: "Do you support a four-day work week?",
  format: { kind: "binary" },
  audience: { geography: { type: "national", value: "US" } },
});

function post(ip: string) {
  return new Request("http://localhost/api/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body,
  });
}

function waitForAbort(signal: AbortSignal) {
  return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
}

// The route module is imported once (re-importing per test was slow enough to
// time out on a loaded host); tests use distinct IPs because its admission
// counters persist across tests.
describe("POST /api/run", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    runEstimate.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("admits at most two concurrent estimates per IP", async () => {
    const signals: AbortSignal[] = [];
    runEstimate.mockImplementation((_spec, _llm, _progress, signal: AbortSignal) => {
      signals.push(signal);
      return waitForAbort(signal);
    });
    const first = await POST(post("1.1.1.1"));
    const second = await POST(post("1.1.1.1"));
    const third = await POST(post("1.1.1.1"));
    const otherIp = await POST(post("2.2.2.2"));
    expect([first.status, second.status, third.status, otherIp.status]).toEqual([200, 200, 429, 200]);
    // Cancelling a response aborts its estimate and frees its slot.
    await first.body!.cancel();
    expect(signals[0].aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect((await POST(post("1.1.1.1"))).status).toBe(200);
    for (const r of [second, otherIp]) await r.body!.cancel();
  });

  it("rejects invalid requests before counting them against the daily allowance", async () => {
    const bad = new Request("http://localhost/api/run", {
      method: "POST",
      headers: { "x-forwarded-for": "3.3.3.3" },
      body: JSON.stringify({ question: "short" }),
    });
    expect((await POST(bad)).status).toBe(400);
    expect(runEstimate).not.toHaveBeenCalled();
  });

  it("streams a plain message, not the provider's, when the model API rejects the request", async () => {
    runEstimate.mockRejectedValue(new LlmRequestError("Incorrect API key provided: sk-proj-****abcd"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const text = await (await POST(post("4.4.4.4"))).text();
    expect(text).toContain("event: error");
    expect(text).toContain("The model service rejected the request");
    expect(text).not.toContain("sk-proj");
    errorLog.mockRestore();
  });
});
