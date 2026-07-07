import type { Distribution, ResponseFormat } from "./types";
import { optionIds } from "./types";

export interface LlmClient {
  /** Returns raw message content for a chat completion. */
  complete(args: {
    system: string;
    user: string;
    model: string;
    json?: boolean;
    maxTokens?: number;
  }): Promise<string>;
}

/** Direct OpenAI-compatible client; no SDK dependency. */
export function openAiClient(apiKey: string, baseUrl = "https://api.openai.com/v1"): LlmClient {
  return {
    async complete({ system, user, model, json = true, maxTokens = 700 }) {
      // gpt-5-mini supports 'minimal'; gpt-5.x point releases use 'none'.
      let reasoningEffort: string | null = model.startsWith("gpt-5.") ? "none" : "minimal";
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const body: Record<string, unknown> = {
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_completion_tokens: maxTokens,
          };
          if (reasoningEffort) body.reasoning_effort = reasoningEffort;
          if (json) body.response_format = { type: "json_object" };
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          if (res.status === 429 || res.status >= 500) {
            await sleep(1200 * 2 ** attempt);
            continue;
          }
          const data = await res.json();
          if (data.error) {
            // Models that reject the reasoning_effort value: drop it and retry.
            if (
              reasoningEffort &&
              typeof data.error.message === "string" &&
              data.error.message.includes("reasoning_effort")
            ) {
              reasoningEffort = null;
              continue;
            }
            throw new Error(data.error.message);
          }
          return data.choices?.[0]?.message?.content ?? "";
        } catch (err) {
          if (attempt === 3) throw err;
          await sleep(1200 * 2 ** attempt);
        }
      }
      throw new Error("unreachable");
    },
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Parse a verbalized distribution reply into a normalized Distribution.
 * Returns null when the reply doesn't cover the option set with positive mass.
 */
export function parseDistribution(
  content: string,
  format: ResponseFormat
): Distribution | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  const ids = optionIds(format);
  const values = ids.map((id) => {
    const v = raw[id];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  });
  if (values.some((v) => v == null)) {
    // Tolerate label-keyed replies for choice formats ("Option text": 40).
    if (format.kind === "choice") {
      const byLabel = format.options.map((label) => {
        const v = raw[label];
        return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
      });
      if (byLabel.every((v) => v != null)) {
        return normalize(ids, byLabel as number[]);
      }
    }
    return null;
  }
  return normalize(ids, values as number[]);
}

function normalize(ids: string[], values: number[]): Distribution | null {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  return Object.fromEntries(ids.map((id, i) => [id, values[i] / total]));
}
