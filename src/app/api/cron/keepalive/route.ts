import { pingStore, purgeOldRecords, storeConfigured } from "@/lib/store";

/**
 * Daily cron (vercel.json): a tiny read keeps the free-tier database from
 * auto-pausing on inactivity, and the purge keeps it inside the free tier.
 * Production runs no estimates while the database is away.
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
  const purged = ping.ok && (await purgeOldRecords());
  return Response.json(
    { status: purged ? "ok" : "failed", message: ping.ok && !purged ? "purge failed" : ping.message },
    { status: purged ? 200 : 503 }
  );
}
