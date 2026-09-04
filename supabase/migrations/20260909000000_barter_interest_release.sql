-- Barter Slice 3a-0 — release a dead pre-agreement negotiation.
--
-- Scope: the accepted-interest release amendment ONLY. No proposal, agreement, obligation,
-- acceptance, cancellation or adjudication schema. No My Trades, no notifications, no
-- abandonment/expiry, no offer-side rate limiter, no block/report, no reputation, no
-- multi-party, no production change.
--
-- THE DEFECT THIS CLOSES
-- Slice 1 made `accepted` TERMINAL and enforced one accepted interest per offer. That was
-- right for integrity and wrong for the product: a negotiation that ends before any official
-- agreement — which PD-046 § 7.1 says is ORDINARY and carries no penalty — permanently
-- consumed the post's only negotiation slot. The owner could not select another responder and
-- could not delete the post (PD-043), so the only exit was close-and-repost, discarding every
-- responder. A penalty, applied silently, to the party the ruling says did nothing wrong.
--
-- THE MODEL (Founder ruling, 2026-09-04)
--   post -> many pending interests -> ONE accepted interest -> ONE active negotiation
-- Exactly one active negotiation per post. Concurrent negotiations are NOT supported, and the
-- one-accepted-per-offer invariant is NOT removed. If the negotiation ends before an official
-- agreement, `accepted -> released` frees the slot while preserving history.
--
-- WHAT IS DELIBERATELY NOT VERIFIED HERE, AND THE SEAM FOR IT
-- No proposal or agreement table exists yet, so this function CANNOT check that no official
-- agreement was formed. **This operation is valid only in the current pre-agreement model.**
-- When the agreement tables land, `release_barter_interest` MUST gain the invariant "no
-- official agreement exists for this interest/post" — added HERE, inside this function, which
-- is deliberately shaped as the single seam future slices extend. Do not create a second
-- release path.
--
-- AND NOTE WHERE THAT GUARD HAS TO LIVE. The trigger below authorises `accepted -> released`
-- for any statement carrying the marker; it does not know what preconditions the RPC checked.
-- So a guard added ONLY to this function body would be a caller-level guarantee -- exactly the
-- shape of the defect this slice had to correct one layer up, where attribution was derived
-- correctly by the RPC and by nothing else. The agreement guard must be enforced where the
-- transition is authorised, and proven by a test that sets the marker DIRECTLY and asserts
-- refusal, not merely by an RPC-level test.

-- ── 0. Pre-apply integrity check ─────────────────────────────────────────────
-- The new columns are meaningless unless every accepted row can be described by them. Fail
-- loudly rather than half-applying.
do $$
declare v_n integer;
begin
  -- `released` is included so this file is IDEMPOTENT: re-applying it after a release has
  -- happened must succeed. An earlier version omitted it and aborted on exactly the state the
  -- migration creates, telling the operator to "reconcile" correct rows.
  select count(*) into v_n from public.barter_interests where status not in
    ('pending', 'accepted', 'declined', 'released');
  if v_n > 0 then
    raise exception using errcode = 'check_violation',
      message = format('REFUSING TO APPLY: %s barter_interests row(s) hold a status outside '
        || 'the known vocabulary.', v_n),
      hint = 'Reconcile them before applying; this migration assumes the Slice 1 vocabulary.';
  end if;
end $$;

-- ── 1. The status vocabulary gains `released` ────────────────────────────────
-- The CHECK constraint is the reason a naive "just add the transition" amendment fails
-- closed: `released` is not a legal value until this runs.
alter table public.barter_interests drop constraint if exists barter_interests_status_check;
alter table public.barter_interests add constraint barter_interests_status_check
  check (status in ('pending', 'accepted', 'declined', 'released'));

-- NOTE: `barter_interests_one_accepted_per_offer` is ALREADY partial on `status = 'accepted'`,
-- so a row moving to `released` leaves the index automatically. It is deliberately NOT
-- rebuilt — re-scoping it would be a no-op that churns a live unique index for nothing.

alter table public.barter_interests
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid,
  add column if not exists release_reason text;

-- Reasons are derived from the ACTOR, never supplied, so neither party can characterise the
-- other's exit. `mutual_end` is reserved and intentionally unreachable: no current product
-- flow can establish mutuality, and inventing a two-click mutual protocol was explicitly out
-- of scope. It stays in the vocabulary so a later slice that CAN establish it does not have to
-- alter this constraint on a live table.
alter table public.barter_interests drop constraint if exists barter_interests_release_reason_check;
alter table public.barter_interests add constraint barter_interests_release_reason_check
  check (release_reason is null or release_reason in
    ('responder_withdrew', 'owner_ended_negotiation', 'mutual_end'));

-- Released rows are fully described, or not released at all.
alter table public.barter_interests drop constraint if exists barter_interests_release_complete_check;
alter table public.barter_interests add constraint barter_interests_release_complete_check
  check (
    (status = 'released' and released_at is not null and released_by is not null
       and release_reason is not null)
    or (status <> 'released' and released_at is null and released_by is null
       and release_reason is null)
  );

comment on column public.barter_interests.release_reason is
  'Why the pre-agreement negotiation ended. DERIVED from the acting participant by '
  'release_barter_interest(); never client-supplied, so neither party can characterise the '
  'other''s exit. mutual_end is reserved and unreachable in the first beta.';

