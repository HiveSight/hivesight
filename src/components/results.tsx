"use client";

import Link from "next/link";
import { useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconLink,
} from "@tabler/icons-react";
import type { RunResult, SubgroupEstimate } from "@/engine/types";
import { optionIds, optionLabel } from "@/engine/types";
import { allocatePercents } from "@/lib/percents";
import { colorsForFormat, Honeycomb } from "./honeycomb";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function StackedBar({
  dist,
  format,
}: {
  dist: Record<string, number>;
  format: RunResult["format"];
}) {
  const ids = optionIds(format);
  const colors = colorsForFormat(format);
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full" aria-hidden>
      {ids.map((id, i) => (
        <div
          key={id}
          style={{ width: `${(dist[id] ?? 0) * 100}%`, background: colors[i] }}
        />
      ))}
    </div>
  );
}

/** The share each subgroup row reports: agree, yes, or the leading choice by name. */
function rowSummary(dist: Record<string, number>, format: RunResult["format"]): string {
  if (format.kind === "likert5") return pct((dist.agree ?? 0) + (dist.strongly_agree ?? 0));
  if (format.kind === "binary") return pct(dist.yes ?? 0);
  const ids = optionIds(format);
  const top = ids.reduce((best, id) => ((dist[id] ?? 0) > (dist[best] ?? 0) ? id : best), ids[0]);
  return `${optionLabel(format, top)} ${pct(dist[top] ?? 0)}`;
}

