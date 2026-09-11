-- Reviews Phase 2 — the new column has to be readable, and visible.
--
-- ══ CAUGHT BY A GUARD, WHICH IS THE POINT OF THE GUARD ════════════════════
--
-- `20261077000000` added `providers.rating_client_count` and the profile started
-- reading it. `__tests__/guards/providerColumnGrant.test.ts` failed immediately:
-- the column is read by the app and **granted to nobody**, so every client read
-- of it would have been refused.
--
-- And it is the SAME SHAPE as the `is_mobile` defect from the previous session:
-- a column that exists, is meant to be public, and is missing from the surfaces
-- that publish it — where the symptom is not an error a user sees but a query
-- that fails closed and a feature that quietly does nothing.
--
-- Two surfaces, because there are two:
--   1. the column grant on `public.providers`, which is how the base table
--      publishes anything (`20261030000000`);
--   2. `public.providers_visible`, the PD-089 view, which lists its columns
--      EXPLICITLY so a new column is never published by accident — the cost of
--      that safety being that a column meant to be public must be added by hand.
grant select (rating_client_count) on public.providers to anon, authenticated;

-- APPENDED, not inserted: `create or replace view` cannot reorder or rename an
-- existing column, and dropping a view other objects may come to depend on is a
-- bigger act than adding one to the end.
create or replace view public.providers_visible
with (security_invoker = false) as
select
  p.id, p.user_id, p.display_name, p.business_name, p.username,
  p.category_id, p.custom_category, p.bio, p.location, p.neighborhood,
  p.profile_photo_url, p.cover_image_url, p.rating, p.average_rating,
  p.review_count, p.total_bookings, p.repeat_client_rate, p.follower_count,
  p.next_available, p.is_trending, p.is_featured, p.is_approved, p.is_demo,
  p.years_experience, p.specialties, p.created_at,
  p.is_mobile, p.completed_count,
  p.rating_client_count
from public.providers p
where not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = p.user_id)
);

alter view public.providers_visible owner to postgres;
revoke all on public.providers_visible from public;
grant select on public.providers_visible to anon, authenticated;
