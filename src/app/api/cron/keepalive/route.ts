import { pingStore, storeConfigured } from "@/lib/store";

/**
 * Daily cron (vercel.json): a tiny read keeps the free-tier database from
 * auto-pausing on inactivity, which previously took production down.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!storeConfigured()) {
    return Response.json({ status: "skipped", message: "store not configured" });
  }
  const ping = await pingStore();
  return Response.json(
    { status: ping.ok ? "ok" : "failed", message: ping.message },
    { status: ping.ok ? 200 : 503 }
  );
}
