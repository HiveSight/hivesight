# Model-refresh addendum (October 2026): current models on the corrected bank

Status: registered by commit before any model-refresh elicitation runs.
Amends PAP v2 (paper/pap-v2.md, tag `pap-v2`) and the PAP v3 addendum
(paper/pap-v3-addendum.md, tag `pap-v3-addendum`). The July 2026 runs remain
the registered confirmatory record and are reported unchanged. Everything
here is exploratory: it asks how the registered design performs with the
models available in October 2026, and which model the product should serve.

Prompted by two things: the gpt-5-mini / gpt-5.2 generation the product
served has been superseded, and the 2026-09-25 invariants audit found that
the published subgroup MAE averaged within items before averaging items,
while PAP v2 declares pooling "across all reported slice bins". The decision
on that finding was to rerun the benchmark with current frontier models,
scored with the registered pooling, rather than only re-pool the July runs.

## Instrument

Anchor bank v2 (instrument-corrected; `evals/anchor-bank/anchor-bank-v2.json`),
prompts v4 (`evals/run-anchor-bank-v2.mjs`, which is the instrument the
production engine uses), 149 national cells, default variant, replicate 0.
Runs write to `evals/results/model-refresh-run.json` with full per-call logs
under `evals/results/logs/`.

The persona arm is ported from the v1 runner onto the v4 instrument: same
corrected wording, the same presented options as the cells and direct arms
(volunteered options marked), universe notes. 150 records per item are drawn
by systematic weighted sampling from `public/data/v1/US.json` samples with a
seed fixed by item (FNV-1a of `20260707:<itemId>`), so every model answers as
the same 150 people. Subgroup bins with fewer than 10 sampled respondents are
not reported for persona (the v1 rule).

## Models and settings

Each model runs at the lowest reasoning effort it accepts, with thinking off
where allowed (`evals/models.mjs`), matching the registered design's use of
the lowest effort: gpt-6-luna (`none`), gpt-6.1-sol (`low`), gpt-6-astra
(`low`), claude-haiku-5-5 (thinking disabled), claude-sonnet-5-5 (thinking
`between_tools`), claude-opus-5-5 (adaptive thinking, effort `low`; it cannot
disable thinking). gpt-5-mini (`minimal`) is the July reference.

## Runs

| Model | cells + direct | persona |
|---|---|---|
| gpt-6-luna | full bank (63) | 20-item subset |
| gpt-6.1-sol | full bank | 20-item subset |
| claude-haiku-5-5 | full bank | 20-item subset |
| gpt-6-astra | 20-item subset | 20-item subset |
| claude-sonnet-5-5 | 20-item subset | 20-item subset |
| claude-opus-5-5 | 20-item subset | 20-item subset |
| gpt-5-mini | (July R-corrected run, reused) | 20-item subset |

The 20-item subset is the one fixed in PAP v2. Each run carries a spend cap;
a run stopped by its cap is reported as incomplete with the items it covered.

Before this commit, a plumbing check ran all three arms on one item
(gss_happy) for each model to confirm request settings and reply parsing
(0 failed calls, 0 unparsed replies in every model). Only parse rates were
inspected; those outputs are not part of the results and are not committed.

## Metrics

As registered in PAP v2: absolute error of the designated positive-option
share; (a) topline MAE pooled across items; (b) subgroup MAE pooled across
all reported slice bins (bin-mean). The item-mean subgroup MAE the July
publication used is reported alongside for continuity. Failed elicitations
are reported per model and arm; items with more than 10% failed cells are
flagged.

## Questions (exploratory)

- Q1 (personas): does the persona arm's topline and subgroup MAE improve
  over gpt-5-mini's persona arm on the same instrument, for each current
  model? Paired by item on the 20-item subset; item-resampling bootstrap 95%
  CIs on the differences.
- Q2 (architecture, within model): for each model, is cells subgroup MAE
  lower than persona subgroup MAE on the 20-item subset (PAP v2 H2 by model)?
- Q3 (cells): does each current model's cells topline and subgroup MAE
  improve over gpt-5-mini's R-corrected cells run on the same items?

## Product decision rule (fixed here)

The product serves OpenAI models. gpt-6-luna becomes the default if its
full-bank cells subgroup MAE (bin-mean) is no more than 1.0 point above
gpt-5-mini's R-corrected value under the same pooling. Otherwise gpt-6.1-sol
becomes the default if it passes the same test; if neither passes, gpt-5-mini
stays the default. gpt-6.1-sol is offered as a second model through the API.
The accuracy the product displays with each run becomes that model's
full-bank cells topline and bin-mean subgroup MAE from this refresh,
replacing the July figure, and the benchmarks page states the change of
instrument (bank v2) and pooling (bin-mean). A Claude model is added to the
product only by a later decision, whatever these results show.
