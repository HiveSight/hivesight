import type { Metadata } from "next";
import artifact from "../../../evals/results/shed-2024-powered-comparison-v2.json";
import anchorAnalysis from "../../../paper/artifacts/anchor-analysis.json";

export const metadata: Metadata = {
  title: "Benchmarks — HiveSight",
  description:
    "HiveSight estimator accuracy against SHED 2024 human survey targets, all comparison arms, wins and misses.",
};

const ARM_LABELS: Record<string, string> = {
  naive: "Direct model estimate",
  persona: "Persona roleplay (n=150 per question)",
  cells: "HiveSight population cells",
};

function pts(v: number | null | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}`;
}

export default function BenchmarksPage() {
  const questions = artifact.questions as Array<{
    questionId: string;
    prompt: string;
    scoring: string;
    sliceFamily: string;
    arms: Record<
      string,
      {
        estimate: number | null;
        toplineHuman: number;
        toplineAbsError: number | null;
        sliceMAE: number | null;
        sliceErrors: Array<{ label: string; estimate: number; human: number; absError: number }>;
      }
    >;
    stability: { paraphraseEstimate: number; delta: number } | null;
  }>;
  const pooled = artifact.pooled as Record<string, { toplineMAE: number; sliceMAE: number }>;

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <p className="eyebrow mb-3">Benchmarks</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Accuracy against real survey data
      </h1>
      <p className="mt-4 max-w-2xl text-muted">
        Every estimation method HiveSight considers is scored against human
        survey targets before it ships. This page reports the full comparison —
        including where our estimator loses. Current suite: four questions from
        the Federal Reserve&apos;s 2024 Survey of Household Economics and
        Decisionmaking (SHED, n=12,295), national audience, scored on weighted
        human response shares.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight mb-2">
          Registered anchor-bank study — 63 items
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Pre-registered by commit before any model runs: 52 GSS 2024 items
          and 11 SHED 2024 items, scored on weighted human targets, toplines
          and subgroups. Persona roleplay is not competitive. Cells and
          direct estimation tie on marginal accuracy; cells order subgroups
          better (median Spearman below) and stay coherent and composable.
          Full method, hypotheses, and honest misses are in{" "}
          <a href="/paper" className="underline hover:text-ink">
            the research paper
          </a>
          , which renders from these same artifacts.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-surface">
              <tr className="text-left text-muted">
                <th className="px-4 py-3 font-normal">Method · model</th>
                <th className="px-4 py-3 font-normal">Topline MAE (pts)</th>
                <th className="px-4 py-3 font-normal">Subgroup MAE (pts)</th>
                <th className="px-4 py-3 font-normal">Subgroup rank corr</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {Object.entries(
                anchorAnalysis.pooled as Record<
                  string,
                  {
                    items: number;
                    toplineMAE: number;
                    sliceMAE: number;
                    medianSliceSpearman: number | null;
                  }
                >
              ).map(([key, v]) => {
                const labels: Record<string, string> = {
                  "persona:openai:gpt-5-mini": "Persona roleplay · gpt-5-mini (20 items)",
                  "naive:openai:gpt-5-mini": "Direct estimate · gpt-5-mini",
                  "cells:openai:gpt-5-mini": "Population cells · gpt-5-mini",
                  "cells:openai:gpt-5.2": "Population cells · gpt-5.2 (20 items)",
                  "cells:anthropic:claude-haiku-4-5-20251001":
                    "Population cells · claude-haiku-4.5 (20 items)",
                };
                return (
                  <tr key={key} className="border-t border-line">
                    <td className="px-4 py-3 font-sans text-sm text-ink">
                      {labels[key] ?? key}
                    </td>
                    <td className="px-4 py-3">{(v.toplineMAE * 100).toFixed(1)}</td>
                    <td className="px-4 py-3">{(v.sliceMAE * 100).toFixed(1)}</td>
                    <td className="px-4 py-3">
                      {v.medianSliceSpearman == null || Number.isNaN(v.medianSliceSpearman)
                        ? "—"
                        : v.medianSliceSpearman.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight mb-4">
          Pilot: SHED powered comparison
        </h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="bg-surface">
              <tr className="text-left text-muted">
                <th className="px-4 py-3 font-normal">Method</th>
                <th className="px-4 py-3 font-normal">Topline MAE (pts)</th>
                <th className="px-4 py-3 font-normal">Subgroup MAE (pts)</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {Object.entries(pooled).map(([arm, v]) => (
                <tr key={arm} className="border-t border-line">
                  <td className="px-4 py-3 font-sans text-sm text-ink">{ARM_LABELS[arm] ?? arm}</td>
                  <td className="px-4 py-3">{pts(v.toplineMAE)}</td>
                  <td className="px-4 py-3">{pts(v.sliceMAE)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 max-w-2xl space-y-2 text-sm text-muted">
          <p>
            What to take from this: cell-based estimation is the most accurate
            method in test on subgroups, and it is honestly beaten by a direct
            model estimate on national toplines, where the model can lean on
            memorized aggregates. Persona roleplay, the approach most
            synthetic-respondent products use, is far behind on both.
          </p>
          <p>
            The topline gap is a systematic level bias on self-reported
            wellbeing scales (the model under-rates how positively people
            describe their own finances) with the subgroup structure largely
            correct. A single-parameter calibration fit on these questions did
            not generalize under leave-one-question-out validation, so no
            silent correction is applied — results instead carry measured error
            context. The 63-item anchor bank above is the multi-domain
            follow-up this pilot called for; the paper carries the full
            robustness program.
          </p>
        </div>
      </section>

      <section className="mt-12 space-y-8">
        <h2 className="text-xl font-bold tracking-tight">Per-question detail</h2>
        {questions.map((q) => (
          <div key={q.questionId} className="rounded-lg border border-line p-5">
            <p className="text-ink font-medium">“{q.prompt}”</p>
            <p className="mt-1 font-mono text-xs text-muted">
              human target {pts(q.arms.cells.toplineHuman)}% · scoring {q.scoring} · slices by{" "}
              {q.sliceFamily.replace("_", " ")}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1.5 pr-4 font-normal">Method</th>
                    <th className="py-1.5 pr-4 font-normal">Estimate</th>
                    <th className="py-1.5 pr-4 font-normal">Error</th>
                    <th className="py-1.5 font-normal">Slice errors (pts)</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {Object.entries(q.arms).map(([arm, a]) => (
                    <tr key={arm} className="border-t border-line align-top">
                      <td className="py-2 pr-4 font-sans text-sm text-ink">
                        {ARM_LABELS[arm] ?? arm}
                      </td>
                      <td className="py-2 pr-4">{a.estimate == null ? "—" : `${pts(a.estimate)}%`}</td>
                      <td className="py-2 pr-4">{pts(a.toplineAbsError)}</td>
                      <td className="py-2">
                        {a.sliceErrors
                          .map((s) => `${s.label} ${pts(s.absError)}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.stability && (
              <p className="mt-3 font-mono text-xs text-muted">
                prompt-paraphrase stability: Δ{pts(Math.abs(q.stability.delta))} pts
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="mt-12 max-w-2xl text-sm text-muted space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-ink">Caveats</h2>
        <p>
          SHED income slices are household income while population cells band
          personal earned income, so income-slice errors include construct
          mismatch, identically across microdata arms. SHED 2024 was published
          in May 2025 and may appear in model training data; contamination
          would flatter all arms equally, and the next suite adds post-cutoff
          questions to test it. Four questions is a small suite: treat rankings
          as directional and see the raw artifact for full detail.
        </p>
        <p className="font-mono text-xs">
          model {String(artifact.model)} · seed {String(artifact.seed)} ·{" "}
          {String((artifact as { cellCount?: number }).cellCount ?? "")} cells · generated{" "}
          {String(artifact.generatedAt).slice(0, 10)}
        </p>
      </section>
    </div>
  );
}
