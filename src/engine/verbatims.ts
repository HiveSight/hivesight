import type { LlmClient } from "./elicit";
import { mapLimit } from "./elicit";
import { sampleMatchesFilters } from "./bands";
import {
  describeSample,
  VERBATIM_SYSTEM_PROMPT,
  verbatimUserPrompt,
} from "./prompts";
import type {
  AudienceSpec,
  ResponseFormat,
  SampleRecord,
  Verbatim,
} from "./types";
import { optionIds } from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted sample of k records via seeded systematic sampling. */
export function sampleForVerbatims(
  samples: SampleRecord[],
  audience: AudienceSpec,
  k: number,
  seed: number
): SampleRecord[] {
  const eligible = samples.filter((p) => sampleMatchesFilters(p, audience.filters));
  if (eligible.length <= k) return eligible;
  const rng = mulberry32(seed);
  const total = eligible.reduce((s, p) => s + p.weight, 0);
  const step = total / k;
  let target = rng() * step;
  let acc = 0;
  const out: SampleRecord[] = [];
  for (const p of eligible) {
    acc += p.weight;
    while (acc >= target && out.length < k) {
      out.push(p);
      target += step;
    }
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Generate illustrative verbatims. These are qualitative color — clearly
 * labeled in the UI as synthetic and illustrative — not the estimator.
 */
export async function generateVerbatims(args: {
  llm: LlmClient;
  model: string;
  samples: SampleRecord[];
  audience: AudienceSpec;
  question: string;
  format: ResponseFormat;
  count: number;
  seed: number;
  concurrency?: number;
}): Promise<Verbatim[]> {
  const picked = sampleForVerbatims(args.samples, args.audience, args.count, args.seed);
  const ids = optionIds(args.format);
  const results = await mapLimit(picked, args.concurrency ?? 8, async (p) => {
    const personaDescription = describeSample(p, args.audience.geography);
    try {
      const content = await args.llm.complete({
        system: VERBATIM_SYSTEM_PROMPT,
        user: verbatimUserPrompt(personaDescription, args.question, args.format),
        model: args.model,
        json: true,
        maxTokens: 700,
      });
      const parsed = JSON.parse(content) as { choice?: string; text?: string };
      return {
        personaDescription,
        choice: parsed.choice && ids.includes(parsed.choice) ? parsed.choice : null,
        text: typeof parsed.text === "string" ? parsed.text : "",
      };
    } catch {
      return { personaDescription, choice: null, text: "" };
    }
  });
  return results.filter((v) => v.text.length > 0);
}
