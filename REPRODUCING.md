# Reproducing the paper

Three tiers, by what you need. Python steps run under `uv` (Python 3.14.4, Quarto 1.9.36) with the pinned
environment in `pyproject.toml` (`uv sync` once, or use the `uv run --with`
one-liners shown, which resolve to the same pinned versions).

## Tier 0 — verify the paper from committed artifacts (no data, no keys)

Every number and figure in the manuscript regenerates from files in git:

```bash
uv run --with "numpy,scipy" python analysis/analyze_anchor.py        # scores registered v1 runs
uv run --with "numpy,scipy" python analysis/analyze_anchor_v2.py     # scores v4 robustness runs + sensitivities
uv run --with "numpy,scipy,matplotlib" python analysis/make_paper_assets.py
git diff --exit-code paper/artifacts/                                 # clean = reproduced
cd paper && quarto render paper.qmd                                   # rebuild PDF/HTML
```

Inputs consumed: `evals/anchor-bank/anchor-bank-v{1,2}.json`,
`evals/anchor-bank/historical-targets.json`,
`evals/results/anchor-bank-run-v{1,2}.json`,
`evals/results/anchor-cells-predictions.jsonl`,
`evals/results/logs/*.jsonl` (per-call logs, all v2 arms),
`evals/results/shed-2024-powered-comparison-v2.json` (+ gzipped pilot raw log),
`paper/artifacts/brfss-state-targets.json`, `public/data/v1/US.json`.
The CI job `reproduce-artifacts` runs exactly this tier on every push.

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
```

Known nondeterminism: `rf_baseline.py` pins `random_state` but
`HistGradientBoostingClassifier` results can shift across scikit-learn
versions; use the pinned version for bit-reproduction.

## Tier 2 — re-run elicitations (API keys; models may since be deprecated)

```bash
export OPENAI_API_KEY=... ANTHROPIC_API_KEY=...
node evals/run-anchor-bank.mjs --arms cells,naive --items all        # registered v1 runs
node evals/run-anchor-bank-v2.mjs --arms cells,naive --items all     # v4 corrected instruments
# variants: --replicate N | --variant order-reversed|paraphrase|no-volunteered | --granularity 1|8|40
node evals/run-brfss-states.mjs
```

Elicitations are **not deterministic**: no seed parameter exists for the
model APIs (the SEED constant governs only persona-record sampling). Runs
checkpoint per item+arm into the run artifacts; per-call logs (prompt,
response, response ID, usage) append under `evals/results/logs/`. Models
used: `gpt-5-mini` (reasoning effort minimal), `gpt-5.2` (none),
`claude-haiku-4-5-20251001`. When these are retired, Tier 0 still reproduces
the paper from the committed logs and artifacts.

Approximate cost to re-run everything in Tier 2: ~$20 at July 2026 prices.

## Provenance markers

- Pre-registrations: `paper/pap-v2.md` (tag `pap-v2`, commit `f93e00b`),
  `paper/pap-v3-addendum.md` (tag `pap-v3-addendum`, commit `5c301b6`) —
  committed and pushed before the runs they specify; ordering is auditable
  against run-artifact timestamps and per-call log timestamps.
- The production site's benchmarks page imports the same
  `paper/artifacts/*.json` this document regenerates.
