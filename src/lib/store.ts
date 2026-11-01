import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RunResult } from "@/engine/types";
import { visitorKey } from "@/lib/visitor";

/**
 * The database holds saved estimates and the daily allowances. Saving stays
 * best effort: a finished estimate still reaches the asker without a share
 * link. Claiming fails closed: production runs no estimate it can't count.
 * Only local development runs without a database.
 */

let client: SupabaseClient | null | undefined;

// Persistence must never hold up a finished estimate.
const STORE_TIMEOUT_MS = 2000;

// The largest request stores about 47 KB, so this holds the runs table near
// 400 MB at worst, dead rows included, and leaves room for the rest of the
// database. An organization over the free plan's 500 MB can have its requests
// refused, and that would stop every claim.
const KEEP_RUNS = 7_000;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  try {
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  } catch (err) {
    // A malformed URL makes createClient throw; treat that as no database.
    console.error("store misconfigured:", err);
    client = null;
  }
  return client;
}

export function storeConfigured(): boolean {
  return getClient() !== null;
}

export interface RunLimits {
  /** Estimates of one model one visitor may run per UTC day. */
  visitorLimit: number;
  /** Units this estimate draws from the site's daily allowance. */
  siteCost: number;
  /** The day's site total this estimate may reach. */
  siteLimit: number;
}

export type RunClaim = "ok" | "visitor" | "site" | "unavailable";

/** Counts one estimate. Anything but a clear answer returns "unavailable". */
export async function claimRun(visitor: string, limits: RunLimits): Promise<RunClaim> {
  const db = getClient();
  if (!db) return process.env.NODE_ENV === "production" ? "unavailable" : "ok";
  try {
    const { data, error } = await db
      .rpc("claim_run", {
        p_visitor: visitorKey(visitor, process.env.SUPABASE_SECRET_KEY as string),
        p_visitor_limit: limits.visitorLimit,
        p_site_cost: limits.siteCost,
        p_site_limit: limits.siteLimit,
      })
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS));
    if (error) {
      console.error("claimRun failed:", error.message);
      return "unavailable";
    }
    if (data === "ok" || data === "visitor" || data === "site") return data;
    console.error("claimRun got an unexpected answer");
    return "unavailable";
  } catch (err) {
    console.error("claimRun failed:", err);
    return "unavailable";
  }
}

export async function purgeOldRecords(): Promise<boolean> {
  const db = getClient();
  if (!db) return false;
  try {
    const { error } = await db
      .rpc("purge_old_records", { p_keep_runs: KEEP_RUNS })
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS));
    if (!error) return true;
    console.error("purgeOldRecords failed:", error.message);
  } catch (err) {
    console.error("purgeOldRecords failed:", err);
  }
  return false;
}

export async function saveRun(result: RunResult): Promise<string | null> {
  const db = getClient();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("runs")
      .insert({ payload: result })
      .select("id")
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS))
      .single();
    if (error) {
      console.error("saveRun failed:", error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error("saveRun failed:", err);
    return null;
  }
}

/**
 * "missing" means the store answered and has no such run (a 404);
 * "unavailable" means it could not answer, so the link may still be good.
 */
export type GetRunOutcome =
  | { status: "found"; result: RunResult }
  | { status: "missing" }
  | { status: "unavailable" };

export async function getRun(id: string): Promise<GetRunOutcome> {
  const db = getClient();
  if (!db) return { status: "unavailable" };
  try {
    const { data, error } = await db
      .from("runs")
      .select("payload")
      .eq("id", id)
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS))
      .maybeSingle();
    if (error) {
      console.error("getRun failed:", error.message);
      return { status: "unavailable" };
    }
    if (!data) return { status: "missing" };
    return { status: "found", result: (data as { payload: RunResult }).payload };
  } catch (err) {
    console.error("getRun failed:", err);
    return { status: "unavailable" };
  }
}

export async function pingStore(): Promise<{ ok: boolean; message: string }> {
  const db = getClient();
  if (!db) return { ok: false, message: "store not configured" };
  // Public health and cron responses get a fixed message; details go to logs.
  try {
    // A claim too large for any site allowance runs the real function, with its
    // write and row lock, and counts nothing. A plain read would pass on a
    // database that refuses every claim.
    const { data, error } = await db
      .rpc("claim_run", { p_visitor: "ping", p_visitor_limit: 1, p_site_cost: 2, p_site_limit: 1 })
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS));
    if (data === "site") return { ok: true, message: "ok" };
    console.error("store ping failed:", error?.message ?? "unexpected answer");
  } catch (err) {
    console.error("store ping failed:", err);
  }
  return { ok: false, message: "store unreachable" };
}

/** The database's size, or null when it can't say. */
export async function databaseBytes(): Promise<number | null> {
  const db = getClient();
  if (!db) return null;
  try {
    const { data, error } = await db
      .rpc("database_bytes")
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS));
    if (!error && typeof data === "number") return data;
    console.error("databaseBytes failed:", error?.message ?? "unexpected answer");
  } catch (err) {
    console.error("databaseBytes failed:", err);
  }
  return null;
}

// /api/health is public and each ping takes the site row's lock, so one
// instance sends each query at most once per interval, however much traffic
// it gets.
const PING_INTERVAL_MS = 30_000;

function recent<T>(query: () => Promise<T>): () => Promise<T> {
  let last: { at: number; result: Promise<T> } | undefined;
  return () => {
    if (!last || Date.now() - last.at >= PING_INTERVAL_MS) {
      last = { at: Date.now(), result: query() };
    }
    return last.result;
  };
}

export const recentPing = recent(pingStore);
export const recentDatabaseBytes = recent(databaseBytes);
