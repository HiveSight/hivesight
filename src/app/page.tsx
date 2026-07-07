import Link from "next/link";
import { AskForm } from "@/components/ask-form";

const BENCH = [
  { arm: "Persona roleplay (typical AI-survey approach)", topline: 37, subgroup: 23 },
  { arm: "Direct model estimate", topline: 9, subgroup: 7 },
  { arm: "HiveSight population cells", topline: 17, subgroup: 6 },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-5">
      <section className="pt-14 pb-10 sm:pt-20">
        <p className="eyebrow mb-4">Pre-field audience estimation</p>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Ask a calibrated model of the United States
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          HiveSight estimates how a defined population — national, state,
          congressional district, or segment — would answer a survey question.
          It elicits response distributions over census-calibrated population
          cells and aggregates them with real weights. A directional prior
          before you field, not a replacement for polling.
        </p>
      </section>

      <AskForm />

      <section className="mt-24 grid gap-10 sm:grid-cols-3">
        {[
          {
            n: "1",
            title: "Partition",
            body: "Your audience is resolved against a calibrated synthetic population built from Census Bureau microdata — 4.2 million records with state and district assignment — and partitioned into ~150 weighted cells: age, earned income, sex, housing, children, benefits.",
          },
          {
            n: "2",
            title: "Elicit",
            body: "For each cell, the model estimates the full response distribution directly — the approach that beats one-call-per-fake-respondent roleplay in head-to-head research, at a fraction of the cost.",
          },
          {
            n: "3",
            title: "Weight",
            body: "Cell distributions aggregate with calibrated population weights, the same post-stratification logic survey statisticians use. Every run records its dataset, prompts, model, and seed.",
          },
        ].map((step) => (
          <div key={step.n}>
            <p className="font-mono text-xs text-honey-deep mb-2">{step.n}</p>
            <h2 className="text-lg font-bold tracking-tight">{step.title}</h2>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-24 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <p className="eyebrow mb-2">Measured, not promised</p>
        <h2 className="text-2xl font-bold tracking-tight">
          Benchmarked against real survey data — misses included
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Mean absolute error against the Federal Reserve&apos;s 2024 Survey of
          Household Economics and Decisionmaking, four questions, national
          audience. Lower is better. Subgroup accuracy is where cell-based
          estimation earns its keep — and topline error is real, which is why
          results ship with error context attached.
        </p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4 font-normal">Method</th>
                <th className="py-2 pr-4 font-normal">Topline error</th>
                <th className="py-2 font-normal">Subgroup error</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {BENCH.map((row) => (
                <tr key={row.arm} className="border-t border-line">
                  <td className="py-2.5 pr-4 font-sans text-sm text-ink">{row.arm}</td>
                  <td className="py-2.5 pr-4">{row.topline} pts</td>
                  <td className="py-2.5">{row.subgroup} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link
          href="/benchmarks"
          className="mt-5 inline-block text-sm underline text-ink hover:text-indigo"
        >
          Full benchmark results and method
        </Link>
      </section>
    </div>
  );
}
