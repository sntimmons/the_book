-- feature_interest: the in-app demand survey behind the "coming soon" preview
-- screens. Each time a tester taps "I'd use this" on a preview, the app inserts
-- one row { user_id, feature_name }. The UNIQUE (user_id, feature_name) keeps it
-- to one vote per user per feature.
--
-- Run this in the Supabase SQL editor BEFORE testing. Until it exists, the app
-- still works: the interest write fails silently and the button stays confirmed.

create table if not exists public.feature_interest (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  feature_name text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, feature_name)
);

alter table public.feature_interest enable row level security;

-- A signed-in user may record interest only as themselves.
create policy "Users can insert their own interest"
  on public.feature_interest
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- A signed-in user may read only their own interest (so the button can show the
-- confirmed state again on re-open).
create policy "Users can read their own interest"
  on public.feature_interest
  for select
  to authenticated
  using (user_id = auth.uid());

-- Founder: to see demand, query in the SQL editor (service role bypasses RLS):
--   select feature_name, count(*) as votes
--   from public.feature_interest
--   group by feature_name
--   order by votes desc;
