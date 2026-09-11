-- Booking & Onboarding Integrity — requirement G, the enforceable half.
--
-- ══ THE PROBLEM, STATED AS A CLIENT'S EXPERIENCE ══════════════════════════
--
-- Go Live requires a profile photo and one active service. It does NOT require
-- any availability. So a provider can be live, approved, carrying the "Houston
-- Beta Provider" badge and a working Book Now — with **zero open days
-- configured**.
--
-- A client picks them, chooses a service, reaches the date step, and finds
-- nothing. Not an error; just an empty calendar with no explanation, on a
-- profile that looked entirely ready. That is the failure the Founder ruling
-- names: *"avoid sending clients into providers who look fully bookable but have
-- no availability configured."*
--
-- ══ THE RULE, IN THREE LAYERS, AND WHY IT IS NOT ALL ONE ══════════════════
--
-- **1. BLOCKS GO LIVE** (unchanged — this migration adds nothing here):
--    profile basics, a profile photo, and at least one active service. That is
--    the existing minimum and Item Y is explicit that onboarding stays minimal.
--
-- **2. VISIBLE BUT NOT NORMALLY BOOKABLE** (what this adds): a live provider with
--    no configured availability keeps their profile, their portfolio, their
--    reviews, their message control and every existing booking — and does not
--    present Book Now. Exactly the shape Correction 3 item H built for a
--    de-approved provider, applied to a different cause.
--
--    **This is deliberately NOT a Go Live gate.** Blocking Go Live on availability
--    would turn a recoverable, self-correcting condition into a wall during
--    onboarding, and a provider who wants to set hours later — or who is between
--    schedules — is not someone to refuse. Withdrawing one control is a narrower
--    answer than refusing the whole business.
--
-- **3. OPTIONAL, and none of it blocks anything:** portfolio, reels, analytics,
--    payouts. `20261071000000` does not read them and nothing else may start.
--
-- ══ WHAT THIS IS NOT ══════════════════════════════════════════════════════
--
-- Not a new business policy about WHAT availability must look like — no minimum
-- hours, no minimum days, no advance-notice rule. The test is only *"is there
-- any open day at all"*, because that is the difference between a calendar a
-- client can use and one that is empty. Anything stricter would be inventing
-- policy, which the ruling forbids.

create or replace function public.provider_is_bookable(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Approved for the marketplace (PD-076 / item H), AND has somewhere for a
    -- client to land. Both are necessary; neither is sufficient alone.
    coalesce((select p.is_approved from public.providers p where p.id = p_provider_id), false)
    and exists (
      select 1 from public.provider_availability a
       where a.provider_id = p_provider_id and a.is_available
    )
    and exists (
      select 1 from public.provider_services s
       where s.provider_id = p_provider_id and coalesce(s.is_active, true)
    );
$$;

alter function public.provider_is_bookable(uuid) owner to postgres;
revoke all on function public.provider_is_bookable(uuid) from public, anon;
-- Granted to clients because the PROFILE needs it to decide whether to draw Book
-- Now, and to anon because an unauthenticated visitor sees the same profile.
-- It takes a provider id and answers a fact about a PUBLIC business — whether it
-- can currently be booked — which is not private and is exactly what the profile
-- is about to display anyway. That is what separates it from the block
-- predicates, which answered about a RELATIONSHIP between two people.
grant execute on function public.provider_is_bookable(uuid) to anon, authenticated, service_role;

comment on function public.provider_is_bookable(uuid) is
  'Whether this provider can actually take a normal booking right now: approved, '
  'at least one active service, and at least one available slot in their weekly '
  'availability. Used by the profile to decide whether to present Book Now, so a '
  'provider who looks ready is ready. NOT a Go Live gate — a live provider with '
  'no hours keeps their profile, portfolio, reviews, message control and every '
  'existing booking, and only the one control that would lead to an empty '
  'calendar is withdrawn. The availability test is deliberately "is there any '
  'open day at all" and nothing stricter: minimum hours or advance-notice rules '
  'would be inventing policy.';
