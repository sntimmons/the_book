-- Session 8C — PD-089, the surfaces the first pass did not reach.
--
-- `20261064000000` covered providers, community posts and community replies.
-- PD-089 also names **Reels / content surfaces**, and those read a DIFFERENT
-- table: `public.posts` (media), with `public.post_comments` beneath it. A rule
-- that hid someone from the community feed and left them in Reels would deliver
-- most of PD-089 and read as a bug in the half that is most visible.
--
-- ── ONE DIFFERENCE THAT MATTERS ───────────────────────────────────────────
--
-- `posts` has no `user_id` — it is owned through `provider_id` — so the filter
-- joins to `providers` to reach the person. Blocking is between PEOPLE, not
-- businesses (PD-082), and the join is what keeps that true here.
--
-- ── WHAT IS DELIBERATELY NOT FILTERED ─────────────────────────────────────
--
-- A provider's OWN portfolio on their own dashboard, the portfolio shown on a
-- profile opened directly, and `attachHeroImages` — which decorates a provider
-- list that has ALREADY been filtered, so a blocked provider is never in its
-- input. Filtering it again would cost a join per card and change nothing.

create or replace view public.posts_visible
with (security_invoker = false) as
select
  p.id, p.provider_id, p.media_url, p.media_type, p.caption, p.category_id,
  p.content_type, p.is_active, p.is_demo, p.created_at, p.like_count, p.comment_count
from public.posts p
where not exists (
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

comment on view public.posts_visible is
  'PD-089. Media posts (Reels and portfolio content), minus anyone the caller is '
  'blocked with in either direction. Joins through providers because `posts` is '
  'owned by a BUSINESS and a block is between PEOPLE. Read by Reels and by the '
  'posts branch of provider search; a provider''s own dashboard and a '
  'directly-opened profile still read public.posts, because those are not '
  'ordinary discovery surfaces.';

create or replace view public.post_comments_visible
with (security_invoker = false) as
select
  pc.id, pc.post_id, pc.user_id, pc.comment_text, pc.created_at
from public.post_comments pc
where not exists (
  select 1 from public.user_blocks b
   where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = pc.user_id)
      or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = pc.user_id)
);

alter view public.post_comments_visible owner to postgres;
revoke all on public.post_comments_visible from public;
grant select on public.post_comments_visible to anon, authenticated;

comment on view public.post_comments_visible is
  'PD-089. Comments on media posts, minus anyone the caller is blocked with. '
  'Comments are the surface where a blocked person is most likely to reappear '
  'after their own content is hidden, because they arrive under somebody '
  'else''s.';
