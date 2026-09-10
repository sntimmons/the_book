-- Session 8 (A, J) — the block reaches the write gates.
--
-- `20261046000000` created the record and the predicate. This is where the
-- predicate is asked, and the SHAPE of every addition is the same: **refuse the
-- NEW thing, touch nothing that exists.**
--
--   * a new CONVERSATION between a blocked pair is refused
--   * a new BOOKING between a blocked pair is refused (`PT427`)
--
-- Neither closes a thread, cancels a booking, hides a message or removes a row.
-- That is the whole discipline of the feature: a block is about what happens
-- next, and the product must not express it by taking away what already happened.
--
-- ── THE MESSAGE IS THE SAME IN BOTH DIRECTIONS ────────────────────────────
--
-- "This conversation is not available." / "This provider is not available for new
-- bookings." Neither says a block exists, and neither differs depending on which
-- side blocked. A refusal that told the blocked party they had been blocked would
-- turn a safety action into a notification to the person it was taken against.
--
-- `PT427` is a NEW SQLSTATE and is deliberately distinct from `PT426`
-- (de-approved provider). The two produce similar copy but are different facts,
-- and a client surface that conflated them would tell a blocked user that a
-- provider had been removed from the marketplace.
--
-- ── LIVE DEFINITIONS, TAKEN FROM `pg_get_functiondef` ─────────────────────
--
-- `enforce_conversation_insert` and `enforce_booking_write_integrity` were BOTH
-- redefined by PR #74 and neither lives in the migration that created it. Per the
-- ledger:
--   * `enforce_conversation_insert` — live at `20261045000000` (the draft
--     conjunct: a booking must be SUBMITTED to open a thread).
--   * `enforce_booking_write_integrity` — live at `20261041000000`, which is
--     itself a forward correction that restored SEC-LIFECYCLE-001 after an
--     earlier copy-forward silently dropped it.
-- Both bodies below are copied from the live objects and are unchanged apart from
-- the commented block above.

create or replace function public.enforce_conversation_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  -- A non-null, non-pending status is never allowed at creation.
  if new.request_status is not null and new.request_status <> 'pending' then
    new.request_status := 'pending';
  end if;
  -- SESSION 8 (A/K): A BLOCK STOPS A NEW THREAD.
  --
  -- Checked before anything else and for BOTH participants, because the block is
  -- symmetric in effect: it must stop the blocked party opening a conversation
  -- just as surely as it stops the blocker. There is deliberately NO
  -- live-transaction exception here — the exception exists so two people can
  -- finish something they ALREADY have, and a conversation that does not exist
  -- yet is not that. If they have a live booking or agreement, they also already
  -- have the thread it opened.
  --
  -- The message is generic and identical in both directions, so it cannot be used
  -- to discover that you have been blocked.
  if (select auth.role()) is distinct from 'service_role'
     and public.contact_blocked(
           new.client_id,
           (select p.user_id from public.providers p where p.id = new.provider_id)
         ) then
    raise exception 'This conversation is not available.'
      using errcode = 'insufficient_privilege';
  end if;

  -- CLIENT-initiated inserts are gated so a client cannot craft an ungated chat:
  if auth.uid() = new.client_id then
    if new.booking_id is null then
      -- Non-booking client contact must be a pending REQUEST (even if null supplied).
      if new.request_status is null then
        new.request_status := 'pending';
      end if;
    else
      -- A booking-linked client conversation must reference a REAL booking for
      -- this exact pair — no fake booking_id may buy an open chat.
      -- CORRECTION 3 FOLLOW-UP: `and b.submitted_at is not null`.
      --
      -- This test was written when a `bookings` row could only mean "a real
      -- request the provider has been shown". Since 20261037000000 it can also
      -- mean an unsent DRAFT — invisible to the provider, created by merely
      -- reaching the contract step, and unthrottled. Without this conjunct a
      -- client could insert a draft against any approved provider and use its id
      -- to open an UNGATED conversation, bypassing the message-request gate this
      -- whole slice exists to enforce.
      if not exists (
        select 1 from public.bookings b
        where b.id = new.booking_id
          and b.user_id = new.client_id
          and b.provider_id = new.provider_id
          and b.submitted_at is not null
      ) then
        raise exception 'That booking does not belong to this conversation.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  -- request_opened_at is a SECURITY BOUNDARY (it scopes the one-initial-message
  -- rule), so it must be server-authoritative: for any non-service_role pending
  -- row, stamp it with server time and IGNORE any client-supplied value. A client
  -- must not be able to future-date it to slip messages past the pending gate.
  -- clock_timestamp() (real wall clock), not now()/transaction time, so the
  -- boundary strictly precedes any message inserted afterward even inside one
  -- transaction, and a re-request always advances past prior-cycle messages.
  if new.request_status = 'pending' then
    new.request_opened_at := clock_timestamp();
  else
    new.request_opened_at := null;
  end if;
  return new;
