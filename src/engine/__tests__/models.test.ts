import { afterEach, describe, expect, it, vi } from "vitest";
import * as evalModels from "../../../evals/models.mjs";
import { openAiClient } from "../elicit";
import { DEFAULT_MODEL, SERVED_MODEL_IDS, SERVED_MODELS, reasoningEffortFor } from "../models";
import { RunRequestSchema } from "@/lib/schema";

const baseRequest = {
  question: "Do you support a four-day work week?",
  format: { kind: "binary" },
  audience: { geography: { type: "national", value: "US", label: "United States" } },
};

describe("served models", () => {
  it("serve with the settings the benchmark runners use", () => {
    for (const id of SERVED_MODEL_IDS) {
      const evalCfg = evalModels.EVAL_MODELS[id as keyof typeof evalModels.EVAL_MODELS];
      expect(evalCfg, `${id} missing from evals/models.mjs`).toBeDefined();
      expect(evalCfg.provider).toBe(SERVED_MODELS[id].provider);
      expect("reasoningEffort" in evalCfg ? evalCfg.reasoningEffort : undefined).toBe(
        SERVED_MODELS[id].reasoningEffort
      );
      expect(evalCfg.price).toEqual(SERVED_MODELS[id].price);
    }
  });

  it("default to a served model", () => {
    expect(SERVED_MODEL_IDS).toContain(DEFAULT_MODEL);
    expect(RunRequestSchema.parse(baseRequest).model).toBe(DEFAULT_MODEL);
  });

  it("reject models the product no longer serves", () => {
    for (const model of ["gpt-5-mini", "gpt-5.2", "gpt-6-astra"]) {
      expect(RunRequestSchema.safeParse({ ...baseRequest, model }).success).toBe(false);
    }
  });

  it("have no reasoning effort for unknown models", () => {
    expect(reasoningEffortFor("not-a-model")).toBeNull();
  });
});

describe("openAiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(replies: unknown[]) {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        const reply = replies[Math.min(bodies.length - 1, replies.length - 1)];
        return { status: 200, json: async () => reply } as Response;
      })
    );
    return bodies;
  }

  const ok = { choices: [{ message: { content: '{"yes": 60, "no": 40}' } }] };

  it.each(SERVED_MODEL_IDS)("sends %s its registered reasoning effort", async (model) => {
    const bodies = stubFetch([ok]);
    await openAiClient("test-key").complete({ system: "s", user: "u", model });
    expect(bodies[0].reasoning_effort).toBe(SERVED_MODELS[model].reasoningEffort);
    expect(bodies[0].model).toBe(model);
  });

  it("retries without reasoning_effort when the API rejects the value", async () => {
    const rejected = {
      error: { message: "Unsupported value: 'reasoning_effort' does not support 'none' with this model." },
    };
    const bodies = stubFetch([rejected, ok]);
    const content = await openAiClient("test-key").complete({
      system: "s",
      user: "u",
      model: "gpt-6-luna",
    });
    expect(content).toBe('{"yes": 60, "no": 40}');
    expect(bodies).toHaveLength(2);
    expect(bodies[1].reasoning_effort).toBeUndefined();
  });
});
