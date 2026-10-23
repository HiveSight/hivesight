import type { Metadata } from "next";
import Link from "next/link";
import refresh from "../../../paper/artifacts/model-refresh.json";
import { DEFAULT_MODEL } from "@/engine/models";
import { individualBenchmarkFor, individualModeEnabled, INDIVIDUAL_PEOPLE } from "@/engine/individual-study";

type Score = { toplineMAE: number; subgroupMAE: number };
const scores = refresh.models as unknown as Record<
  string,
  Record<string, { all: Score | null; subset20: Score }>
>;
const served = scores[DEFAULT_MODEL];
const pts = (v: number) => Math.round(v * 100);

export const metadata: Metadata = {
  title: "Methodology — HiveSight",
  description:
    "How HiveSight estimates audience responses: census-calibrated population cells, direct distribution elicitation, and weighted aggregation.",
};

/** The opt-in individual mode, described only when the product offers it. */
function IndividualMethod() {
  const b = individualBenchmarkFor(DEFAULT_MODEL);
  const personaGain = (
    refresh.Q4_personaProb as Record<string, { vsPersona: { subgroup: { diff: number } | null } | null }>
  )[DEFAULT_MODEL]?.vsPersona?.subgroup?.diff;
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight">Simulated people (experimental)</h2>
      <p className="mt-2 text-muted">
        As an opt-in alternative, HiveSight can build an estimate from simulated people. Up to{" "}
        {INDIVIDUAL_PEOPLE.toLocaleString()} people are drawn at random from the audience in the
        population sample, which represents adults in proportion to their numbers. Each is
        described to the model in the second person and asked how likely they are to give each
        answer, one call per person. The estimate averages those probabilities, and subgroup
        breakdowns average the people in each group; groups with fewer than 10 people are not shown.
        {personaGain != null &&
          ` People report probabilities rather than a single answer: on 20 benchmark questions, averaging probabilities cut subgroup error by ${pts(-personaGain)} points against counting each person's single answer with ${DEFAULT_MODEL}.`}
        {b?.topline != null && b.subgroup != null && (
          <>
            {" "}On the 63 benchmark questions with {DEFAULT_MODEL}, this method missed by{" "}
            {pts(b.topline)} points nationally and {pts(b.subgroup)} points for subgroups.
          </>
        )}{" "}
        The design and the accuracy shown come from a study registered before its runs; see{" "}
        <Link href="/benchmarks" className="underline">
          benchmarks
        </Link>
        .
      </p>
    </section>
  );
}

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
            with prompt wording. On the 20 benchmark questions where we ran
            both with {DEFAULT_MODEL}, persona roleplay missed national answer
            shares by {pts(served.persona.subset20.toplineMAE)} points on average;
            cell estimation missed by {pts(served.cells.subset20.toplineMAE)}.
            Instead, HiveSight treats the language model as a conditional
            response model over population cells:
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

        {individualModeEnabled() && <IndividualMethod />}

        <section>
          <h2 className="text-xl font-bold tracking-tight">What the verbatims are</h2>
          <p className="mt-2 text-muted">
            Alongside the estimate, HiveSight writes a handful of illustrative
            verbatims for population profiles sampled to represent the audience. They are
            synthetic, clearly labeled, and carry no weight in the numbers. No
            human respondents are surveyed anywhere in this product.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Known limits</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted">
            <li>
              Error is measured, not zero: across 63 benchmark questions,
              estimates with {DEFAULT_MODEL} missed the real answer share by{" "}
              {pts(served.cells.all!.toplineMAE)} points on average nationally and{" "}
              {pts(served.cells.all!.subgroupMAE)} points for subgroups. Use
              estimates for direction and comparison, not exact levels.
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
