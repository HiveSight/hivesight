# HiveSight — Claude Code notes

Rebuilt July 2026 around a cell-based estimator (see docs/rebuild-2026.md).
Persona-roleplay simulation was retired after benchmarking at 37pts topline
MAE vs 6pts subgroup MAE for cell-based estimation (evals/results/).

## Stack

- Next.js 15 App Router + Tailwind v4, TypeScript strict, bun (not pnpm/npm)
- Estimator: `src/engine/` — pure TS package. Cells + verbalized distribution
  elicitation + calibrated-weight aggregation. No persona roleplay.
- Data release: `public/data/v1/{US,<state>}.json` built by
  `pipeline/build_cell_release.py` from HF `MaxGhenis/hivesight-persona-data`.
  Districts reduce at request time in `src/engine/data.ts`.
- Database: Supabase project `nbtaqmnxvwftbooxjhnd` (org PolicyEngine-test, free
  plan). It holds saved estimates (`runs`) and the daily allowances
  (`run_quota`, `claim_run`). Production stops estimates whenever `claim_run`
  can't answer, so it needs this database; `bun run dev` runs without it, with
  no allowances or share links. Free-tier projects auto-pause on inactivity,
  so the daily keepalive cron in vercel.json queries the database to keep it
  active, and purges old records.
- The hosted project also keeps the pre-rebuild tables (surveys, responses,
  and others) with their rows. Public roles have no access to them.

## Commands

```bash
bun run dev          # dev server
bun run typecheck && bun run test && bun run build
bun run data:release # build missing public/data/v1 files (needs numpy; delete a file to rebuild it)
```

## Environment

- `OPENAI_API_KEY` — required. Local dev: in `.env.local` (real key in the
  `claude-env` keychain via `~/.claude/manage-secret.sh get OPENAI_API_KEY`).
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` — required in production
  (see Stack). `SUPABASE_SECRET_KEY` also keys the visitor hash, so rotating it
  restarts the day's per-visitor counts.
- `CRON_SECRET` — optional, protects /api/cron/keepalive.

## Migrations

Apply migrations before deploying the code that needs them: production refuses
every estimate while `claim_run` can't answer.

The hosted project's migration history starts with `00001`–`00005` from the
pre-rebuild schema, which this repo doesn't carry, so `supabase db push` refuses
to run. Apply new files in `supabase/migrations/` through the Management API:
`POST https://api.supabase.com/v1/projects/<ref>/database/query` with
`Authorization: Bearer $SUPABASE_ACCESS_TOKEN` (a personal access token, set in
the shell) and the body `{"query": "<sql>"}`. Then insert `(version, name)` into
`supabase_migrations.schema_migrations`.

## Models

- Served models and their request settings: `src/engine/models.ts`
  (default gpt-6-luna at reasoning effort none; gpt-6.1-sol at low). The eval
  runners' settings are in `evals/models.mjs`; `models.test.ts` keeps them
  equal. Verify model IDs and supported efforts against the provider's docs
  and live API before changing them.
- `/api/run` accepts every served model, and the form sends none, so visitors
  get the default. `paper/pap-model-refresh-2026-10.md` registers Sol as a second
  model through the API. Each model sets its own `visitorLimit` and `siteUnits`,
  and `models.test.ts` holds one visitor to a fifth of the site's allowance.

## Rules

- Model or prompt changes must re-run the anchor-bank refresh
  (`evals/run-anchor-bank-v2.mjs`, REPRODUCING.md "Model refresh") under a
  committed addendum, then regenerate `paper/artifacts/model-refresh.json`.
  The product's displayed error (`benchmarkErrorFor` in src/engine/run.ts),
  the home page, and the benchmarks page all read that artifact — never
  hand-edit displayed accuracy numbers.
- Copy is direct and quantitative; sentence case; no hype. Product framing is
  "pre-field directional estimation" (AAPOR-aligned), never poll replacement.
  Verbatims are always labeled synthetic/illustrative (ESOMAR).
- Band logic exists in three places that must stay in parity: engine
  (src/engine/bands.ts, data.ts), pipeline (pipeline/build_cell_release.py),
  evals (evals/prep_shed_data.py).
