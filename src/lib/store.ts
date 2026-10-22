import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RunResult } from "@/engine/types";

/**
 * Persistence is optional: when Supabase env vars are absent (or the project
 * is paused), runs still execute and return results inline — only share
 * links and history are disabled. This keeps the public demo independent of
 * database availability.
 */

let client: SupabaseClient | null | undefined;

// Persistence must never hold up a finished estimate.
const STORE_TIMEOUT_MS = 2000;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  try {
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  } catch (err) {
    // A malformed URL makes createClient throw; run without persistence.
    console.error("store misconfigured:", err);
    client = null;
  }
  return client;
}

export function storeConfigured(): boolean {
  return getClient() !== null;
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
    const { error } = await db
      .from("runs")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(STORE_TIMEOUT_MS));
    if (!error) return { ok: true, message: "ok" };
    console.error("store ping failed:", error.message);
  } catch (err) {
    console.error("store ping failed:", err);
  }
  return { ok: false, message: "store unreachable" };
}
