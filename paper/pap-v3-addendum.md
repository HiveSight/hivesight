# PAP v3 addendum: referee-driven corrections and robustness program

Status: registered by commit before any v4 elicitation runs. Amends PAP v2
(paper/pap-v2.md, commit f93e00b). The v2-registered analyses remain the
confirmatory record and are reported unchanged; everything specified here is
either (a) an instrument-corrected robustness replication or (b) a
pre-specified sensitivity/inference addition responding to referee review of
the first submission. Nothing in this addendum alters v2 hypothesis wording
or scoring after observation of v4 results.

## Instrument corrections (anchor bank v2)

Referee review identified fidelity gaps between elicitation instruments and
the human instruments generating the targets. Bank v2
(evals/anchor-bank/build_targets_v2.py → anchor-bank-v2.json) corrects:

1. **Verbatim wordings**: gss_polviews restored to the GSS card wording;
   gss_helppoor / gss_helpsick / gss_helpnot / gss_eqwlth presented as
   anchored-endpoint numbered scales matching the showcards (interior points
   unlabeled except the standard "agree with both" midpoint where the
   instrument labels it); gss_fefam / gss_fechld / gss_fepresch /
   gss_spanking carry the agree–disagree battery stem; shed_b3 restores
   "(and your family living with you)"; nat* option lists follow the
   question stem's order (too much / too little / about the right amount);
   shed_400cash states the Fed's full cash-equivalent definition (cash,
   checking/savings, or credit card paid in full at the next statement).
2. **Volunteered categories**: for the six items where a category is
   volunteered rather than offered (gss_trust, gss_fair, gss_helpful,
   gss_getahead, gss_courts, gss_divlaw), the v4 elicitation lists read
   options and marks the volunteered category explicitly ("not read to
   respondents; some volunteer it"). A no-volunteered variant (offered
   options only, human targets renormalized over them) is run for the same
   six items as a sensitivity.
3. **Item nonresponse**: all v4 prompts instruct the model to estimate
   shares among respondents giving a substantive answer, matching the
   listwise-dropped human targets (the conditional-on-opinionation
   estimand, now stated). Per-item DK/refused rates are reported.
4. **Provenance flags**: every item is labeled native / derived /
   composite; gss_satjob carries its employed-respondents universe in the
   prompt. Pooled results are reported with and without derived/composite
   items.

## v4 runs (all gpt-5-mini unless stated; full per-call logs persisted)

- R-corrected: cells + direct arms, full bank v2 (primary robustness
  replication of the v2 tables).
- R-replicates: three additional independent runs of cells + direct on the
  20-item subset; report between-run SD of pooled MAEs.
- R-order: one run of cells on the 20-item subset with option order
  reversed.
- R-paraphrase: one run of cells on ten pre-listed items (the ten
  odd-indexed items of the 20-item subset in itemId order) with
  paraphrased stems.
- R-granularity: cells arm on the full bank at 1, 8 (age × sex), and 40
  (age × income × sex) cells, alongside the 149-cell run.

## Added analyses (computable from existing + v4 artifacts)

- Report registered secondary metric (total variation), pooled by arm.
- Paired bootstrap CIs (item-level resampling) on cells-minus-direct MAE
  differences; TOST equivalence bound of ±1.5 points; one-sided Wilcoxon
  matching H1's registered direction.
- H1 disaggregated by slice family; primary confirmatory pooling = age and
  sex (construct-clean in all arms); income and tenure reported as
  secondary with construct caveats.
- Rank structure: primary statistic becomes within-item Spearman on the age
  family only; pooled-family version retained as secondary; paired
  cells-vs-direct test; NaN policy: undefined correlations (constant
  estimates) counted as zero discrimination in a sensitivity, excluded in
  the primary, with per-arm item counts disclosed.
- Valence: permutation test of the positive-vs-negative signed-error
  contrast; neutral class reported alongside; option-position/extremity
  confound probed by regressing signed error on the designated positive
  option's list position and extremity; claim demoted unless it survives.
- Contamination: signed error regressed on the 2022→2024 (GSS) and
  2023→2024 (SHED) movement of each item's human target; memorization of
  older published values predicts slope ≈ −1. Historical targets computed
  from GSS 2022 (same cumulative file) and the SHED 2023 public file.
- Pilot-overlap sensitivity: all pooled v2 statistics recomputed excluding
  shed_b2, shed_b3, shed_400cash, shed_housing_stress.
- Volunteered-option sensitivity: pooled statistics excluding the six
  affected items; model-minus-human mass on volunteered options reported.
- Target-noise floor: per-bin human-target SEs under stated design-effect
  assumptions (GSS deff 1.5, SHED 1.2, BRFSS state deff 2.5); expected MAE
  under target resampling reported next to each pooled MAE; subgroup MAE
  sensitivity restricted to bins with n ≥ 100.
- PPI: richer predictor (age × sex × household-income × tenure) on SHED
  items where the anchor survey carries the covariates; GSS structural
  limitation stated.
- Persona decomposition: binomial sampling floor at n=150 reported and
  subtracted in an architectural-bias decomposition; persona MAE split
  GSS vs SHED.
- Cost table: calls, tokens, and USD per item per arm, reconstructed from
  run artifacts (not process counters).
- BRFSS: bootstrap-over-states CIs for arm differences; prose corrected to
  reflect that cells do not beat the national-constant baseline pooled;
  "48 states plus DC" corrected; state target SEs reported.

## Reporting commitments

The revised manuscript labels the v2 bank results as the registered
confirmatory record, v4 as instrument-corrected robustness; the
cells-vs-direct Spearman contrast is labeled exploratory wherever it
appears; H4 is reported as not established; the seeding sentence is
corrected (record sampling seeded; model outputs nondeterministic); release
claims enumerate exactly what is public.
