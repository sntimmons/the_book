-- Barter Slice 2 — atomic accept → conversation handoff.
--
-- Scope: the accept transition ONLY. No agreement schema, no obligations, no proposal
-- redesign, no My Trades, no notifications, no blocking, no reviews, no reputation, no
-- multi-party, no offer-side rate limiter, no eligibility change.
--
-- THE DEFECT THIS CLOSES
-- Accepting a barter response was four sequential client round trips with no transaction:
--   1. UPDATE barter_interests SET status='accepted'   <- COMMITS on its own
--   2. getOrCreateConversation(...)                    <- may return null
--   3. INSERT INTO messages                            <- error never checked
--   4. UPDATE conversation.last_message_at             <- error never checked
-- Every step after (1) can fail while (1) stands, and Slice 1 made that permanent: the
-- partial unique index means the consumed accept slot can never be freed, and the
-- transition allow-list forbids reverting `accepted`. Four reachable stranded states:
--   * conversation creation returns null -> "Accepted" with no thread, no retry;
--   * the pair already has a pending/declined pre-booking request -> the message insert is
--     REJECTED by enforce_prebooking_message_rules, yet the code still navigates, so the
--     owner believes the responder was told and the responder was never contacted;
--   * the message insert fails for any other reason -> same silent false success;
--   * a second accept is then impossible, so the offer is locked in the broken state.
-- The last one is why this had to be fixed before any agreement model lands on these rows.
--
-- THE FIX
-- One SECURITY DEFINER function performs the whole handoff in a single transaction, so
-- acceptance and a usable conversation now succeed or fail together. There is no code path
-- that can leave an accepted response without a conversation a participant can post to.

-- RECORDED, NOT RESOLVED -- these are decisions, not defects, and this slice does not take
-- them. Each was raised in review and is deliberately left open:
--   * OFFER-TEXT MUTABILITY. A response is frozen the moment it is sent (Slice 1), but the
--     offer it answers stays editable, so an owner can change the terms after providers have
--     responded to the old ones. Slice 1's header already states that the DENY-list on
--     barter_offers must become an ALLOW-list when a counterparty-dependent column is added,
--     which Slice 3 will do -- so the enforcement seam is already required. Awaiting a ruling
--     on freeze-on-first-response vs snapshot.
--   * UNRELATED PENDING REQUEST. When the pair already has a pre-booking request open in the
--     REVERSE direction (the offer owner asked the responder as a client, and it is still
--     pending), accepting the barter response force-opens it, resolving a request the
--     responder never acted on. Bounded and arguably intended -- they initiated barter
--     contact -- but it is an inference this code makes, not one a document authorises.
--   * TWO THREADS PER PAIR. `getOrCreateConversation` resolves one orientation; this RPC
--     resolves both. A pair who barter AND book each other can legitimately hold two rows,
--     and `conversation_unique_pair` cannot detect it because both columns differ. Slice 3's
--     agreement has to point at ONE conversation, so this should be settled BEFORE that
--     schema exists, not migrated afterwards.
--   * STRANDED PRE-SLICE-2 ROWS. An interest accepted under the old four-write path that
--     never got a conversation now raises permanently: `accepted` is terminal, the unique
--     index holds the slot, and the idempotent branch refuses rather than repairs. Verified
--     0 accepted interests (so 0 stranded) on non-production; production is NOT queried by
--     this work and its count is unknown. No backfill is included.

-- ── 1. Barter match supersedes a pre-booking request ─────────────────────────
-- enforce_conversation_update already encodes exactly one supersede rule: attaching a real
-- booking opens the thread "regardless of any prior pending/declined request state". A
-- confirmed barter match is the same kind of event -- two providers have agreed to work
-- together -- and without a matching rule the handoff simply cannot open the thread:
-- `declined -> accepted` is not a legal participant transition, and `pending -> accepted`
-- requires being the provider on that row, which the canonical orientation may not make the
-- accepting party.
--
-- The carve-out is gated TWICE, and both gates are necessary.
--
-- EVIDENCE, not caller: it opens the thread only when an ACCEPTED barter interest genuinely
-- links these two providers. A participant cannot reach it by asserting anything -- the
-- accepted row has to exist first, and Slice 1 makes that row writable only by the offer
-- owner along one legal transition.
--
-- But evidence alone is too broad, because an accepted match is PERMANENT (Slice 1 forbids
-- reverting it). A purely evidence-gated rule would therefore hand both parties the ability
-- to reopen ANY declined request between them, forever, with a direct PostgREST PATCH --
-- including the party who was declined. `decline` is the only refusal primitive this product
-- ships (there is no blocking), so making it unilaterally defeasible by the refused party
-- would quietly remove the one way a provider can say no. The second gate is a
-- transaction-local marker published by accept_barter_interest around its own update, which
-- confines the carve-out to the handoff itself. See section 3.
--
-- The two gates answer different questions: the marker asks "is this the handoff?", the
-- evidence asks "is there really a match?". Neither is sufficient alone.
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

