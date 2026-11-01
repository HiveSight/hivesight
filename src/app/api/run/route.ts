import { LlmRequestError, openAiClient } from "@/engine/elicit";
import { SERVED_MODELS, SITE_UNITS_PER_DAY, type ServedModel } from "@/engine/models";
import { runEstimate } from "@/engine/run";
import { RunRequestSchema } from "@/lib/schema";
import { type RunClaim, claimRun, saveRun } from "@/lib/store";
import { clientIp, visitorNetwork } from "@/lib/visitor";

export const maxDuration = 300;

// The database counts daily allowances, which models.ts sets. A typical Luna
// estimate costs about $0.0064 (155 calls at the per-call cost in
// evals/results/model-refresh-run.json), so a full site allowance typically
// spends about $3.20. The largest requests, with every call at the token
// ceiling, would spend about $38 on English text and about $75 on text written
// to use the most tokens. Sol's units cover its measured cost and its token
// prices, so Sol requests don't raise these figures.

// Per-instance limits on work in flight.
const MAX_ACTIVE_PER_IP = 2;
const MAX_ACTIVE_PER_INSTANCE = 8;
// Stop spending before the platform kills the function at maxDuration.
const RUN_DEADLINE_MS = 270_000;

function refusal(claim: Exclude<RunClaim, "ok">, model: ServedModel) {
  switch (claim) {
    case "visitor":
      return {
        status: 429,
        error: `Your network has used today's ${model.visitorLimit} free ${model.label} estimates, and HiveSight offers ${model.visitorLimit} more at midnight UTC.`,
      };
    case "site":
      return {
        status: 429,
        error: "HiveSight can't fit this estimate into today's free allowance and offers more at midnight UTC.",
      };
    case "unavailable":
      return { status: 503, error: "HiveSight has paused new estimates. Please try again later." };
  }
}

const activeByIp = new Map<string, number>();
let activeRuns = 0;

function admit(ip: string): (() => void) | null {
  const mine = activeByIp.get(ip) ?? 0;
  if (mine >= MAX_ACTIVE_PER_IP || activeRuns >= MAX_ACTIVE_PER_INSTANCE) return null;
  activeByIp.set(ip, mine + 1);
  activeRuns++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRuns--;
    const left = (activeByIp.get(ip) ?? 1) - 1;
    if (left > 0) activeByIp.set(ip, left);
    else activeByIp.delete(ip);
  };
}

/** Public message for a failed run; provider details stay in server logs. */
function publicMessage(err: unknown): string {
  if (err instanceof LlmRequestError) {
    console.error("model API rejected request:", err);
    return "The model service rejected this request.";
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return "The estimate took too long and was stopped. Please try again.";
  }
  // Engine errors are written for users (for example, no matching cells).
  return err instanceof Error ? err.message : "Estimate failed";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Model API not configured" }, { status: 503 });
  }
  // Browsers preflight cross-site JSON and this route grants no cross-site
  // access, so other sites can't spend their visitors' allowances.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send the request as JSON." }, { status: 415 });
  }

  const ip = visitorNetwork(clientIp(request.headers));
  const parsed = RunRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }
  // Admit first: a request turned away because others are running must not
  // use up the daily allowance.
  const release = admit(ip);
  if (!release) {
    return Response.json(
      { error: "Too many estimates are running right now. Please try again in a minute." },
      { status: 429 }
    );
  }
  const spec = parsed.data;
  const model = SERVED_MODELS[spec.model];
  // A visitor holds a separate daily allowance for each model.
  const claim = await claimRun(`${ip} ${spec.model}`, {
    visitorLimit: model.visitorLimit,
    siteCost: model.siteUnits,
    siteLimit: SITE_UNITS_PER_DAY,
  });
  if (claim !== "ok") {
    release();
    const { status, error } = refusal(claim, model);
    return Response.json({ error }, { status });
  }
  const llm = openAiClient(apiKey);

  // One signal stops all upstream work: the client disconnecting, the
  // response stream being cancelled, or the deadline.
  const aborter = new AbortController();
  const signal = AbortSignal.any([
    aborter.signal,
    request.signal,
    AbortSignal.timeout(RUN_DEADLINE_MS),
  ]);
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const result = await runEstimate(
          {
            question: spec.question,
            format: spec.format,
            audience: spec.audience,
            model: spec.model,
            mode: spec.mode,
            verbatimCount: spec.verbatimCount,
          },
          llm,
          (p) => send("progress", p),
          signal
        );
        const runId = await saveRun(result);
        send("complete", { result, runId });
      } catch (err) {
        if (!closed) send("error", { message: publicMessage(signal.reason ?? err) });
      } finally {
        release();
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      aborter.abort();
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
