-- claim_run reads the counts before it takes the site lock and refuses a claim
-- they already rule out, so a flood of refused claims can't queue real claims
-- behind the site row. Counts only rise within a day, so a stale read can't
-- refuse a claim that fits. A stale read can pass a claim that no longer fits,
-- and the checks under the lock refuse it. The store ping's claim never fits and
-- skips the reads, because it exists to reach the write and the lock.
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
  seen integer;
  site_used integer;
  visitor_used integer;
begin
  if p_visitor_limit < 1 or p_site_cost < 1 or p_site_limit < 1 then
    raise exception 'claim_run limits must be positive';
  end if;

  if p_site_cost <= p_site_limit then
    select used into seen from public.run_quota
      where bucket = 'site' and day = today;
    if seen + p_site_cost > p_site_limit then
      return 'site';
    end if;
    select used into seen from public.run_quota
      where bucket = 'visitor:' || p_visitor and day = today;
    if seen >= p_visitor_limit then
      return 'visitor';
    end if;
  end if;

  -- Every claim still in the running locks the site row first, so these claims
  -- run one at a time and the two counts move together.
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
