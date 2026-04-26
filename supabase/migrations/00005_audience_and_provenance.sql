-- Persist richer audience targeting and run provenance.
-- These fields make each completed run auditable without copying full microdata
-- records into the app database.

alter table surveys
  add column if not exists audience_filters jsonb not null default '{}';

alter table surveys
  add column if not exists field_selection jsonb;

alter table surveys
  add column if not exists field_selection_version text;

alter table surveys
  add column if not exists dataset_version text;

alter table surveys
  add column if not exists sample_seed integer;

alter table surveys
  add column if not exists sample_frame_count integer;

alter table surveys
  add column if not exists sample_frame_weight numeric;

alter table respondents
  add column if not exists selected_fields jsonb;

alter table respondents
  add column if not exists synthetic_person_id text;
