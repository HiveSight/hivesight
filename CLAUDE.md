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

## Monitoring

Nothing on Vercel can report that the site stopped serving estimates, so two
programs outside Vercel report it:

- `.github/workflows/health-monitor.yml` (`scripts/health-monitor.mjs`) reads
  `/api/health`, retries a failure twice, and keeps one open issue for each
  kind of problem (an outage, the database size or a drill), with the label
  `health-alert`. It edits that issue on each later failure, and GitHub
  notifies nobody of the edit. It closes the issue on its first run at least
  an hour after the last failure. From 450 MB, above what the purge allows,
  `/api/health` reports `database_size` as `warning` but still answers 200,
  and the workflow opens the database size issue. That check reads this
  project alone, while Supabase counts the whole organization against its
  quota.
- `~/chief-of-staff/bin/hivesight-health-watch` (launchd, every 5 minutes on
  Max's Mac) starts that workflow about every 15 minutes, once 14 minutes have
  passed since the last start and every run that started in the last hour, on
  any branch, has finished. We keep the cron line only as a backup. In the 45
  hours after the workflow landed on November 2, 2026, GitHub started six
  scheduled runs, and
  [others report missing or sparse scheduled runs too](https://github.com/orgs/community/discussions/206019).
  Max doesn't read GitHub's email for this repo, so the watcher also sends each
  new issue through `say` to Telegram, once, including one that opened and
  closed while the watcher didn't run.

  The watcher also alerts when the monitor stops. It adds up the time between
  its checks, at most 5 minutes for each gap, since it last saw a new
  successful run on `main` and since its last clean read of the issues. Once
  either total reaches 6 hours, it alerts on the first check that finds a
  fault. It finds one when the newest run on `main` ended in anything but
  success or has stayed unfinished for an hour, or when GitHub never listed the
  last two runs the watcher started. A failed start or `gh` call counts as a
  fault too, as do an answer from GitHub that the watcher can't read in full
  and a crash while it relays the issues. A night with the Mac off adds 5
  minutes, but each short wake that macOS makes during sleep adds up to 5
  minutes too. A wake without a network finds a fault, so a sleep with 72 such
  wakes raises the alarm. `say` holds alerts for the next morning card from
  22:00 to 07:00 and once six have gone out that day, so Max may not hear of an
  outage until then.

  launchd runs the watcher only while the Mac stays awake and during the short
  wakes macOS makes while it sleeps. At other times only GitHub starts runs, on
  its sparse schedule, and nothing tells Max about an outage.

Test the whole path with
`gh workflow run health-monitor.yml -R HiveSight/hivesight -f drill=true`, which
reads the failing `scripts/health-drill.json`. The run opens a `[drill]` issue
and leaves a real outage's issue alone. The first regular run at least an hour
after the drill's last failure closes the drill issue.

## Edge limits

`scripts/firewall.mjs` holds per-address limits that Vercel's firewall applies
before a request reaches a function: 10 requests a minute to `/api/run`, 120 to
`/runs/*`, 20 to `/api/health` and 5 to `/api/cron/keepalive`. Static pages get
none. After each build, CI runs `bun scripts/firewall.mjs routes`, which fails
when an App Router or Pages Router function route has no rule, more than one
rule, or a rule that covers only some of its paths. It also fails when a rule
covers a static page or no function route, and when the build has middleware.

Vercel keeps the firewall configuration apart from deploys, so merging a change
to `RULES` changes nothing live until someone applies it with a Vercel token
(the CLI's login token works):

```bash
VERCEL_TOKEN=... node scripts/firewall.mjs dry-run  # stage the rules, check the draft, discard it
VERCEL_TOKEN=... node scripts/firewall.mjs apply    # stage, publish and read back
VERCEL_TOKEN=... node scripts/firewall.mjs check    # exit 1 when the live rules differ
```

`apply` switches the firewall on when it's off. Vercel's docs don't say what the
switch gates, so a rule, IP block or managed ruleset someone set up in the
dashboard may start acting then. Apart from that, `apply` changes only rules
whose names start with `hivesight: `. Vercel keeps one draft for the project and
publishes all of it, so `apply` refuses to start while the draft holds anything
the live configuration doesn't. It publishes only when the draft holds this
run's changes and nothing else. The draft doesn't record a flip of the firewall
switch, so `apply` also compares the draft's other settings with the ones Vercel
returned after the run's first change. After a failure, it discards the draft
only when the draft holds nothing but this run's changes.

Some dashboard edits can still slip past these checks. One that lands between
the last check and the publish call goes live with the rules. `apply` throws
away one that lands between its last read of the draft and the discard. And a
change the draft doesn't record joins the settings `apply` compares against if it
lands before Vercel answers the run's first change. A switch flip is one such
change: a flip to off in that window fails the run, which then discards the flip
with the draft.

`check` and `apply` warn when an active dashboard rule with a bypass or allow
action sits ahead of these rules. Vercel skips the remaining custom rules for
every request a bypass rule matches, and its docs don't describe allow.

Vercel counts each address's requests under each rule in fixed 60-second
windows, with a separate count in each region. It bills $0.50 per million
requests a rule allows in iad1 (regional pricing page, September 14, 2026), and
nothing for the requests it refuses.

When the firewall refuses a request, it answers with a plain-text 429 that
carries the header `x-vercel-mitigated: deny` and no reset time. The form can't
read that body as JSON, so it shows its own rate-limit message. hivesight.ai and
hivesight-nu.vercel.app share one count. Live checks on November 2 found that
`/api/run` with a query string, in capitals or with an encoded letter counts
against the same rule, and so do HEAD and OPTIONS requests.

### What the limits leave open

- Each limit caps one address, so N addresses can still send 10N requests a
  minute to `/api/run` and 120N to `/runs/*`.
- Fifteen addresses can still spend the day's 500 units in about two minutes,
  and the site then refuses everyone until midnight UTC.
- One address can stay under the `/runs/*` limit and keep re-reading a large
  saved estimate. At about 47 KB a read, it pulls the free plan's 5 GB of
  uncached Supabase egress in about 15 hours.
- The rules key on the connecting address, and neither hostname has an AAAA
  record, so visitors reach the site over IPv4. Vercel's docs don't say whether
  an `ip` key counts an IPv6 address alone or its whole /64. If either hostname
  gains an AAAA record, an IPv6 visitor may get a fresh count for each address
  it holds. If Cloudflare starts proxying hivesight.ai, every visitor shares
  Cloudflare's addresses.
- Nothing runs `check` on a schedule, so nothing reports a rule someone switches
  off in the dashboard.

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
  get the default. We registered Sol as a second model through the API in
  `paper/pap-model-refresh-2026-10.md`. Each model sets its own `visitorLimit`,
  `siteUnits` and `siteLimit`. `models.test.ts` holds one visitor to a fifth of
  the site's allowance and holds most of the allowance for the default model.

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
