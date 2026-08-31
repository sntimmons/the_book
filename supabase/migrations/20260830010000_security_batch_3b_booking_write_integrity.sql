-- =============================================================================
-- Security Batch 3b: booking write integrity (security-critical subset)
-- =============================================================================
-- Closes the booking write holes:
--   * INSERT: a client could seed status='completed', payment_status='captured',
--     completed_at / no_show_flag / payment_finalized, etc. (the INSERT policy
--     only checked user_id).
--   * UPDATE: a provider could change payment_amount/payment_status/status/
--     no_show_flag and reassign user_id (the policies used tautological col=col
--     WITH CHECK clauses that enforce nothing).
--   * Client cancel was dead: the policy required status='cancelled' (invalid per
--     the CHECK constraint; the app sends 'cancelled_by_client').
--
-- Mechanism: RLS for row/actor ownership + a BEFORE INSERT/UPDATE trigger for
-- OLD-vs-NEW field integrity (RLS cannot compare OLD/NEW; column grants cannot
-- distinguish client vs provider since both are role `authenticated`). No
-- tautological WITH CHECK. service_role bypasses. Only public.bookings is touched.
--
-- SCOPE (approved): identity/financial immutability + INSERT integrity + fix the
-- client-cancel value + actor-ownership of status changes. DEFERRED (product
-- decisions, NOT enforced here): strict transition ordering, terminal-state
-- semantics, reschedule lifecycle, arriving/check-in ordering, late-cancellation
-- semantics. payment_amount remains client-supplied at INSERT (payment/pricing
-- architecture debt) — this migration only locks it against UPDATE.
-- =============================================================================

-- 1. Trigger function: INSERT clamps derived/privileged fields to safe defaults;
--    UPDATE enforces immutable identity/financial fields + actor-scoped changes.
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

  -- Identity + financial + admin fields immutable for authenticated actors.
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
  then
    raise exception 'Booking identity/financial fields are not user-editable'
      using errcode = 'check_violation';
  end if;

  if is_client and not is_provider then
    -- Client may only cancel (status -> cancelled_by_client) ...
    if new.status is distinct from old.status and new.status <> 'cancelled_by_client' then
      raise exception 'Clients may only cancel their booking (cancelled_by_client)'
        using errcode = 'check_violation';
    end if;
    -- ... and may not write provider-controlled fields.
    if new.provider_confirmed_at      is distinct from old.provider_confirmed_at
       or new.provider_first_response_at is distinct from old.provider_first_response_at
       or new.completed_at            is distinct from old.completed_at
       or new.client_checked_in_at    is distinct from old.client_checked_in_at
       or new.no_show_flag            is distinct from old.no_show_flag
       or new.provider_safety_notes   is distinct from old.provider_safety_notes
    then
      raise exception 'Clients may not set provider-controlled booking fields'
        using errcode = 'check_violation';
    end if;
  elsif is_provider then
    -- Provider may not write client-controlled fields. Status transitions are
    -- allowed here (strict ordering is deferred, see header).
    if new.client_safety_notes is distinct from old.client_safety_notes
       or new.issue_reported     is distinct from old.issue_reported
       or new.issue_reported_at  is distinct from old.issue_reported_at
       or new.issue_reason       is distinct from old.issue_reason
    then
      raise exception 'Providers may not set client-controlled booking fields'
        using errcode = 'check_violation';
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

-- 2. RLS cleanup: remove tautological WITH CHECKs; fix the dead client-cancel
--    value. Field integrity is now enforced by the trigger, so the policies only
--    express row/actor ownership.

-- Client cancellation: uses the app's real value 'cancelled_by_client'. The
-- state guard (pending/accepted) preserves existing behavior; the trigger blocks
-- any non-cancel change.
drop policy if exists clients_cancel_own_bookings on public.bookings;
create policy clients_cancel_own_bookings on public.bookings
  for update to authenticated
  using (auth.uid() = user_id and status in ('pending', 'accepted'))
  with check (auth.uid() = user_id and status = 'cancelled_by_client');

-- Provider management: ownership via providers.id <-> providers.user_id, both
-- sides, so provider_id cannot be reassigned. No tautological payment clause.
drop policy if exists providers_manage_own_bookings on public.bookings;
create policy providers_manage_own_bookings on public.bookings
  for update to authenticated
  using (
    provider_id in (select p.id from public.providers p where p.user_id = auth.uid())
  )
  with check (
    provider_id in (select p.id from public.providers p where p.user_id = auth.uid())
  );

-- INSERT policy (Users can insert own bookings) and SELECT policies are kept as-is.
-- No DELETE policy is added (authenticated DELETE remains denied by RLS).
