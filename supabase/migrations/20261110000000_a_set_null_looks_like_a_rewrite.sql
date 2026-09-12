-- FORWARD CORRECTION to 20261108000000 (Account erasure, policy H).
--
-- ══ THE FIFTH AND SIXTH GUARD A SET NULL HAS TO GET PAST ══════════════════
--
-- This is the same finding for the fifth and sixth time, and the pattern deserves
-- naming plainly: **every append-only and immutability guard in this schema was
-- written against a client trying to rewrite history, and a referential
-- `SET NULL` looks exactly like one.** `operator_case_events`,
-- `community_moderation_actions`, `barter_obligations`, and now
-- `barter_interests` and `barter_offers`.
--
-- The refusal was `Only the status of a response may change.` — right against a
-- responder editing their own answer, wrong against an erasure anonymising a
-- departed participant. And the alternative was the CASCADE these keys used to
-- carry, which destroyed `barter_agreements` and its adjudicated obligations
-- along with the bargaining: the counterparty's record of a trade they
-- completed, deleted because the other party left.
--
-- The allowance is PREPENDED and each guard's existing body is preserved
-- verbatim, because these are long functions this repo has lost rules inside
-- before. It is checked in full — the identity column to NULL, the entire rest of
-- the row identical, privileged or no-JWT caller — so it cannot edit anything and
-- cannot REPOINT a party at somebody else.

create or replace function public.enforce_barter_interest_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$

declare
  v_uid uuid := (select auth.uid());
  v_is_offer_owner boolean;
  v_is_responder boolean;
  v_release boolean;
begin
  -- ══ ACCOUNT ERASURE SEVER (20261110000000) ═══════════════════════════════
  --
  -- A referential `SET NULL` is an UPDATE, and this guard's set-difference refuses
  -- every column but the lifecycle ones — so anonymising a departed participant
  -- was refused, and the CASCADE it replaced destroyed the agreement and its
  -- adjudicated obligations (policy H forbids that). Permitted in exactly one
  -- shape, checked in full: `interested_user_id` going to NULL, EVERY other column identical,
  -- from a privileged or no-JWT session. A user id is not a term of the trade —
  -- the surviving `*_provider_id` is what identifies the party.
  if tg_op = 'UPDATE'
     and new.interested_user_id is null
     and old.interested_user_id is not null
     and (to_jsonb(new) - 'interested_user_id') is not distinct from (to_jsonb(old) - 'interested_user_id')
     and ((select auth.role()) = 'service_role' or (select auth.uid()) is null) then
    return new;
  end if;

  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.status := 'pending';
    -- Release fields are never author-supplied, on any path.
    new.released_at := null;
    new.released_by := null;
    new.release_reason := null;
    if exists (
      select 1 from public.barter_offers o
      where o.id = new.offer_id and o.user_id = v_uid
    ) then
      raise exception 'You cannot respond to your own offer.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE.
  v_is_offer_owner := exists (
    select 1 from public.barter_offers o
    where o.id = old.offer_id and o.user_id = v_uid
  );
  -- Now doing real work, exactly as the Slice 1 comment predicted it would when an
  -- author-side path appeared: release_barter_interest is SECURITY DEFINER, so it bypasses
  -- barter_interests_owner_update's RLS filter and a responder's write reaches this trigger.
  v_is_responder := (old.interested_user_id = v_uid);

  -- Is THIS statement the authoritative release RPC performing THIS row's release?
  --
  -- Gated on the TRANSITION as well as the marker, deliberately. Gating on the marker alone
  -- widened the allow-list for ANY update carrying it — including one that changes no status —
  -- so an already-released row's `released_by` and `release_reason` were mutable in principle.
  -- That is the one field pair whose whole purpose is to be a durable, non-repudiable statement
  -- about which party walked away.
  v_release := coalesce(current_setting('app.barter_release', true), '') = old.id::text
               and old.status = 'accepted' and new.status = 'released';

  if v_release then
    -- CLAMPED, not trusted. The trigger derives these itself rather than accepting whatever the
    -- caller wrote, so "the owner cannot record that the responder withdrew" is an invariant of
    -- the WRITE BOUNDARY, not of one well-behaved function. It was the latter until now: the
    -- RPC derived them correctly, and nothing made that true of any future caller that sets the
    -- marker. Same discard-then-derive shape as created_at on the INSERT path above.
    new.released_at := clock_timestamp();
    new.released_by := v_uid;
    -- THREE-WAY with no `else`, deliberately. An `else 'owner_ended_negotiation'` would derive
    -- "not the responder, therefore the owner" 25 lines BEFORE the participant check below --
    -- correct only because that check aborts the statement. With no else, a non-participant
    -- yields NULL and barter_interests_release_complete_check rejects the row regardless of how
    -- the branches are later reordered. Fails closed structurally rather than by arrangement.
    new.release_reason := case
      when v_is_responder then 'responder_withdrew'
      when v_is_offer_owner then 'owner_ended_negotiation'
    end;

    if (to_jsonb(new) - 'status' - 'released_at' - 'released_by' - 'release_reason')
       is distinct from
       (to_jsonb(old) - 'status' - 'released_at' - 'released_by' - 'release_reason') then
      raise exception 'Only the status of a response may change.'
        using errcode = 'check_violation';
    end if;
  else
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Only the status of a response may change.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status is distinct from old.status then
    if v_release then
      -- The ONLY new transition, and it is reachable only from the RPC.
      if not (old.status = 'accepted' and new.status = 'released') then
        raise exception 'A response can only be released from accepted.'
          using errcode = 'check_violation';
      end if;
      -- Either participant may end a pre-agreement negotiation (PD-046 § 7.1). This does NOT
      -- widen ordinary status mutation: outside the release path the owner-only rule below is
      -- untouched, and a responder still cannot accept, decline, or re-pend anything.
      if not (v_is_offer_owner or v_is_responder) then
        raise exception 'Only a participant can end this negotiation.'
          using errcode = 'insufficient_privilege';
      end if;
    else
      if not v_is_offer_owner then
        raise exception 'Only the offer owner can accept or decline a response.'
          using errcode = 'check_violation';
      end if;
      -- Unchanged. `released` is absent by design: it is not reachable outside the RPC, and
      -- there is no path OUT of released — a released response is never re-pended or
      -- re-accepted.
      if not (old.status = 'pending' and new.status in ('accepted', 'declined')) then
        raise exception 'A response can only go from pending to accepted or declined.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end 
