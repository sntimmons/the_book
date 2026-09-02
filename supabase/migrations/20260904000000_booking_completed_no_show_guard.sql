-- =============================================================================
-- Phase 1 (product decision): completed -> no_show is an ILLEGAL transition.
--
-- DECISION: `completed` and `no_show` are ALTERNATIVE outcomes of a booking. A
-- legitimately completed booking cannot later become a no-show through the normal
-- booking lifecycle.
--
-- WHY THIS IS A WRITE-BOUNDARY GUARD, NOT A READ FILTER:
-- Phase 0 (SEC-DATA-101) deliberately anchors review eligibility and reveal on the
-- immutable, server-stamped `completed_at` and NOT on live `status`, so a provider
-- cannot suppress a review by changing a booking's status. But because the Phase 0
-- no_show branch forbids CHANGING completed_at rather than clearing it, the state
-- `completed_at IS NOT NULL AND status = 'no_show'` was reachable -- and in that
-- state review_opportunity() and review_eligible() could disagree. Adding a live
-- `status` test to either predicate would have "fixed" the disagreement by handing
-- providers a permanent review kill-switch, re-opening SEC-DATA-101. Forbidding the
-- transition instead makes the contradictory state unreachable FOR AUTHENTICATED
-- WRITERS GOING FORWARD (this is a BEFORE-trigger on new writes; it does not, and
-- deliberately does not, remediate any pre-existing row, and service_role still
-- bypasses). That is sufficient: because neither review_opportunity() nor
-- review_eligible() tests live status, a legacy row in that state is treated
-- identically by both -- reviewable -- which is the intended anti-suppression
-- posture, not a divergence. review_eligible() remains the single authority; nothing about the 7-day
-- window, reveal, or under_review changes.
--
-- SCOPE: exactly one new condition, in the provider `no_show` branch of
-- enforce_booking_write_integrity(). Every other transition, field-immutability rule,
-- and role check is byte-for-byte the Phase 0 (20260902000000) definition. No table,
-- policy, index, grant, or trigger binding is touched -- the trigger already exists
-- and continues to point at this function name.
--
-- NOT BUILT HERE: an administrative correction workflow. service_role bypasses this
-- trigger entirely (the early return at the top), so ops retains a path if a genuine
-- correction is ever needed. Designing that workflow is a later product/ops concern.
-- =============================================================================

