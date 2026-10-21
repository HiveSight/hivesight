/**
 * Models the product serves, with the request settings the benchmark measured
 * them under. evals/models.mjs holds the same settings for the eval runners;
 * __tests__/models.test.ts keeps the two in agreement so published accuracy
 * describes the shipped configuration.
 *
 * Model IDs, reasoning-effort support, and prices were read from
 * developers.openai.com/api/docs/models and confirmed against the live API
 * on 2026-10-21. Each model runs at the lowest effort it accepts: the
 * estimator asks for a short JSON distribution, and the registered design
 * used the lowest effort for every model.
 */

export interface ServedModel {
  label: string;
  provider: "openai";
  reasoningEffort: "none" | "low";
  /** USD per million tokens [input, output]. */
  price: [number, number];
}

export const SERVED_MODELS = {
  "gpt-6-luna": {
    label: "GPT-6 Luna",
    provider: "openai",
    reasoningEffort: "none",
    price: [0.1, 0.5],
  },
  "gpt-6.1-sol": {
    label: "GPT-6.1 Sol",
    provider: "openai",
    reasoningEffort: "low",
    price: [2, 10],
  },
} as const satisfies Record<string, ServedModel>;

export type ServedModelId = keyof typeof SERVED_MODELS;

export const SERVED_MODEL_IDS = Object.keys(SERVED_MODELS) as [ServedModelId, ...ServedModelId[]];

export const DEFAULT_MODEL: ServedModelId = "gpt-6-luna";

/** Reasoning effort to send for a model; null when the model is unknown. */
export function reasoningEffortFor(model: string): string | null {
  return (SERVED_MODELS as Record<string, ServedModel>)[model]?.reasoningEffort ?? null;
}
