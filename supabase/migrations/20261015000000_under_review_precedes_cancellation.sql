-- A recorded no-show takes precedence over ordinary cancellation (PD-063).
--
-- FOUNDER RULING, 2026-09-07. `20261012000000` shipped no-show reporting with cancellation
-- dominating unconditionally, which left one shape the Founder has now ruled out: a receiver
-- files a valid no-show report, and the provider it is about cancels the trade, and the derived
-- Under Review state disappears from both screens. The report row survived, but nothing showed
-- it. **The party a report is about must not be able to make it stop counting.**
--
-- ── THE APPROVED STATE BOUNDARY ────────────────────────────────────────────
--
--   A. Cancellation commits first  → the agreement is cancelled, and a later no-show report is
--      REFUSED (`PT409`). This already held; `20261012000000` checks for cancellations under the
--      lock and this migration does not change it.
--   B. No-show report commits first → the agreement is Under Review, and a later ordinary
--      cancellation is REFUSED (`PT423`, new). **This is what this migration adds.**
--   C. They race → exactly ONE transition wins. Guaranteed by the shared agreement row lock, not
--      by hope: both writers take `barter_agreements` FOR UPDATE first (`20261014000000` moved
--      no-show onto that order), so the second one to arrive blocks, and when it proceeds it sees
--      the first one's committed state and takes its refusing branch.
--
-- NEVER, and each of these is asserted rather than assumed:
--   * a report exists and a later cancellation hides or clears it;
--   * cancellation and a no-show report both commit as compatible ordinary states;
--   * cancellation deletes or rewrites no-show history — it cannot, the table is append-only.
--
-- ── WHY A NEW SQLSTATE ─────────────────────────────────────────────────────
--
-- `PT423` (HTTP 423 Locked, matching the repo's `PT4xx` convention alongside `PT409`/`PT410`/
-- `PT412`) rather than reusing `object_not_in_prerequisite_state`. That code already means
-- "something has already been delivered", and a trade under review has NOT necessarily been
-- delivered — telling a provider it had would be a false statement about their own trade. A
-- distinct code lets `lib/barterErrors.ts` say the true thing.
--
-- ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
--
-- Under Review remains an UNRESOLVED OPERATIONAL STATE. Refusing cancellation is not a finding
-- of fault, not Unfulfilled, not a terminal outcome, and not an adjudication — none of which
-- exist. It only stops the one exit that would have made the report stop mattering. The trade
-- stays exactly where it is until a review workflow exists to move it, and this migration does
-- not begin one.
--
-- Nothing about NEEDS ATTENTION changes. A plain elapsed window still does not enter Under
-- Review, still creates no second timer, and still resolves only by the receiver answering; how
-- it might later enter review is explicitly UNDECIDED and belongs to the adjudication slice.

