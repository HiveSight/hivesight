import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RunResult } from "@/engine/types";

/**
 * Persistence is optional: when Supabase env vars are absent (or the project
 * is paused), runs still execute and return results inline — only share
 * links and history are disabled. This keeps the public demo independent of
 * database availability.
 */

let client: SupabaseClient | null | undefined;

function getClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
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
      .single();
    if (error) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

export async function getRun(id: string): Promise<RunResult | null> {
  const db = getClient();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("runs")
      .select("payload")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return (data as { payload: RunResult }).payload;
  } catch {
    return null;
  }
}

export async function pingStore(): Promise<{ ok: boolean; message: string }> {
  const db = getClient();
  if (!db) return { ok: false, message: "store not configured" };
  try {
    const { error } = await db.from("runs").select("id").limit(1);
    return error ? { ok: false, message: error.message } : { ok: true, message: "ok" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "unknown" };
  }
}
