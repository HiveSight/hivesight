# Reproducing the paper

Three tiers, by what you need. Python steps run under `uv` (Python 3.14.4,
Quarto 1.9.36). The one-liners below pin the same package versions CI uses.

## Tier 0 — verify the paper from committed artifacts (no data, no keys)

Every number and figure in the manuscript regenerates from files in git:

```bash
PINS="numpy==2.3.4,scipy==1.16.3,matplotlib==3.10.7"
uv run --with "$PINS" python analysis/analyze_anchor.py         # scores registered v1 runs
uv run --with "$PINS" python analysis/analyze_anchor_v2.py      # scores v4 robustness runs + sensitivities
uv run --with "$PINS" python analysis/analyze_model_refresh.py  # scores the October 2026 model refresh
uv run --with "$PINS" python analysis/make_paper_assets.py      # summary.json and figures
python3 analysis/compare_artifacts.py                           # match = reproduced
cd paper && quarto render paper.qmd                                   # rebuild submission PDF/HTML
bun run paper:site                                                    # rebuild the hivesight.ai/paper embed
```

Inputs consumed: `evals/anchor-bank/anchor-bank-v{1,2}.json`,
`evals/anchor-bank/historical-targets.json`,
`evals/results/anchor-bank-run-v{1,2}.json`,
`evals/results/anchor-cells-predictions.jsonl`,
`evals/results/logs/*.jsonl` (per-call logs, all v2 arms),
`evals/results/shed-2024-powered-comparison-v2.json` (+ gzipped pilot raw log),
`evals/results/brfss-states-run-v1.json`, `evals/results/model-refresh-run.json`,
`paper/artifacts/brfss-state-targets.json`, `public/data/v1/US.json`, and the
committed Tier 1 outputs `paper/artifacts/ppi.json`, `ppi-richer.json` and
`rf-baseline.json`, which Tier 0 reads as they are.
The CI job `reproduce-artifacts` runs the four scripts above and the
comparison on every push; it does not render Quarto. The comparison allows
floating-point noise (relative 1e-9), because Linux and macOS round the last
bits differently; on one platform, regenerated artifacts and figures are
byte-identical (`git diff --exit-code paper/`).

Exception: `analysis/rf_baseline.py` and the PPI study additionally need the
respondent-level extracts (Tier 1), which GSS terms do not allow us to commit.

## Tier 1 — regenerate human targets from raw survey data (no keys)

1. Obtain the four data files per [DATA.md](DATA.md); verify checksums.
2. `export HS_SCRATCH=/path/to/downloads GSS_DTA=/path/to/gss7224_r2.dta`
3. Rebuild:

```bash
uv run --with pandas python evals/anchor-bank/build_targets.py      # v1 bank + respondent extracts
uv run --with pandas python evals/anchor-bank/build_targets_v2.py   # v2 bank + historical targets
uv run --with pandas python analysis/build_brfss_targets.py         # BRFSS state targets
uv run --with "pandas,scikit-learn" python analysis/rf_baseline.py  # RF ceiling (needs extracts)
uv run --with "numpy,pandas" python analysis/ppi.py                 # PPI study -> ppi.json
PPI_RICHER_F=1 uv run --with "numpy,pandas" python analysis/ppi.py  # richer predictor -> ppi-richer.json
```

Raw files default to `data/raw/` (gitignored); the environment variables
override it. `build_targets_v2.py` stops if the SHED 2023 file is missing
unless you pass `--allow-missing-2023`.

Known nondeterminism: `rf_baseline.py` pins `random_state` but
`HistGradientBoostingClassifier` results can shift across scikit-learn
versions; use the pinned version for bit-reproduction.

## Tier 2 — re-run elicitations (API keys; models may since be deprecated)

Runners checkpoint per item and arm into their artifact and skip what it
already holds, so against the committed artifacts they make no calls. To
rerun, write to a new artifact (`--artifact` on the v2 runner; the v1 and
BRFSS runners write their registered files in place, so move a copy aside
first and restore it after):

