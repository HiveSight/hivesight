import { NextResponse } from "next/server";
import { loadAndSampleForLocation } from "@/lib/data/location-resolver";
import { createSeededRandom } from "@/lib/data/sampler";
import { createClient } from "@/lib/supabase/server";
import type { LocationFilter } from "@/types";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "failed" | "skipped";

interface HealthCheck {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
}

const HEALTH_LOCATION: LocationFilter = {
  type: "state",
  value: "DE",
  label: "Delaware",
};

function now() {
  return Date.now();
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runCheck(
  name: string,
  check: () => Promise<string | void>
): Promise<HealthCheck> {
  const startedAt = now();

  try {
    const message = await check();
    return {
      name,
      status: "ok",
      latencyMs: now() - startedAt,
      message: message ?? undefined,
    };
  } catch (error) {
    return {
      name,
      status: "failed",
      latencyMs: now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shallow = url.searchParams.get("shallow") === "1";
  const checks: HealthCheck[] = [];

  checks.push(
    await runCheck("supabase", async () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
      }
      if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
      }

      const supabase = await createClient();
      const query = supabase
        .from("surveys")
        .select("id", { count: "exact", head: true });
      const { error, count } = await withTimeout(
        Promise.resolve(
          query as unknown as PromiseLike<{
            error: { message: string } | null;
            count: number | null;
          }>
        ),
        5_000,
        "Supabase survey metadata check"
      );

      if (error) throw new Error(error.message);
      return `reachable; surveys visible to health check: ${count ?? 0}`;
    })
  );

  checks.push(
    await runCheck("openai_config", async () => {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not configured");
      }
      return "OPENAI_API_KEY is configured";
    })
  );

  if (shallow) {
    checks.push({
      name: "microdata_sample",
      status: "skipped",
      latencyMs: 0,
      message: "Skipped by shallow=1",
    });
  } else {
    checks.push(
      await runCheck("microdata_sample", async () => {
        const sample = await withTimeout(
          loadAndSampleForLocation(HEALTH_LOCATION, 1, {
            allowSyntheticFallback: false,
            random: createSeededRandom(20260425),
          }),
          10_000,
          "Microdata sample check"
        );

        if (sample.synthetic || sample.persons.length !== 1) {
          throw new Error("Calibrated microdata sample did not return one real record");
        }

        return `loaded ${sample.metadata.eligibleCount.toLocaleString()} eligible records for ${HEALTH_LOCATION.label}`;
      })
    );
  }

  const failed = checks.filter((check) => check.status === "failed");
  const status = failed.length > 0 ? "degraded" : "ok";

  return NextResponse.json(
    {
      status,
      checkedAt: new Date().toISOString(),
      service: "hivesight",
      checks,
    },
    {
      status: failed.length > 0 ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
