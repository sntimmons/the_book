-- Phase 1 UX: one server-authoritative read helper so the UI can accurately
-- represent a review opportunity WITHOUT duplicating the Phase 0 window/reveal
-- logic in client TypeScript. Additive read-only RPC; the Phase 0 eligibility /
-- reveal / write contract is unchanged.
--
-- review_opportunity(booking_id, direction) → one of:
--   'not_participant'   caller is not the relevant party for this booking/direction (no info leak)
--   'not_completed'     the booking has not reached a completed state
--   'already_submitted' the caller has already submitted their review for this booking
--   'under_review'      booking is under_review — submission paused, reveal held
--   'window_closed'     the 7-day review window has closed — no new submission
--   'eligible'          the caller may submit now
--
-- direction:
--   'client_to_provider' — the client reviews the provider (writes provider_reviews)
--   'provider_to_client' — the provider reviews the client (writes client_reviews)

create or replace function public.review_opportunity(
  p_booking_id uuid,
  p_direction text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_uid uuid := auth.uid();
  v_is_participant boolean := false;
  v_already boolean := false;
begin
  -- SEC-AUTHZ-001: fail CLOSED for an unidentified caller. `auth.uid() = user_id`
  -- evaluates to NULL (not false) when auth.uid() is null, and PL/pgSQL treats a
  -- NULL `if` condition as false — so `if not v_is_participant` would NOT fire and
  -- execution would fall through to the state branches. Return before any read.
  if v_uid is null then
    return 'not_participant';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    return 'not_participant';
  end if;

  if p_direction = 'client_to_provider' then
    v_is_participant := (v_uid = v_booking.user_id);
    v_already := exists (
      select 1 from public.provider_reviews pr
      where pr.booking_id = p_booking_id and pr.reviewer_user_id = v_uid
    );
  elsif p_direction = 'provider_to_client' then
    v_is_participant := exists (
      select 1 from public.providers p
      where p.id = v_booking.provider_id and p.user_id = v_uid
    );
    v_already := exists (
      select 1 from public.client_reviews cr
      where cr.booking_id = p_booking_id
        and cr.reviewer_provider_id = v_booking.provider_id
    );
  else
    return 'not_participant';
  end if;

  if not coalesce(v_is_participant, false) then
    return 'not_participant';
  end if;

  -- no_show is handled by the completed_at anchor below, NOT by a live-status test.
  -- A booking that never completed has completed_at IS NULL, so a real no_show already
  -- resolves to 'not_completed' — which is the approved product rule (a no-show is not a
  -- completed service, so there is no service-quality review to leave).
  --
  -- We deliberately do NOT test `status = 'no_show'` here. completed_at is stamped once
  -- and immutable, and the Phase 0 no_show branch forbids CHANGING it rather than clearing
  -- it, so a booking completed and THEN flipped to no_show keeps a non-null completed_at.
  -- Testing live status would make that flip suppress an already-earned review — exactly
  -- the vector Phase 0 closed as SEC-DATA-101 ("anchored on the immutable, server-stamped
  -- completed_at, NOT live status, so a provider cannot block a client's review by
  -- transitioning a completed booking to no_show"). It would also disagree with
  -- review_eligible(), which the INSERT policies use and which has no status test.
  -- DECIDED (migration 20260904000000): completed -> no_show is an ILLEGAL transition,
  -- rejected at the write boundary, so that contradictory state is now UNREACHABLE and
  -- this helper and review_eligible() agree by construction. A genuine void on a
  -- completed booking is expressed via under_review (service_role-only).
  if v_booking.completed_at is null then
    return 'not_completed';
  end if;
  if v_already then
    return 'already_submitted';
  end if;
  if v_booking.under_review then
    return 'under_review';
  end if;
  if public.review_window_closed(p_booking_id) then
    return 'window_closed';
  end if;

  -- CODE-DUP-001: the positive answer defers to the SAME predicate the INSERT
  -- policies use, so this read helper can never report 'eligible' for a booking the
  -- write boundary would reject. The branches above exist only to explain WHY a
  -- booking is not eligible; they are not a second definition of eligibility. When
  -- review_eligible() gains a condition (delayed-deliverable delivered_at, category
  -- windows), this stays correct automatically instead of inviting the user into a
  -- form the DB will refuse.
  if not public.review_eligible(p_booking_id) then
    return 'not_completed';
  end if;
  return 'eligible';
end;
$$;

alter function public.review_opportunity(uuid, text) owner to postgres;
revoke all on function public.review_opportunity(uuid, text) from public;
-- Supabase's ALTER DEFAULT PRIVILEGES (canonical baseline) auto-grants EXECUTE to
-- anon at CREATE time; `revoke ... from public` removes only the PUBLIC pseudo-role
-- entry and leaves that DIRECT anon grant in place. Revoke it explicitly — the same
-- correction this repo already shipped for the contract helpers (20260829070000) and
-- that Phase 0 applies to its own helpers. Only signed-in participants may read this.
revoke execute on function public.review_opportunity(uuid, text) from anon;
grant execute on function public.review_opportunity(uuid, text) to authenticated;
