# Individual-simulation addendum (October 2026): individual probabilities on the full bank

Status: registered by commit and tag `pap-individual-sim-2026-10` before any
of its elicitation runs. Builds on the model-refresh addendum
(paper/pap-model-refresh-2026-10.md, tags `pap-model-refresh-2026-10`,
`-amend1`, `-amend2`), whose results are reported unchanged. PAP v2
(paper/pap-v2.md) fixes the metrics and pooling used here.

## Why

The product's eventual goal is individual-level simulation: estimates built
from simulated people rather than from population cells. In the refresh,
persona roleplay, in which each person names a single answer, stayed 12 to 15
points of subgroup MAE behind cells for every current model. Amendment 2 asked
the same 150 people per item for their probability of each answer instead.
Averaging those distributions cut subgroup MAE by 10 to 13 points, leaving it
1.8 to 3.1 points behind cells (gpt-6-luna +3.1, gpt-6.1-sol +2.4, paired,
bin-pooled) and topline MAE 2.3 to 4.6 points behind (gpt-6-luna +4.2,
gpt-6.1-sol +4.3). That result is exploratory: 20 items, registered after the
other refresh results were read, and drawn from a 1,200-record pool in which
equal-probability draws of 150 can take only eight distinct sets, of which the
20 items used seven.

This study runs the individual-probability arm on the whole bank, with every
person in the product's pool rather than 150 of them, for gpt-6-luna and, on
the full bank for the first time, gpt-6.1-sol; adds a gpt-6-luna arm with an
independent pool of people for every item; and fixes its comparisons and
product rules in advance.

## What ran before this commit

No elicitation for this study has run. The runner's new arms
(`evals/run-anchor-bank-v2.mjs`), the pool builder
(`pipeline/build_fresh_pools.py`) and the analysis
(`analysis/analyze_individual_sim.py`) were tested end to end against a local
stand-in for the model API that returns each item's human target distribution
plus random noise, not model output, including its failure cases (exhausted
quota, an outage on one item, a log line cut off mid-write, resume). Nothing
from those runs is committed or reported; the analysis writes mock-mode output
only to a git-ignored file. Two rounds of independent review of this text and
its code, before commit, led to the run safeguards, the weighting of bins at K
below 1,200, the per-model gate, the treatment of flagged items, the
within-item test-retest measure, per-comparison bootstrap seeds, the
composition check D5, and scoring K*-person runs on all bins (rules 2 to 4).
The form of rule 1 also changed after a mock run: on the stand-in's replies,
weighting bins by how often they are shown made 150 people score better than
the census, because small runs hide sparse bins whose errors are large, so
K* now compares each K with the census on the same bins.

Two checks used only committed or public inputs. The released US pool
(`public/data/v1/US.json`, 1,200 records) reproduces exactly from the pinned
Hugging Face frame (DATA.md; 4,221,054 adult records, SHA-256
`9f7a7e20dfdb01ca934ad349ea1ba4417aa8e9018280958389cdb1a49a03d0bd`) with
`pipeline/build_cell_release.py`. Amendment 2's per-person replies for
gpt-6-luna and gpt-6.1-sol were rebuilt from its committed per-call logs
(`evals/extract-persona-prob-people.mjs`, output
`evals/results/persona-prob-subset20-people.json`); every log line's prompts
match the runner's, and the rebuilt people reproduce amendment 2's toplines
exactly. Those replies were already part of the refresh's reported results;
they were not examined beyond that check.

The first draw of the fresh pools (below) ran the systematic pass in frame
order, as the released pool does. Two items' pools then shared 734 of their
1,200 records, because systematic samples whose random starts fall close
together are near copies. That draw was discarded before any use and the
design below adopted.

## Instrument

As amendment 2: anchor bank v2, prompts v4, the `persona-prob` prompt (the
same system prompt and description of the person as the persona arm, the same
presented options as cells and direct with volunteered options marked, the
substantive-answer instruction), replies parsed with the cells parser. The
description is kept verbatim, including its stray period ("You are a
48-year-old woman living in the United States. with no wage or
self-employment income this year."), so results compare with amendment 2 and
D1 compares identical prompts. Each person is a separate call with no shared
context. An arm's estimate is the equal-weight mean of its people's
distributions; a subgroup bin's estimate is the mean over the people in that
bin, and bins with fewer than 10 people who answered are not reported. Every
pool below is a weight-proportional sample of the population (amendment 1),
so equal weights are design-unbiased; a pool's realized composition still
differs from the population's by chance (D5).

## Arms

- `persona-prob-pool`: for every item, all 1,200 records of the released US
  pool, the pool the product ships. The same people answer every item.
- `persona-prob-fresh`: for every item, all 1,200 records of that item's own
  pool, drawn from the pinned frame by `pipeline/build_fresh_pools.py`: a
  systematic weight-proportional sample over a random permutation of the
  frame, seeded by item (FNV-1a of `20261023:<itemId>`), written to
  `evals/anchor-bank/fresh-pools-US.json.gz` (SHA-256
  `24cf78d3bad16ab633510ce55945a53ddb651e89c72825ae45dbd694f4db50fa`, which
  the runner checks). Two items' pools share 1.5 records on average (at most
  7), so in this arm person-sampling error is close to independent across
  items.

