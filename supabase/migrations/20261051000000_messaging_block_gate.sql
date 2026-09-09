-- Session 8 (A, K) — messaging respects the block, with the one documented exception.
--
-- This is the most delicate gate in the session, and the exception in it is the
-- reason blocking can be offered at all. The full policy is written above the
-- code below rather than here, so it sits with the thing it governs.
--
-- In short: **a block refuses a new message, unless the two people have a LIVE
-- transaction they still need to finish.** Everything about that sentence is
-- load-bearing — "new", "live", and "finish".
--
-- ── WHAT THIS DOES NOT DO ─────────────────────────────────────────────────
--
-- It does not hide, delete or close anything. Existing messages remain readable
-- to both parties, because a person who blocks someone mid-dispute needs the
-- record of what was said at least as much as anyone.
--
-- ── LIVE DEFINITION ───────────────────────────────────────────────────────
--
-- Body from `pg_get_functiondef`. The ledger records this function as redefined
-- FOUR times and the trap explicitly: `20260913000000` once rebuilt it from
-- `20260901000000` and silently deleted the `for update` lock that closes
-- SEC-DATA-001. Its live definition is `20261045000000` (the draft conjunct), and
-- `supabase/tests/messaging.test.sql` pins the lock on `prosrc` for exactly this
-- reason. Both the lock and the draft conjunct are carried through below.

create or replace function public.enforce_prebooking_message_rules()
 returns trigger
 language plpgsql
 security definer
 set search_path = ''
as $$
declare
  v_conv public.conversation%rowtype;
  v_since_count integer;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Addressing is a SERVER concept: only a definer function may say who a platform notice is
  -- for. Clamped for any message that HAS an author -- i.e. every client insert, since the
  -- INSERT policy requires sender_id = auth.uid() and null can never satisfy it, so a
  -- null-sender row can only come from a definer function.
  --
  -- Scoping it this way is load-bearing: SECURITY DEFINER does not change auth.role(), so an
  -- unconditional clamp fires inside release_barter_interest too and silently wipes the
  -- addressing it just computed -- defeating the "do not badge the actor" rule via the very
  -- guard meant to protect it.
  if new.sender_id is not null then
    new.system_recipient_id := null;
  end if;

  -- created_at is an enforcement boundary (the one-message-per-pending-cycle rule reads it), so
  -- it is server-authoritative and a client-supplied value is discarded.
  new.created_at := clock_timestamp();

  -- LOCK, then read. Added by 20260901010000 to close SEC-DATA-001 and RESTORED here after
  -- this migration's first draft dropped it: the body was written from 20260901000000, the
  -- migration that CREATED this function, rather than 20260901010000, the one that was live.
  -- `create or replace` replaces the whole body, so writing from a superseded copy deletes
  -- every later correction silently -- and a single-transaction harness cannot stage the race
  -- that would reveal it. Under READ COMMITTED two concurrent inserts on one conversation both
  -- read v_since_count = 0 and both commit; the lock makes the second block, then re-read.
  select c.* into v_conv from public.conversation c where c.id = new.conversation_id
  for update;
  if not found then
    raise exception 'That conversation does not exist.' using errcode = 'check_violation';
  end if;

  -- ══ SESSION 8 (A/K): THE BLOCK GATE, AND ITS ONE EXCEPTION ══════════════
  --
  -- A block stops NEW contact. It does not close a thread attached to something
  -- the two people are still in the middle of.
  --
  -- **THE POLICY, EXACTLY AS IMPLEMENTED:**
  --   * If a block exists in either direction, a new message is REFUSED —
  --   * UNLESS the pair has a LIVE transaction (`has_live_transaction`): a
  --     SUBMITTED, non-terminal booking, or a confirmed, uncancelled barter
  --     agreement with at least one unresolved obligation.
  --
  -- **WHY THE EXCEPTION EXISTS.** Two providers in a confirmed trade owe each
  -- other delivery, confirmation, and — when it goes wrong — a no-show report or
  -- a review request. A client with an accepted booking has a provider coming to
  -- their address. Severing those threads would trap both people inside an
  -- obligation while removing the only means of completing, cancelling or
  -- resolving it. The narrow exception is what makes blocking safe to offer at
  -- all; without it, blocking mid-transaction would be the more dangerous act.
  --
  -- **WHY IT IS SAFE.** It is bounded three ways. It applies only to a
  -- conversation that ALREADY exists (opening a new one is refused outright by
  -- `enforce_conversation_insert`, with no exception). It lasts only as long as
  -- the transaction is live — once every obligation is resolved or the booking
  -- reaches a terminal state, the block bites here too. And it grants NOTHING
  -- else: no new booking, no new barter interest, no discovery visibility.
  --
  -- A DRAFT booking is deliberately not a live transaction, so a blocked party
  -- cannot manufacture their own exception by opening a booking flow.
  if (select auth.role()) is distinct from 'service_role' then
    declare
      v_other uuid;
    begin
      select case
               when new.sender_id = v_conv.client_id
                 then (select p.user_id from public.providers p where p.id = v_conv.provider_id)
               else v_conv.client_id
             end
        into v_other;

      if v_other is not null
         and public.contact_blocked(new.sender_id, v_other)
         and not public.has_live_transaction(new.sender_id, v_other) then
        raise exception 'This conversation is not available.'
          using errcode = 'insufficient_privilege';
      end if;
    end;
  end if;

  -- Open conversations: booking-linked, legacy (no request state), or accepted.
  --
  -- CORRECTION 3 FOLLOW-UP: "booking-linked" now means linked to a SUBMITTED
  -- request. The two gates above refuse to attach a draft in the first place, so
  -- this is the third, independent refusal — and it is the one that still holds
  -- for a conversation whose booking was attached before this correction.
  if (v_conv.booking_id is not null
      and exists (select 1 from public.bookings b
                   where b.id = v_conv.booking_id and b.submitted_at is not null))
     or v_conv.request_status is null
     or v_conv.request_status = 'accepted' then
    return new;
  end if;

  if v_conv.request_status = 'declined' then
    raise exception 'This request has been declined; no further messages are allowed.'
      using errcode = 'check_violation';
  end if;

  -- request_status = 'pending': only the client may send, and only the single initial message.
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