alter function public.enforce_conversation_update() owner to postgres;
revoke all on function public.enforce_conversation_update() from public;
revoke all on function public.enforce_conversation_update() from anon;

-- ── 2. Canonical provider↔provider thread key ────────────────────────────────
-- `conversation` is keyed UNIQUE (client_id, provider_id) with an auth uid in one slot and a
-- providers.id in the other -- a shape that assumes one party is a client. For two providers
-- the orientation is arbitrary, and the old code always used (responder.uid, owner.providers.id).
-- That is orientation-DEPENDENT: A accepting B produces a different row than B accepting A,
-- so one human pair could end up with two threads and a split history.
--
-- Canonical rule: the party whose auth uid sorts LOWER takes the client slot, and the OTHER
-- party's providers.id takes the provider slot. Deterministic, independent of who accepted.
--
-- An EXISTING row in either orientation always wins over the canonical one, so this never
-- splits a thread that already exists (including a pre-booking request thread, or a genuine
-- client↔provider booking thread between the same two people). Canonicalisation applies only
-- when creating.
create or replace function public.barter_canonical_conversation(
  p_user_a uuid, p_provider_a uuid,
  p_user_b uuid, p_provider_b uuid
)
returns table (client_id uuid, provider_id uuid)
language sql
immutable
set search_path = ''
as $$
  select case when p_user_a < p_user_b then p_user_a else p_user_b end,
         case when p_user_a < p_user_b then p_provider_b else p_provider_a end;
$$;

alter function public.barter_canonical_conversation(uuid, uuid, uuid, uuid) owner to postgres;
revoke all on function public.barter_canonical_conversation(uuid, uuid, uuid, uuid) from public;
revoke all on function public.barter_canonical_conversation(uuid, uuid, uuid, uuid) from anon;

