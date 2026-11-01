-- Saved estimates behind share links. The page reads them with the service
-- role, so public roles get no access.

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists runs_created_at_idx on public.runs (created_at desc);

alter table public.runs enable row level security;
revoke all on table public.runs from public, anon, authenticated;
