import { loadGeography } from "@/engine/data";
import { recentDatabaseBytes, recentPing, storeConfigured } from "@/lib/store";

// Supabase counts every project in the organization against the free plan's
// 500 MB. This warns at 80%, while there's still time to act: at the site's
// daily allowance the largest estimates add under 24 MB a day.
const DATABASE_QUOTA_BYTES = 500_000_000;
const DATABASE_WARNING_BYTES = 400_000_000;

function databaseSizeCheck(bytes: number | null) {
  if (bytes === null) {
    return { name: "database_size", status: "unknown", message: "database size unavailable" };
  }
  return {
    name: "database_size",
    status: bytes >= DATABASE_WARNING_BYTES ? "warning" : "ok",
    message: `${Math.round(bytes / 1_000_000)} MB of ${DATABASE_QUOTA_BYTES / 1_000_000} MB`,
  };
}

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
    // The error names filesystem paths; keep it out of the public response.
    console.error("health: cell data failed to load:", err);
    checks.push({ name: "cell_data", status: "failed", message: "cell data failed to load" });
  }

  if (storeConfigured()) {
    const [ping, bytes] = await Promise.all([recentPing(), recentDatabaseBytes()]);
    checks.push({
      name: "store",
      status: ping.ok ? "ok" : "failed",
      message: ping.message,
    });
    checks.push(databaseSizeCheck(bytes));
  } else if (process.env.NODE_ENV === "production") {
    checks.push({
      name: "store",
      status: "failed",
      message: "store not configured; estimates stay paused without it",
    });
  } else {
    checks.push({
      name: "store",
      status: "disabled",
      message: "store not configured; local development runs without allowances or share links",
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
