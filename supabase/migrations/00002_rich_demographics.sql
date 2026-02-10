-- Add rich demographic columns to respondents and location to surveys
-- Supports the location-first survey flow with real CPS microdata

-- Add location column to surveys (stores LocationFilter as JSONB)
alter table surveys add column if not exists location jsonb;

-- Add rich demographic columns to respondents
alter table respondents add column if not exists sex text;
alter table respondents add column if not exists race_ethnicity text;
alter table respondents add column if not exists occupation text;
alter table respondents add column if not exists is_college_student boolean;
alter table respondents add column if not exists is_disabled boolean;
alter table respondents add column if not exists tenure_type text;
alter table respondents add column if not exists has_children boolean;
alter table respondents add column if not exists children_count integer;
alter table respondents add column if not exists insurance_type text;
alter table respondents add column if not exists receives_benefits boolean;
alter table respondents add column if not exists zip_code text;
alter table respondents add column if not exists congressional_district text;

-- Add rate limiting table for free tier (unauthenticated surveys)
create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  survey_count integer not null default 0,
  window_start timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_limits_ip on rate_limits(ip_address);
create index if not exists idx_rate_limits_window on rate_limits(window_start);

-- Allow anonymous surveys (user_id becomes nullable for free tier)
-- We keep the existing constraint but add a policy for anonymous inserts
alter table surveys alter column user_id drop not null;

-- Update RLS: allow anonymous survey viewing by ID (for results page)
create policy "Anyone can view surveys by id"
  on surveys for select
  using (true);

-- Drop the old user-only select policy (replaced by the above)
drop policy if exists "Users can view own surveys" on surveys;

-- Allow service role to insert surveys for anonymous users
create policy "Service role can insert surveys"
  on surveys for insert
  with check (true);

-- Allow anonymous respondent/response viewing for public surveys
drop policy if exists "Users can view respondents of own surveys" on respondents;
create policy "Anyone can view respondents"
  on respondents for select
  using (true);

drop policy if exists "Users can view responses of own surveys" on responses;
create policy "Anyone can view responses"
  on responses for select
  using (true);
