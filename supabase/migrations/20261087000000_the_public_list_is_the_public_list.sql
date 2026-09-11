-- Reviews Phase 2 — the reveal boundary reaches the LIST, not just the policy.
--
-- ══ THE AUTHOR SEES THEIR OWN BLIND REVIEW ON THE PUBLIC PROFILE ══════════
--
-- `provider_reviews_read` is `using (auth.uid() = reviewer_user_id or
-- provider_review_revealed(booking_id))`. As a PRIVACY boundary that is exactly
-- right — a reviewer must be able to read back what they wrote. But
-- `fetchRevealedProviderReviews()` uses that policy as its definition of "the
-- public review list", and deliberately does not re-filter (with good reason: an
-- earlier client-side filter dropped real rows for readers whose RLS-blocked
-- reads of `bookings`/`client_reviews` made the reveal sets empty).
--
-- So the reviewer, inside their own blind window, opens the provider's profile
-- and sees their not-yet-public review listed, rendered identically to a public
-- one, and counted. `app/post-booking/submitted.tsx` tells them the review stays
-- private until the counterpart reviews or the window closes — and then offers
-- "View {name}'s Profile" one tap below. The product contradicts its own promise
-- in two screens.
--
-- ── WHY A FUNCTION AND NOT A NARROWER POLICY ──────────────────────────────
--
-- Narrowing the policy would break the author's legitimate read of their own
-- review, which is a different requirement and one the blind window depends on.
-- The two questions are genuinely different — *may I read this row* and *is this
-- row public* — and only the second one belongs to a public list.
--
-- This discloses NOTHING new. It returns the ids of reviews that are already
-- readable by everyone, including `anon`, through the same predicate the read
-- policy uses. It cannot answer anything about a blind review: an unrevealed
-- review is simply absent, exactly as it is absent from a stranger's read.
create or replace function public.revealed_provider_review_ids(p_provider_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id
    from public.provider_reviews pr
   where pr.provider_id = p_provider_id
     and public.provider_review_revealed(pr.booking_id);
$$;

alter function public.revealed_provider_review_ids(uuid) owner to postgres;
revoke all on function public.revealed_provider_review_ids(uuid) from public;
grant execute on function public.revealed_provider_review_ids(uuid)
  to anon, authenticated, service_role;

comment on function public.revealed_provider_review_ids(uuid) is
  'The ids of a provider''s reviews that are PUBLIC, by the same predicate the '
  'read policy uses. Exists because the read policy answers "may I read this '
  'row" — which correctly includes the author''s own blind review — while a '
  'public review LIST needs "is this row public". Discloses nothing new: every '
  'id it returns is already readable by anon. An unrevealed review is absent, '
  'exactly as it is for a stranger.';
