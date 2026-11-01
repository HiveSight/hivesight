import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import refresh from "../../../../paper/artifacts/model-refresh.json";

const ARTIFACT = "../../../../paper/artifacts/model-refresh.json";

async function pageWhenRuleChooses(model: string) {
  vi.resetModules();
  vi.doMock(ARTIFACT, () => ({
    default: { ...refresh, productDecision: { ...refresh.productDecision, default: model } },
  }));
  const { default: BenchmarksPage } = await import("../page");
  return renderToStaticMarkup(BenchmarksPage()).replaceAll("&#x27;", "'");
}

describe("benchmarks page", () => {
  afterEach(() => vi.doUnmock(ARTIFACT));

  it("credits the decision rule when the rule chose the default model", async () => {
    expect(await pageWhenRuleChooses("gpt-6-luna")).toContain(
      "Under the addendum's decision rule, HiveSight serves GPT-6 Luna by default."
    );
  });

  it("states the default alone when the rule chose another model", async () => {
    const page = await pageWhenRuleChooses("gpt-6.1-sol");
    expect(page).toContain("HiveSight serves GPT-6 Luna by default.");
    expect(page).not.toContain("decision rule");
  });
});
