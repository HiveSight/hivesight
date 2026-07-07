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
bun run evals:shed   # powered SHED benchmark (needs OPENAI_API_KEY; ~$1)
bun run data:release # rebuild public/data/v1 (needs numpy; ~10 min)
```

## Environment

- `OPENAI_API_KEY` — required. Local dev: in `.env.local` (real key in the
  `claude-env` keychain via `~/.claude/manage-secret.sh get OPENAI_API_KEY`).
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` — optional persistence.
- `CRON_SECRET` — optional, protects /api/cron/keepalive.

## Rules

- Engine changes must re-run `bun run evals:shed` and update the artifact +
  BENCHMARK_ERROR in src/engine/run.ts. The benchmarks page renders the
  artifact directly — never hand-edit displayed accuracy numbers.
- Copy is direct and quantitative; sentence case; no hype. Product framing is
  "pre-field directional estimation" (AAPOR-aligned), never poll replacement.
  Verbatims are always labeled synthetic/illustrative (ESOMAR).
- Band logic exists in three places that must stay in parity: engine
  (src/engine/bands.ts, data.ts), pipeline (pipeline/build_cell_release.py),
  evals (evals/prep_shed_data.py).
