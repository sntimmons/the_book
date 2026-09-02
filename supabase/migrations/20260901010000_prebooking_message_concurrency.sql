-- Pre-booking one-message-while-pending: make the gate atomic under concurrency.
--
-- SEC-DATA-001 (Agent 2, MEDIUM): `enforce_prebooking_message_rules` gated the
-- "exactly one initial client message while pending" rule with a non-atomic
-- read-then-insert — `SELECT count(*) FROM messages ...` in a BEFORE INSERT
-- trigger with no lock. Under READ COMMITTED (Supabase default), two concurrent
-- initial-message inserts for the SAME pending conversation each observe count=0
-- (neither sees the other's uncommitted row) and both commit — so more than one
-- pending message can slip through. No user boundary is crossed, but the approved
-- server-side anti-spam invariant is violated.
--
-- Fix: take a row-level lock on the conversation row (`SELECT ... FOR UPDATE`)
-- before evaluating the count. Two message inserts for the same conversation now
-- serialize on that one row: the second blocks until the first commits, then
-- re-reads and sees the first (now-committed) message → count>0 → rejected. The
-- lock is scoped to a single conversation row, so it never serializes inserts on
-- DIFFERENT conversations; it is held only for the microseconds of the insert
-- transaction; the message insert takes no other contended lock, so there is no
-- deadlock cycle. Nothing else about the rule changes — status gating, the
-- decline block, the provider-send block, the server-stamped `created_at`, and the
-- `created_at >= request_opened_at` cycle scoping are all preserved. No schema
-- change; only the function body is replaced (the trigger binding is unchanged).
--
-- This is a NEW forward migration (the prior migration 20260901000000 is already
-- merged to main); migration history is not rewritten. Production is untouched.

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

  -- Lock the conversation row for the duration of this insert. This SERIALIZES
  -- concurrent message inserts for the SAME conversation (closing the SEC-DATA-001
  -- read-then-insert race on the pending one-message rule) without touching any
  -- other conversation. A concurrent insert on this conversation blocks here until
  -- we commit, then sees our just-committed message in the count below.
  select * into v_conv
  from public.conversation
  where id = new.conversation_id
  for update;
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
