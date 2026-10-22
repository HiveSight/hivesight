import type { Metadata } from "next";
import artifact from "../../../evals/results/shed-2024-powered-comparison-v2.json";
import anchorAnalysis from "../../../paper/artifacts/anchor-analysis.json";
import refresh from "../../../paper/artifacts/model-refresh.json";
import { DEFAULT_MODEL, SERVED_MODELS } from "@/engine/models";

export const metadata: Metadata = {
  title: "Benchmarks — HiveSight",
  description:
    "HiveSight estimator accuracy against GSS 2024 and SHED 2024 human survey targets, by model and method, wins and misses.",
};

const ARM_LABELS: Record<string, string> = {
  naive: "Direct model estimate",
  persona: "Persona roleplay (n=150 per question)",
  cells: "HiveSight population cells",
};

function pts(v: number | null | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}`;
}

type ArmScore = {
  items: number;
  toplineMAE: number | null;
  subgroupMAE: number | null;
  subgroupMAE_itemMean: number | null;
  bins: number;
};
type ArmScores = { all: ArmScore | null; subset20: ArmScore };
type ModelScores = Record<string, unknown>;
type Paired = {
  items: number;
  topline: { diff: number; lo: number; hi: number };
  subgroup: { diff: number; lo: number; hi: number } | null;
} | null;

const MODEL_LABELS: Record<string, string> = {
  "gpt-5-mini": "gpt-5-mini (July reference)",
  "gpt-6-luna": "gpt-6-luna",
  "gpt-6.1-sol": "gpt-6.1-sol",
  "gpt-6-astra": "gpt-6-astra",
  "claude-haiku-5-5": "claude-haiku-5.5",
  "claude-sonnet-5-5": "claude-sonnet-5.5",
  "claude-opus-5-5": "claude-opus-5.5",
};

function arm(models: Record<string, ModelScores>, model: string, name: string): ArmScores | null {
  const a = models[model]?.[name];
  return a && typeof a === "object" && "subset20" in a ? (a as ArmScores) : null;
}

function diffCi(d: { diff: number; lo: number; hi: number } | null | undefined): string {
  if (!d) return "—";
  const f = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}`;
  return `${f(d.diff)} [${f(d.lo)}, ${f(d.hi)}]`;
}

/**
 * Which current models' direct estimates beat cells, read from the same rows
 * the table shows (full bank where run, else the 20-item subset).
 */
function directWins(models: Record<string, ModelScores>, current: string[]): string {
  const row = (m: string, name: string) => {
    const a = arm(models, m, name);
    return a?.all ?? a?.subset20 ?? null;
  };
  const losers: string[] = [];
  const exceptions: string[] = [];
  for (const m of current) {
    const c = row(m, "cells");
    const d = row(m, "naive");
    if (!c || !d || c.subgroupMAE == null || d.subgroupMAE == null) continue;
    if (d.subgroupMAE <= c.subgroupMAE) losers.push(m);
    else exceptions.push(`${MODEL_LABELS[m]} (${pts(c.subgroupMAE)} vs ${pts(d.subgroupMAE)})`);
  }
  const lead = `direct estimation's subgroup error is at or below the cells estimator's for ${losers.length} of ${losers.length + exceptions.length} current models in the table`;
  return exceptions.length ? `${lead}; the exception is ${exceptions.join(", ")}.` : `${lead}.`;
}