-- ── 1. The write path refuses ──────────────────────────────────────────────
--
-- LIVE DEFINITION taken from `20261010000000_cancellation_notice_neutral_copy.sql` — read from
-- MIGRATION_LEDGER.md's functions table, NOT from `20261005000000`, which created this function
-- and has been superseded five times. Copying that older body forward would delete the in-thread
-- notice, the post-lock re-check, the actor binding and the neutral wording.
--
-- Exactly ONE block is added, marked below. Every other line is the live body unchanged.
create or replace function public.cancel_barter_agreement(
  p_agreement_id uuid,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ag public.barter_agreements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider uuid;
  v_obligations integer;
  v_delivered integer;
  v_reported integer;
  v_acts integer;
  v_class text;
  v_label text;
  v_offer public.barter_offers%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'Keep the reason under 200 characters.' using errcode = 'invalid_parameter_value';
  end if;

  select ag.* into v_ag from public.barter_agreements ag where ag.id = p_agreement_id;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;
  if v_uid not in (v_ag.owner_user_id, v_ag.responder_user_id) then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  v_provider := case when v_uid = v_ag.owner_user_id
                     then v_ag.owner_provider_id else v_ag.responder_provider_id end;

  select ag.* into v_ag from public.barter_agreements ag
   where ag.id = p_agreement_id for update;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  select count(*) into v_obligations
    from (select o.id from public.barter_obligations o
           where o.agreement_id = p_agreement_id
           order by o.id for update) locked;
  if v_obligations <> 2 then
    raise exception 'That trade is not in a state that can be cancelled.'
      using errcode = 'internal_error';
  end if;

  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = p_agreement_id and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- ── THE ONE ADDED BLOCK (PD-063) ────────────────────────────────────────
  -- Read AFTER the agreement and both obligation rows are locked, so a report committing
  -- concurrently either landed before this lock was taken (and is seen here) or is still waiting
  -- for it (and will see this cancellation). There is no window between the two.
  --
  -- Placed BEFORE the idempotent already-cancelled branch deliberately. Reaching this line with
  -- both a report and this caller's own prior cancellation should be impossible — a report is
  -- refused on a cancelled trade — so if it ever happens the invariant has already broken, and
  -- refusing is the safe direction.
  select count(*) into v_reported
    from public.barter_obligation_no_show_reports r
   where r.agreement_id = p_agreement_id;
  if v_reported > 0 then
    raise exception 'This trade needs review, so it can no longer be cancelled.'
      using errcode = 'PT423';
  end if;
  -- ── END OF THE ADDED BLOCK ──────────────────────────────────────────────

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = p_agreement_id and c.actor_user_id = v_uid) then
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
  end if;

  insert into public.barter_agreement_cancellations
    (agreement_id, actor_user_id, actor_provider_id, reason)
  values (p_agreement_id, v_uid, v_provider, v_reason);

  select count(*) into v_acts from public.barter_agreement_cancellations c
   where c.agreement_id = p_agreement_id;
  -- Derived ONCE, then used for both the wording and the return, so the sentence the
  -- counterparty reads can never disagree with the answer the caller was given.
  v_class := case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;

  select o.* into v_offer from public.barter_offers o where o.id = v_ag.offer_id;
  v_label := public.barter_terms_label(v_offer.offering_service, v_offer.seeking_service);

  perform public.pair_conversation_notice(
    v_ag.owner_provider_id, v_ag.owner_user_id,
    v_ag.responder_provider_id, v_ag.responder_user_id,
    -- Says what the two acts PROVE -- each provider cancelled -- and nothing about whether
    -- either consented to the other's decision. True whether B answered A's cancellation or
    -- the two of them quit at the same moment without ever seeing each other's act.
    case when v_class = 'mutually_cancelled'
         then 'Both providers cancelled the trade for ' || v_label || '.'
         else 'The trade for ' || v_label || ' was cancelled by one provider.'
    end,
    -- Addressed to whoever did NOT just act.
    case when v_uid = v_ag.owner_user_id
         then v_ag.responder_user_id else v_ag.owner_user_id end);

  return v_class;
exception
  when unique_violation then
    -- Reachable only from the act insert: the notice contains its own failures, so nothing it
    -- does can land here and roll the act back while this returns a success.
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
end;
$$;

alter function public.cancel_barter_agreement(uuid, text) owner to postgres;
revoke all on function public.cancel_barter_agreement(uuid, text) from public, anon;
grant execute on function public.cancel_barter_agreement(uuid, text) to authenticated;

-- ── 2. The row guard refuses too ───────────────────────────────────────────
-- Defense in depth behind the RPC, matching how the delivered-check is already doubled here.
-- `authenticated` holds no INSERT on `barter_agreement_cancellations`, so this exists for a
-- privileged or direct insert. Its read is UNLOCKED, so like the delivered-check beside it this
-- is a SEQUENTIAL guard: it catches a cancellation written against an already-reported trade and
-- does NOT by itself decide the race. The race is decided by the agreement lock in the two RPCs.
--
-- Live definition is still `20261005000000`; only the new block is added.
create or replace function public.enforce_barter_cancellation_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
  v_delivered integer;
  v_reported integer;
begin
  select exists (
    select 1 from public.barter_agreements ag
     where ag.id = new.agreement_id
       and (
         (new.actor_user_id = ag.owner_user_id
          and new.actor_provider_id = ag.owner_provider_id)
         or
         (new.actor_user_id = ag.responder_user_id
          and new.actor_provider_id = ag.responder_provider_id)
       )
  ) into v_ok;
  if not v_ok then
    raise exception 'Only a participant of that agreement can cancel it.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = new.agreement_id
     and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- PD-063, the same rule the RPC enforces.
  select count(*) into v_reported
    from public.barter_obligation_no_show_reports r
   where r.agreement_id = new.agreement_id;
  if v_reported > 0 then
    raise exception 'This trade needs review, so it can no longer be cancelled.'
      using errcode = 'PT423';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_cancellation_consistent() owner to postgres;
revoke all on function public.enforce_barter_cancellation_consistent()
  from public, anon, authenticated;

comment on function public.cancel_barter_agreement(uuid, text) is
  'Records this participant''s pre-delivery cancellation. Refused once anything is delivered '
  '(55000) and, per PD-063, once a no-show report exists (PT423) — a trade under review cannot '
  'be cancelled out of review. Takes the agreement lock before the obligation locks, the same '
  'order report_barter_obligation_no_show uses, so exactly one of the two wins a race.';

-- Nothing else changes: no table, no column, no new write path, no new grant, and no terminal
-- outcome. Needs Attention is untouched — it still does not enter Under Review, and no timer,
-- escalation or operator path was created.