create or replace function public.enforce_booking_write_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_client   boolean;
  is_provider boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status                     := 'pending';
    new.payment_status             := 'unpaid';
    new.completed_at               := null;
    new.client_checked_in_at       := null;
    new.provider_confirmed_at      := null;
    new.provider_first_response_at := null;
    new.no_show_flag               := false;
    new.payment_finalized          := false;
    new.payment_authorized_at      := null;
    new.payment_captured_at        := null;
    new.capture_scheduled_for      := null;
    new.refund_status              := 'none';
    new.under_review               := false;
    new.dispute_flag               := false;
    new.cancelled_at               := null;
    new.cancelled_by               := null;
    new.cancellation_actor         := null;
    new.cancellation_reason        := null;
    new.stripe_payment_intent_id   := null;
    new.stripe_last_event_id       := null;
    new.stripe_last_event_at       := null;
    new.admin_resolution_notes     := null;
    new.issue_reported             := false;
    new.issue_reported_at          := null;
    new.issue_reason               := null;
    new.provider_safety_notes      := null;
    new.client_safety_notes        := null;
    return new;
  end if;

  -- tg_op = 'UPDATE'
  is_client   := (auth.uid() = old.user_id);
  is_provider := exists (
    select 1 from public.providers p
    where p.id = old.provider_id and p.user_id = auth.uid()
  );

  if new.id                       is distinct from old.id
     or new.user_id               is distinct from old.user_id
     or new.provider_id           is distinct from old.provider_id
     or new.service_id            is distinct from old.service_id
     or new.service_name          is distinct from old.service_name
     or new.requested_date        is distinct from old.requested_date
     or new.requested_time        is distinct from old.requested_time
     or new.appointment_time      is distinct from old.appointment_time
     or new.message               is distinct from old.message
     or new.created_at            is distinct from old.created_at
     or new.payment_amount        is distinct from old.payment_amount
     or new.payment_status        is distinct from old.payment_status
     or new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
     or new.payment_authorized_at is distinct from old.payment_authorized_at
     or new.payment_captured_at   is distinct from old.payment_captured_at
     or new.stripe_last_event_id  is distinct from old.stripe_last_event_id
     or new.stripe_last_event_at  is distinct from old.stripe_last_event_at
     or new.capture_scheduled_for is distinct from old.capture_scheduled_for
     or new.payment_finalized     is distinct from old.payment_finalized
     or new.refund_status         is distinct from old.refund_status
     or new.under_review          is distinct from old.under_review
     or new.dispute_flag          is distinct from old.dispute_flag
     or new.admin_resolution_notes is distinct from old.admin_resolution_notes
     or new.client_checked_in_at  is distinct from old.client_checked_in_at
     or new.cancellation_reason   is distinct from old.cancellation_reason
     or new.provider_safety_notes is distinct from old.provider_safety_notes
     or new.client_safety_notes   is distinct from old.client_safety_notes
     or new.issue_reported        is distinct from old.issue_reported
     or new.issue_reported_at     is distinct from old.issue_reported_at
     or new.issue_reason          is distinct from old.issue_reason
  then
    raise exception 'Booking field is not user-editable'
      using errcode = 'check_violation';
  end if;

  if is_client and not is_provider then
    if new.status is distinct from old.status and new.status <> 'cancelled_by_client' then
      raise exception 'Clients may only author status cancelled_by_client'
        using errcode = 'check_violation';
    end if;
    if new.provider_confirmed_at      is distinct from old.provider_confirmed_at
       or new.provider_first_response_at is distinct from old.provider_first_response_at
       or new.completed_at            is distinct from old.completed_at
       or new.no_show_flag            is distinct from old.no_show_flag
    then
      raise exception 'Clients may not set provider-controlled booking fields'
        using errcode = 'check_violation';
    end if;
    if new.status = 'cancelled_by_client' then
      if new.cancellation_actor is distinct from 'client' then
        raise exception 'cancellation_actor must be client' using errcode = 'check_violation';
      end if;
      if new.cancelled_by is not null and new.cancelled_by <> auth.uid()::text then
        raise exception 'cancelled_by must be the cancelling client' using errcode = 'check_violation';
      end if;
    end if;

  elsif is_provider then
    if new.status is distinct from old.status
       and new.status not in ('accepted', 'cancelled_by_provider', 'completed', 'no_show') then
      raise exception 'Providers may not author status %', new.status
        using errcode = 'check_violation';
    end if;
    if new.status = 'accepted' then
      if new.completed_at        is distinct from old.completed_at
         or new.cancelled_at     is distinct from old.cancelled_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'Only accept fields may change when accepting' using errcode = 'check_violation'; end if;

    elsif new.status = 'cancelled_by_provider' then
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.completed_at     is distinct from old.completed_at
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'Only provider-cancel fields may change when cancelling' using errcode = 'check_violation'; end if;
      if new.cancellation_actor is distinct from 'provider' then
        raise exception 'cancellation_actor must be provider' using errcode = 'check_violation'; end if;
      if new.cancelled_by is not null and new.cancelled_by <> auth.uid()::text then
        raise exception 'cancelled_by must be the cancelling provider' using errcode = 'check_violation'; end if;

    elsif new.status = 'completed' then
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.provider_first_response_at is distinct from old.provider_first_response_at
         or new.cancelled_at     is distinct from old.cancelled_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'Only completed_at may change when completing' using errcode = 'check_violation'; end if;
      -- SEC-DATA-003 / SEC-DATA-201: completed_at is SERVER-authoritative and
      -- stamped exactly ONCE — on the FIRST-EVER completion. Keying on
      -- `old.completed_at is null` (not `old.status <> 'completed'`) means a status
      -- round-trip (completed → accepted/no_show → completed) can NOT re-stamp it:
      -- completed_at survives those transitions (each branch forbids changing it), so
      -- on any later re-completion it is already set and is held immutable. This keeps
      -- the review window and any achieved reveal from being reset by a provider.
      if old.completed_at is null then
        -- first completion: stamp server time, ignore any supplied value.
        new.completed_at := now();
      else
        -- already completed at some point: the review-clock anchor is immutable.
        if new.completed_at is distinct from old.completed_at then
          raise exception 'completed_at is immutable once set' using errcode = 'check_violation';
        end if;
      end if;

    elsif new.status = 'no_show' then
      -- SEC-LIFECYCLE-001 / PRODUCT: `completed` and `no_show` are ALTERNATIVE booking
      -- outcomes, so completed -> no_show is an ILLEGAL transition. completed_at is the
      -- server-stamped, stamp-once, immutable record that the service DID happen, so a
      -- non-null value is the authoritative marker of a prior completion (the no_show
      -- branch forbids CHANGING completed_at rather than clearing it, so it survives).
      --
      -- This closes the review-suppression vector at the WRITE boundary, which is where
      -- it belongs: without it a provider could flip a completed booking to no_show to
      -- make the client's review entry disappear. Enforcing it here (rather than adding
      -- a live-status test to review_eligible()/review_opportunity()) keeps SEC-DATA-101
      -- intact -- eligibility and reveal stay anchored on the immutable completed_at, so
      -- an earned review can never be revoked by a status change -- and makes the
      -- contradictory state completed_at IS NOT NULL AND status='no_show' unreachable
      -- for authenticated writers going forward, rather than merely unrepresented in
      -- the UI. No pre-existing row is rewritten by this migration.
      --
      -- NARROW BY DESIGN: only this transition is added. No other transition's legality
      -- is changed. service_role still bypasses this whole trigger (early return above),
      -- so a future admin/ops correction workflow remains possible; that workflow is a
      -- later product/ops concern and is deliberately NOT built here. A genuine dispute
      -- or void on a completed booking is expressed via under_review (service_role-only),
      -- which already blocks submission and holds reveal.
      if old.completed_at is not null then
        raise exception 'A completed booking cannot be marked no_show'
          using errcode = 'check_violation';
      end if;
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.provider_first_response_at is distinct from old.provider_first_response_at
         or new.completed_at     is distinct from old.completed_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
      then raise exception 'Only no_show fields may change on no_show' using errcode = 'check_violation'; end if;
      if new.no_show_flag is not true then
        raise exception 'no_show requires no_show_flag = true' using errcode = 'check_violation'; end if;

    else
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.provider_first_response_at is distinct from old.provider_first_response_at
         or new.completed_at     is distinct from old.completed_at
         or new.cancelled_at     is distinct from old.cancelled_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
         or new.no_show_flag     is distinct from old.no_show_flag
      then raise exception 'No valid provider action for this update' using errcode = 'check_violation'; end if;
    end if;
  end if;

  return new;
end;
$$;
alter function public.enforce_booking_write_integrity() owner to postgres;
revoke all on function public.enforce_booking_write_integrity() from public;
