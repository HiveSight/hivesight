-- Fresh schema for the rebuilt estimator app. Persistence is optional:
-- the app runs stateless when this database is unavailable.

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists runs_created_at_idx on public.runs (created_at desc);

-- Server-only access: the app reads/writes with the service role.
alter table public.runs enable row level security;
