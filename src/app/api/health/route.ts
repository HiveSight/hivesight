import { loadGeography } from "@/engine/data";
import { pingStore, storeConfigured } from "@/lib/store";

export async function GET() {
  const checks: Array<{ name: string; status: string; message: string }> = [];

  checks.push({
    name: "model_config",
    status: process.env.OPENAI_API_KEY ? "ok" : "failed",
    message: process.env.OPENAI_API_KEY ? "OPENAI_API_KEY configured" : "OPENAI_API_KEY missing",
  });

  try {
    const { table } = await loadGeography({ type: "state", value: "DE" });
    checks.push({
      name: "cell_data",
      status: "ok",
      message: `${table.cells.length} cells for Delaware, weight ${Math.round(table.totalWeight).toLocaleString()}`,
    });
  } catch (err) {
    checks.push({
      name: "cell_data",
      status: "failed",
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  if (storeConfigured()) {
    const ping = await pingStore();
    checks.push({
      name: "store",
      status: ping.ok ? "ok" : "failed",
      message: ping.message,
    });
  } else {
    checks.push({
      name: "store",
      status: "disabled",
      message: "persistence not configured; runs return inline only",
    });
  }

  const failed = checks.some((c) => c.status === "failed");
  return Response.json(
    {
      status: failed ? "degraded" : "ok",
      service: "hivesight",
      checkedAt: new Date().toISOString(),
      checks,
    },
    { status: failed ? 503 : 200 }
  );
}
