import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const pingStore = vi.fn();
const purgeOldRecords = vi.fn();
const storeConfigured = vi.fn();
vi.mock("@/lib/store", () => ({
  pingStore: () => pingStore(),
  purgeOldRecords: () => purgeOldRecords(),
  storeConfigured: () => storeConfigured(),
}));

const get = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/cron/keepalive", { headers }));

describe("GET /api/cron/keepalive", () => {
  beforeEach(() => {
    pingStore.mockReset().mockResolvedValue({ ok: true, message: "ok" });
    purgeOldRecords.mockReset().mockResolvedValue(true);
    storeConfigured.mockReset().mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("pings and purges", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
    expect(purgeOldRecords).toHaveBeenCalledOnce();
  });

  it("turns away callers without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await get()).status).toBe(401);
    expect((await get({ authorization: "Bearer wrong" })).status).toBe(401);
    expect(pingStore).not.toHaveBeenCalled();
    expect((await get({ authorization: "Bearer s3cret" })).status).toBe(200);
  });

  it("skips the purge when the ping fails", async () => {
    pingStore.mockResolvedValue({ ok: false, message: "store unreachable" });
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ message: "store unreachable" });
    expect(purgeOldRecords).not.toHaveBeenCalled();
  });

  it("reports a failed purge", async () => {
    purgeOldRecords.mockResolvedValue(false);
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ message: "purge failed" });
  });

  it("skips everything in local development without a database", async () => {
    storeConfigured.mockReturnValue(false);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "skipped" });
    expect(pingStore).not.toHaveBeenCalled();
  });

  it("fails when production has no database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    storeConfigured.mockReturnValue(false);
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "failed", message: "store not configured" });
    expect(pingStore).not.toHaveBeenCalled();
  });
});
