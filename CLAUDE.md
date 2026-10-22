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
- Persistence (optional): Supabase project `nbtaqmnxvwftbooxjhnd`. The app
  runs stateless without it — only share links and history need the DB.
  Free-tier projects auto-pause on inactivity; the daily keepalive cron in
  vercel.json prevents this once the project is restored/upgraded.

## Commands

```bash
bun run dev          # dev server
bun run typecheck && bun run test && bun run build
bun run data:release # build missing public/data/v1 files (needs numpy; delete a file to rebuild it)
```

## Environment

- `OPENAI_API_KEY` — required. Local dev: in `.env.local` (real key in the
  `claude-env` keychain via `~/.claude/manage-secret.sh get OPENAI_API_KEY`).
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` — optional persistence.
- `CRON_SECRET` — optional, protects /api/cron/keepalive.

## Models

- Served models and their request settings: `src/engine/models.ts`
  (default gpt-6-luna at reasoning effort none; gpt-6.1-sol at low). The eval
  runners' settings are in `evals/models.mjs`; `models.test.ts` keeps them
  equal. Verify model IDs and supported efforts against the provider's docs
  and live API before changing them.

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
