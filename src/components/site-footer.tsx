import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line mt-20">
      <div className="mx-auto max-w-5xl px-5 py-10 grid gap-8 sm:grid-cols-3 text-sm text-muted">
        <div>
          <p className="eyebrow mb-2">What this is</p>
          <p>
            Simulated estimates from a language model conditioned on
            census-calibrated population cells. No human respondents are
            surveyed. Use as a pre-field prior, not as a poll.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-2">Data</p>
          <p>
            Population structure: calibrated synthetic microdata built from the
            Current Population Survey, with state and district assignment.
            Benchmark targets: Federal Reserve SHED 2024.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-2">Accuracy</p>
          <p>
            Every method change is measured against real survey data first.{" "}
            <Link href="/benchmarks" className="underline hover:text-ink">
              See current benchmarks
            </Link>
            , including where estimates miss.
          </p>
        </div>
      </div>
    </footer>
  );
}
