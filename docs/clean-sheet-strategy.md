# HiveSight clean-sheet strategy

Last updated: 2026-04-24

This note captures the current clean-sheet view of HiveSight so a future session can continue without reconstructing the product, architecture, and research reasoning from chat history.

## Current verified state

- The five code review findings from the latest review were fixed and committed in `580b14d`.
- Production `https://hivesight.ai` was manually deployed from that commit-era tree and is serving the redesigned home, thesis, and benchmark pages.
- Supabase project `hivesight` had become inactive; it was restored through the Supabase Management API.
- Supabase migrations `00001` through `00004` are recorded in `supabase_migrations.schema_migrations`.
- A live anonymous survey smoke test completed successfully with `personaSource: microdata`.
- CI passed for commit `580b14d`: `Improve HiveSight research UX and benchmarks`.

## Core thesis

HiveSight should not be positioned as "a geography polling toy." The stronger claim is:

> Ask AI audiences anything you would ask humans, grounded in calibrated population microdata.

Geography is the most intuitive entry point and an important differentiator, but it is not the only product. The defensible asset is the long-wise, geography-assigned synthetic population with rich household, demographic, economic, and policy variables. That lets the product target and condition on local population structure without doing runtime MRP-style post-stratification.

## If building from scratch

### Product surface

Start with one loop:

1. User enters a claim, message, concept, product description, or survey question.
2. User selects an audience by geography plus optional demographic/economic filters.
3. HiveSight samples calibrated microdata records from the target audience.
4. HiveSight runs the question through a respondent simulation engine.
5. Results show distribution, representative reasons, subgroup breaks, provenance, model, sample size, and rerun/compare controls.

The product should quickly support:

- Compare audiences: same question across geographies or segments.
- Compare messages: multiple claims/headlines/concepts across one audience.
- Segment builder: age, income, household type, children, housing tenure, occupation, benefits, disability, insurance, student status, race/ethnicity, sex, and geography.
- Export: CSV for responses and respondent metadata, plus a compact report link.
- Saved studies: a study contains questions, audiences, model settings, runs, and benchmarkable outputs.

### Architecture

Use a data plane, simulation plane, and product plane.

Data plane:

- Store calibrated synthetic populations as versioned datasets outside the app database, likely Parquet on object storage or Hugging Face for public/static artifacts.
- Every record should have stable record id, dataset version, person/household attributes, geography assignments, and calibration metadata.
- Treat the long-wise geography-assigned population as the source of truth. Runtime selection should be filtering and sampling, not post-stratifying generic national records.
- Keep a compact metadata registry in the app database: dataset version, variable dictionary, available geographies, row counts, and source hashes.

Simulation plane:

- Make respondent generation an async job for anything beyond small free runs. Edge/serverless streaming is fine for the public 25-person demo, but durable jobs are cleaner for paid/large studies.
- Split the pipeline into explicit steps: audience resolution, field selection, prompt rendering, model call, response parsing, persistence, aggregation, report generation.
- Make every run reproducible: save dataset version, model, prompt version, field-selection version, random seed, sample ids, and parser version.
- Use idempotency keys so refreshes and client retries do not double-charge or duplicate runs.

Product plane:

- Keep Next.js/Vercel for the UI and lightweight API routes.
- Use Supabase for auth, app metadata, saved studies, survey runs, respondents, responses, and credits.
- Add a queue/worker path before scaling larger hives. Vercel is fine for the website, but long-running simulations should not depend on request lifetime.
- Add `/api/health` and uptime monitoring that verifies Supabase, OpenAI configuration, and at least a tiny microdata load path.

### Data model

The app database should model studies rather than only surveys.

- `studies`: owner, title, description, status, created_at.
- `audiences`: study_id, location filter, demographic/economic filters, resolved dataset version, estimated population count.
- `questions`: study_id, text, response type, scale, options.
- `runs`: question_id, audience_id, model, sample size, prompt version, field-selector version, dataset version, seed, status, started_at, completed_at.
- `sampled_respondents`: run_id, synthetic_person_id, selected fields shown to model, full metadata reference, weight.
- `responses`: run_id, respondent_id, parsed response, reasoning, raw model output, parser confidence.
- `aggregates`: run_id, metric payload, subgroup payload, generated report payload.

Keep full microdata out of the app database unless necessary. Persist enough to audit and reproduce runs.

## Field selection

The current keyword heuristic is useful but should not be the long-term design. Clean-sheet field selection should be a typed policy engine.

Inputs:

- Question text.
- Response type and options.
- Audience filter.
- Field dictionary with field descriptions, allowed uses, sensitivity level, and examples.
- Product mode: marketing, product, policy, academic, editorial, generic.