$fn$;

alter function public.enforce_barter_interest_write() owner to postgres;
revoke all on function public.enforce_barter_interest_write() from public, anon, authenticated;

create or replace function public.enforce_barter_offer_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$

begin
  -- ══ ACCOUNT ERASURE SEVER (20261110000000) ═══════════════════════════════
  --
  -- A referential `SET NULL` is an UPDATE, and this guard's set-difference refuses
  -- every column but the lifecycle ones — so anonymising a departed participant
  -- was refused, and the CASCADE it replaced destroyed the agreement and its
  -- adjudicated obligations (policy H forbids that). Permitted in exactly one
  -- shape, checked in full: `user_id` going to NULL, EVERY other column identical,
  -- from a privileged or no-JWT session. A user id is not a term of the trade —
  -- the surviving `*_provider_id` is what identifies the party.
  if tg_op = 'UPDATE'
     and new.user_id is null
     and old.user_id is not null
     and (to_jsonb(new) - 'user_id') is not distinct from (to_jsonb(old) - 'user_id')
     and ((select auth.role()) = 'service_role' or (select auth.uid()) is null) then
    return new;
  end if;

  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    -- DEPRECATED FIELD (PD-069). Silently dropped rather than refused, so a not-yet-updated
    -- client can still post an offer. No new barter offer records a dollar value.
    new.offering_value := null;
    return new;
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Offer identity and creation time are not editable.'
      using errcode = 'check_violation';
  end if;
  -- ONE-DIRECTIONAL. A legacy value may be kept (so an old offer stays editable) or cleared,
  -- never introduced and never changed. `is distinct from` is required rather than `<>` because
  -- NULL is the ordinary case on both sides here.
  if new.offering_value is distinct from old.offering_value
     and new.offering_value is not null then
    raise exception 'Barter offers no longer carry an estimated value.'
      using errcode = 'check_violation';
  end if;
  return new;
end 
$fn$;

alter function public.enforce_barter_offer_write() owner to postgres;
revoke all on function public.enforce_barter_offer_write() from public, anon, authenticated;
