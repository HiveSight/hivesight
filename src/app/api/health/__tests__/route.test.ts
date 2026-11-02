import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outageProblems, sizeProblems } from "../../../../../scripts/health-monitor.mjs";
import { GET } from "../route";

const recentDatabaseBytes = vi.fn();
const recentPing = vi.fn();
const storeConfigured = vi.fn();
vi.mock("@/lib/store", () => ({
  recentDatabaseBytes: () => recentDatabaseBytes(),
  recentPing: () => recentPing(),
  storeConfigured: () => storeConfigured(),
}));
vi.mock("@/engine/data", () => ({
  loadGeography: async () => ({ table: { cells: [{}], totalWeight: 1 } }),
}));

async function storeCheck() {
  const response = await GET();
  const body = await response.json();
  return {
    code: response.status,
    status: body.status,
    store: body.checks.find((c: { name: string }) => c.name === "store"),
  };
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    recentDatabaseBytes.mockReset().mockResolvedValue(12_000_000);
    recentPing.mockReset();
    storeConfigured.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reports a production site with no database as degraded", async () => {
    vi.stubEnv("NODE_ENV", "production");
    storeConfigured.mockReturnValue(false);
    const { code, status, store } = await storeCheck();
    expect(code).toBe(503);
    expect(status).toBe("degraded");
    expect(store.status).toBe("failed");
  });

  it("accepts local development with no database", async () => {
    vi.stubEnv("NODE_ENV", "development");
    storeConfigured.mockReturnValue(false);
    const { code, status, store } = await storeCheck();
    expect(code).toBe(200);
    expect(status).toBe("ok");
    expect(store.status).toBe("disabled");
  });

  it("reports an unreachable database as degraded", async () => {
    storeConfigured.mockReturnValue(true);
    recentPing.mockResolvedValue({ ok: false, message: "store unreachable" });
    const { code, store } = await storeCheck();
    expect(code).toBe(503);
    expect(store.status).toBe("failed");
  });

  async function sizeCheck(bytes: number | null) {
    storeConfigured.mockReturnValue(true);
    recentPing.mockResolvedValue({ ok: true, message: "ok" });
    recentDatabaseBytes.mockResolvedValue(bytes);
    const response = await GET();
    const body = await response.json();
    return {
      code: response.status,
      size: body.checks.find((c: { name: string }) => c.name === "database_size"),
    };
  }

  it("reports the database's size against the quota", async () => {
    expect((await sizeCheck(12_274_835)).size).toEqual({
      name: "database_size",
      status: "ok",
      message: "this project holds 12 MB; the organization's quota is 500 MB",
    });
  });

  it("warns from 450 MB and stays healthy, because estimates still run", async () => {
    expect((await sizeCheck(449_999_999)).size.status).toBe("ok");
    const { code, size } = await sizeCheck(450_000_000);
    expect(size.status).toBe("warning");
    expect(code).toBe(200);
  });

  it("stays healthy when it can't read the size", async () => {
    const { code, size } = await sizeCheck(null);
    expect(size.status).toBe("unknown");
    expect(code).toBe(200);
  });

  it("agrees with the outside monitor on every state it can report", async () => {
    const state = fc.record({
      environment: fc.constantFrom("production", "development"),
      configured: fc.boolean(),
      pingOk: fc.boolean(),
      openaiKey: fc.boolean(),
      bytes: fc.option(fc.integer({ min: 0, max: 600_000_000 })),
    });
    await fc.assert(
      fc.asyncProperty(state, async ({ environment, configured, pingOk, openaiKey, bytes }) => {
        vi.stubEnv("NODE_ENV", environment);
        vi.stubEnv("OPENAI_API_KEY", openaiKey ? "test-key" : "");
        storeConfigured.mockReturnValue(configured);
        recentPing.mockResolvedValue({ ok: pingOk, message: pingOk ? "ok" : "store unreachable" });
        recentDatabaseBytes.mockResolvedValue(bytes);

        const response = await GET();
        const answer = { status: response.status, body: await response.json() };

        // Development runs without a database, and the monitor only reads production.
        const storeOk = configured ? pingOk : false;
        expect(outageProblems(answer, Date.now()).length === 0).toBe(storeOk && openaiKey);
        const reading = configured ? bytes : null;
        expect(sizeProblems(answer)).toEqual(
          reading === null
            ? null
            : reading >= 450_000_000
              ? [expect.stringContaining("database_size: ")]
              : []
        );
      })
    );
  });
});
