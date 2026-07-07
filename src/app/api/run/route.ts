import { openAiClient } from "@/engine/elicit";
import { runEstimate } from "@/engine/run";
import { RunRequestSchema } from "@/lib/schema";
import { saveRun } from "@/lib/store";

export const maxDuration = 300;

// Best-effort per-instance rate limit for the free demo. Not a security
// boundary; a durable limiter arrives with accounts.
const RATE_LIMIT_PER_DAY = 20;
const hits = new Map<string, { count: number; day: string }>();

function rateLimited(ip: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const cur = hits.get(ip);
  if (!cur || cur.day !== day) {
    hits.set(ip, { count: 1, day });
    return false;
  }
  cur.count++;
  return cur.count > RATE_LIMIT_PER_DAY;
}

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Model API not configured" }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return Response.json(
      { error: `Free demo allows ${RATE_LIMIT_PER_DAY} estimates per day.` },
      { status: 429 }
    );
  }

  const parsed = RunRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const spec = parsed.data;
  const llm = openAiClient(apiKey);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await runEstimate(
          {
            question: spec.question,
            format: spec.format,
            audience: spec.audience,
            model: spec.model,
            verbatimCount: spec.verbatimCount,
          },
          llm,
          (p) => sse(controller, "progress", p)
        );
        const runId = await saveRun(result);
        sse(controller, "complete", { result, runId });
      } catch (err) {
        sse(controller, "error", {
          message: err instanceof Error ? err.message : "Estimate failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