Outputs:

- Included fields.
- Excluded fields.
- Reason for each sensitive field.
- Prompt-facing phrasing for each field.
- A stable field-selection version.

Rules:

- Always include basic non-sensitive context needed for human-like responses: age band, household situation, broad employment/income context, and geography at the right granularity.
- Include sensitive fields only when the question plausibly needs them or the user explicitly targets them.
- Avoid exact values when they cause anchoring; use bands unless benchmarks show exact values improve accuracy.
- Add negative tests for every high-risk trigger, especially polysemous terms like `family`, `parent`, `drug`, `coverage`, `insurance`, `black`, `white`, and `rent`.
- Save the fields shown to each respondent so users can audit what the model saw.

The likely implementation path is:

1. Replace ad hoc keyword arrays with a declarative field registry and deterministic rules.
2. Add a small classifier later only to propose categories, with deterministic guardrails deciding final inclusion.
3. Benchmark field-selection variants against evergreen survey datasets before making richer context the default.

## Benchmark strategy

Do not spend money on original human data until the existing-public-data benchmark story is exhausted.

Reference comparisons:

- Naive LLM: ask the model without respondent microdata.
- Basic demographic persona: age, sex, race/ethnicity, state, income band.
- HiveSight microdata: richer calibrated record with question-aware selected fields.
- Optional oracle-ish condition: richer field set or exact values, used only to test ceilings.

Good benchmark datasets:

- GSS 2024 for evergreen social attitudes.
- SHED 2024 for household finance and economic stress.
- Survey of Consumer Decisions / consumer-choice style datasets if available and recent enough.
- Text-based treatment-effect benchmarks from `treatmenteffect.app` / Hewitt et al. for message framing.

Metrics:

- Overall distribution error, e.g. MAE or RMSE against human marginals.
- Subgroup error across age, income, race/ethnicity, sex, education, and geography where available.
- Rank correlation across questions and answer options.
- Treatment-effect sign accuracy and effect-size error for experiments.
- Stability across seeds and prompt perturbations.
- Calibration by audience size and model.

The public benchmark page should report both wins and misses. Credibility comes from showing where HiveSight improves over baseline prompting, not from pretending synthetic respondents always replace human polling.

## Decision analysis

Primary KPIs for the next 60 days:

- Public demo reliability: at least 99% uptime for home page and successful 25-person free run health checks by 2026-06-30.
- Benchmark proof: at least one public benchmark suite showing HiveSight microdata beats naive LLM and basic-persona baselines on pre-registered metrics by 2026-06-30.
- User value: at least 10 external users complete a free run and view results by 2026-06-30.

Options considered:

| Option | Description | Demo reliability forecast | Benchmark proof forecast | User value forecast |
| --- | --- | ---: | ---: | ---: |
| Incremental hardening | Keep current app, add health checks, field registry, first benchmark result | 80% | 65% | 55% |
| Engine rewrite behind current UI | Build durable job engine and study model before more marketing | 65% | 55% | 35% |
| Separate benchmark repo first | Move research/benchmark work into a standalone repo before product changes | 75% | 70% | 30% |
| Full clean rewrite | Rebuild app, data model, workers, UI, and benchmark stack from scratch | 35% | 30% | 15% |

Recommendation:

Use incremental hardening as the main path. Do not full-rewrite now. Do not split repos yet except for very large generated benchmark outputs if they become hard to manage. The current app is live, testable, and already carries the product story. The right move is to harden the live loop and make the benchmark proof real.

## Next implementation priorities

1. Add production health checks and monitoring.
2. Add a typed audience/filter model for rich microdata targeting.
3. Replace keyword-only field selection with a field registry plus deterministic selection rules.
4. Publish the first small benchmark result, not just the benchmark plan.
5. Improve results pages: provenance, selected fields, sample details, confidence/stability, compare/rerun.
6. Move large simulation runs to async jobs once free-run and benchmark usage grows.

## Open risks

- Supabase project inactivity can silently break the free-run path. Add monitoring and consider a paid/stable Supabase plan if this is public.
- LLM survey accuracy is task-dependent. Marketing copy should claim real insights, not universal replacement of polls.
- Richer conditioning may improve fidelity but can also induce stereotyping. Store selected fields and evaluate subgroup errors.
- Geography-assigned synthetic population is the right conceptual asset, but users may need non-geographic segment targeting first. The UI must not trap the product in a local-only framing.
- Benchmark datasets may be partially in model training data. Prefer fresh public datasets, but measure anyway and disclose dataset dates.

