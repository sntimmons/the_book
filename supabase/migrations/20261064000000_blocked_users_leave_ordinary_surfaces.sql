-- Session 8C — PD-089. A BLOCKED PERSON DISAPPEARS FROM ORDINARY SURFACES.
--
-- ══ THE PLAN, AND WHY IT IS NOT AN RLS POLICY ═════════════════════════════
--
-- PD-089 requires SYMMETRIC hiding: blocked users disappear from EACH OTHER'S
-- ordinary discovery, community and content surfaces. Symmetric is the hard
-- word. A policy on `providers` can see the caller's OWN blocks — RLS on
-- `user_blocks` scopes reads to `blocker_user_id = auth.uid()` — but it cannot
-- see a block made AGAINST the caller without bypassing that, which means a
-- `SECURITY DEFINER` predicate, which a policy can only use if it is
-- `EXECUTE`-granted to `authenticated`.
--
-- **That is the thing `20261055000000` forbids, in writing:** *"Do not grant
-- this to a client role to satisfy an RLS policy; put the check in a trigger
-- instead."* There is no trigger seam on a read, and the Founder ruling on
-- PD-089 rejected re-granting such a predicate outright: PD-087 permits a block
-- to be INFERABLE through normal product behaviour, and does not authorise an
-- explicit per-target oracle a client can probe.
--
-- ── SO THE FILTER RETURNS CONTENT, NOT AN ANSWER ──────────────────────────
--
-- Two `SECURITY DEFINER` views. The caller selects rows from them exactly as it
-- selected rows from the tables — same columns, same filters, same ordering,
-- same pagination — and an absent row is indistinguishable from a row that was
-- deleted, deactivated, never created, or filtered by any other predicate. There
-- is nothing to probe, because there is no question to ask: you cannot request
-- "is X hidden from me", only "show me what I can see".
--
-- ── THE MINIMUM REFACTOR, WHICH IS THE POINT OF USING VIEWS ───────────────
--
-- A view keeps every existing query shape. The client change is the table name
-- and nothing else — no new RPC signature, no re-implementation of search
-- grammar, filters, ordering or pagination, and no risk of a rewritten query
-- quietly behaving differently. This was chosen over a `discover_providers(...)`
-- RPC for exactly that reason.
--
-- ══ WHICH READS CHANGE, AND WHICH DELIBERATELY DO NOT ═════════════════════
--
-- CHANGED — the ordinary surfaces PD-089 names:
--   * provider discovery pool, the paginated provider list, provider search
--   * the community feed, bookmarked feed, a post's detail, a post's replies
--
-- UNCHANGED, and each for a reason:
--   * **A provider profile opened directly** (`useProvider(id)`). Not a feed —
--     it is reached from a saved provider, a message thread or a past booking,
--     all of which PD-089 preserves. Hiding it would also ANNOUNCE: a profile
--     that 404s for one person and not another is a louder signal than a card
--     missing from a list.
--   * **Every booking, message-thread, review, contract and own-business read.**
--     These are the "narrow existing transaction/history access" PD-089
--     preserves. A blocked pair mid-booking must still see each other's name,
--     terms and appointment, or the block strands the trade — the same
--     principle as the live-transaction messaging exception in PD-082.
--   * **`getLiveCount()`**, an aggregate with no identity in it.
--   * **Operator and service paths.** `auth.uid()` is null for `service_role`
--     and no-claims sessions, so the predicate is vacuously true and they see
--     everything. An operator handling a report about a person they happen to
--     have blocked must still be able to see them.
--
-- ══ WHAT A DEFINER VIEW COSTS, AND HOW THAT IS PAID ═══════════════════════
--
-- `security_invoker = false` means the view runs as its owner and BYPASSES the
-- underlying table's RLS and column grants. That is the whole mechanism and it
-- is also the danger: the ledger records that recreating `my_barter_obligations`
-- without `security_invoker = true` would be "a silent, total RLS read bypass".
--
-- So these views are built to expose EXACTLY the public column set each surface
-- already reads, and nothing else. `providers` carries column-level grants from
-- `20261030000000` precisely so private columns stay private; the view lists the
-- same 27 public columns explicitly rather than `select *`, so a column added to
-- the table later is NOT automatically published. B5B pins both the column set
-- and `security_invoker = false`.