function SubgroupSection({
  subgroups,
  format,
}: {
  subgroups: SubgroupEstimate[];
  format: RunResult["format"];
}) {
  const dimensions = [...new Set(subgroups.map((s) => s.dimension))];
  return (
    <div className="space-y-6">
      {dimensions.map((dim) => {
        const rows = subgroups
          .filter((s) => s.dimension === dim)
          .sort((a, b) => b.weightShare - a.weightShare);
        const coverage = rows[0]?.coverage ?? 1;
        return (
          <div key={dim}>
            <p className="eyebrow mb-2">
              {dim}
              {coverage < 0.995 && (
                <span className="ml-2 normal-case tracking-normal">
                  covers {pct(coverage)} of audience
                </span>
              )}
            </p>
            <table className="sr-only">
              <caption>{dim}: estimated share choosing each answer</caption>
              <thead>
                <tr>
                  <th scope="col">Group</th>
                  {optionIds(format).map((id) => (
                    <th key={id} scope="col">
                      {optionLabel(format, id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {optionIds(format).map((id) => (
                      <td key={id}>{pct(row.dist[id] ?? 0)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-2" aria-hidden>
              {rows.map((row) => (
                <div key={row.label} className={`grid ${format.kind === "choice" ? "grid-cols-[10rem_1fr_9rem]" : "grid-cols-[10rem_1fr_3.5rem]"} items-center gap-3`}>
                  <span className="text-sm text-ink truncate" title={row.label}>
                    {row.label}
                  </span>
                  <StackedBar dist={row.dist} format={format} />
                  <span className="font-mono text-xs text-muted text-right">
                    {rowSummary(row.dist, format)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Plain-language list of the audience filters a run used. */
function audienceFilters(filters: RunResult["audience"]["filters"]): string | null {
  const parts = Object.values(filters).filter((v): v is string[] => Array.isArray(v) && v.length > 0);
  return parts.length ? parts.map((v) => v.join(" or ")).join("; ") : null;
}

export function Results({
  result,
  runId,
  showQuestion = true,
}: {
  result: RunResult;
  runId: string | null;
  /** The shared-run page shows the question as its heading already. */
  showQuestion?: boolean;
}) {
  const [showProvenance, setShowProvenance] = useState(false);
  const headlineLabel =
    result.format.kind === "likert5"
      ? "agree or strongly agree"
      : result.format.kind === "binary"
        ? "answer yes"
        : `choose “${result.headline.label}”`;

  function downloadJson() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hivesight-estimate.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const p = result.provenance;
  const people = p.mode === "individual" ? p.people : undefined;
  // Runs saved before coverage was recorded carry no elicitedShare; it is
  // known only when no cell failed.
  const elicitedShare = p.elicitedShare ?? (p.cellFailures ? null : 1);
  // The headline uses the chart's allocation, so it matches the legend.
  const counts = allocatePercents(result.topline, result.format);
  const ids = optionIds(result.format);
  const headlinePct =
    result.format.kind === "likert5"
      ? counts[ids.indexOf("agree")] + counts[ids.indexOf("strongly_agree")]
      : result.format.kind === "binary"
        ? counts[ids.indexOf("yes")]
        : (counts[result.format.options.indexOf(result.headline.label)] ?? Math.max(...counts));
  const benchmarkItems = result.benchmarkError?.items;
  const filtersText = audienceFilters(result.audience.filters);

  return (
    <section aria-label="Estimate results" className="space-y-10">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <p className="eyebrow mb-3">Estimate</p>
          {showQuestion && <p className="mb-3 max-w-xl text-ink">“{result.question}”</p>}
          <p className="text-5xl font-extrabold tracking-tight text-ink">{headlinePct}%</p>
          <p className="mt-2 text-muted">
            of {result.audience.geography.label} adults
            {filtersText ? ` (${filtersText})` : ""} are estimated to {headlineLabel}
          </p>
          {result.benchmarkError?.topline == null ? (
            <p className="mt-4 text-sm text-muted max-w-md">
              Directional estimate from a language model, not a measurement of real
              respondents. Treat it as a prior, not a poll.
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted max-w-md">
              Directional estimate. On{" "}
              <Link href="/benchmarks" className="underline hover:text-ink">
                {benchmarkItems ? `${benchmarkItems} benchmark survey questions` : "benchmark questions"}
              </Link>
              ,{" "}
              {people
                ? `asking ${result.benchmarkError.people?.toLocaleString() ?? "the same number of"} simulated people with ${p.model}`
                : `this method with ${p.model}`}{" "}
              missed the real answer share by{" "}
              <span className="font-mono">
                {Math.round(result.benchmarkError.topline * 100)} points
              </span>{" "}
              on average nationally
              {result.benchmarkError.subgroup != null && (
                <>
                  {" "}and{" "}
                  <span className="font-mono">
                    {Math.round(result.benchmarkError.subgroup * 100)} points
                  </span>{" "}
                  for subgroups
                </>
              )}
              .
              {result.format.kind === "likert5" &&
                " Five-point agreement statements like this one were not among them."}{" "}
              Treat it as a prior, not a poll.
            </p>
          )}
        </div>
        <Honeycomb dist={result.topline} format={result.format} />
      </div>

      {people && (
        <p role="note" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink">
          Experimental simulated-people estimate: {people.answered.toLocaleString()} of{" "}
          {people.asked.toLocaleString()} simulated people
          {people.asked < people.eligible ? `, drawn from ${people.eligible.toLocaleString()} who match the audience,` : ""}{" "}
          reported how likely they are to give each answer, and the estimate averages them.
          {people.answered < people.asked * 0.9 &&
            " More than one in ten gave no usable answer, so treat it with extra caution or run it again."}
        </p>
      )}

      {!people && elicitedShare != null && elicitedShare < 0.9 && (
        <p role="note" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink">
          This estimate rests on {pct(elicitedShare)} of the audience: {p.cellFailures} of{" "}
          {p.cellCount + p.cellFailures} population cells returned no usable answer. Groups in the
          failed cells are missing from the topline, so treat it with extra caution or run it again.
        </p>
      )}

      {result.subgroups.length > 0 && (
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-4">How groups differ</h2>
          <SubgroupSection subgroups={result.subgroups} format={result.format} />
        </div>
      )}

      {result.verbatims.length > 0 && (
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-1">Synthetic verbatims</h2>
          <p className="text-sm text-muted mb-4">
            Illustrative voices written by the model for sampled population
            profiles. Not the estimate, and not real people.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {result.verbatims.map((v, i) => (
              <blockquote key={i} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-sm text-ink">“{v.text}”</p>
                <footer className="mt-3 flex items-start justify-between gap-3">
                  <span className="text-xs text-muted">{v.personaDescription}</span>
                  {v.choice && (
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-honey-deep">
                      {optionLabel(result.format, v.choice)}
                    </span>
                  )}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line">
        <button
          onClick={() => setShowProvenance((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted hover:text-ink"
          aria-expanded={showProvenance}
        >
          <span className="eyebrow">Provenance</span>
          {showProvenance ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>
        {showProvenance && (
          <dl className="grid gap-x-8 gap-y-2 border-t border-line px-4 py-4 font-mono text-xs text-muted sm:grid-cols-2">
            {[
              ["Engine", p.engineVersion],
              ["Prompts", p.promptVersion],
              ["Dataset", p.datasetVersion],
              ["Model", p.model],
              people
                ? ["Simulated people", `${people.answered} answered of ${people.asked} asked (${people.eligible} eligible)`]
                : ["Population cells", `${p.cellCount}${p.cellFailures ? ` (${p.cellFailures} failed)` : ""}`],
              ["Weighted audience", Math.round(p.eligibleWeight).toLocaleString()],
              ["Audience estimated", elicitedShare == null ? "not recorded" : pct(elicitedShare)],
              ["Share of geography", pct(p.populationShare)],
              ["Seed", String(p.seed)],
              ["Started", p.startedAt],
              ["Completed", p.completedAt],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt>{k}</dt>
                <dd className="text-ink text-right break-all">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadJson}
          className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-surface"
        >
          <IconDownload size={16} /> Download JSON
        </button>
        {runId && (
          <button
            onClick={() => navigator.clipboard.writeText(`${location.origin}/runs/${runId}`)}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink hover:bg-surface"
          >
            <IconLink size={16} /> Copy share link
          </button>
        )}
      </div>
    </section>
  );
}
