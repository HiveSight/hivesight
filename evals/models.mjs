/**
 * Request settings per model for the anchor-bank runners. Every model the
 * product serves (src/engine/models.ts) must appear here with the same
 * settings; src/engine/__tests__/models.test.ts enforces this.
 *
 * Registered models (gpt-5-mini, gpt-5.2, claude-haiku-4-5-20251001) keep the
 * settings they ran under in July 2026. Current models were read from the
 * providers' model docs and confirmed against the live APIs on 2026-10-21;
 * each runs at the lowest effort it accepts, with thinking off where the
 * model allows it.
 *
 * price: USD per million tokens [input, output], list prices on that date.
 */
export const EVAL_MODELS = {
  // Registered July 2026 (PAP v2 / v3 addendum).
  "gpt-5-mini": { provider: "openai", reasoningEffort: "minimal", price: [0.25, 2.0] },
  "gpt-5.2": { provider: "openai", reasoningEffort: "none", price: [1.25, 10.0] },
  "claude-haiku-4-5-20251001": { provider: "anthropic", price: [1.0, 5.0] },
  // Current models (model-refresh addendum, October 2026).
  "gpt-6-luna": { provider: "openai", reasoningEffort: "none", price: [0.1, 0.5] },
  "gpt-6.1-sol": { provider: "openai", reasoningEffort: "low", price: [2.0, 10.0] },
  "gpt-6-astra": { provider: "openai", reasoningEffort: "low", price: [10.0, 50.0] },
  "claude-haiku-5-5": { provider: "anthropic", thinking: { type: "disabled" }, price: [0.1, 0.5] },
  "claude-sonnet-5-5": { provider: "anthropic", thinking: { type: "between_tools" }, price: [2.0, 10.0] },
  // Opus 5.5 rejects disabled thinking; low effort is its lightest setting.
  "claude-opus-5-5": { provider: "anthropic", effort: "low", price: [4.0, 20.0] },
};

export function modelConfig(model) {
  const cfg = EVAL_MODELS[model];
  if (!cfg) {
    throw new Error(`Unknown model ${model}; add it to evals/models.mjs with its request settings.`);
  }
  return cfg;
}

/** Provider request body fields beyond model/messages/max tokens. */
export function requestExtras(model) {
  const cfg = modelConfig(model);
  if (cfg.provider === "openai") {
    return cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {};
  }
  const extras = {};
  if (cfg.thinking) extras.thinking = cfg.thinking;
  if (cfg.effort) extras.output_config = { effort: cfg.effort };
  return extras;
}

/** Text of an Anthropic Messages reply; thinking blocks come before it. */
export function anthropicText(data) {
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function costUsd(model, tokIn, tokOut) {
  const [pIn, pOut] = modelConfig(model).price;
  return (tokIn * pIn + tokOut * pOut) / 1e6;
}
