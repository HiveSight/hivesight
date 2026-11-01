import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const pingStore = vi.fn();
const storeConfigured = vi.fn();
vi.mock("@/lib/store", () => ({
  pingStore: () => pingStore(),
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
    pingStore.mockReset();
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
    pingStore.mockResolvedValue({ ok: false, message: "store unreachable" });
    const { code, store } = await storeCheck();
    expect(code).toBe(503);
    expect(store.status).toBe("failed");
  });
});
