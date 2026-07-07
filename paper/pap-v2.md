# Pre-analysis plan v2: anchor-bank evaluation of cell-based LLM audience estimation

Status: registered by commit to HiveSight/hivesight `rebuild/estimator-v2`
before any anchor-bank elicitation runs. Amends the v0.3 PAP (April 2026).
The pilot (4 SHED items, July 7 2026, artifact
`evals/results/shed-2024-powered-comparison-v2.json`) informed the design and
is reported separately as the pilot; all confirmatory claims below refer to
the anchor-bank runs executed after this commit.

## Design

Estimate human survey response distributions for the US adult population and
demographic subgroups using LLM-based methods; score against weighted human
targets computed from GSS 2024 (52 items) and SHED 2024 (11 items) —
`evals/anchor-bank/anchor-bank-v1.json`, built by
`evals/anchor-bank/build_targets.py` before elicitation.

Item selection rule (fixed a priori): all pre-listed candidate items with
2024 non-missing n ≥ 600; subgroup bins reported when bin n ≥ 30. Slices:
age band and sex (both surveys), household income band and housing tenure
(SHED; income is household — a documented construct mismatch with the
microdata's personal earned income bands, identical across microdata arms).

## Arms

1. **cells** (HiveSight estimator): verbalized response distribution per
   post-stratification cell (149 national cells; `public/data/v1/US.json`),
   aggregated with calibrated weights. Prompts: `prompts:v3-expert-cell`.
2. **naive**: direct expert estimate of the distribution for the full
   audience, plus one direct call per reported subgroup.
3. **persona**: one roleplay call per weighted-sampled microdata record
   (n=150/item), matched-budget comparison. Subset of 20 items (below).

Primary model: gpt-5-mini (reasoning effort minimal). Model-variant runs
(exploratory): gpt-5.2 and claude-haiku-4.5 on the same 20-item subset,
cells arm only.

20-item subset (fixed here): gss_happy, gss_health, gss_satfin, gss_trust,
gss_cappun, gss_grass, gss_confed, gss_consci, gss_natsoc, gss_nateduc,
gss_polviews, gss_fefam, shed_b2, shed_b3, shed_400cash, shed_ef1, shed_ef7,
shed_bk1, shed_work, shed_housing_stress.

## Metrics

Primary: absolute error of the designated positive-option share, (a) topline
MAE pooled across items; (b) subgroup MAE pooled across all reported slice
bins. Secondary: total-variation distance between full option distributions;
Spearman rank correlation of subgroup estimates vs human subgroup values
within item; signed error by item valence (positive/negative/neutral).

## Confirmatory hypotheses

- H1: cells subgroup MAE < naive subgroup MAE (pooled).
- H2: cells subgroup MAE < persona subgroup MAE (20-item subset).
- H3: persona topline MAE > cells topline MAE (20-item subset; pilot
  replication).
- H4: cells signed topline error is negative for positive-valence
  self-report items and its sign differs by valence class (the pilot's
  "pessimism bias flips with valence" observation).
- H5: median within-item Spearman rank correlation of cells subgroup
  estimates ≥ 0.8 where an item has ≥ 4 subgroup bins.

## Prediction-powered inference (PPI)

Using per-cell predictions and respondent-level human data: for each item,
draw a human anchor subsample (n=200, weighted), rectify the cells estimate
(PPI; Angelopoulos et al. 2023), and evaluate 95% interval coverage of the
full-sample human target across 500 bootstrap replicates, versus (a) the
human-anchor-only interval width and (b) an unrectified LLM interval.
Confirmatory: PPI coverage within [0.93, 0.97] pooled across items; PPI
interval width < human-only width for the median item.

## Random-forest baseline (exploratory)

Gradient-boosted / random-forest classifier trained on each survey's own
respondent demographics (80/20 split), post-stratified predictions on the
held-out fold; compares "signal available in demographics learned from the
anchor survey itself" against LLM arms.

## Exclusions and disclosure

No fresh human survey is fielded in this study (cost); training-data
contamination is addressed by disclosure (SHED 2024 published May 2025;
GSS 2024 microdata released fall 2025; model cutoffs documented) and a
registered follow-up with post-cutoff items. Cell elicitation failures are
reported; items with > 10% failed cells are flagged. No calibration layer is
applied in any arm.