Each run keeps every person's parsed distribution in its artifact, so the
analysis can check the runner's aggregates and draw subsamples of people.

## Models, runs and spend caps

Settings from `evals/models.mjs`, unchanged from the refresh: gpt-6-luna
(reasoning effort `none`, the product's default model) and gpt-6.1-sol
(`low`, the frontier model the product serves). The runs, in this order:

```bash
node evals/run-anchor-bank-v2.mjs --model gpt-6-luna --items all --arms persona-prob-pool \
  --artifact individual-sim-gpt-6-luna-pool.json --max-usd 6
node evals/run-anchor-bank-v2.mjs --model gpt-6-luna --items all --arms persona-prob-fresh \
  --artifact individual-sim-gpt-6-luna-fresh.json --max-usd 6
node evals/run-anchor-bank-v2.mjs --model gpt-6.1-sol --items all --arms persona-prob-pool \
  --artifact individual-sim-gpt-6.1-sol-pool.json --max-usd 75
```

Each run is 75,600 calls. Expected costs, from amendment 2's tokens per call
adjusted for the full bank's longer questions, are about $2.80 for each
gpt-6-luna run and $56 for gpt-6.1-sol. The runs may proceed concurrently
(each writes its own artifact and log); `--concurrency` sets only how many
calls are in flight.

Safeguards in the runner, for these arms only: one arm per run, the artifact
name above, all items, the default variant, replicate 0 and granularity 149,
and a spend cap that counts spend already in the run's log, so a resumed run
cannot exceed its cap (the artifact's call, token and cost totals are
likewise cumulative over passes). A call that still fails after eight
attempts stops the run without saving its item, which reruns on resume; an
exhausted quota or a rejected request stops the run at once. Only replies
that do not parse count as failed elicitations. Calls in flight when a run
stops are billed and may be missing from the log, and a log line cut off by a
crash mid-write is kept, skipped and counted by both the runner and the
analysis. Every log line and the artifact record the API endpoint; a resume
refuses a log or artifact written against another endpoint, and the analysis
refuses runs made against any endpoint but the official one. When a pass
starts, the artifact records its start time, the git commit, whether the
run's inputs (the runner, `evals/models.mjs`, the bank, the fresh pools and
`public/data/v1/US.json`) differ from that commit, and their SHA-256 hashes.
When a run is complete its log is compressed (`gzip -9 -n`, committed as
`evals/results/logs/*.jsonl.gz`); the runner refuses to resume a compressed
run. A run stopped by its cap is reported as incomplete with the items it
covered. Interruptions, resumes and repeated calls are recorded in post-run
notes.

Comparators are already committed: the refresh's cells and direct (`naive`)
arms for both models on all 63 items, and its persona and persona-prob arms on
the 20-item subset (`evals/results/model-refresh-run.json`).

## People per item

Estimates use the census of each item's 1,200 replies (K = 1,200) and, from
the same replies, K = 150, 300 and 600 people drawn with equal probability
without replacement: 200 subsamples per item and K, seeded by 20261023 and a
CRC-32 of model, arm, item and K. Because people are asked independently, a
subsample of the census is distributed as a fresh K-person run on the same
pool would be.

At K below 1,200 a small bin is sometimes shown and sometimes not. An item's
expected topline error at K is its mean over subsamples. A bin enters with its
mean error over the subsamples that show it, weighted by the share of
subsamples that show it, so expected subgroup MAE at K is the expected sum of
shown bin errors over the expected number of bins shown. Paired comparisons
weight each bin the same way. The share of the census's bins a K-person run
is expected to show is reported with each K; at K = 150 the sparse income
bins are rarely shown.

## Metrics and inference

As PAP v2 and the refresh: absolute error of the designated positive-option
share; (a) topline MAE pooled across items; (b) subgroup MAE pooled across all
reported slice bins (bin-mean), with the item-mean pooling reported alongside.
Failed elicitations are reported per run. An item whose run has more than 10%
failed elicitations is flagged, and counts as not covered for the product
rules.

