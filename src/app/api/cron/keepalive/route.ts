import { pingStore, purgeOldRecords, storeConfigured } from "@/lib/store";

/**
 * Daily cron (vercel.json): Supabase pauses free-tier projects on inactivity,
 * so this queries the database each day, and the purge limits what it holds.
 * Production runs no estimates while the database is away.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!storeConfigured()) {
    const production = process.env.NODE_ENV === "production";
    return Response.json(
      { status: production ? "failed" : "skipped", message: "store not configured" },
      { status: production ? 503 : 200 }
    );
  }
  const ping = await pingStore();
  const purged = ping.ok && (await purgeOldRecords());
  return Response.json(
    { status: purged ? "ok" : "failed", message: ping.ok && !purged ? "purge failed" : ping.message },
    { status: purged ? 200 : 503 }
  );
}
