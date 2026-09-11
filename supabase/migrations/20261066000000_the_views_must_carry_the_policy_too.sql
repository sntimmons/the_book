-- FORWARD CORRECTION to 20261064000000 / 20261065000000 (Session 8C, PD-089).
--
-- ══ WHAT I GOT WRONG, AND IT IS THE WHOLE COST OF A DEFINER VIEW ══════════
--
-- `security_invoker = false` bypasses the base table's RLS **and** its column
-- grants. `20261064000000`'s own header says so, and then pays only HALF the
-- bill: it audits the COLUMN list carefully — no private `providers` column
-- rides in — and never audits the POLICY each base table was carrying.
--
-- Three of the five do not have `USING (true)`:
--
--   * `community_posts_provider_read`   — USING (auth.uid() IN (select user_id from providers))
--   * `community_replies_provider_read` — the same
--   * `posts_public_read`               — USING (is_active = true)
--
-- The views dropped all three, and `20261064000000` then granted SELECT to
-- **`anon`**. So the provider-only community hub — post and reply bodies, author
-- ids, categories, timestamps, and soft-hidden `is_active = false` rows — became
-- readable by anyone holding the public anon key, with no account at all. That is
-- a surface the schema deliberately gated, opened as a side effect of a
-- block-filtering change.
--
-- **The rule this establishes:** a `_visible` view must carry its base table's
-- OWN read predicate in addition to the block filter. Anything else is not a
-- filter, it is a bypass with a filter attached. A subset test is added to B5B —
-- for every `_visible` view and every role, the rows it returns must be a SUBSET
-- of what that role could read from the base table — because that ONE property
-- catches this whole class and would have caught all three of these.
--
-- ── AND TWO COLUMN OMISSIONS THAT BROKE SHIPPED FEATURES ──────────────────
--
-- `providers_visible` omitted `is_mobile`, so the "Mobile only" search filter —
-- which Correction 3 item M restored after it had been removed once — issued a
-- filter on a column the view does not have and failed closed on every query.
-- `posts_visible` omitted `thumbnail_url` and `service_type`, which the content
-- search selects and filters on, so that branch returned nothing, always, with
-- only a console line. `20261064000000`'s comment claimed "the same 27 public
-- columns"; it listed 26, and the grant has 28.

-- ── 1. The community views carry the provider-only gate ───────────────────
create or replace view public.community_posts_visible
with (security_invoker = false) as
select
  cp.id, cp.provider_id, cp.user_id, cp.content, cp.category,
  cp.like_count, cp.reply_count, cp.created_at, cp.is_active
from public.community_posts cp
where exists (
  -- The base table's own policy, restated. The community hub is provider-only
  -- and stays provider-only.
  select 1 from public.providers pr where pr.user_id = (select auth.uid())
)
and not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
);

alter view public.community_posts_visible owner to postgres;
revoke all on public.community_posts_visible from public, anon;
-- NOT granted to `anon`. An unauthenticated caller has no `auth.uid()`, so the
-- provider gate above already returns nothing — but the grant is removed as
-- well, because two refusals are the standard here and the first version of this
-- view proved why.
grant select on public.community_posts_visible to authenticated;

create or replace view public.community_replies_visible
with (security_invoker = false) as
select
  cr.id, cr.post_id, cr.user_id, cr.provider_id, cr.content, cr.created_at
from public.community_replies cr
where exists (
  select 1 from public.providers pr where pr.user_id = (select auth.uid())
)
and not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cr.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cr.user_id)
);

alter view public.community_replies_visible owner to postgres;
revoke all on public.community_replies_visible from public, anon;
grant select on public.community_replies_visible to authenticated;

-- ── 2. `posts_visible` carries `is_active = true`, and the missing columns ─
create or replace view public.posts_visible
with (security_invoker = false) as
select
  p.id, p.provider_id, p.media_url, p.media_type, p.caption, p.category_id,
  p.content_type, p.is_active, p.is_demo, p.created_at, p.like_count,
  p.comment_count,
  -- APPENDED, not inserted: `create or replace view` cannot rename or reorder an
  -- existing column, so a new one goes on the end or the view has to be dropped
  -- — and dropping a view that other objects may come to depend on is a bigger
  -- act than adding a column.
  p.thumbnail_url, p.service_type
from public.posts p
where p.is_active = true
and not exists (
  select 1
    from public.providers pr
    join public.user_blocks b
      on (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = pr.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = pr.user_id)
   where pr.id = p.provider_id
);

alter view public.posts_visible owner to postgres;
revoke all on public.posts_visible from public;
grant select on public.posts_visible to anon, authenticated;

-- ── 3. `providers_visible` gains the two columns it dropped ───────────────
create or replace view public.providers_visible
with (security_invoker = false) as
select
  p.id, p.user_id, p.display_name, p.business_name, p.username,
  p.category_id, p.custom_category, p.bio, p.location, p.neighborhood,
  p.profile_photo_url, p.cover_image_url, p.rating, p.average_rating,
  p.review_count, p.total_bookings, p.repeat_client_rate, p.follower_count,
  p.next_available, p.is_trending, p.is_featured, p.is_approved, p.is_demo,
  p.years_experience, p.specialties, p.created_at,
  -- Both were in the public column grant and both were dropped by accident.
  -- `is_mobile` backs a shipped search filter; `completed_count` is read by the
  -- card. A filtered or ordered column needs to be present, not merely granted.
  p.is_mobile, p.completed_count
from public.providers p
where not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = p.user_id)
);

alter view public.providers_visible owner to postgres;
revoke all on public.providers_visible from public;
grant select on public.providers_visible to anon, authenticated;

-- ── 4. The barter board, which PD-089 names and the first pass missed ─────
--
-- PD-089's own "Why" cites this surface: a blocker kept seeing the blocked
-- party's offers, could still tap Respond, and got a refusal that pointed them at
-- their OWN eligibility — a false lead about themselves. Filtering the provider
-- NAMES without filtering the OFFERS made it worse: the card survived, rendered
-- as an anonymous "Provider", and still offered Respond.
create or replace view public.barter_offers_visible
with (security_invoker = false) as
select
  o.id, o.provider_id, o.user_id, o.offering_service, o.seeking_service,
  o.notes, o.is_active, o.created_at
from public.barter_offers o
where exists (
  -- `barter_offers_provider_read` is provider-only, like the community hub.
  select 1 from public.providers pr where pr.user_id = (select auth.uid())
)
and not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = o.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = o.user_id)
);

alter view public.barter_offers_visible owner to postgres;
revoke all on public.barter_offers_visible from public, anon;
grant select on public.barter_offers_visible to authenticated;

comment on view public.barter_offers_visible is
  'PD-089. The barter board, minus anyone the caller is blocked with. Carries '
  '`barter_offers_provider_read`''s provider-only gate as well as the block '
  'filter — a _visible view must restate its base table''s own read predicate, '
  'because security_invoker = false drops it. Offers are filtered, not merely '
  'their author''s name: a nameless card that still offers Respond is worse than '
  'no filtering at all.';

comment on view public.community_posts_visible is
  'PD-089. Community posts, minus anyone the caller is blocked with in either '
  'direction, AND minus everything if the caller is not a provider — the hub is '
  'provider-only and `security_invoker = false` drops that policy unless the view '
  'restates it. 20261064000000 did not, and granted this to anon, which made the '
  'whole hub world-readable. Not granted to anon any more.';


