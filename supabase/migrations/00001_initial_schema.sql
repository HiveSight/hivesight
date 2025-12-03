-- HiveSight Database Schema
-- Clean rebuild from scratch

-- No extensions needed - using gen_random_uuid() which is built-in

-- Enums
create type subscription_tier as enum ('free', 'basic', 'premium');
create type survey_status as enum ('pending', 'processing', 'completed', 'failed');
create type response_type as enum ('likert', 'open_ended');
create type likert_scale as enum ('strongly_disagree', 'disagree', 'neutral', 'agree', 'strongly_agree');
create type transaction_type as enum ('grant', 'usage', 'purchase', 'refund');

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  tier subscription_tier not null default 'free',
  credit_balance integer not null default 100,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Surveys (the questions users ask)
create table surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  question text not null,
  response_type response_type not null,
  model text not null,
  hive_size integer not null,
  demographic_filters jsonb not null default '{}',
  status survey_status not null default 'pending',
  credits_used integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Respondents (simulated personas)
create table respondents (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  age integer not null,
  income integer not null,
  state text not null,
  weight numeric,
  created_at timestamptz not null default now()
);

-- Responses (LLM responses from personas)
create table responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  respondent_id uuid not null references respondents(id) on delete cascade,
  likert_response likert_scale,
  open_ended_response text,
  reasoning text,
  created_at timestamptz not null default now()
);

-- Credit transactions
create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount integer not null,
  type transaction_type not null,
  description text,
  survey_id uuid references surveys(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index idx_surveys_user_id on surveys(user_id);
create index idx_surveys_status on surveys(status);
create index idx_respondents_survey_id on respondents(survey_id);
create index idx_responses_survey_id on responses(survey_id);
create index idx_responses_respondent_id on responses(respondent_id);
create index idx_credit_transactions_user_id on credit_transactions(user_id);

-- Row Level Security
alter table profiles enable row level security;
alter table surveys enable row level security;
alter table respondents enable row level security;
alter table responses enable row level security;
alter table credit_transactions enable row level security;

-- Profiles policies
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Surveys policies
create policy "Users can view own surveys"
  on surveys for select
  using (auth.uid() = user_id);

create policy "Users can create surveys"
  on surveys for insert
  with check (auth.uid() = user_id);

create policy "Users can update own surveys"
  on surveys for update
  using (auth.uid() = user_id);

-- Respondents policies
create policy "Users can view respondents of own surveys"
  on respondents for select
  using (
    exists (
      select 1 from surveys
      where surveys.id = respondents.survey_id
      and surveys.user_id = auth.uid()
    )
  );

create policy "Service role can insert respondents"
  on respondents for insert
  with check (true);

-- Responses policies
create policy "Users can view responses of own surveys"
  on responses for select
  using (
    exists (
      select 1 from surveys
      where surveys.id = responses.survey_id
      and surveys.user_id = auth.uid()
    )
  );

create policy "Service role can insert responses"
  on responses for insert
  with check (true);

-- Credit transactions policies
create policy "Users can view own transactions"
  on credit_transactions for select
  using (auth.uid() = user_id);

-- Function to create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  -- Grant initial credits
  insert into credit_transactions (user_id, amount, type, description)
  values (new.id, 100, 'grant', 'Welcome bonus');

  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at_column();
