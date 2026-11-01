import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequestError } from "@/engine/elicit";
import { POST } from "../route";

// The route's own behavior (admission, cancellation, error messages) is under
// test; the estimator is replaced by a stub that waits until aborted.
const runEstimate = vi.fn();
vi.mock("@/engine/run", () => ({ runEstimate: (...args: unknown[]) => runEstimate(...args) }));
const claimRun = vi.fn();
vi.mock("@/lib/store", () => ({
  saveRun: async () => null,
  claimRun: (...args: unknown[]) => claimRun(...args),
}));

const body = JSON.stringify({
  question: "Do you support a four-day work week?",
  format: { kind: "binary" },
  audience: { geography: { type: "national", value: "US" } },
});

function post(ip: string, payload = body) {
  return new Request("http://localhost/api/run", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: payload,
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
    claimRun.mockReset().mockResolvedValue("ok");
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

  it("does not count requests turned away while others run against the daily allowance", async () => {
    runEstimate.mockImplementation((_spec, _llm, _progress, signal: AbortSignal) =>
      waitForAbort(signal)
    );
    const held = [await POST(post("5.5.5.5")), await POST(post("5.5.5.5"))];
    expect(claimRun).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 25; i++) expect((await POST(post("5.5.5.5"))).status).toBe(429);
    expect(claimRun).toHaveBeenCalledTimes(2);
    for (const r of held) await r.body!.cancel();
    await new Promise((r) => setTimeout(r, 0));
    const next = await POST(post("5.5.5.5"));
    expect(next.status).toBe(200);
    await next.body!.cancel();
  });

  it.each([
    ["visitor", 429, "20 free estimates"],
    ["site", 429, "all of today's free estimates"],
    ["unavailable", 503, "paused new estimates"],
  ])("refuses a %s claim before spending and frees its slot", async (claim, status, message) => {
    claimRun.mockResolvedValue(claim);
    // Three refusals in a row: a leaked slot would answer the third "too many running".
    for (let i = 0; i < 3; i++) {
      const response = await POST(post("6.6.6.6"));
      expect(response.status).toBe(status);
      expect((await response.json()).error).toContain(message);
    }
    expect(runEstimate).not.toHaveBeenCalled();
  });

  it("claims the default model's share of the site allowance for the caller's network", async () => {
    runEstimate.mockResolvedValue({});
    await (await POST(post("2001:db8:1:2:3:4:5:6"))).text();
    expect(claimRun).toHaveBeenLastCalledWith("2001:db8:1:2::/64", {
      visitorLimit: 20,
      siteCost: 1,
      siteLimit: 500,
    });
  });

  it("turns away Sol, which one visitor could use to drain the site's allowance", async () => {
    const sol = JSON.stringify({ ...JSON.parse(body), model: "gpt-6.1-sol" });
    expect((await POST(post("7.7.7.7", sol))).status).toBe(400);
    expect(claimRun).not.toHaveBeenCalled();
  });

  it("rejects invalid requests before counting them against the daily allowance", async () => {
    expect((await POST(post("3.3.3.3", JSON.stringify({ question: "short" })))).status).toBe(400);
    expect(runEstimate).not.toHaveBeenCalled();
    expect(claimRun).not.toHaveBeenCalled();
  });

  it.each([
    ["text/plain;charset=UTF-8"],
    ["application/x-www-form-urlencoded"],
    ["multipart/form-data; boundary=x"],
    [null],
  ])("refuses content type %s, which other sites could send with no preflight", async (type) => {
    const request = new Request("http://localhost/api/run", {
      method: "POST",
      headers: type ? { "content-type": type, "x-forwarded-for": "8.8.8.8" } : { "x-forwarded-for": "8.8.8.8" },
      body: type ? body : new TextEncoder().encode(body),
    });
    expect((await POST(request)).status).toBe(415);
    expect(claimRun).not.toHaveBeenCalled();
  });

  it("accepts JSON however the header spells it", async () => {
    runEstimate.mockResolvedValue({});
    const request = new Request("http://localhost/api/run", {
      method: "POST",
      headers: { "content-type": "Application/JSON; charset=utf-8", "x-forwarded-for": "9.9.9.9" },
      body,
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    await response.text();
  });

  it("streams a plain message, not the provider's, when the model API rejects the request", async () => {
    runEstimate.mockRejectedValue(new LlmRequestError("Incorrect API key provided: sk-proj-****abcd"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const text = await (await POST(post("4.4.4.4"))).text();
    expect(text).toContain("event: error");
    expect(text).toContain("The model service rejected this request");
    expect(text).not.toContain("sk-proj");
    errorLog.mockRestore();
  });
});
