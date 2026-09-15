-- A PROFILE IS AN ORDINARY SURFACE (CODE-DRIFT-008)
--
-- PD-089 says a blocked person disappears from each other's ordinary discovery
-- and content surfaces. Discover and search honoured that, because they read
-- `providers_visible` and `posts_visible`. The public PROVIDER PROFILE did not:
-- it read the base `providers` and `posts` tables directly, so a viewer who had
-- blocked a provider — or been blocked by one — could still open that provider's
-- profile from a saved entry, a follow, or a remembered link and see their
-- portfolio, their reels and their process shots in full.
--
-- PD-090 is NOT a licence for this. It accepts that a determined technical user
-- may INFER a block by diffing a base table against its view, and refuses to pay
-- the cost of making that inference impossible. Inferring that a block exists and
-- having the app itself serve you the blocked person's profile in ordinary
-- navigation are different things, and only the first was accepted.
--
-- The client fix is to read the views. This migration exists because one of them
-- could not answer the question the profile asks.
--
-- ── WHAT THIS CHANGES: ONE COLUMN ─────────────────────────────────────────
--
-- `posts_visible` did not expose `sort_order`, and the profile orders portfolio,
-- reels and process media by it — that ordering is the provider's own curation of
-- how their work is presented. Moving the profile onto the view without it would
-- have silently scrambled every provider's gallery into `created_at` order, or
-- worse, into no order at all.
--
-- EVERY PREDICATE IS CARRIED OVER UNCHANGED, character for character: the
-- is_active gate, the BIDIRECTIONAL block filter, and the account_unavailable
-- exclusion that covers an open deletion request, an erased account and an
-- ownerless shell. `security_invoker = false` is preserved, so the view keeps
-- applying its predicate as its postgres owner rather than as the caller — which
-- is the whole mechanism, and what `20261066000000` and `20261094000000` exist to
-- defend. The grants are restated to exactly what `20261066000000` set.
--
-- This supersedes the definition in `20261111000000`; that file is not edited.

create or replace view public.posts_visible
with (security_invoker = false) as
select p.id, p.provider_id, p.media_url, p.media_type, p.caption, p.category_id,
       p.content_type, p.is_active, p.is_demo, p.created_at, p.like_count,
       p.comment_count, p.thumbnail_url, p.service_type,
       -- The only addition. A provider's chosen order is part of how their work
       -- reads, and a visibility view that cannot express it forces the surfaces
       -- that respect it back onto the base table — which is the defect.
       p.sort_order
  from public.posts p
 where p.is_active = true
   and not exists (
     select 1 from public.providers pr
       join public.user_blocks b
         on (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = pr.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = pr.user_id)
      where pr.id = p.provider_id
   )
   and not exists (
     select 1 from public.providers pr2
      where pr2.id = p.provider_id and public.account_unavailable(pr2.user_id)
   );

alter view public.posts_visible owner to postgres;

comment on view public.posts_visible is
  'PD-089 plus PD-102. Active media posts, minus any provider the caller is '
  'blocked with in EITHER direction, and minus any provider whose owner is '
  'unavailable. Carries `sort_order` so a surface that respects the provider''s '
  'own curation does not have to fall back to the base table to get it — which '
  'is how the public profile came to bypass the block filter (CODE-DRIFT-008).';

-- Restated, not widened: identical to what 20261066000000 granted.
revoke all on public.posts_visible from public;
grant select on public.posts_visible to anon, authenticated;
