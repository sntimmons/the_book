-- Pre-booking message requests.
--
-- Adds a request lifecycle to the existing single-conversation-per-pair model
-- (conversation_unique_pair on (client_id, provider_id)). A pre-booking request
-- lives ON the conversation row via request_status; booking-linked and legacy
-- conversations keep request_status = null and remain open.
--
--   request_status:  null (open: booking/legacy/normal)
--                    'pending'  -> client sent ONE initial message, awaiting provider
--                    'accepted' -> provider accepted; normal two-way conversation
--                    'declined' -> provider declined; no further messages
--   Re-request: a declined request may return to 'pending' (client only).
--
-- Server-side integrity (never rely on UI): a client may send only ONE initial
-- message while pending; the provider cannot message while pending; no messages
-- after decline; only the provider may accept/decline; only the client may
-- re-open a declined request; identity fields are immutable. Mirrors the SB3b
-- write-integrity trigger style. service_role bypasses all of it.

-- ── 1. Schema ────────────────────────────────────────────────────────────────
-- The reconstructed baseline gave conversation.booking_id a bogus
-- DEFAULT gen_random_uuid(), so a conversation created without an explicit
-- booking_id silently gets a RANDOM non-null uuid. The request gate keys off
-- "booking_id IS NULL = pre-booking", so this default must be dropped or every
-- pre-booking request would look like a booking conversation. (Existing rows keep
-- their values; the app already inserts booking_id explicitly.)
alter table public.conversation alter column booking_id drop default;

alter table public.conversation
  add column if not exists request_status text,
  add column if not exists request_opened_at timestamptz;

alter table public.conversation
  drop constraint if exists conversation_request_status_check;
alter table public.conversation
  add constraint conversation_request_status_check
  check (request_status is null or request_status in ('pending', 'accepted', 'declined'));

comment on column public.conversation.request_status is
  'Pre-booking request lifecycle: null=open (booking/legacy), pending, accepted, declined.';
comment on column public.conversation.request_opened_at is
  'When the current pending request cycle opened; scopes the one-initial-message rule across re-requests.';

-- The base conversation_unique_pair already forces one row per (client, provider),
-- so at most one pending request per pair. This partial unique makes that intent
-- explicit and is robust if the base constraint ever changes.
create unique index if not exists conversation_one_pending_prebooking
  on public.conversation (client_id, provider_id)
  where request_status = 'pending';

-- ── 2. Conversation INSERT clamp ─────────────────────────────────────────────
-- Client-initiated PRE-BOOKING contact must be a request — the server does not
-- rely on the UI. Rules for a non-service_role insert:
--   * any non-null, non-pending status is clamped to 'pending' (a client can
--     never create a pre-accepted/declined conversation);
--   * a CLIENT creating a NON-booking conversation (auth.uid() = client_id and
--     booking_id is null) is forced to 'pending' even if they supplied null, so a
--     client cannot craft an ungated open chat.
-- Provider/business/community-initiated contact (auth.uid() <> client_id, e.g. a
-- provider messaging a client, or a barter match where the caller owns the
-- provider slot) and booking-linked conversations (booking_id not null) are left
-- open — those remain a separate, deferred product question.
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
      if not exists (
        select 1 from public.bookings b
        where b.id = new.booking_id
          and b.user_id = new.client_id
          and b.provider_id = new.provider_id
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

revoke all on function public.enforce_conversation_insert() from public;

drop trigger if exists enforce_conversation_insert on public.conversation;
create trigger enforce_conversation_insert
  before insert on public.conversation
  for each row execute function public.enforce_conversation_insert();

-- ── 3. Conversation UPDATE integrity (accept/decline/re-request) ─────────────
create or replace function public.enforce_conversation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_client boolean;
  v_is_provider boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.provider_id is distinct from old.provider_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Immutable conversation fields may not change.'
      using errcode = 'check_violation';
  end if;

  v_is_client := (auth.uid() = old.client_id);
  v_is_provider := exists (
    select 1 from public.providers p
    where p.id = old.provider_id and p.user_id = auth.uid()
  );

  -- A booking may only be ATTACHED once (null -> value) by a participant, and the
  -- booking must genuinely belong to this conversation's client↔provider pair —
  -- booking_id must never become a privilege-escalation vector.
  if new.booking_id is distinct from old.booking_id then
    if old.booking_id is not null then
      raise exception 'A conversation''s booking may not be reassigned.'
        using errcode = 'check_violation';
    end if;
    if not (v_is_client or v_is_provider) then
      raise exception 'Only a participant may attach a booking.'
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.bookings b
      where b.id = new.booking_id
        and b.user_id = old.client_id
        and b.provider_id = old.provider_id
    ) then
      raise exception 'That booking does not belong to this conversation.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Request status transitions.
  if new.request_status is distinct from old.request_status then
    -- BOOKING SUPERSEDES THE REQUEST: when a legitimate booking is attached
    -- (null -> value, validated above) the conversation opens for normal two-way
    -- booking messaging regardless of any prior pending/declined request state.
    if old.booking_id is null and new.booking_id is not null
       and new.request_status = 'accepted' then
      null; -- allowed for a participant; booking ownership already verified
    elsif old.request_status = 'pending' and new.request_status in ('accepted', 'declined') then
      if not v_is_provider then
        raise exception 'Only the provider may accept or decline a request.'
          using errcode = 'check_violation';
      end if;
    elsif old.request_status = 'declined' and new.request_status = 'pending' then
      if not v_is_client then
        raise exception 'Only the client may re-open a declined request.'
          using errcode = 'check_violation';
      end if;
      -- Re-request opens a NEW request cycle: the server sets a fresh
      -- request_opened_at (ignoring any client value) so the one-initial-message
      -- allowance resets and prior-cycle messages fall outside the new window.
      new.request_opened_at := clock_timestamp();
    else
      raise exception 'Invalid request status transition.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- request_opened_at is server-authoritative and only ever changes via the
  -- transitions above; a client may not otherwise mutate this security boundary.
  if new.request_opened_at is distinct from old.request_opened_at
     and not (old.request_status = 'declined' and new.request_status = 'pending') then
    raise exception 'request_opened_at may not be changed directly.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_conversation_update() from public;

