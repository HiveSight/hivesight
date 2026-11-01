-- Daily estimate allowances. Serverless instances share no memory, so the
-- counts live here and each claim runs as one transaction. `site` counts cost
-- units across all visitors; each `visitor:<key>` row counts one visitor's
-- estimates. Days follow UTC.

create table if not exists public.run_quota (
  bucket text not null,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (bucket, day)
);

alter table public.run_quota enable row level security;
revoke all on table public.run_quota from public, anon, authenticated;

-- Returns 'ok' after counting the estimate, or names the allowance that
-- refused it ('visitor' or 'site') and leaves both counts alone.
create or replace function public.claim_run(
  p_visitor text,
  p_visitor_limit integer,
  p_site_cost integer,
  p_site_limit integer
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  site_used integer;
  visitor_used integer;
begin
  if p_visitor_limit < 1 or p_site_cost < 1 or p_site_limit < 1 then
    raise exception 'claim_run limits must be positive';
  end if;

  -- Every claim locks the site row first, so claims run one at a time and
  -- the two counts move together.
  insert into public.run_quota (bucket, day) values ('site', today)
    on conflict (bucket, day) do nothing;
  select used into strict site_used from public.run_quota
    where bucket = 'site' and day = today
    for update;
  if site_used + p_site_cost > p_site_limit then
    return 'site';
  end if;

  insert into public.run_quota as q (bucket, day, used)
    values ('visitor:' || p_visitor, today, 1)
    on conflict (bucket, day) do update set used = q.used + 1
      where q.used < p_visitor_limit
    returning q.used into visitor_used;
  if visitor_used is null then
    return 'visitor';
  end if;

  update public.run_quota set used = used + p_site_cost
    where bucket = 'site' and day = today;
  return 'ok';
end;
$$;

-- Keeps the database inside the free tier: drops visitor keys after a day and
-- saved estimates beyond the newest p_keep_runs.
create or replace function public.purge_old_records(p_keep_runs integer) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.run_quota where day < (now() at time zone 'utc')::date - 1;
  delete from public.runs where id in (
    select id from public.runs order by created_at desc, id offset p_keep_runs
  );
end;
$$;

revoke all on function public.claim_run(text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.purge_old_records(integer)
  from public, anon, authenticated;
grant execute on function public.claim_run(text, integer, integer, integer) to service_role;
grant execute on function public.purge_old_records(integer) to service_role;
