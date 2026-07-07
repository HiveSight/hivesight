"use client";

import { useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconLink,
} from "@tabler/icons-react";
import type { RunResult, SubgroupEstimate } from "@/engine/types";
import { optionIds, optionLabel } from "@/engine/types";
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
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[10rem_1fr_3.5rem] items-center gap-3">
                  <span className="text-sm text-ink truncate" title={row.label}>
                    {row.label}
                  </span>
                  <StackedBar dist={row.dist} format={format} />
                  <span className="font-mono text-xs text-muted text-right">
                    {format.kind === "likert5"
                      ? pct((row.dist.agree ?? 0) + (row.dist.strongly_agree ?? 0))
                      : format.kind === "binary"
                        ? pct(row.dist.yes ?? 0)
                        : pct(Math.max(...optionIds(format).map((id) => row.dist[id] ?? 0)))}
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

export function Results({ result, runId }: { result: RunResult; runId: string | null }) {
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

  return (
    <section aria-label="Estimate results" className="space-y-10">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <p className="eyebrow mb-3">Estimate</p>
          <p className="text-5xl font-extrabold tracking-tight text-ink">
            {pct(result.headline.value)}
          </p>
          <p className="mt-2 text-muted">
            of {result.audience.geography.label} adults{" "}
            {Object.values(result.audience.filters).some((f) => f?.length)
              ? "(filtered audience) "
              : ""}
            are estimated to {headlineLabel}
          </p>
          {result.benchmarkError?.topline != null && (
            <p className="mt-4 text-sm text-muted max-w-md">
              Directional estimate. On benchmark questions this method averaged{" "}
              <span className="font-mono">
                ±{Math.round(result.benchmarkError.topline * 100)}pts
              </span>{" "}
              topline error and{" "}
              <span className="font-mono">
                ±{Math.round((result.benchmarkError.subgroup ?? 0) * 100)}pts
              </span>{" "}
              on subgroups. Treat it as a prior, not a poll.
            </p>
          )}
        </div>
        <Honeycomb dist={result.topline} format={result.format} />
      </div>

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
              ["Population cells", `${p.cellCount}${p.cellFailures ? ` (${p.cellFailures} failed)` : ""}`],
              ["Weighted audience", Math.round(p.eligibleWeight).toLocaleString()],
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
