-- Allow updating anonymous surveys (user_id is null)
-- The existing "Users can update own surveys" policy uses auth.uid() = user_id
-- which fails for anonymous surveys since null = null is false in SQL

drop policy if exists "Users can update own surveys" on surveys;

create policy "Anyone can update surveys"
  on surveys for update
  using (true);

-- Also allow service role to update respondents (for adding responses)
create policy "Service role can update respondents"
  on respondents for update
  using (true);

-- Allow service role to insert/update responses
create policy "Anyone can insert responses"
  on responses for insert
  with check (true);