Comparisons are paired by item: 10,000 item resamples, percentile 95% CIs,
subgroup differences pooled over the bins both arms report, weighted as above
(with unit weights this is `paired_errors` in
`analysis/analyze_model_refresh.py`, draw for draw; the refresh's `paired()`
now calls it, and `paper/artifacts/model-refresh.json` regenerates byte for
byte). Each comparison draws its resamples from its own generator, seeded by
20261023 and a CRC-32 of the comparison's name, so no interval depends on
which other comparisons ran. The intervals resample items only. They are
conditional on the released pool (whose composition differs from the
population's by chance: it holds 271 adults aged 18 to 29, more than 62 of
the 63 fresh pools, whose mean is 240), on the single cells and direct runs,
and on the census replies.

Item sets: all 63 items (primary), and the 43 items outside the 20-item subset
("other 43"), the out-of-sample check, since amendment 2's result came from
the subset.

## Questions

These are registered estimates with intervals. None carries a directional
hypothesis, and no multiplicity adjustment is made. The thresholds in the
product rules were set knowing amendment 2's 20-item gaps (gpt-6-luna +4.2
topline and +3.1 subgroup against cells, with 150 people).

- Q1 (individual vs cells): for each model, `persona-prob-pool` (K = 1,200)
  minus `cells`, topline and bin-pooled subgroup MAE, on all 63 items and on
  the other 43.
- Q2 (individual vs direct): the same, minus `naive`.
- Q3 (people per item): for each model, expected MAE of `persona-prob-pool`
  at K = 150, 300, 600 and 1,200, and each K minus `cells` on all 63 items
  (at K = 1,200 this is Q1's comparison).
- Q4 (independent people, gpt-6-luna): `persona-prob-fresh` minus
  `persona-prob-pool`, and `persona-prob-fresh` minus `cells`, all 63 items.
- Q5 (models): gpt-6-luna minus gpt-6.1-sol on `persona-prob-pool`
  (K = 1,200), all 63 items.

Descriptive, without intervals unless stated:

- D1 (test-retest): amendment 2's people answered the 20 subset items once
  already, with the same prompts. Within each item with at least 10 people
  answering both times, the correlation (where both sets of answers vary) and
  mean absolute difference between a person's two positive-option shares, and
  the standard deviation of their first answers, each averaged across items.
- D2 (sampling error): mean person-sampling standard error of a bin's
  estimate at each K (finite-population corrected within the pool), over the
  bins expected to have at least 10 people at that K (the count is reported),
  and the mean standard error of a census bin estimate as a sample from the
  frame.
- D3 (failures and cost): failure rates per run; calls, tokens and cost from
  the per-call logs.
- D4 (continuity): on the 20-item subset, `persona-prob-pool` (K = 1,200)
  minus amendment 2's `persona-prob` (150 people) and minus `persona`, with
  intervals.
- D5 (composition): each run's census reweighted so its people match the
  population's shares of the 40 age × earned-income × sex cells (cells with no
  pool member dropped and the rest renormalized), scored as above, with an
  interval on its difference from the unweighted census.

## Product rules (fixed here)

