-- Persist the provenance of respondent generation at the survey level.
-- This lets results pages distinguish calibrated microdata from synthetic fallback runs.

alter table surveys
  add column if not exists persona_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'surveys_persona_source_check'
  ) then
    alter table surveys
      add constraint surveys_persona_source_check
      check (persona_source in ('microdata', 'synthetic_fallback', 'legacy_personas'));
  end if;
end $$;
