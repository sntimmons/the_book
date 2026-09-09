-- FORWARD CORRECTION to 20261037000000 (Correction 3, items J and K).
--
-- ══ WHAT MOVING THE BOOKING ROW EARLIER BROKE ═════════════════════════════
--
-- `20261037000000` created a new kind of `bookings` row: a DRAFT, with
-- `submitted_at IS NULL`, inserted when the client reaches the contract step and
-- invisible to the provider. It correctly taught the provider's SELECT policy
-- about that distinction, and stopped there.
--
-- **Three server-side boundaries written before drafts existed test only that "a
-- booking exists for this pair".** Each was written when that could only mean a
-- real request the provider had been shown and could answer. A draft satisfies
-- all three, and the consequences are not cosmetic:
--
--   1. `enforce_conversation_insert` — a client could insert a draft against any
--      approved provider (unthrottled: the rate limit is checked at SUBMIT, not
--      at draft creation) and pass its id as `booking_id` to open a conversation
--      with `request_status` left NULL, i.e. OPEN. **That bypasses the
--      pre-booking message-request gate entirely** — the boundary that exists so
--      a provider decides who may message them.
--   2. `enforce_conversation_update` — the same test guards the booking-attach
--      path, and the supersede branch permits `declined -> accepted` whenever a
--      booking is attached. So a draft let a client **reverse a provider's
--      explicit decline** and reopen a thread that provider had closed.
--   3. `enforce_prebooking_message_rules` — treats any `booking_id` as an open
--      conversation, so once attached the thread accepted unlimited messages in
--      both directions, permanently (`booking_id` may never be cleared).
--
-- Reachable by an ordinary authenticated account in two REST calls, with no
-- provider action and no privileged role. **The shipped client walks into it on
-- its own**: the bookings tab hands a draft's id to `getOrCreateConversation`.
--
-- ══ AND THE LOCKOUT THE UNIQUE INDEX CREATED ══════════════════════════════
--
-- `bookings_one_draft_per_pair` was `where submitted_at is null` — with no status
-- term. A client who cancels a draft leaves a row that is still `submitted_at IS
-- NULL`, so it keeps occupying the single draft slot for that (client, provider)
-- pair forever, while `clients_cancel_own_bookings` (`status in
-- ('pending','accepted')`) no longer admits it for UPDATE.
--
-- Every later attempt to book that provider then: found the cancelled draft,
-- issued an UPDATE that RLS filtered to zero rows **with no error**, treated that
-- as success, submitted it — filtered to zero rows again, no error — and showed
-- the client **"BOOKING REQUEST SENT"**. Nothing was sent, and the client could
-- never book that provider again. A success screen for a request that does not
-- exist is the worst failure this correction could have produced.
--
-- The index is narrowed to LIVE drafts. A cancelled draft frees the slot, which
-- is what it should always have done: "one intent = one request" is about one
-- OPEN intent, not one intent ever.
--
-- ══ AND THE CLIENT-IDENTITY VIEW ══════════════════════════════════════════
--
-- `clients_provider` is a definer view that shows a provider a client's name and
-- neighborhood whenever a booking exists for the pair. An unsent draft is not a
-- relationship the client chose to create with that provider, so it should not
-- disclose their identity.
--
-- ══ HOW THIS WAS MISSED, WHICH MATTERS MORE THAN THE FIX ═════════════════
--
-- Every changed object was tested in isolation and passed. What no test asked was
-- what the NEW KIND OF ROW meant to boundaries that were not changed. When a
-- migration widens what an existing row type can mean, the review question is not
-- "is the new column safe?" but **"what else tests for the existence of this
-- row, and was it written assuming the old meaning?"** The B5B additions at the
-- end of this correction ask exactly that.
--
-- All three function bodies below are copied from `pg_get_functiondef` on the
-- LIVE objects and are otherwise unchanged; the added conjunct is commented at
-- each site.