```bash
export OPENAI_API_KEY=... ANTHROPIC_API_KEY=...
node evals/run-anchor-bank-v2.mjs --arms cells,naive --items all --artifact rerun.json   # v4 instruments
# variants: --replicate N | --variant order-reversed|paraphrase|no-volunteered | --granularity 1|8|40
node evals/run-anchor-bank.mjs --arms cells,naive --items all        # registered v1 runs (in place)
node evals/run-brfss-states.mjs                                      # (in place)
node evals/run-shed-powered.mjs                                      # SHED pilot -> results/shed-powered-rerun.json
```

The v1 runner shares one random stream across items, so its persona records
depend on which items a run skips; the registered v1 persona samples assume a
single uninterrupted pass. The v2 runner seeds each item separately.
The registered paraphrase probe (PAP v3) had no paraphrase for `gss_nateduc`,
which therefore ran with its original stem; the v2 runner now refuses a
paraphrase run with a missing paraphrase.

### Model refresh (October 2026)

Registered in `paper/pap-model-refresh-2026-10.md` (tags
`pap-model-refresh-2026-10`, `-amend1` and `-amend2`). Each
model writes its own artifact, then the per-model artifacts merge into
`evals/results/model-refresh-run.json`:

```bash
node evals/run-anchor-bank-v2.mjs --model gpt-6-luna --items all --arms cells,naive \
  --artifact model-refresh-gpt-6-luna.json --max-usd 3
node evals/run-anchor-bank-v2.mjs --model gpt-6-luna --items subset20 --arms persona \
  --artifact model-refresh-gpt-6-luna.json --max-usd 2
# ...the same for each model and item set in the addendum's run table;
# gpt-5-mini also runs --arms persona-july; every model runs --arms persona-prob
# on subset20 (amendment 2)
uv run python evals/merge_refresh_artifacts.py
uv run --with "numpy==2.3.4" python analysis/analyze_model_refresh.py
```

Request settings per model (reasoning effort, Anthropic thinking) live in
`evals/models.mjs`; the product's served models (`src/engine/models.ts`) must
match them, which a unit test enforces. `--max-usd` stops a run once its
estimated spend passes the cap.

Elicitations are **not deterministic**: no seed parameter exists for the
model APIs (the SEED constant governs only persona-record sampling). Runs
checkpoint per item+arm into the run artifacts. The v2 runner appends per-call
logs (prompt, response, response ID, usage) under `evals/results/logs/`; the
v1 runner records parsed cell distributions in `anchor-cells-predictions.jsonl`,
and the BRFSS runner keeps no per-call log. Models
used in July: `gpt-5-mini` (reasoning effort minimal), `gpt-5.2` (none),
`claude-haiku-4-5-20251001`; the October refresh's models and settings are in
`evals/models.mjs`. When these are retired, Tier 0 still reproduces the
paper and the refresh from the committed logs and artifacts.

Approximate cost to re-run the July Tier 2 runs: ~$20 at July 2026 prices. The October 2026 refresh cost $111 (from its per-call logs), most of it gpt-6-astra and claude-opus-5-5.

## Provenance markers

- Pre-registrations: `paper/pap-v2.md` (tag `pap-v2`, commit `f93e00b`),
  `paper/pap-v3-addendum.md` (tag `pap-v3-addendum`, commit `5c301b6`),
  `paper/pap-model-refresh-2026-10.md` (tags `pap-model-refresh-2026-10`,
  `pap-model-refresh-2026-10-amend1`, `pap-model-refresh-2026-10-amend2`;
  its post-run notes record one interrupted and resumed run) —
  committed and pushed before the runs they specify; ordering is auditable
  against run-artifact timestamps and per-call log timestamps.
- The production site's benchmarks page imports the same
  `paper/artifacts/*.json` this document regenerates.
