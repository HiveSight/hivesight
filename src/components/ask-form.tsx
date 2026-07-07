"use client";

import { useState } from "react";
import { IconPlayerPlay } from "@tabler/icons-react";
import type { RunProgress, RunResult } from "@/engine/types";
import {
  AGE_BANDS,
  BENEFITS,
  CHILDREN,
  INCOME_BANDS,
  SEXES,
  TENURES,
} from "@/engine/bands";
import { DISTRICT_PATTERN, STATES } from "@/lib/geographies";
import { Results } from "./results";

type FormatKind = "likert5" | "binary" | "choice";

const EXAMPLES = [
  "Raising the federal minimum wage to $15 per hour would be good for my community.",
  "I could cover a $400 emergency expense using cash or its equivalent.",
  "Local governments should allow more apartment buildings in my neighborhood.",
];

const FILTER_GROUPS: Array<{
  key: "ageBands" | "incomeBands" | "sexes" | "tenure" | "children" | "benefits";
  label: string;
  options: readonly string[];
  detailed?: boolean;
}> = [
  { key: "ageBands", label: "Age", options: AGE_BANDS },
  { key: "incomeBands", label: "Earned income", options: INCOME_BANDS },
  { key: "sexes", label: "Sex", options: SEXES },
  { key: "tenure", label: "Housing", options: TENURES, detailed: true },
  { key: "children", label: "Children at home", options: CHILDREN, detailed: true },
  { key: "benefits", label: "Means-tested benefits", options: BENEFITS, detailed: true },
];

export function AskForm() {
  const [question, setQuestion] = useState("");
  const [formatKind, setFormatKind] = useState<FormatKind>("likert5");
  const [choiceOptions, setChoiceOptions] = useState("");
  const [geoType, setGeoType] = useState<"national" | "state" | "district">("national");
  const [stateValue, setStateValue] = useState("CA");
  const [districtValue, setDistrictValue] = useState("");
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [showFilters, setShowFilters] = useState(false);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  function toggleFilter(key: string, option: string) {
    setFilters((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
      return { ...prev, [key]: next };
    });
  }

  function geography() {
    if (geoType === "national") return { type: "national", value: "US", label: "United States" };
    if (geoType === "state") {
      const s = STATES.find((s) => s.value === stateValue)!;
      return { type: "state", value: s.value, label: s.label };
    }
    return {
      type: "district",
      value: districtValue.toUpperCase(),
      label: `Congressional district ${districtValue.toUpperCase()}`,
    };
  }

  const districtInvalid = geoType === "district" && !DISTRICT_PATTERN.test(districtValue.toUpperCase());
  const choiceList = choiceOptions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const formatInvalid = formatKind === "choice" && (choiceList.length < 2 || choiceList.length > 8);
  const disabled = running || question.trim().length < 10 || districtInvalid || formatInvalid;

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          format: formatKind === "choice" ? { kind: "choice", options: choiceList } : { kind: formatKind },
          audience: {
            geography: geography(),
            filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v.length)),
          },
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (eventType === "progress") setProgress(data);
            else if (eventType === "complete") {
              setResult(data.result);
              setRunId(data.runId);
            } else if (eventType === "error") throw new Error(data.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Estimate failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="rounded-xl border border-line bg-surface p-5 sm:p-6 shadow-[0_1px_2px_rgba(25,29,43,0.04)]">
        <label htmlFor="question" className="eyebrow">
          Survey question
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="State a claim or question exactly as a survey would."
          className="mt-2 w-full resize-none rounded-md border border-line bg-paper px-3 py-2.5 text-base text-ink placeholder:text-faint"
        />
        <div className="mt-1 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuestion(ex)}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-ink hover:border-faint"
            >
              {ex.length > 56 ? ex.slice(0, 53) + "…" : ex}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="eyebrow" htmlFor="format">
              Response format
            </label>
            <select
              id="format"
              value={formatKind}
              onChange={(e) => setFormatKind(e.target.value as FormatKind)}
              className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink"
            >
              <option value="likert5">Agreement (5-point scale)</option>
              <option value="binary">Yes / no</option>
              <option value="choice">Multiple choice</option>
            </select>
            {formatKind === "choice" && (
              <textarea
                value={choiceOptions}
                onChange={(e) => setChoiceOptions(e.target.value)}
                rows={3}
                placeholder={"One option per line (2-8)"}
                className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-faint"
              />
            )}
          </div>
          <div>
            <label className="eyebrow" htmlFor="geo">
              Audience
            </label>
            <div className="mt-2 flex gap-2">
              <select
                id="geo"
                value={geoType}
                onChange={(e) => setGeoType(e.target.value as typeof geoType)}
                className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink"
              >
                <option value="national">United States</option>
                <option value="state">State</option>
                <option value="district">Congressional district</option>
              </select>
              {geoType === "state" && (
                <select
                  aria-label="State"
                  value={stateValue}
                  onChange={(e) => setStateValue(e.target.value)}
                  className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink"
                >
                  {STATES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              {geoType === "district" && (
                <input
                  aria-label="District code"
                  value={districtValue}
                  onChange={(e) => setDistrictValue(e.target.value)}
                  placeholder="NY-17"
                  className="w-28 rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm text-ink placeholder:text-faint"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className="mt-2 text-xs text-muted underline hover:text-ink"
            >
              {showFilters ? "Hide segment filters" : "Add segment filters"}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            {FILTER_GROUPS.map((group) => (
              <div key={group.key} className="flex flex-wrap items-baseline gap-2">
                <span className="eyebrow w-40 shrink-0">{group.label}</span>
                {group.options.map((opt) => {
                  const active = filters[group.key]?.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleFilter(group.key, opt)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        active
                          ? "border-indigo bg-indigo text-paper"
                          : "border-line text-muted hover:text-ink hover:border-faint"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ))}
            <p className="text-xs text-faint">
              Housing, children, and benefits filters apply to the detailed
              population cells that carry those attributes.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center gap-4">
          <button
            onClick={run}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
          >
            <IconPlayerPlay size={16} />
            {running ? "Estimating…" : "Run estimate"}
          </button>
          <span className="text-xs text-faint">
            Free while in research preview. Estimates take about a minute.
          </span>
        </div>

        {progress && running && (
          <div className="mt-4" role="status">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-honey transition-[width] duration-300"
                style={{
                  width: `${progress.total ? Math.round((progress.completed / progress.total) * 100) : 5}%`,
                }}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-muted">{progress.message}</p>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-md border border-scale-1 px-3 py-2 text-sm text-ink" role="alert">
            {error}
          </p>
        )}
      </div>

      {result && <Results result={result} runId={runId} />}
    </div>
  );
}
