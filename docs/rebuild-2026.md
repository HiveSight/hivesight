# The 2026 rebuild: from persona roleplay to cell estimation

Date: 2026-07-07

## What changed and why

The original HiveSight simulated one fake respondent per LLM call and counted
the draws. A properly powered benchmark (evals/run-shed-powered.mjs, four SHED
2024 questions, national audience) measured that architecture at **36.6pts
topline MAE / 23.0pts subgroup MAE** — models roleplaying low-income personas
dramatize hardship (75.9% claimed serious housing hardship vs 18.7% of real
respondents). This matches the 2024-2026 literature: persona simulation
compresses variance, misportrays subgroups, and drifts with prompt wording
(Bisbee et al. 2024; Wang et al. 2025; Gong et al. 2026).

The rebuilt estimator treats the model as a conditional response model over
post-stratification cells:

1. partition the calibrated microdata audience into ~150 weighted cells,
2. elicit a verbalized response distribution per cell (expert framing, JSON),
3. aggregate with calibrated population weights.

Measured: **17.0pts topline / 6.2pts subgroup MAE** — best-in-test on
subgroups (beating even direct estimation at 6.8), with near-perfect rank
ordering, ±1-3pt prompt-paraphrase stability, exact reproducibility given a
seed, and ~1 output token per option per cell (roughly 100x cheaper than
persona simulation at equal audience coverage).

Known limit: a systematic pessimism bias on self-report wellbeing toplines.
A single-parameter logit calibration failed leave-one-question-out validation
(bias direction flips with question valence), so v1 ships no silent
correction — results carry measured error context instead. The direct model
estimate (9.3pts topline) is surfaced in provenance as a cross-check.

## Decisions of record

- **Estimator**: cells; personas retired to illustrative verbatims only.
- **Positioning**: pre-field directional estimation (AAPOR 2026 sanctioned
  framing); never poll replacement; ESOMAR-compliant synthetic labeling.
- **Wedge** (market scan, July 2026): policy/advocacy/government-affairs
  buyers needing district and segment reads no one fields polls for.
  Category-of-one pairing available later: opinion + PolicyEngine fiscal
  microsimulation on the same calibrated population.
- **Calibration roadmap**: build a 30+ question anchor bank across domains
  and valences (GSS + SHED + post-cutoff items) before shipping any level
  correction; validate on held-out whole questions.
- **Data plane**: prebuilt cell tables + sample pools for US + 51 states
  (public/data/v1, ~420KB each); districts reduce at request time from the
  HF per-district files with in-memory caching.
- **Persistence optional**: the demo runs stateless; Supabase enables share
  links when configured. Daily keepalive cron prevents free-tier auto-pause
  (the outage that took the old product down).
- **Dropped from v0**: accounts, credits, Stripe — reintroduce post-launch
  behind the same storage adapter.

## Evidence base

- evals/results/shed-2024-powered-comparison-v2.json (rendered at /benchmarks)
- Gong, Sanders & Schneier 2026 (arXiv:2603.20229) — direct distribution
  beats simulated individuals in 77% of cells at 5x lower cost.
- Meister, Guestrin & Hashimoto 2024 (arXiv:2411.05403) — verbalized
  distributions beat logprobs and sampling.
- Krsteski et al. 2025 (arXiv:2510.11408) — PPI rectification for valid
  intervals; the calibration end-state.
- AAPOR task force report, May 2026; ICC/ESOMAR Code 5th ed. 2025.
