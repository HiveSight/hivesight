# HiveSight

Pre-field audience estimation: how would a defined US population — national,
state, congressional district, or demographic segment — answer a survey
question? HiveSight elicits response distributions from a language model over
~150 census-calibrated population cells and aggregates them with calibrated
weights (post-stratification with an LLM-elicited cell response model). It is
a directional prior before you field, not a replacement for polling, and it
publishes its own misses.

**Live**: https://hivesight.ai · **Benchmarks**: https://hivesight.ai/benchmarks

## The research paper

*What does post-stratifying language-model predictions buy? A registered three-arm evaluation against 63 survey items* — source in
[paper/](paper/), rendered [paper/paper.pdf](paper/paper.pdf). The paper's
every number renders from artifacts in [paper/artifacts/](paper/artifacts/),
which the production benchmarks page also imports. Pre-registration:
[paper/pap-v2.md](paper/pap-v2.md) (commit `f93e00b`, tagged `pap-v2`) and
[paper/pap-v3-addendum.md](paper/pap-v3-addendum.md) (commit `5c301b6`,
tagged `pap-v3-addendum`), each committed before the runs they govern.

Headline registered results (63 items, GSS 2024 + SHED 2024, gpt-5-mini):
persona role-play 25.0/25.0 pts topline/subgroup MAE at matched budget;
population cells 9.2/9.8; direct estimation 8.6/9.8. See the paper for what
those numbers do and do not support.

## Repository map

| Path | What it is |
|---|---|
| `src/engine/` | The estimator: cells, elicitation, aggregation, verbatims. Pure TS, unit-tested. |
| `src/app/` | Next.js app (hivesight.ai): ask flow, methodology, benchmarks. |
| `public/data/v1/` | Data release: cell tables + sample pools, US + 51 states. |
| `pipeline/` | Builds the data release from the population frame. |
| `evals/` | Anchor banks, elicitation runners, raw run artifacts and per-call logs. |
| `analysis/` | Scoring, PPI, RF baseline, BRFSS targets, paper assets. |
| `paper/` | Manuscript (Quarto), pre-registrations, artifacts, figures. |

## Reproducing

See [REPRODUCING.md](REPRODUCING.md) for the ordered chain (what runs from
committed artifacts alone, what needs raw data, what needs API keys) and
[DATA.md](DATA.md) for data acquisition, versions, and checksums.

Quick start (app):

```bash
bun install
OPENAI_API_KEY=... bun run dev
```

Quick start (verify the paper's numbers from committed artifacts — no keys,
no raw data):

```bash
uv run --with "numpy,scipy" python analysis/analyze_anchor.py
uv run --with "numpy,scipy,matplotlib" python analysis/make_paper_assets.py
git diff --exit-code paper/artifacts/   # should be clean
```

## License and data terms

Code: MIT. GSS microdata are not redistributed (NORC terms) — only weighted
aggregates appear in this repository; see DATA.md. SHED and BRFSS are public
federal data products.
