-- Pre-Session-8 Correction 3 — the booking request gets a lifecycle:
-- a DRAFT the client can resume, a SUBMITTED request the provider sees, and a
-- server-authoritative EXPIRY.
--
-- Three approved items land together because they are one mechanism:
--
--   B  requests expire at 72 hours, not 24, and expiry is authoritative
--      server-side rather than a number the UI computes.
--   J  the booking exists BEFORE the contract step, so contract access can be
--      scoped to a transaction instead of to "any live provider".
--   K  one intent = one request. A dropped network, a failed signature or a
--      back-out resumes the SAME request rather than creating another.
--
-- ── WHY A DRAFT COLUMN AND NOT A DRAFT STATUS ─────────────────────────────
--
-- `bookings.status` is constrained to a fixed vocabulary and `pending` already
-- means "a real request the provider must answer". Creating the row earlier
-- without a second axis would put every abandoned half-finished booking flow
-- into the provider's request queue — the opposite of what item K asks for.
--
-- So the row carries `submitted_at`. NULL means the client is still inside the
-- flow and NO PROVIDER CAN SEE IT (§ 4). Non-NULL is the moment the request was
-- actually made, and it is the only thing that starts the clock. `status` keeps
-- its existing meaning untouched, so every downstream consumer — the lists, the
-- write-integrity trigger, review eligibility, the notification derivation —
-- reads exactly what it read before.
--
-- ── THE EXPIRY RULE, STATED EXACTLY ───────────────────────────────────────
--
--   expires_at = LEAST( submitted_at + 72 hours, appointment_time )
--
-- and never earlier than `submitted_at` itself.
--
-- The `appointment_time` term is the answer to "what if the appointment is
-- sooner than 72 hours". A request for a slot at 09:00 tomorrow cannot sensibly
-- sit answerable until three days from now: the service time would already have
-- passed. Clamping to the appointment is the simplest rule that cannot leave a
-- request pending past an impossible service time, and it invents no scheduling
-- system — it is one `least()` over a column the row already has.
--
-- `appointment_time` is nullable (the flow cannot always assemble it from the
-- date and time strings), and when it is NULL the 72-hour deadline stands alone.
-- **PM REVIEW:** that is the one case where a request can outlive its own
-- requested slot, and it is bounded at 72 hours.
--
-- ── WHAT IS DELIBERATELY NOT BUILT ────────────────────────────────────────
--
-- No scheduler, no job, no timer, no notification. Nothing flips a row when the
-- deadline passes — the state is DERIVED per read, exactly as PD-057's receiver
-- window is, so there is no persisted transition that can disagree with the
-- timestamps. `booking_request_urgency()` in § 6 is what the provider's own
-- screens read to show a 24-hour nudge and a 48-hour stronger reminder. **The
-- product must not claim a reminder was DELIVERED**: there is no push, device or
-- email channel anywhere in this product, and a derived badge is not a message.
--
-- Expired requests are NOT deleted and NOT hidden. They stay in both sides'
-- history with `status = 'pending'`; only the provider's ability to ACCEPT them
-- ends (§ 5).

-- ── 1. The two new columns ───────────────────────────────────────────────────
alter table public.bookings
  add column if not exists submitted_at timestamptz,
  add column if not exists expires_at timestamptz;

comment on column public.bookings.submitted_at is
  'When the client actually submitted this request. NULL means it is still a '
  'DRAFT inside the booking flow and no provider can see it (the provider SELECT '
  'policy requires it non-null). Server-stamped on the submit transition and '
  'immutable afterwards. Backfilled to created_at for every pre-existing row.';

comment on column public.bookings.expires_at is
  'When the provider can no longer accept this request. Computed server-side as '
  'LEAST(submitted_at + 72 hours, appointment_time), never earlier than '
  'submitted_at. Never client-supplied. Nothing flips the row when it passes — '
  'the state is derived per read (booking_request_urgency), so there is no '
  'persisted transition that can disagree with this timestamp.';

-- ── 2. Backfill: every existing booking is already a real request ───────────
-- Written before the guards below so no existing row is stranded as a draft and
-- silently removed from a provider's queue.
update public.bookings
   set submitted_at = coalesce(submitted_at, created_at, now()),
       expires_at = coalesce(
         expires_at,
         least(coalesce(created_at, now()) + interval '72 hours',
               coalesce(appointment_time, coalesce(created_at, now()) + interval '72 hours'))
       )
 where submitted_at is null;

