-- claim_run and purge_old_records run as the caller, so the service role needs
-- its own rights on both tables. Supabase no longer gives new projects these by
-- default, so the migrations spell them out.
grant select, insert, update, delete on table public.run_quota to service_role;
grant select, insert, delete on table public.runs to service_role;

-- A null or zero count would delete every saved estimate.
create or replace function public.purge_old_records(p_keep_runs integer) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_keep_runs is null or p_keep_runs < 1 then
    raise exception 'purge_old_records needs a positive count';
  end if;

  delete from public.run_quota where day < (now() at time zone 'utc')::date - 1;
  delete from public.runs where id in (
    select id from public.runs order by created_at desc, id offset p_keep_runs
  );
end;
$$;