drop trigger if exists enforce_conversation_update on public.conversation;
create trigger enforce_conversation_update
  before update on public.conversation
  for each row execute function public.enforce_conversation_update();

-- ── 4. Message INSERT rules (one initial message; status gating) ─────────────
create or replace function public.enforce_prebooking_message_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversation%rowtype;
  v_since_count int;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- messages.created_at is used as the pending-cycle enforcement boundary, so for
  -- any client insert it must be SERVER-authoritative — a client must not be able
  -- to backdate created_at to keep the pending message-count at zero. Stamp it with
  -- server time; this also preserves natural ordering (each insert gets a later
  -- clock value). service_role (handled above) keeps its supplied value.
  new.created_at := clock_timestamp();

  select * into v_conv from public.conversation where id = new.conversation_id;
  if not found then
    return new; -- RLS rejects unknown conversations; nothing to enforce here
  end if;

  -- Open conversations: booking-linked, legacy (no request state), or accepted.
  -- Participant + sender_id = auth.uid() are already enforced by the messages RLS.
  if v_conv.booking_id is not null
     or v_conv.request_status is null
     or v_conv.request_status = 'accepted' then
    return new;
  end if;

  if v_conv.request_status = 'declined' then
    raise exception 'This request has been declined; no further messages are allowed.'
      using errcode = 'check_violation';
  end if;

  -- request_status = 'pending': only the client may send, and only the single
  -- initial message of this pending cycle.
  if new.sender_id is distinct from v_conv.client_id then
    raise exception 'The provider must accept the request before messaging.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_since_count
  from public.messages m
  where m.conversation_id = new.conversation_id
    and (v_conv.request_opened_at is null or m.created_at >= v_conv.request_opened_at);
  if v_since_count > 0 then
    raise exception 'Only one message may be sent while a request is pending.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_prebooking_message_rules() from public;

drop trigger if exists enforce_prebooking_message_rules on public.messages;
create trigger enforce_prebooking_message_rules
  before insert on public.messages
  for each row execute function public.enforce_prebooking_message_rules();

-- ── 5. RLS: allow participants to UPDATE their conversation ───────────────────
-- Needed for accept/decline, re-request, attaching a booking, and last_message_at
-- bumps. Integrity is enforced by enforce_conversation_update above.
drop policy if exists "participants_update_conversation" on public.conversation;
create policy "participants_update_conversation" on public.conversation
  for update to authenticated
  using (
    auth.uid() = client_id
    or auth.uid() in (select p.user_id from public.providers p where p.id = provider_id)
  )
  with check (
    auth.uid() = client_id
    or auth.uid() in (select p.user_id from public.providers p where p.id = provider_id)
  );