-- ── 3. One draft per client per provider ────────────────────────────────────
-- The database half of "one intent = one request". The client resumes its draft
-- by looking it up, and this index is what makes a concurrent second attempt
-- impossible rather than merely unlikely. PARTIAL, so it constrains only drafts:
-- a client may hold any number of real submitted requests with one provider.
create unique index if not exists bookings_one_draft_per_pair
  on public.bookings (user_id, provider_id)
  where submitted_at is null;

-- ── 4. A draft is invisible to the provider ─────────────────────────────────
-- Recreated with the added conjunct; everything else is carried through
-- unchanged from the canonical baseline. Role narrowed from `public` to
-- `authenticated` while here — the predicate already pivots on auth.uid().
drop policy if exists "Providers can view their bookings" on public.bookings;
create policy "Providers can view their bookings" on public.bookings
  for select to authenticated
  using (
    submitted_at is not null
    and provider_id in (
      select providers.id from public.providers where providers.user_id = auth.uid()
    )
  );

-- The client keeps seeing their own drafts — that is what makes resume possible.
-- Restated unchanged apart from being explicit about it.
drop policy if exists "Users can view own bookings" on public.bookings;
create policy "Users can view own bookings" on public.bookings
  for select to authenticated
  using (auth.uid() = user_id);

-- INSERT: role clause added, predicate unchanged.
drop policy if exists "Users can insert own bookings" on public.bookings;
create policy "Users can insert own bookings" on public.bookings
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ── 5. Write integrity: the submit transition, and expiry as a real boundary ─
--
-- Redefines `enforce_booking_write_integrity`. **Its live definition is
-- `20260902000000` § 5, NOT the `20260830010000` that created it** — that file
-- added the server-authoritative `completed_at` stamp, and copying the older body
-- forward would silently delete it and reopen SEC-DATA-003. The body below is
-- taken from `20260902000000` and extended; every pre-existing rule is carried
-- through verbatim.
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
    --
    -- NEW: every client-created booking starts as a DRAFT. A client cannot insert
    -- a row that is already a submitted request, and cannot set its own deadline.
    new.submitted_at               := null;
    new.expires_at                 := null;

    -- ITEM H: a provider who is not currently approved does not take NEW
    -- bookings. Existing history is untouched — this is an INSERT-only refusal,
    -- so every booking, message and review already tied to that provider stays
    -- exactly where it is and stays readable by both sides. The client-facing
    -- wording is availability, not judgement: "Not currently available for new
    -- bookings". It is NOT a verification claim of any kind.
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

  -- (a) Immutable for authenticated actors.
  --
  -- NEW: `expires_at` joins this list unconditionally — it is derived, never
  -- written by a caller, and § (d) sets it. `submitted_at` is NOT here because
  -- the submit transition legitimately changes it once; § (d) constrains that.
  if new.id                       is distinct from old.id
     or new.user_id               is distinct from old.user_id
     or new.provider_id           is distinct from old.provider_id
     or new.service_id            is distinct from old.service_id
     or new.created_at            is distinct from old.created_at
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

  -- (b) THE DRAFT IS EDITABLE, THE REQUEST IS NOT.
  --
  -- While `submitted_at` is null the row is still the client's own working copy,
  -- so the flow may revise the service, the date, the time and the note as the
  -- client moves back and forth through the steps — which is exactly what makes
  -- resuming the same row possible instead of inserting a new one. Once
  -- submitted, those fields freeze: a provider answers the request they were
  -- shown, and a client cannot rewrite the appointment underneath an acceptance.
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
  else
    -- Only the owning client may work on their own draft.
    if not is_client then
      raise exception 'Only the client may edit their own draft request'
        using errcode = 'check_violation';
    end if;
  end if;

  -- (c) SUBMIT: null -> now, once, server-stamped, client only.
  if new.submitted_at is distinct from old.submitted_at then
    if old.submitted_at is not null then
      raise exception 'A request may not be re-submitted'
        using errcode = 'check_violation';
    end if;
    if not is_client then
      raise exception 'Only the client may submit their own request'
        using errcode = 'check_violation';
    end if;
    if new.submitted_at is null then
      raise exception 'A request may not be un-submitted'
        using errcode = 'check_violation';
    end if;
    -- Server time, never the client's. This timestamp starts the 72-hour clock
    -- and decides the deadline below, so a device clock must not reach it.
    new.submitted_at := clock_timestamp();
    -- (d) THE DEADLINE, COMPUTED HERE AND NOWHERE ELSE.
    new.expires_at := greatest(
      new.submitted_at,
      least(
        new.submitted_at + interval '72 hours',
        coalesce(new.appointment_time, new.submitted_at + interval '72 hours')
      )
    );
  elsif new.expires_at is distinct from old.expires_at then
    raise exception 'A request deadline is not user-editable'
      using errcode = 'check_violation';
  end if;

  -- (e) Actor + action authorship of status and the operational fields.
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
    -- A provider may not act on a request they cannot see.
    if old.submitted_at is null then
      raise exception 'That request has not been submitted'
        using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status
       and new.status not in ('accepted', 'cancelled_by_provider', 'completed', 'no_show') then
      raise exception 'Providers may not author status %', new.status
        using errcode = 'check_violation';
    end if;

    -- EXPIRY IS A REAL BOUNDARY, NOT A LABEL. Accepting is the one act the
    -- deadline forbids; declining stays available forever, because letting a
    -- provider close out a stale request is not a thing to prevent.
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
      -- latched. `old.completed_at is null` (not `old.status <> 'completed'`) so a
      -- status round-trip cannot re-stamp it and move the review window.
      if old.completed_at is null then
        new.completed_at := now();
      else
        new.completed_at := old.completed_at;
      end if;

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
revoke all on function public.enforce_booking_write_integrity() from public, anon;