function CurrentModels() {
  const models = refresh.models as unknown as Record<string, ModelScores>;
  const order = Object.keys(MODEL_LABELS).filter((m) => models[m]);
  const q4 = refresh.Q4_personaProb as Record<string, { vsPersona: Paired; vsCells: Paired }>;
  const design = refresh.personaDesignEffect as Paired;
  const decision = refresh.productDecision as { default: string };
  const current = order.filter((m) => m !== "gpt-5-mini");
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight mb-2">Current models — October 2026 refresh</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        The registered design rerun with the models available in October 2026, on the
        instrument-corrected bank and the prompts the product uses, under{" "}
        <a
          href="https://github.com/HiveSight/hivesight/blob/main/paper/pap-model-refresh-2026-10.md"
          className="underline hover:text-ink"
        >
          an addendum
        </a>{" "}
        registered before the refresh runs (it also records a one-item plumbing check, two
        amendments and one interrupted run). The refresh registered no confirmatory hypotheses,
        so all its comparisons are exploratory. Subgroup error pools every reported subgroup, as
        the original plan registered.
        HiveSight serves {SERVED_MODELS[DEFAULT_MODEL].label} by default
        {decision.default === DEFAULT_MODEL ? ", the model the registered rule selects" : ""}.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-surface">
            <tr className="text-left text-muted">
              <th className="px-4 py-3 font-normal">Model</th>
              <th className="px-4 py-3 font-normal">Items</th>
              <th className="px-4 py-3 font-normal">Cells topline</th>
              <th className="px-4 py-3 font-normal">Cells subgroup</th>
              <th className="px-4 py-3 font-normal">Direct topline</th>
              <th className="px-4 py-3 font-normal">Direct subgroup</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {order.map((m) => {
              const cells = arm(models, m, "cells");
              const naive = arm(models, m, "naive");
              const c = cells?.all ?? cells?.subset20;
              const n = naive?.all ?? naive?.subset20;
              return (
                <tr key={m} className="border-t border-line">
                  <td className="px-4 py-3 font-sans text-sm text-ink">{MODEL_LABELS[m]}</td>
                  <td className="px-4 py-3">{c?.items ?? "—"}</td>
                  <td className="px-4 py-3">{pts(c?.toplineMAE)}</td>
                  <td className="px-4 py-3">{pts(c?.subgroupMAE)}</td>
                  <td className="px-4 py-3">{pts(n?.toplineMAE)}</td>
                  <td className="px-4 py-3">{pts(n?.subgroupMAE)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Mean absolute error of the designated answer share, in percentage points. Models with
        20 items ran the 20-item subset fixed in the original plan; compare them with each
        other, not with full-bank rows.
      </p>
      <p className="mt-2 max-w-2xl text-xs text-muted">
        Where our estimator loses: {directWins(models, current)} Cells keep their coherence
        (subgroups always add up to the topline) and compose across any audience filter. This
        comparison was not one of the refresh&apos;s questions.
      </p>

      <h3 className="mt-8 mb-2 font-bold tracking-tight">
        Simulating individuals with current models
      </h3>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Each model answered as the same 150 sampled adults per question, on the 20-item subset,
        in two ways: naming the one answer each person would give (persona roleplay), or giving
        each person&apos;s probability of every answer and averaging them. Topline · subgroup
        error in points. The last column compares averaged probabilities with population cells
        on subgroups, with a 95% interval from resampling questions; positive means cells are
        more accurate. The probability arm was added by a second amendment after the other
        results were seen, so treat it as exploratory.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface">
            <tr className="text-left text-muted">
              <th className="px-4 py-3 font-normal">Model</th>
              <th className="px-4 py-3 font-normal">One answer each</th>
              <th className="px-4 py-3 font-normal">Probabilities each</th>
              <th className="px-4 py-3 font-normal">Population cells</th>
              <th className="px-4 py-3 font-normal">Probabilities vs cells (subgroup)</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {order.map((m) => {
              const both = (a: ArmScore | null | undefined) =>
                a ? `${pts(a.toplineMAE)} · ${pts(a.subgroupMAE)}` : "—";
              return (
                <tr key={m} className="border-t border-line">
                  <td className="px-4 py-3 font-sans text-sm text-ink">{MODEL_LABELS[m]}</td>
                  <td className="px-4 py-3">{both(arm(models, m, "persona")?.subset20)}</td>
                  <td className="px-4 py-3">{both(arm(models, m, "persona-prob")?.subset20)}</td>
                  <td className="px-4 py-3">{both(arm(models, m, "cells")?.subset20)}</td>
                  <td className="px-4 py-3">{diffCi(q4[m]?.vsCells?.subgroup)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {design && (
        <p className="mt-2 max-w-2xl text-xs text-muted">
          Persona records are drawn with equal probability from a sample that already
          represents adults in proportion to their weight. The July runs drew in proportion to
          weight a second time and weighted each answer again; for gpt-5-mini that design
          changes persona subgroup error by {diffCi(design.subgroup)} points relative to equal
          probability.
        </p>
      )}
    </section>
  );
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
        Every estimation method and model HiveSight considers is scored against
        human survey targets before it ships, and this page reports the full
        comparison, including where our estimator loses. The suite is a
        pre-registered bank of 63 questions from the 2024 General Social Survey
        and the Federal Reserve&apos;s 2024 Survey of Household Economics and
        Decisionmaking, scored on weighted human answer shares for the US adult
        population and its subgroups.
      </p>

      <CurrentModels />

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight mb-2">
          Registered anchor-bank study — 63 items
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-muted">
          Registered by commit before the anchor-bank runs (a four-question pilot
          informed the design): 52 GSS 2024 items
          and 11 SHED 2024 items, scored on weighted human targets, toplines
          and subgroups. Persona roleplay is not competitive. Cells and
          direct estimation tie on marginal accuracy. In an exploratory
          comparison, cells order subgroups better than direct estimation
          (median Spearman below), though they miss the registered 0.80
          threshold; cells also stay coherent and composable.
          Full method, hypotheses, and honest misses are in{" "}
          <a href="/paper" className="underline hover:text-ink">
            the research paper
          </a>
          , which renders from these same artifacts.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface">
              <tr className="text-left text-muted">
                <th className="px-4 py-3 font-normal">Method · model</th>
                <th className="px-4 py-3 font-normal">Topline MAE (pts)</th>
                <th className="px-4 py-3 font-normal">Subgroup MAE (pts)</th>
                <th className="px-4 py-3 font-normal">Subgroup MAE, registered pooling</th>
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
                      {pts(
                        (refresh.julyRegisteredRepooled as Record<string, ArmScore>)[key]
                          ?.subgroupMAE
                      )}
                    </td>
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
        <p className="mt-2 max-w-2xl text-xs text-muted">
          &ldquo;Subgroup MAE&rdquo; is the July figure, which averaged each question&apos;s subgroups
          before averaging questions. The plan registered pooling every subgroup directly;
          &ldquo;registered pooling&rdquo; reports that definition. The current-models table above uses
          it throughout.
        </p>
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
