-- =============================================================================
-- Security Batch 3b: booking write integrity (security-critical subset)
-- =============================================================================
-- Closes the booking write holes:
--   * INSERT: a client could seed status='completed', payment_status='captured',
--     completed_at / no_show_flag / payment_finalized, etc.
--   * UPDATE: a provider could change payment_amount/payment_status/status/
--     no_show_flag and reassign user_id (tautological col=col WITH CHECK).
--   * Client cancel was dead (policy required an invalid status='cancelled').
--
-- Mechanism: RLS for row/actor ownership + a BEFORE INSERT/UPDATE trigger for
-- OLD-vs-NEW field integrity and actor+action authorship. RLS cannot compare
-- OLD/NEW; column grants cannot distinguish client vs provider (both are role
-- `authenticated`). No tautological WITH CHECK. service_role bypasses. Only
-- public.bookings is touched.
--
-- This migration enforces ACTOR + ACTION -> allowed fields/status AUTHORSHIP
-- (write integrity). It does NOT impose transition ORDERING or lifecycle rules.
-- DEFERRED (product decisions, NOT enforced here): strict transition ordering
-- (e.g. requiring pending->accepted->completed), terminal-state semantics,
-- reschedule lifecycle, arriving/checked_in ordering, late-cancellation
-- semantics, reopening. payment_amount remains client-supplied at INSERT
-- (payment/pricing architecture debt); this migration only locks it vs UPDATE.
--
-- Status authorship allowlists (derived from the actual current app writes):
--   client   : cancelled_by_client
--   provider : accepted, cancelled_by_provider, completed, no_show
-- No other status may be authored by an authenticated actor via UPDATE.
--
-- Only these operational fields are ever mutable by an authenticated actor, and
-- only for the matching action: status, provider_confirmed_at,
-- provider_first_response_at, completed_at, cancelled_at, cancelled_by,
-- cancellation_actor, no_show_flag. Every other column is immutable to
-- authenticated actors (fields not written by any current app flow -- e.g.
-- client_checked_in_at, cancellation_reason, provider_safety_notes,
-- client_safety_notes, issue_* -- are intentionally left immutable; future
-- features may open them with their own design).
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
    -- Force safe initial state; neutralize any seeded privileged/derived fields.
    -- (user_id is separately enforced by the INSERT RLS policy: auth.uid()=user_id.)
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
    -- payment_amount intentionally left as supplied (documented payment debt).
    return new;
  end if;

  -- tg_op = 'UPDATE'
  is_client   := (auth.uid() = old.user_id);
  is_provider := exists (
    select 1 from public.providers p
    where p.id = old.provider_id and p.user_id = auth.uid()
  );

  -- (a) Immutable for authenticated actors: identity, scheduling, financial,
  --     admin, and every field not written by a current app flow.
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

  -- (b) Actor + action authorship of status and the operational fields.
  if is_client and not is_provider then
    -- Client may only author 'cancelled_by_client'.
    if new.status is distinct from old.status and new.status <> 'cancelled_by_client' then
      raise exception 'Clients may only author status cancelled_by_client'
        using errcode = 'check_violation';
    end if;
    -- Client may not write provider-controlled operational fields.
    if new.provider_confirmed_at      is distinct from old.provider_confirmed_at
       or new.provider_first_response_at is distinct from old.provider_first_response_at
       or new.completed_at            is distinct from old.completed_at
       or new.no_show_flag            is distinct from old.no_show_flag
    then
      raise exception 'Clients may not set provider-controlled booking fields'
        using errcode = 'check_violation';
    end if;
    -- Companion-field validation on cancel.
    if new.status = 'cancelled_by_client' then
      if new.cancellation_actor is distinct from 'client' then
        raise exception 'cancellation_actor must be client' using errcode = 'check_violation';
      end if;
      if new.cancelled_by is not null and new.cancelled_by <> auth.uid()::text then
        raise exception 'cancelled_by must be the cancelling client' using errcode = 'check_violation';
      end if;
    end if;

  elsif is_provider then
    -- Provider status authorship allowlist.
    if new.status is distinct from old.status
       and new.status not in ('accepted', 'cancelled_by_provider', 'completed', 'no_show') then
      raise exception 'Providers may not author status %', new.status
        using errcode = 'check_violation';
    end if;
    -- Action-specific writable-field sets (write integrity, not ordering).
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

    elsif new.status = 'no_show' then
      if new.provider_confirmed_at is distinct from old.provider_confirmed_at
         or new.provider_first_response_at is distinct from old.provider_first_response_at
         or new.completed_at     is distinct from old.completed_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_actor is distinct from old.cancellation_actor
      then raise exception 'Only no_show fields may change on no_show' using errcode = 'check_violation'; end if;
      if new.no_show_flag is not true then
        raise exception 'no_show requires no_show_flag = true' using errcode = 'check_violation'; end if;

    else
      -- status unchanged and not an action status (e.g. pending): no operational
      -- field may change (no valid provider action).
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

drop trigger if exists enforce_booking_write_integrity on public.bookings;
create trigger enforce_booking_write_integrity
  before insert or update on public.bookings
  for each row execute function public.enforce_booking_write_integrity();

-- RLS cleanup: remove tautological WITH CHECKs; fix the dead client-cancel value.
-- Field/action integrity is enforced by the trigger; policies express only
-- row/actor ownership. No DELETE policy is added.

drop policy if exists clients_cancel_own_bookings on public.bookings;
create policy clients_cancel_own_bookings on public.bookings
  for update to authenticated
  using (auth.uid() = user_id and status in ('pending', 'accepted'))
  with check (auth.uid() = user_id and status = 'cancelled_by_client');

drop policy if exists providers_manage_own_bookings on public.bookings;
create policy providers_manage_own_bookings on public.bookings
  for update to authenticated
  using (
    provider_id in (select p.id from public.providers p where p.user_id = auth.uid())
  )
  with check (
    provider_id in (select p.id from public.providers p where p.user_id = auth.uid())
  );