-- The client cancel policy must also cover a draft the client abandons
-- deliberately. Predicate widened only by allowing the same act on a draft.
drop policy if exists clients_cancel_own_bookings on public.bookings;
create policy clients_cancel_own_bookings on public.bookings
  for update to authenticated
  using (auth.uid() = user_id and status in ('pending', 'accepted'))
  with check (auth.uid() = user_id
              and status in ('pending', 'accepted', 'cancelled_by_client'));

-- ── 6. The derived urgency state ────────────────────────────────────────────
-- Read per query, stored nowhere, moved by nothing. `none` before 24 hours have
-- passed, `nudge` from 24, `urgent` from 48, `expired` once the deadline is by.
--
-- IT IS A READ STATE, NOT A MESSAGE. There is no push, device or email channel
-- in this product, so no surface consuming this may say a reminder was SENT.
create or replace function public.booking_request_urgency(
  p_submitted_at timestamptz,
  p_expires_at timestamptz,
  p_now timestamptz default now()
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_submitted_at is null then 'draft'
    when p_expires_at is not null and p_now >= p_expires_at then 'expired'
    when p_now >= p_submitted_at + interval '48 hours' then 'urgent'
    when p_now >= p_submitted_at + interval '24 hours' then 'nudge'
    else 'none'
  end;
$$;

alter function public.booking_request_urgency(timestamptz, timestamptz, timestamptz) owner to postgres;
revoke all on function public.booking_request_urgency(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.booking_request_urgency(timestamptz, timestamptz, timestamptz)
  to authenticated, service_role;

comment on function public.booking_request_urgency(timestamptz, timestamptz, timestamptz) is
  'Derived provider-facing urgency for a booking request: draft | none | nudge '
  '(24h) | urgent (48h) | expired (past expires_at). Computed per read, stored '
  'nowhere, and nothing moves a row when it changes — the same discipline as the '
  'PD-057 receiver window. NOT a notification: no push, device or email channel '
  'exists, so no copy built on this may claim a reminder was delivered.';

-- ── 7. Column grants for the two new columns ────────────────────────────────
-- Correction 2 replaced this table's blanket privileges with explicit ones on
-- `providers`; `bookings` still carries table-level grants, so the new columns
-- inherit them. `submitted_at` must be UPDATE-able by the client for the submit
-- transition (§ 5c stamps the value itself); `expires_at` never is.
revoke update (expires_at) on public.bookings from authenticated;