end;
$$;

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
    -- CORRECTION 3: every client-created booking starts as a DRAFT. A client
    -- cannot insert a row that is already a submitted request, nor set its own
    -- deadline.
    new.submitted_at               := null;
    new.expires_at                 := null;

    -- SESSION 8 (A/J): A BLOCK STOPS A NEW BOOKING, in either direction.
    --
    -- On the INSERT only, exactly like the eligibility refusal below it and for
    -- the same reason: existing bookings are untouched, remain readable by both
    -- sides, and can still be completed, cancelled or reviewed. Blocking someone
    -- must not strand a booking either of them still needs.
    if public.contact_blocked_provider(new.user_id, new.provider_id) then
      raise exception 'This provider is not available for new bookings.'
        using errcode = 'PT427';
    end if;

    -- ITEM H: a provider who is not currently approved does not take NEW
    -- bookings. INSERT-only, so every existing booking, message and review tied
    -- to that provider survives untouched and readable by both sides.
    if not exists (
      select 1 from public.providers p
      where p.id = new.provider_id and p.is_approved
    ) then
      raise exception 'This provider is not currently available for new bookings.'
        using errcode = 'PT426';
    end if;

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
     or new.created_at            is distinct from old.created_at
     or new.expires_at            is distinct from old.expires_at
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

  -- CORRECTION 3 (a2) — THE DRAFT IS EDITABLE, THE SUBMITTED REQUEST IS NOT.
  --
  -- `service_name`, `requested_date`, `requested_time`, `appointment_time`,
  -- `message` and `payment_amount` were previously in the blanket immutable list
  -- above, which is correct for a request a provider has been shown and wrong for
  -- a draft the client is still filling in. They are re-imposed here the moment
  -- the request is submitted, so the frozen-after-submit guarantee is unchanged;
  -- what changes is that before submission the SAME row can be revised, which is
  -- what makes resuming it possible instead of inserting a second one (item K).
  if old.submitted_at is not null then
    if new.service_name     is distinct from old.service_name
       or new.requested_date is distinct from old.requested_date
       or new.requested_time is distinct from old.requested_time
       or new.appointment_time is distinct from old.appointment_time
       or new.message        is distinct from old.message
       or new.payment_amount is distinct from old.payment_amount
    then
      raise exception 'A submitted request may not be edited'
        using errcode = 'check_violation';
    end if;
  elsif not is_client then
    raise exception 'Only the client may edit their own draft request'
      using errcode = 'check_violation';
  end if;

  -- (a3) SUBMIT: null -> now, once, client only, server-stamped; and the deadline
  -- computed here and nowhere else (item B).
  if new.submitted_at is distinct from old.submitted_at then
    if old.submitted_at is not null then
      raise exception 'A request may not be re-submitted' using errcode = 'check_violation';
    end if;
    if not is_client then
      raise exception 'Only the client may submit their own request'
        using errcode = 'check_violation';
    end if;
    if new.submitted_at is null then
      raise exception 'A request may not be un-submitted' using errcode = 'check_violation';
    end if;
    new.submitted_at := clock_timestamp();
    new.expires_at := greatest(
      new.submitted_at,
      least(
        new.submitted_at + interval '72 hours',
        coalesce(new.appointment_time, new.submitted_at + interval '72 hours')
      )
    );
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
    -- A provider may not act on a request they cannot even see.
    if old.submitted_at is null then
      raise exception 'That request has not been submitted'
        using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status
       and new.status not in ('accepted', 'cancelled_by_provider', 'completed', 'no_show') then
      raise exception 'Providers may not author status %', new.status
        using errcode = 'check_violation';
    end if;
    -- ITEM B: EXPIRY IS A REAL BOUNDARY, NOT A LABEL. Accepting is the one act
    -- the deadline forbids; declining stays available, because letting a provider
    -- close out a stale request is not a thing to prevent.
    if new.status = 'accepted' and old.status <> 'accepted'
       and old.expires_at is not null and clock_timestamp() > old.expires_at then
      raise exception 'This request has expired and can no longer be accepted.'
        using errcode = 'PT425';
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
