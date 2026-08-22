-- feature_interest_count: aggregate demand for a single "coming soon" feature.
--
-- The feature_interest table's RLS only lets a user read their OWN rows, so the
-- app cannot count total votes with a plain select (it would only ever see 0/1).
-- This SECURITY DEFINER function runs with the owner's rights, bypassing RLS to
-- return the true global count — but it exposes ONLY the aggregate number, never
-- any user_id, so no PII leaks.
--
-- Run this in the Supabase SQL editor AFTER feature_interest.sql. Until it
-- exists, the preview screens still work: the rpc call fails silently and no
-- "X people interested" line is shown.

create or replace function public.feature_interest_count(p_feature_name text)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.feature_interest
  where feature_name = p_feature_name;
$$;

-- Anyone in the app (signed in or not) may read the aggregate count.
grant execute on function public.feature_interest_count(text) to authenticated, anon;
