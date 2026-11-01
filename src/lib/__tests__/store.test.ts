import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visitorKey } from "../visitor";

const rpc = vi.fn();
const createClient = vi.fn(() => ({ rpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => createClient() }));

const limits = { visitorLimit: 20, siteCost: 1, siteLimit: 500 };

function answers(result: unknown) {
  rpc.mockReturnValue({ abortSignal: () => Promise.resolve(result) });
}

// The store keeps one client per module instance, so each test imports afresh.
async function loadStore() {
  vi.resetModules();
  return import("../store");
}

describe("claimRun", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockReset();
    createClient.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["ok", "visitor", "site"])("passes on the database's %s", async (answer) => {
    answers({ data: answer, error: null });
    const { claimRun } = await loadStore();
    expect(await claimRun("203.0.113.9", limits)).toBe(answer);
  });

  it("sends a keyed hash of the visitor and the limits", async () => {
    answers({ data: "ok", error: null });
    const { claimRun } = await loadStore();
    await claimRun("203.0.113.9", limits);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("claim_run");
    expect(args).toMatchObject({ p_visitor_limit: 20, p_site_cost: 1, p_site_limit: 500 });
    expect(args.p_visitor).toBe(visitorKey("203.0.113.9", "test-secret"));
    expect(JSON.stringify(args)).not.toContain("203.0.113.9");
  });

  it("treats any other answer as unavailable", async () => {
    const { claimRun } = await loadStore();
    await fc.assert(
      fc.asyncProperty(
        fc.anything().filter((v) => v !== "ok" && v !== "visitor" && v !== "site"),
        async (data) => {
          answers({ data, error: null });
          expect(await claimRun("203.0.113.9", limits)).toBe("unavailable");
        }
      ),
      { numRuns: 50 }
    );
  });

  it("treats a database error as unavailable, whatever data came with it", async () => {
    answers({ data: "ok", error: { message: "boom" } });
    const { claimRun } = await loadStore();
    expect(await claimRun("203.0.113.9", limits)).toBe("unavailable");
  });

  it("treats a rejected or timed-out call as unavailable", async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.reject(new Error("timed out")) });
    const { claimRun } = await loadStore();
    expect(await claimRun("203.0.113.9", limits)).toBe("unavailable");
  });

  it("gives up on a database that never answers", { timeout: 10_000 }, async () => {
    let signal: AbortSignal | undefined;
    rpc.mockReturnValue({
      abortSignal: (s: AbortSignal) => {
        signal = s;
        return new Promise((_, reject) => s.addEventListener("abort", () => reject(s.reason)));
      },
    });
    const { claimRun } = await loadStore();
    const started = Date.now();
    expect(await claimRun("203.0.113.9", limits)).toBe("unavailable");
    expect(signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it("treats a client that throws as unavailable", async () => {
    rpc.mockImplementation(() => {
      throw new Error("bad client");
    });
    const { claimRun } = await loadStore();
    expect(await claimRun("203.0.113.9", limits)).toBe("unavailable");
  });

  it("stops production estimates when the database has no settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const { claimRun } = await loadStore();
    expect(await claimRun("203.0.113.9", limits)).toBe("unavailable");
  });

  it("stops production estimates when the settings can't build a client", async () => {
    createClient.mockImplementationOnce(() => {
      throw new Error("Invalid supabaseUrl");
    });
    vi.stubEnv("NODE_ENV", "production");
    const { claimRun } = await loadStore();
    expect(await claimRun("203.0.113.9", limits)).toBe("unavailable");
  });

  it("lets local development run without a database", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    const { claimRun } = await loadStore();
    expect(await claimRun("203.0.113.9", limits)).toBe("ok");
  });
});

