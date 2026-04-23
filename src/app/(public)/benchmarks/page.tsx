import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, FlaskConical, Gauge, MapPinned, Users2 } from "lucide-react";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { benchmarkProgram } from "@/lib/benchmarks/report";
import { benchmarkManifestBySuiteId } from "@/lib/benchmarks/manifests";

export const metadata: Metadata = {
  title: "Benchmarks",
  description:
    "HiveSight's public benchmark program for calibrated local synthetic populations, baselines, and evaluation metrics.",
};

const STATUS_STYLES = {
  planned: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  in_progress: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  complete: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
} as const;

const ROADMAP_STYLES = {
  now: "Now",
  next: "Next",
  later: "Later",
} as const;

const methodCards = [
  {
    title: "Not another abstract LLM benchmark",
    description:
      "The target is not generic plausibility. Each suite tests whether HiveSight's calibrated local population improves on weaker prompting baselines.",
    icon: FlaskConical,
  },
  {
    title: "Direct inference on a local population",
    description:
      "HiveSight does not post-stratify a generic national sample after the fact. It filters the geography-assigned synthetic population first, then simulates.",
    icon: MapPinned,
  },
  {
    title: "Built to surface representativeness gains",
    description:
      "Topline accuracy alone is not enough. The important checks are subgroup error, local error, and stability under prompt variation.",
    icon: Gauge,
  },
] as const;

export default function BenchmarksPage() {
  return (
    <div className="min-h-screen bg-honeycomb">
      <PublicHeader
        rightSlot={
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        }
      />

      <main className="px-4 py-16">
        <div className="mx-auto max-w-6xl space-y-12">
          <section className="grid gap-8 rounded-[2rem] border border-amber-900/[0.06] bg-card/80 p-8 shadow-editorial md:grid-cols-[1.1fr_0.9fr] md:p-10">
            <div className="space-y-5">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-600 dark:text-amber-400">
                Benchmark program
              </p>
              <div className="space-y-3">
                <h1 className="text-4xl font-bold leading-tight md:text-6xl">
                  {benchmarkProgram.title}
                </h1>
                <p className="max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
                  {benchmarkProgram.subtitle}
                </p>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-foreground/80 md:text-base">
                {benchmarkProgram.thesis}
              </p>
              <p className="text-sm text-muted-foreground/80">
                Updated {benchmarkProgram.updatedAt}
              </p>
            </div>

            <div className="space-y-4 rounded-[1.75rem] border border-amber-900/[0.06] bg-background/80 p-6 shadow-warm-sm">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Current status
                </p>
              </div>
              <p className="text-sm leading-6 text-foreground/85 md:text-base">
                {benchmarkProgram.currentStatus}
              </p>
              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-4">
                  <p className="text-2xl font-bold">{benchmarkProgram.suites.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">starter suites</p>
                </div>
                <div className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-4">
                  <p className="text-2xl font-bold">{benchmarkProgram.comparisons.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">comparison arms</p>
                </div>
                <div className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-4">
                  <p className="text-2xl font-bold">{benchmarkProgram.metrics.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">core metrics</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {methodCards.map(({ title, description, icon: Icon }) => (
              <div
                key={title}
                className="rounded-[1.75rem] border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
                  {description}
                </p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[1.9rem] border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <div className="flex items-center gap-3">
                <Users2 className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                <h2 className="text-2xl font-semibold">Comparison arms</h2>
              </div>
              <div className="mt-5 space-y-4">
                {benchmarkProgram.comparisons.map((comparison) => (
                  <div key={comparison.id} className="rounded-2xl border border-amber-900/[0.06] bg-background/70 p-4">
                    <p className="font-medium">{comparison.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {comparison.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.9rem] border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                <h2 className="text-2xl font-semibold">Core metrics</h2>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {benchmarkProgram.metrics.map((metric) => (
                  <div key={metric.id} className="rounded-2xl border border-amber-900/[0.06] bg-background/70 p-4">
                    <p className="font-medium">{metric.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {metric.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-600 dark:text-amber-400">
                Initial suites
              </p>
              <h2 className="text-3xl font-bold">Recent, stable, public benchmarks</h2>
              <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
                These first suites bias toward evergreen attitudes, household economics, and consumer
                behavior rather than election swings or weekly headline cycles.
              </p>
            </div>

            <div className="grid gap-5">
              {benchmarkProgram.suites.map((suite) => (
                <article
                  key={suite.id}
                  className="rounded-[1.9rem] border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm"
                >
                  {(() => {
                    const manifest = benchmarkManifestBySuiteId[suite.id];

                    return (
                      <>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-semibold">{suite.title}</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${STATUS_STYLES[suite.status]}`}
                        >
                          {suite.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
                        {suite.focus}
                      </p>
                    </div>
                    <a
                      href={suite.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-amber-700 transition-colors duration-200 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
                    >
                      Source
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>

                  <div className="mt-6 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
                    <div className="space-y-4 rounded-[1.5rem] border border-amber-900/[0.06] bg-background/70 p-5">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                          Why this suite
                        </p>
                        <p className="mt-2 text-sm leading-6 text-foreground/85">
                          {suite.whyThisSuite}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                          Starter manifest
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {manifest.questions.length} starter questions wired to benchmark fields from{" "}
                          {manifest.datasetLabel}.
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                          Source freshness
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {suite.source.name} was fielded {suite.source.fieldDates} and released{" "}
                          {suite.source.releaseDate}. {suite.source.freshnessNote}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-[1.5rem] border border-amber-900/[0.06] bg-background/70 p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                          Question families
                        </p>
                        <div className="mt-3 space-y-2">
                          {suite.questionFamilies.map((family) => (
                            <p key={family} className="text-sm leading-6 text-foreground/85">
                              {family}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[1.5rem] border border-amber-900/[0.06] bg-background/70 p-5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                          Evaluation focus
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {suite.targetMetrics.map((metricId) => {
                            const metric = benchmarkProgram.metrics.find((item) => item.id === metricId);
                            return (
                              <span
                                key={metricId}
                                className="rounded-full border border-amber-900/[0.08] bg-card/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-foreground/80"
                              >
                                {metric?.label ?? metricId}
                              </span>
                            );
                          })}
                        </div>
                        <p className="mt-4 text-sm leading-6 text-muted-foreground">
                          {suite.notes}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[1.5rem] border border-amber-900/[0.06] bg-background/70 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                      Starter prompts
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {manifest.questions.map((question) => (
                        <div
                          key={question.id}
                          className="rounded-2xl border border-amber-900/[0.06] bg-card/70 p-4"
                        >
                          <p className="font-medium">{question.prompt}</p>
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {question.sourceVariable} → {question.benchmarkField}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {question.rationale}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-amber-700 dark:text-amber-300" />
              <h2 className="text-2xl font-semibold">Roadmap</h2>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {benchmarkProgram.roadmap.map((item) => (
                <div key={item.step} className="rounded-[1.5rem] border border-amber-900/[0.06] bg-background/70 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                    {ROADMAP_STYLES[item.status]}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-foreground/85">
                    {item.step}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