-- ── 1. PROVIDERS, MINUS ANYONE THE CALLER IS BLOCKED WITH ─────────────────
create or replace view public.providers_visible
with (security_invoker = false) as
select
  p.id, p.user_id, p.display_name, p.business_name, p.username,
  p.category_id, p.custom_category, p.bio, p.location, p.neighborhood,
  p.profile_photo_url, p.cover_image_url, p.rating, p.average_rating,
  p.review_count, p.total_bookings, p.repeat_client_rate, p.follower_count,
  p.next_available, p.is_trending, p.is_featured, p.is_approved, p.is_demo,
  p.years_experience, p.specialties, p.created_at
from public.providers p
where not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = p.user_id)
);

alter view public.providers_visible owner to postgres;
revoke all on public.providers_visible from public;
-- `anon` too: an unauthenticated caller has no `auth.uid()`, the NOT EXISTS is
-- vacuously true, and they see the same public set they always did.
grant select on public.providers_visible to anon, authenticated;

comment on view public.providers_visible is
  'PD-089. The public provider columns, MINUS anyone the caller is blocked with '
  'in either direction. Ordinary discovery, the provider list and search read '
  'this; bookings, message threads, reviews, contracts, own-business reads and a '
  'directly-opened profile deliberately still read public.providers, because '
  'those are the narrow transaction and history access PD-089 preserves. '
  'security_invoker = false is LOAD-BEARING — it is how the filter sees a block '
  'made AGAINST the caller, which RLS on user_blocks hides — and it is also why '
  'the column list is written out rather than select *: a column added to '
  'providers later must not become public by accident.';

-- ── 2. COMMUNITY POSTS, SAME RULE ─────────────────────────────────────────
create or replace view public.community_posts_visible
with (security_invoker = false) as
select
  cp.id, cp.provider_id, cp.user_id, cp.content, cp.category,
  cp.like_count, cp.reply_count, cp.created_at, cp.is_active
from public.community_posts cp
where not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
);

alter view public.community_posts_visible owner to postgres;
revoke all on public.community_posts_visible from public;
grant select on public.community_posts_visible to anon, authenticated;

comment on view public.community_posts_visible is
  'PD-089. Community posts, MINUS anyone the caller is blocked with in either '
  'direction. The feed, the bookmarked feed and a post''s detail read this. '
  'Posts are content, so hiding is symmetric and complete rather than partial — '
  'a blocked pair does not see each other in the feed, and neither can tell '
  'whether a given post is absent because of a block, a deletion or a filter.';

-- ── 3. REPLIES, BECAUSE A THREAD IS A SURFACE TOO ─────────────────────────
--
-- Hiding a post but leaving its author's REPLIES under someone else's post would
-- deliver half of PD-089 and read as a bug.
create or replace view public.community_replies_visible
with (security_invoker = false) as
select
  cr.id, cr.post_id, cr.user_id, cr.provider_id, cr.content, cr.created_at
from public.community_replies cr
where not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cr.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cr.user_id)
);

alter view public.community_replies_visible owner to postgres;
revoke all on public.community_replies_visible from public;
grant select on public.community_replies_visible to anon, authenticated;

comment on view public.community_replies_visible is
  'PD-089. Replies, minus anyone the caller is blocked with. Separate from the '
  'post view because hiding a post while leaving its author''s replies under '
  'someone else''s post would deliver half the rule and read as a bug.';

-- ── 4. NONE OF THESE IS A WRITE PATH ──────────────────────────────────────
--
-- A simple view over one table is auto-updatable in Postgres, which would make
-- these an INSERT/UPDATE/DELETE route that bypasses the underlying RLS entirely.
-- Only SELECT is granted above, and B5B asserts a write through each one is
-- refused — the same property `my_barter_obligations` pins, for the same reason.