The prototype is an opt-in "individual" elicitation mode in `src/engine`,
behind the existing model registry and a server setting that is off by
default: one call per person with the persona-prob prompts (pinned to the
runner's by parity tests); people drawn with equal probability without
replacement from the audience's eligible pool records; equal-weight means, or
record-weighted means where a geography's pool is its whole population rather
than a weight-proportional sample (districts with no more than 1,200 records);
subgroup breakdowns from each person's attributes, with bins under 10 people
not shown.

1. People per run: K* is the smallest K in {150, 300, 600} whose expected
   error, paired against the census on the same items and on the bins a
   K-person run shows, is no more than 0.5 points higher on both topline and
   subgroup MAE (gpt-6-luna, all 63 items); otherwise K* = 1,200. K* is
   computed only if gpt-6-luna's pool run covers all 63 items with none
   flagged. The mode asks min(K*, eligible records) people.

   Rules 2 to 4 score a K*-person run as the census on all bins plus that
   added error (the model's own, paired as in rule 1; zero when K* = 1,200),
   so bins a small run hides cannot make it look more accurate.
2. Gate, for each served model separately: a model offers the mode only if
   its `persona-prob-pool` run covers all 63 items with none flagged and its
   Q1 point estimates against its own cells arm (all 63 items, all bins), plus
   its added error at K*, are no more than 2.0 points on both topline and
   bin-pooled subgroup MAE.
3. Default: the individual mode is eligible to be proposed as the default
   only if gpt-6-luna's Q1 95% CI upper bounds against cells, plus its added
   error at K*, are below 0 for subgroup MAE and below +1.0 point for topline
   MAE. Otherwise cells stay the default.
4. Displayed accuracy: an individual-mode run shows its model's full-bank
   `persona-prob-pool` census topline and bin-pooled subgroup MAE plus its
   added error at K*, with the number of people, written by the analysis to
   `paper/artifacts/individual-sim.json` alongside the expected share of
   subgroups a K*-person run shows. These describe national estimates with
   K* people; a run whose audience has fewer eligible records asks everyone
   eligible and shows the same figures.
5. Scope: the measured accuracy is for national estimates from the released
   US pool. State and district pools are other draws and are not benchmarked
   here, as the cells benchmark is national only.

Whether to turn the mode on, and any change of default, is Max's decision;
these rules fix only what the results can support.

Run order: the three runs, then the analysis. Deviations, interruptions and
corrections go in post-run notes appended below, never by editing the
registered text.

## Post-run notes (2026-10-23; disclosures, not a registration)

Written after the runs and the registered analysis. None changes the
registered text; each records what happened or what the results show beyond
it.

1. **Order.** The registration commit (0908c5b) and tag were pushed, and the
   draft PR opened at 11:38:41Z, before the first study call at 11:38:55Z.
   Every pass recorded commit 0908c5b with its inputs unmodified.
2. **Runs.** gpt-6-luna released pool: one pass, 75,600 calls, no failed
   calls, $2.80. gpt-6-luna fresh pools: one pass, 75,600 calls, no failed
   calls, $2.80. gpt-6.1-sol released pool: started at concurrency 30, stopped
   by the operator at 11:41Z after one saved item to raise concurrency to 60,
   and resumed with unchanged code at 11:41:55Z; the 814 calls of the
   unsaved second item (gss_health) were repeated, so the log holds 76,414
   answered calls, no failed calls, $56.53 (cumulative, against the $75 cap).
   No log line was cut off.
3. **gss_satjob is flagged for gpt-6-luna, so rules 1 to 4 did not apply.**
   For this item, which the GSS asks only of people who work for pay
   (universe note: "Asked of respondents who work for pay; estimate among
   employed members of this group"), gpt-6-luna replied with every
   percentage zero for each simulated person with no earnings: 389 of 1,200
   in the released pool and 387 of 1,200 in its fresh pool, and no one else.
   gpt-6.1-sol answered for everyone. The parser treats an all-zero reply as
   unparsed, so 32% of gpt-6-luna's elicitations on the item failed, the item
   was flagged, and, as registered, gpt-6-luna's run did not cover all 63
   items: K* was not computed and neither model passes the gate. The
   individual mode is therefore not supported, and cells stay the default.
   The abstentions are arguably correct (the estimate then rests on the
   people the question applies to), but the registered rule counts them as
   failures and is applied as written.
4. **The gate fails without that item too (exploratory E1).** Treating the
   abstentions as out of universe, K* would be 150 (asking 150 people adds
   0.00 topline and 0.06 subgroup points to the census), and both models
   would still fail rule 2 on both metrics: gpt-6-luna +2.75 topline and +2.14
   subgroup points behind its cells, gpt-6.1-sol +2.93 and +2.18, against a
   2.0-point margin. The registered conclusion does not depend on gss_satjob.
5. **What the results show (from the registered artifact).** With every
   person in the pool, individual probabilities remain about 2 to 3 points
   behind cells and direct estimation for both models (Q1, Q2; all intervals
   on all 63 items exclude zero). Asking more people does not close the gap:
   150 people score like 1,200 (Q3), and 1,200 people score within 0.2 to 0.4
   points of amendment 2's 150 on the same 20 items (D4). Independent pools
   (Q4) and reweighting to the population's age × income × sex composition
   (D5) change nothing. The remaining error is therefore not person-sampling
   noise. Individual reports are stable: asked twice, a person's answer share
   correlates 0.81 (gpt-6-luna) and 0.97 (gpt-6.1-sol) with their first
   answer within an item (D1).
6. **Where the error sits (exploratory E2).** Simulated individuals overstate
   hardship: mean signed topline error is about −5 to −7 points on
   positive-valence items and +15 to +19 points on the three negative-valence
   items, against about +3 to +4 for cells on both. The largest gaps to cells
   are financial-wellbeing items (shed_b2, shed_ef7, shed_ef1,
   shed_housing_stress) and gss_fear.
