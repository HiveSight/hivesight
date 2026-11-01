-- The hosted project keeps the tables from before the July 2026 rebuild, and
-- the app no longer reads them. Their policies let anyone holding the public
-- key read and change rows, so public roles lose all access. The rows stay.
-- A database built from this directory alone has none of these objects.

do $$
declare
  legacy text;
begin
  foreach legacy in array array[
    'profiles', 'surveys', 'respondents', 'responses', 'credit_transactions', 'rate_limits'
  ] loop
    if to_regclass('public.' || legacy) is not null then
      execute format('alter table public.%I enable row level security', legacy);
      execute format('revoke all on table public.%I from public, anon, authenticated', legacy);
    end if;
  end loop;

  if to_regprocedure('public.handle_new_user()') is not null then
    revoke all on function public.handle_new_user() from public, anon, authenticated;
  end if;
end;
$$;
