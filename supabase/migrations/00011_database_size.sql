-- The size of this project's database, so /api/health can warn before the
-- organization runs out of the free plan's 500 MB. Supabase's quota sums every
-- database in the organization; this is the one that grows. Only the service
-- role can call this.
create or replace function public.database_bytes() returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_database_size(pg_catalog.current_database());
$$;

revoke all on function public.database_bytes() from public, anon, authenticated;
grant execute on function public.database_bytes() to service_role;
