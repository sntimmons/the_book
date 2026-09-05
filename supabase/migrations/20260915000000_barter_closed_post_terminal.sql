-- Closed barter posts are TERMINAL. Founder rulings, 2026-09-04 (PD-051, PD-052).
--
-- PD-050 made a manually closed post unable to select a NEW response. These rulings finish the
-- shape: closing is one-way, and a closed post's pending responses cannot be answered at all --
-- neither accepted nor declined. They stay pending history, and both parties are told why.
--
-- Scope: two guards and one sanitiser fix. No proposal/agreement/obligation schema.

-- ── 1. `is_active` is ONE-WAY for authenticated writers (PD-051) ─────────────
-- `barter_offers_owner_update`'s USING is `user_id = auth.uid()`, and enforce_barter_offer_write
-- pins only `id` and `created_at` -- so nothing stopped an owner PATCHing is_active back to
-- true, accepting, and closing again. That defeats PD-050 through the one column PD-050 reads,
-- while leaving PD-050 itself literally satisfied (accepting never acted as the reopen; a
-- separate write did).
--
-- Pending responders are told a closed post is finished and their response is history. That
-- statement has to be durable, or it is not a statement. A provider who wants to offer again
-- creates a new post.
--
-- ADDITIVE trigger, not a redefinition of enforce_barter_offer_write: `create or replace
-- function` replaces a whole body, and this repo has already lost a row lock that way
-- (see MIGRATION_LEDGER.md, enforce_prebooking_message_rules). A new trigger cannot delete a
-- correction it does not know about.
create or replace function public.enforce_barter_offer_active_one_way()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role exempt, matching every sibling trigger on this table
  -- (enforce_barter_offer_write, enforce_barter_interest_write, the rate limiter). Support
  -- and backfill paths keep the ability to reopen; authenticated owners do not.
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if old.is_active is false and new.is_active is true then
    raise exception 'A closed post cannot be reopened. Create a new post instead.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_offer_active_one_way() owner to postgres;
revoke all on function public.enforce_barter_offer_active_one_way() from public, anon;

-- `zy` so it sorts AFTER barter_offers_write_integrity, which owns column immutability and
-- should speak first about a write that violates both.
drop trigger if exists barter_offers_zy_active_one_way on public.barter_offers;
create trigger barter_offers_zy_active_one_way
  before update on public.barter_offers
  for each row execute function public.enforce_barter_offer_active_one_way();

-- ── 2. A closed post's responses cannot be ANSWERED at all (PD-052) ──────────
-- 20260914000000 blocked only the transition into `accepted`. Decline was left legal, and the
-- two client surfaces then disagreed about whether to offer it. Worse, declining on a closed
-- post silently rewrites what the RESPONDER is told: "This post has been closed without your
-- response being accepted" becomes "Your response was not selected" -- collapsing exactly the
-- distinction PD-050 requires both parties be shown.
--
-- Renamed from enforce_barter_accept_open_offer because it is no longer only about accepting,
-- and a function whose name understates what it refuses is how the next author reasons wrongly
-- about it. The old trigger and function are dropped in the same statement block.
drop trigger if exists barter_interests_zy_accept_open_offer on public.barter_interests;
drop function if exists public.enforce_barter_accept_open_offer();

create or replace function public.enforce_barter_answer_open_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  -- service_role exempt, per the convention named in section 1. Noted by review as the one
  -- omission in the 20260914000000 version: with no exemption, and with
  -- enforce_barter_interest_write clamping every authenticated INSERT to 'pending', the INSERT
  -- arm bound ONLY service_role -- the single role the house pattern exempts.
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Only the transitions INTO an answered state. `released` is untouched: a negotiation
  -- outlives its post (PD-049), so either party may still end one on a closed post.
  if new.status is null or new.status not in ('accepted', 'declined') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select o.is_active into v_active
    from public.barter_offers o where o.id = new.offer_id;
  if v_active is false then
    -- DISTINCT sqlstate. check_violation is this table's general refusal code and the client
    -- maps it, for both accept and decline, to "already answered" -- which would blame the
    -- responder for something the OWNER did. 55000 says what is actually wrong: the POST.
    raise exception 'This post is closed. Its responses are history and can no longer be answered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_answer_open_offer() owner to postgres;
revoke all on function public.enforce_barter_answer_open_offer() from public, anon;

-- `zy` so it sorts AFTER barter_interests_write_integrity (which validates the transition
-- itself) and before barter_interests_zz_rate_limit, following this table's convention. An
-- illegal transition is therefore refused by the rule that owns it, and this trigger speaks
-- only about the post.
drop trigger if exists barter_interests_zy_answer_open_offer on public.barter_interests;
create trigger barter_interests_zy_answer_open_offer
  before insert or update on public.barter_interests
  for each row execute function public.enforce_barter_answer_open_offer();

-- ── 3. The accept-handoff message uses the sanitiser ─────────────────────────
-- The release notice was hardened in 20260913000000/20260914000000; THIS call site composes a
-- message from the same two participant-authored columns and was missed. Lower stakes -- it is
-- attributed to the owner (sender_id = v_uid) so it renders in their own bubble and never posed
-- as platform speech -- but it interpolated up to 200 unbounded characters, with a working
-- quote breakout, into a sentence the platform composed.
--
-- LINEAGE NOTE: this body was taken from 20260907000000, which MIGRATION_LEDGER.md confirms is
-- the current definition (accept_barter_interest has never been redefined), and only the two
-- message-composition lines were changed. Verified by diff before committing: 2 lines removed.
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
    -- SANITISED. Both interpolated values are participant-authored: display_name and
    -- offering_service are free text the owner controls, and this message is composed by the
    -- PLATFORM, so an unstripped quote closes ours and opens free prose mid-sentence, exactly
    -- as it did in the release notice. Same helper, same reason -- this call site was simply
    -- missed when that one was fixed. This message is attributed (sender_id = v_uid), so it
    -- renders in the owner's own bubble and never posed as platform speech; the bound and the
    -- quote containment are still worth having.
    substr(public.barter_terms_sanitize(coalesce(v_owner_name, 'A provider')), 1, 40)
      || ' accepted your barter response for "'
      || substr(public.barter_terms_sanitize(v_offer.offering_service), 1, 40)
      || '". Work out the details here.',
    false
  );

  update public.conversation set last_message_at = clock_timestamp() where id = v_conv_id;

  return v_conv_id;
end;
$$;

alter function public.accept_barter_interest(uuid) owner to postgres;
revoke all on function public.accept_barter_interest(uuid) from public, anon;
grant execute on function public.accept_barter_interest(uuid) to authenticated;