describe("purgeOldRecords", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports success and failure", async () => {
    const { purgeOldRecords } = await loadStore();
    answers({ error: null });
    expect(await purgeOldRecords()).toBe(true);
    expect(rpc.mock.calls[0]).toEqual(["purge_old_records", { p_keep_runs: 7_000 }]);
    answers({ error: { message: "boom" } });
    expect(await purgeOldRecords()).toBe(false);
    rpc.mockReturnValue({ abortSignal: () => Promise.reject(new Error("timed out")) });
    expect(await purgeOldRecords()).toBe(false);
  });

  it("does nothing without a database", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { purgeOldRecords } = await loadStore();
    expect(await purgeOldRecords()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("pingStore", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends a claim too large for the site and expects the site's refusal", async () => {
    answers({ data: "site", error: null });
    const { pingStore } = await loadStore();
    expect(await pingStore()).toEqual({ ok: true, message: "ok" });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("claim_run");
    expect(args.p_site_cost).toBeGreaterThan(args.p_site_limit);
  });

  it.each([
    [{ data: "ok", error: null }],
    [{ data: "visitor", error: null }],
    [{ data: null, error: null }],
    [{ data: null, error: { message: "cannot execute INSERT in a read-only transaction" } }],
  ])("fails on %j", async (answer) => {
    answers(answer);
    const { pingStore } = await loadStore();
    expect(await pingStore()).toEqual({ ok: false, message: "store unreachable" });
  });

  it("fails on a rejected call", async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.reject(new Error("timed out")) });
    const { pingStore } = await loadStore();
    expect(await pingStore()).toEqual({ ok: false, message: "store unreachable" });
  });

  it("gives up on a database that never answers", { timeout: 10_000 }, async () => {
    let signal: AbortSignal | undefined;
    rpc.mockReturnValue({
      abortSignal: (s: AbortSignal) => {
        signal = s;
        return new Promise((_, reject) => s.addEventListener("abort", () => reject(s.reason)));
      },
    });
    const { pingStore } = await loadStore();
    expect(await pingStore()).toEqual({ ok: false, message: "store unreachable" });
    expect(signal?.aborted).toBe(true);
  });

  it("reports a missing database", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { pingStore } = await loadStore();
    expect(await pingStore()).toEqual({ ok: false, message: "store not configured" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks the database every time, for the cron", async () => {
    answers({ data: "site", error: null });
    const { pingStore } = await loadStore();
    await pingStore();
    await pingStore();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("recentPing", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    rpc.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends one ping for a burst of health checks", async () => {
    answers({ data: "site", error: null });
    const { recentPing } = await loadStore();
    const results = await Promise.all(Array.from({ length: 500 }, () => recentPing()));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("pings again once its answer has aged 30 seconds", async () => {
    answers({ data: "site", error: null });
    const { recentPing } = await loadStore();
    await recentPing();
    vi.advanceTimersByTime(29_999);
    await recentPing();
    expect(rpc).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    await recentPing();
    expect(rpc).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(29_999);
    await recentPing();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("reports a failure the next ping clears", async () => {
    answers({ data: null, error: { message: "boom" } });
    const { recentPing } = await loadStore();
    expect((await recentPing()).ok).toBe(false);
    answers({ data: "site", error: null });
    expect((await recentPing()).ok).toBe(false);
    expect(rpc).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    expect((await recentPing()).ok).toBe(true);
  });
});

describe("databaseBytes", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns the database's answer", async () => {
    answers({ data: 12_274_835, error: null });
    const { databaseBytes } = await loadStore();
    expect(await databaseBytes()).toBe(12_274_835);
    expect(rpc).toHaveBeenCalledWith("database_bytes");
  });

  it.each([
    ["an error", { data: null, error: { message: "boom" } }],
    ["an error with data", { data: 1, error: { message: "boom" } }],
    ["no data", { data: null, error: null }],
    ["text", { data: "12", error: null }],
  ])("answers null on %s", async (_name, result) => {
    answers(result);
    const { databaseBytes } = await loadStore();
    expect(await databaseBytes()).toBeNull();
  });

  it("answers null on a rejected call", async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.reject(new Error("offline")) });
    const { databaseBytes } = await loadStore();
    expect(await databaseBytes()).toBeNull();
  });

  it("gives up on a database that never answers", { timeout: 10_000 }, async () => {
    rpc.mockReturnValue({
      abortSignal: (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    });
    const { databaseBytes } = await loadStore();
    expect(await databaseBytes()).toBeNull();
  });

  it("answers null without a database", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const { databaseBytes } = await loadStore();
    expect(await databaseBytes()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("recentDatabaseBytes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    rpc.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("asks once for a burst of health checks and again after 30 seconds", async () => {
    answers({ data: 1, error: null });
    const { recentDatabaseBytes } = await loadStore();
    await Promise.all(Array.from({ length: 500 }, () => recentDatabaseBytes()));
    expect(rpc).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(30_000);
    await recentDatabaseBytes();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("shares no answer with the ping", async () => {
    answers({ data: "site", error: null });
    const { recentDatabaseBytes, recentPing } = await loadStore();
    await recentPing();
    answers({ data: 7, error: null });
    expect(await recentDatabaseBytes()).toBe(7);
  });
});