-- ── 1. A draft may not open, attach to, or unlock a conversation ────────────
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

create or replace function public.enforce_conversation_update()
 returns trigger
 language plpgsql
 security definer
 set search_path = ''
as $$
declare
  v_is_client boolean;
  v_is_provider boolean;
  v_barter_match boolean;
  v_handoff boolean;
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

  if new.booking_id is distinct from old.booking_id then
    if old.booking_id is not null then
      raise exception 'A conversation''s booking may not be reassigned.'
        using errcode = 'check_violation';
    end if;
    if not (v_is_client or v_is_provider) then
      raise exception 'Only a participant may attach a booking.'
        using errcode = 'check_violation';
    end if;
    -- The booking must belong to THIS PAIR. Both orientations are accepted, and only those
    -- two: a conversation is now canonical for a provider pair, so the row's orientation is
    -- fixed by uuid order and need not match the direction the booking was made in. Checking
    -- only the literal orientation (as this did) meant a provider who booked their
    -- counterparty could never attach it -- resolve_conversation handed them the canonical row
    -- and this refused it, so the Message button died silently for half of all pairs.
    --
    -- The second arm is NOT a widening to "any booking involving either person". It requires
    -- the booking's client to be the provider ON this row, AND the booking's provider to be
    -- the provider owned by this row's client -- the same two humans, in the other direction.
    if not exists (
      select 1 from public.bookings b
      where b.id = new.booking_id
        -- CORRECTION 3 FOLLOW-UP. See enforce_conversation_insert for the full
        -- reasoning. Here it also closes a second, worse door: the supersede
        -- branch below permits `declined -> accepted` when a booking is attached,
        -- so without this an unsent draft would let a client REVERSE a provider's
        -- explicit decline and reopen a thread they had closed.
        and b.submitted_at is not null
        and (
          (b.user_id = old.client_id and b.provider_id = old.provider_id)
          or (
            exists (select 1 from public.providers pb
                     where pb.id = old.provider_id and pb.user_id = b.user_id)
            and exists (select 1 from public.providers pc
                         where pc.id = b.provider_id and pc.user_id = old.client_id)
          )
        )
    ) then
      raise exception 'That booking does not belong to this conversation.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.request_status is distinct from old.request_status then
    -- Is there an accepted barter match between the two humans on this row? Both
    -- orientations are checked, because a barter thread is canonicalised by uuid order and
    -- need not put either party in a particular slot.
    v_barter_match := exists (
      select 1
      from public.barter_interests i
      join public.barter_offers o on o.id = i.offer_id
      join public.providers po on po.id = o.provider_id
      join public.providers pr on pr.id = i.interested_provider_id
      where i.status = 'accepted'
        and (
          (po.user_id = old.client_id and pr.id = old.provider_id)
          or (pr.user_id = old.client_id and po.id = old.provider_id)
        )
    );

    -- Is THIS statement the handoff RPC opening the thread it is itself creating or
    -- reusing? The RPC publishes the conversation id as a transaction-local GUC immediately
    -- before its update and clears it immediately after, so the marker is true only for that
    -- one statement. PostgREST runs each request in its own transaction and exposes only
    -- functions in the API schema over /rpc/, so a client cannot set this GUC in the same
    -- transaction as an UPDATE of its own -- which is what makes the carve-out below
    -- unreachable outside the RPC. This is a CONJUNCT, not a replacement: the barter-match
    -- evidence still has to hold. The marker answers "is this the handoff?", the evidence
    -- answers "is there really a match?", and both must be true.
    v_handoff := coalesce(current_setting('app.barter_handoff', true), '') = old.id::text;

    if old.booking_id is null and new.booking_id is not null
       and new.request_status = 'accepted' then
      null; -- booking supersedes (unchanged)
    elsif old.request_status = 'pending' and new.request_status in ('accepted', 'declined') then
      -- PRE-EXISTING RULE, kept FIRST so the barter carve-out can only ADD a transition and
      -- never intercept one. An earlier draft placed the carve-out above this branch, which
      -- -- because plpgsql if/elsif is first-match -- silently replaced this provider-only
      -- check with a participant check whenever a match existed. That was an undisclosed
      -- authorization widening on the messaging surface. The relaxation is now explicit,
      -- scoped to exactly the case the handoff needs, and applies ONLY to 'accepted':
      -- pending -> declined stays provider-only, unchanged.
      if not v_is_provider then
        if new.request_status = 'accepted' and v_is_client and v_barter_match and v_handoff then
          -- The accepting party can legitimately occupy the CLIENT slot: the barter thread
          -- key is canonical by uuid order, so which slot the offer owner lands in is not
          -- theirs to choose. Requires a real accepted match, same evidence gate as below.
          null;
        else
          raise exception 'Only the provider may accept or decline a request.'
            using errcode = 'check_violation';
        end if;
      end if;
    elsif v_handoff and v_barter_match and new.request_status = 'accepted'
          and old.request_status = 'declined' then
      -- BARTER MATCH SUPERSEDES A DECLINED REQUEST. Genuinely new: declined -> accepted was
      -- not a legal participant transition at all. Same shape as the booking rule above and
      -- gated on evidence in the database, not on who is asking.
      if not (v_is_client or v_is_provider) then
        raise exception 'Only a participant may open a matched barter conversation.'
          using errcode = 'check_violation';
      end if;
    elsif old.request_status = 'declined' and new.request_status = 'pending' then
      if not v_is_client then
        raise exception 'Only the client may re-open a declined request.'
          using errcode = 'check_violation';
      end if;
      new.request_opened_at := clock_timestamp();
    else
      raise exception 'Invalid request status transition.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.request_opened_at is distinct from old.request_opened_at
     and not (old.request_status = 'declined' and new.request_status = 'pending') then
    raise exception 'request_opened_at may not be changed directly.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

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

