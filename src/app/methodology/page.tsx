import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology — HiveSight",
  description:
    "How HiveSight estimates audience responses: census-calibrated population cells, direct distribution elicitation, and weighted aggregation.",
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <p className="eyebrow mb-3">Methodology</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        How an estimate is made
      </h1>

      <div className="prose-hs mt-8 space-y-6 text-[15px] leading-relaxed text-ink">
        <section>
          <h2 className="text-xl font-bold tracking-tight">The estimator</h2>
          <p className="mt-2 text-muted">
            HiveSight does not simulate individual fake respondents and count
            their answers. Research consistently finds that persona roleplay
            compresses within-group variance, dramatizes hardship, and drifts
            with prompt wording — and our own benchmark measured it at 37
            points of topline error. Instead, HiveSight treats the language
            model as a conditional response model over population cells:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
            <li>
              <span className="text-ink">Audience resolution.</span> Your
              geography and filters select records from a calibrated synthetic
              population built from Census Bureau Current Population Survey
              microdata — 4.2 million person records with calibrated weights
              and state and congressional-district assignment.
            </li>
            <li>
              <span className="text-ink">Cell partition.</span> The audience is
              partitioned into roughly 150 post-stratification cells by age
              band, earned-income band, sex, and — where a cell carries enough
              population weight — housing tenure, children at home,
              means-tested benefit receipt, and Social Security receipt.
            </li>
            <li>
              <span className="text-ink">Distribution elicitation.</span> For
              each cell, the model is asked — as an expert estimator, not a
              roleplayer — for the percentage of that group choosing each
              response option. One call per cell, structured JSON out.
            </li>
            <li>
              <span className="text-ink">Weighted aggregation.</span> Cell
              distributions combine with calibrated population weights — the
              same post-stratification arithmetic survey statisticians use.
              Subgroup estimates re-aggregate the same cells; nothing is
              re-asked, so breakdowns are always consistent with the topline.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">What the verbatims are</h2>
          <p className="mt-2 text-muted">
            Alongside the estimate, HiveSight writes a handful of illustrative
            verbatims for weighted-sampled population profiles. They are
            synthetic, clearly labeled, and carry no weight in the numbers. No
            human respondents are surveyed anywhere in this product.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Known limits</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              Toplines on self-report scales carry a measured level bias (about
              17 points MAE on our SHED suite versus 6 points on subgroups).
              Estimates are most reliable for comparisons — between segments,
              geographies, or message variants — where level bias cancels.
            </li>
            <li>
              A calibration layer that corrects levels against anchor surveys
              (GSS, SHED) is in development; it ships only when it passes
              held-out-question validation, and results will disclose when it
              is applied.
            </li>
            <li>
              The model is frozen in time: it cannot track opinion shifts after
              its training cutoff. Fast-moving topics degrade accuracy.
            </li>
            <li>
              Small or marginalized subgroups are where language models are
              least reliable. Cell estimates for narrow audiences deserve extra
              skepticism, and fielding real respondents remains the standard.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Intended use</h2>
          <p className="mt-2 text-muted">
            HiveSight is pre-field research infrastructure: form priors, triage
            which audiences to actually poll, stress-test message variants
            across geographies you could never afford to field. Professional
            standards bodies (AAPOR, ESOMAR) endorse exactly this diagnostic
            use of simulated respondents and caution against substituting them
            for measurement of real populations. We agree, and the product says
            so wherever numbers appear. See{" "}
            <Link href="/benchmarks" className="underline">
              benchmarks
            </Link>{" "}
            for current measured accuracy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Reproducibility</h2>
          <p className="mt-2 text-muted">
            Every run records its engine version, prompt version, dataset
            version, model, seed, cell count, and weighted audience —
            downloadable with the results. The benchmark harness and its raw
            call logs live in the repository, and the benchmark page renders
            the same artifact the engine is gated on.
          </p>
        </section>
      </div>
    </div>
  );
}