-- ── 3. The atomic accept ─────────────────────────────────────────────────────
-- Returns the conversation id. Every failure raises, so the caller never receives a
-- half-completed accept.
--
-- Idempotent by design: re-accepting an interest this caller already accepted returns the
-- same conversation id rather than raising, so a double tap, a retry after a dropped
-- response, or a replayed request all converge on one outcome.
--
-- Concurrency: the OFFER row is locked FOR UPDATE before anything is read or written, so two
-- simultaneous accepts on the same offer serialise. The second one then sees the first's
-- accepted row and raises the "already matched" error rather than racing the partial unique
-- index. The index remains the backstop.
create or replace function public.accept_barter_interest(p_interest_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_owner_provider uuid;
  v_responder_user uuid;
  v_responder_provider uuid;
  v_conv_id uuid;
  v_conv public.conversation%rowtype;
  v_client uuid;
  v_provider uuid;
  v_new_status text;
  v_owner_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  -- Lock the OFFER, not the interest: the invariant being protected is one accepted response
  -- PER OFFER, so the offer is the correct serialisation point.
  select o.* into v_offer from public.barter_offers o
   where o.id = v_interest.offer_id for update;
  if not found then
    raise exception 'That offer no longer exists.' using errcode = 'check_violation';
  end if;

  if v_offer.user_id <> v_uid then
    -- DISTINCT errcode. `check_violation` is this migration's general refusal code, and the
    -- client maps it for `accept` to "already answered" -- which would be a FALSE statement
    -- about the counterparty's response here. insufficient_privilege says what actually
    -- happened and lets the client say something true.
    raise exception 'Only the offer owner can accept a response.'
      using errcode = 'insufficient_privilege';
  end if;

  -- DEFENSE IN DEPTH (SEC-AUTHZ-003). Running as postgres, RLS is off, so nothing else in
  -- this function re-establishes that these provider rows belong to the users they are about
  -- to be matched with -- those bindings are held only by write-time policies in another
  -- migration. If an offer ever carried a provider_id not owned by its user_id, this function
  -- would open a conversation with an unrelated THIRD provider and write a message into it
  -- with RLS bypassed. No authenticated path can produce such a row today; this makes that an
  -- assertion of the function rather than an assumption inherited from elsewhere.
  if not exists (
    select 1 from public.providers p
     where p.id = v_offer.provider_id and p.user_id = v_offer.user_id
  ) or not exists (
    select 1 from public.providers p
     where p.id = v_interest.interested_provider_id
       and p.user_id = v_interest.interested_user_id
  ) then
    raise exception 'Offer or response identity is inconsistent; cannot match.'
      using errcode = 'internal_error';
  end if;

  v_owner_provider := v_offer.provider_id;
  v_responder_user := v_interest.interested_user_id;
  v_responder_provider := v_interest.interested_provider_id;

  -- Resolve the thread for this pair, in EITHER orientation, before deciding anything.
  -- Both orientations, DETERMINISTICALLY ordered. Two providers who have also booked each
  -- other legitimately hold BOTH rows, and an unordered `limit 1` would let the match message
  -- land in one thread while a retry returned the other -- so a double tap could navigate to
  -- a thread with no match message in it. Ordering by id makes every call agree.
  select c.* into v_conv from public.conversation c
   where (c.client_id = v_responder_user and c.provider_id = v_owner_provider)
      or (c.client_id = v_offer.user_id and c.provider_id = v_responder_provider)
   order by c.id
   limit 1;

  -- IDEMPOTENCE. Already accepted by this owner: return the existing thread unchanged.
  if v_interest.status = 'accepted' then
    if v_conv.id is null then
      raise exception 'This response is accepted but its conversation is missing.'
        using errcode = 'internal_error';
    end if;
    return v_conv.id;
  end if;

  if v_interest.status <> 'pending' then
    raise exception 'That response has already been answered.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.barter_interests x
     where x.offer_id = v_interest.offer_id and x.status = 'accepted'
  ) then
    raise exception 'This offer has already been matched with another provider.'
      using errcode = 'unique_violation';
  end if;

  -- Accept FIRST, so the evidence the conversation carve-out looks for exists by the time
  -- the thread is opened. Both writes are in this one transaction, so a later failure
  -- rolls this back with everything else.
  update public.barter_interests set status = 'accepted' where id = p_interest_id;

  if v_conv.id is null then
    select cc.client_id, cc.provider_id into v_client, v_provider
      from public.barter_canonical_conversation(
             v_offer.user_id, v_owner_provider,
             v_responder_user, v_responder_provider) cc;
    insert into public.conversation (client_id, provider_id, created_at)
    values (v_client, v_provider, clock_timestamp())
    returning id, request_status into v_conv_id, v_new_status;
    -- enforce_conversation_insert clamps to 'pending' ONLY when the caller occupies the
    -- client slot. Under canonical ordering that depends on which of the two uuids is lower,
    -- so BOTH outcomes are reachable for the same code path:
    --   * clamped to 'pending' -> open it, which section 1 authorises;
    --   * left NULL -> that ALREADY means an open conversation
    --     (enforce_prebooking_message_rules treats a null request_status as open), so
    --     touching it would be a NULL -> 'accepted' transition that no branch permits and
    --     the trigger would rightly reject.
    if v_new_status = 'pending' then
      -- Publish the handoff marker for exactly this one statement, then clear it. It is
      -- transaction-local (is_local = true) so it is discarded at commit or rollback
      -- regardless; the explicit reset matters because the B5B harness runs the whole suite
      -- in ONE transaction, where a marker left set could make a later direct-UPDATE test
      -- pass for the wrong reason.
      perform set_config('app.barter_handoff', v_conv_id::text, true);
      update public.conversation set request_status = 'accepted' where id = v_conv_id;
      perform set_config('app.barter_handoff', '', true);
    end if;
  else
    v_conv_id := v_conv.id;
    if v_conv.request_status is not null and v_conv.request_status <> 'accepted' then
      -- A pending or DECLINED pre-booking request between these two. Left alone, the match
      -- message would be rejected and the pair would have no usable thread. Marker scoped to
      -- this single statement, same reasoning as the insert branch above.
      perform set_config('app.barter_handoff', v_conv_id::text, true);
      update public.conversation set request_status = 'accepted' where id = v_conv_id;
      perform set_config('app.barter_handoff', '', true);
    end if;
  end if;

  select p.display_name into v_owner_name from public.providers p where p.id = v_owner_provider;

  insert into public.messages (conversation_id, sender_id, content, is_read)
  values (
    v_conv_id, v_uid,
    coalesce(v_owner_name, 'A provider') || ' accepted your barter response for "'
      || v_offer.offering_service || '". Work out the details here.',
    false
  );

  update public.conversation set last_message_at = clock_timestamp() where id = v_conv_id;

  return v_conv_id;
end;
$$;

alter function public.accept_barter_interest(uuid) owner to postgres;
revoke all on function public.accept_barter_interest(uuid) from public;
revoke all on function public.accept_barter_interest(uuid) from anon;
grant execute on function public.accept_barter_interest(uuid) to authenticated;
