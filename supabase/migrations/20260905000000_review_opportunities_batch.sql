-- =============================================================================
-- Foundation cleanup: make review-ENTRY availability server-authoritative in list
-- surfaces too (SEC-AUTHZ-001 / CODE-DUP-010).
--
-- PROBLEM. Phase 1 made the review SCREENS authoritative (they call
-- review_opportunity), but the list CTA and the booking-detail read were still
-- gated on live `bookings.status = 'completed'` BEFORE any authoritative read
-- happened. The DB anchors eligibility on the immutable, server-stamped
-- completed_at (SEC-DATA-101) precisely so a status change cannot revoke an
-- earned review -- so a booking whose status legitimately moved off 'completed'
-- (e.g. a provider downgrade to 'accepted', which remains a legal transition)
-- kept its review right in the DB while the UI silently withheld the entry. Two
-- definitions of "reviewable", and the client-side one was the weaker.
--
-- WHY A BATCH WRAPPER. A list cannot call review_opportunity once per row without
-- an N+1 of round trips. This function exists ONLY to amortise that. It adds NO
-- eligibility logic of its own: it is a thin fan-out over the SAME
-- public.review_opportunity(uuid, text) the screens already use, so there is
-- exactly one implementation of review-entry state in the system.
--
-- SECURITY. Deliberately SECURITY INVOKER. It runs as the caller and delegates to
-- review_opportunity, which is SECURITY DEFINER and performs its own participant,
-- direction and null-auth.uid() checks per booking. That means this wrapper grants
-- no new privilege and creates no second authorization surface -- passing a
-- stranger's booking id simply yields 'not_participant', exactly as the
-- single-booking call would. anon EXECUTE is revoked explicitly (Supabase's
-- ALTER DEFAULT PRIVILEGES grants it at CREATE time; `revoke from public` does not
-- remove that direct grant).
-- =============================================================================

create or replace function public.review_opportunities(
  p_booking_ids uuid[],
  p_direction text
)
returns table (booking_id uuid, opportunity text)
language sql
stable
security invoker
set search_path = ''
as $$
  -- No LIMIT. An earlier draft capped the fan-out at 200 rows, but a silent cap on a
  -- read that drives whether a control renders is worse than the amplification it
  -- guards against: the caller cannot tell a truncated answer from 'unknown', so an
  -- arbitrary (uuid-ordered) subset of a heavy user's bookings would quietly lose its
  -- review entry -- the exact review-suppression class this branch exists to close.
  --
  -- What actually bounds this, precisely: every element is an independent
  -- participant-checked lookup that returns 'not_participant' for a stranger's id, so
  -- the wrapper grants nothing and leaks nothing however large the array. Input
  -- de-duplication and page-scoping happen in the TypeScript caller
  -- (lib/reviews.ts, hooks/useReviewOpportunities.ts) and are CONVENTIONS, NOT server
  -- guarantees -- a direct RPC call bypasses both. If a server-side bound is ever
  -- wanted it must `raise exception` above N, never `limit`: silent truncation is the
  -- failure mode this deliberately removed.
  select b.id, public.review_opportunity(b.id, p_direction)
  from unnest(coalesce(p_booking_ids, '{}'::uuid[])) as b(id)
$$;

alter function public.review_opportunities(uuid[], text) owner to postgres;
revoke all on function public.review_opportunities(uuid[], text) from public;
revoke execute on function public.review_opportunities(uuid[], text) from anon;
grant execute on function public.review_opportunities(uuid[], text) to authenticated;