-- ── 2. Write integrity, amended ──────────────────────────────────────────────
-- Two defects in the shipped trigger had to be fixed together, and neither is visible from the
-- transition list alone:
--
--   (a) THE ACTOR GATE. `if new.status is distinct from old.status then if not
--       v_is_offer_owner then raise` fires BEFORE the transition allow-list is consulted. So
--       merely adding `accepted -> released` to that list would still abort every
--       responder-initiated withdrawal — half of all negotiation exits — leaving the interest
--       `accepted` and the slot consumed. That is the exact stranded state this slice exists
--       to remove, reintroduced by the amendment meant to remove it.
--
--   (b) THE COLUMN ALLOW-LIST. `(to_jsonb(new) - 'status')` makes every other column immutable
--       by design, which is correct and must stay — but the three release columns have to move
--       in the same statement as the status. They are excluded ONLY on the release path.
--
-- The release path is identified by a transaction-local marker published by
-- release_barter_interest around its own UPDATE — the app.barter_handoff pattern. A
-- client-supplied field would be proof of nothing; a GUC that only the definer function sets,
-- and that PostgREST callers cannot set in the same transaction as their own UPDATE, is.
create or replace function public.enforce_barter_interest_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_offer_owner boolean;
  v_is_responder boolean;
  v_release boolean;
begin
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
end $$;

alter function public.enforce_barter_interest_write() owner to postgres;
revoke all on function public.enforce_barter_interest_write() from public, anon;

-- ── 3. The authoritative release path ────────────────────────────────────────
-- No reason parameter, deliberately. The reason is DERIVED from who is calling, so it is
-- structurally impossible for the owner to record "the responder withdrew" or for the
-- responder to record "the owner ended it". A validated parameter would still let a caller
-- assert something untrue about the counterparty; deriving it removes the question.
create or replace function public.release_barter_interest(p_interest_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_is_owner boolean;
  v_is_responder boolean;
  v_reason text;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  -- Lock the OFFER, not the interest: the invariant being protected is "one accepted response
  -- per offer", so the offer is the serialisation point — the same reasoning by which
  -- accept_barter_interest locks the offer. This makes release and a concurrent accept of a
  -- different response serialise against each other rather than racing for the freed slot.
  select o.* into v_offer from public.barter_offers o
   where o.id = v_interest.offer_id for update;
  if not found then
    raise exception 'That offer no longer exists.' using errcode = 'check_violation';
  end if;

  -- Re-read under the lock.
  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;

  v_is_owner := (v_offer.user_id = v_uid);
  v_is_responder := (v_interest.interested_user_id = v_uid);

  if not (v_is_owner or v_is_responder) then
    -- DISTINCT errcode: check_violation is this surface's general refusal and the client maps
    -- it to statements about the response's state, which would be false here.
    raise exception 'Only a participant can end this negotiation.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent where safe: re-releasing returns the recorded reason rather than raising, so a
  -- double tap or a retried request is not an error. Deliberately AFTER the participant check,
  -- so a non-participant learns nothing about the row.
  if v_interest.status = 'released' then
    return v_interest.release_reason;
  end if;

  if v_interest.status <> 'accepted' then
    raise exception 'Only the response currently in negotiation can be released.'
      using errcode = 'check_violation';
  end if;

  -- A SEED, not the decision. The trigger clamps all three release columns, so whatever is
  -- written here is overwritten -- and this function must not look like the place the rule
  -- lives, because the header points future slices at it as the seam to extend. An engineer
  -- who added `mutual_end` here and nowhere else would watch it be silently rewritten to
  -- `owner_ended_negotiation`: a legal value, no constraint violation, a green suite.
  --
  -- It is still written rather than left null, because the trigger early-returns for
  -- service_role and barter_interests_release_complete_check would then reject the row. The
  -- value RETURNED to the caller is read back from the row below, so it is whatever was
  -- actually recorded, never merely what this function intended.
  v_reason := case when v_is_responder then 'responder_withdrew'
                   else 'owner_ended_negotiation' end;

  -- PRE-AGREEMENT ONLY. There is no agreement schema yet, so nothing to check. When it lands,
  -- the "no official agreement exists for this interest" guard goes HERE.
  perform set_config('app.barter_release', v_interest.id::text, true);
  update public.barter_interests
     set status = 'released',
         released_at = clock_timestamp(),
         released_by = v_uid,
         release_reason = v_reason
   where id = v_interest.id
  returning release_reason into v_reason;
  perform set_config('app.barter_release', '', true);

  -- Read back, so the caller is told what the write boundary RECORDED, not what this function
  -- proposed. If the two ever diverge, the caller sees the truth.
  return v_reason;
end $$;

alter function public.release_barter_interest(uuid) owner to postgres;
revoke all on function public.release_barter_interest(uuid) from public, anon;
grant execute on function public.release_barter_interest(uuid) to authenticated;

-- ── 4. PD-043 is untouched ───────────────────────────────────────────────────
-- enforce_barter_offer_delete refuses deletion when ANY barter_interests row references the
-- offer, whatever its status — so a released interest still blocks hard delete, and the owner
-- does not regain that ability by ending a negotiation. Close/archive remains the removal
-- path. Deliberately NOT modified; asserted in B5B.
