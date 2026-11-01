import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(args.p_visitor).toMatch(/^[0-9a-f]{64}$/);
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
    expect(rpc.mock.calls[0][0]).toBe("purge_old_records");
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