-- ── 2. A cancelled draft must not hold the one-draft slot ──────────────────
--
-- Recreated, not altered: a partial index's predicate cannot be changed in place.
-- `status = 'pending'` is the live-draft condition — the write-integrity trigger
-- forces `pending` on every client INSERT, so a draft is `pending` until the
-- client abandons it, and `cancelled_by_client` afterwards.
drop index if exists public.bookings_one_draft_per_pair;
create unique index if not exists bookings_one_draft_per_pair
  on public.bookings (user_id, provider_id)
  where submitted_at is null and status = 'pending';

-- ── 3. An unsent draft does not disclose the client's identity ─────────────
--
-- Body from the canonical baseline, with the one conjunct added. The second
-- disjunct (an existing conversation) is unchanged: that IS a relationship the
-- client chose to create.
create or replace view public.clients_provider
with (security_invoker = false) as
  select c.id, c.name, c.created_at, c.neighborhood
    from public.clients c
   where exists (
           select 1 from public.bookings b
             join public.providers p on p.id = b.provider_id
            where b.user_id = c.id
              and p.user_id = (select auth.uid())
              -- CORRECTION 3 FOLLOW-UP: an unsent draft is not a relationship.
              and b.submitted_at is not null
         )
      or exists (
           select 1 from public.conversation cv
             join public.providers p2 on p2.id = cv.provider_id
            where cv.client_id = c.id
              and p2.user_id = (select auth.uid())
         );

alter view public.clients_provider owner to postgres;
revoke all on public.clients_provider from public, anon;
grant select on public.clients_provider to authenticated;

comment on view public.clients_provider is
  'Client identity a provider may read: name, join date and neighborhood, for a '
  'client who has SUBMITTED a booking to them or has a conversation with them. An '
  'unsent draft (submitted_at IS NULL) does not qualify — it is invisible to the '
  'provider and is not a relationship the client chose to create.';
