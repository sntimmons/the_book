-- FORWARD CORRECTION to 20261039000000 (Correction 3, item X).
--
-- ── THE DEFECT ────────────────────────────────────────────────────────────
--
-- `20261039000000` gave a deliverer's review request the third route into Under
-- Review and taught `adjudicate_barter_obligation` to accept it — but the
-- eligibility rule is enforced in TWO places, by design. The RPC checks it, and
-- `enforce_barter_adjudication_consistent` re-checks it on the adjudications
-- table so that a direct privileged INSERT cannot bypass the RPC. That trigger
-- was not updated, so it went on refusing anything that was not a no-show report
-- or a `not_received` answer.
--
-- The result was a transition that read correctly and did nothing: the trade
-- showed **Under Review** to both participants, and the operator path refused it
-- as `object_not_in_prerequisite_state` — the exact "cosmetic" failure
-- `20261039000000`'s own § 7 said it existed to prevent. The Review Queue that
-- PD-068 makes a pre-beta requirement would have been unable to act on the very
-- rows item X was built to produce.
--
-- Caught by `supabase/tests/barter_review_request.test.sql` § 10, which asserts
-- the operator can actually resolve a requested review rather than only that the
-- RPC's own precondition passes. The RPC's insert goes through this trigger, so
-- the two checks must agree; the test failing at the INSERT is what surfaced the
-- disagreement.
--
-- ── WHAT CHANGES ──────────────────────────────────────────────────────────
--
-- The eligibility check gains the same disjunct the RPC already has, and the
-- comment above it — which still said the escalation question was open — is
-- corrected. Nothing else moves.
--
-- Body copied forward from `pg_get_functiondef` on the LIVE object, whose
-- definition is `20261023000000_adjudication_hardening.sql` per the ledger, NOT
-- the `20261019000000` that created it. The ledger row for this function names
-- two rules that a copy-forward silently drops and that are not obvious from the
-- body: the explicit NULL-`adjudicator_user_id` refusal (load-bearing since
-- `20261023000000` made the column nullable for erasure, because the participant
-- test below it evaluates to NULL rather than true on a null), and the
-- participant check made against BOTH the agreement's participants and the
-- obligation's. Both are preserved verbatim below.

create or replace function public.enforce_barter_adjudication_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.barter_obligations%rowtype;
  v_ag public.barter_agreements%rowtype;
  v_reported boolean;
  v_requested boolean;
begin
  -- Server-stamped on EVERY insert path, not merely defaulted: a DEFAULT is overridden by an
  -- explicit insert, and this timestamp is the record of when a decision was actually made.
  new.adjudicated_at := clock_timestamp();

  select o.* into v_o from public.barter_obligations o where o.id = new.obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;
  if new.agreement_id <> v_o.agreement_id then
    raise exception 'An adjudication must belong to its obligation''s agreement.'
      using errcode = 'check_violation';
  end if;

  select ag.* into v_ag from public.barter_agreements ag where ag.id = v_o.agreement_id;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  -- Load-bearing now that the column is NULLABLE. A null adjudicator makes the participant test
  -- below evaluate to NULL rather than true, so without this an insert that named nobody would
  -- pass it. Nullable exists for ERASURE, which happens long after the insert; recording a
  -- decision with no decider was never allowed and still is not.
  if new.adjudicator_user_id is null then
    raise exception 'An adjudication must record who decided it.' using errcode = 'check_violation';
  end if;

  -- THE PRODUCT RULE, enforced where no caller can skip it: participants may not adjudicate
  -- their own trade. Checked against BOTH the agreement's participants and the obligation's, so
  -- it holds even if those two sets were ever to drift.
  if new.adjudicator_user_id in (v_ag.owner_user_id, v_ag.responder_user_id)
     or new.adjudicator_user_id in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'A participant cannot adjudicate their own trade.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A cancelled trade is over and has nothing to resolve.
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to adjudicate.'
      using errcode = 'check_violation';
  end if;

  -- ELIGIBILITY: the obligation must currently be UNDER REVIEW. There are now THREE routes, and
  -- this check must list all of them or it silently vetoes the ones it omits — which is exactly
  -- the defect this migration corrects.
  --
  --   1. a no-show report, and 2. a `not_received` answer — PD-062's two RECEIVER acts, folded
  --      into `barter_obligation_under_review`;
  --   3. a DELIVERER's explicit review request — item X, closing OQ-071. The open question was
  --      how a plain Needs Attention might enter Under Review; the Founder ruling answers it with
  --      a participant-initiated act and NOT a timer or an automatic escalation.
  --
  -- An elapsed window with none of the three, a delivery, a passed due date and a passed
  -- scheduled time all remain deliberately insufficient: something explicit must have put the
  -- obligation into review before anyone may resolve it. This mirrors
  -- `adjudicate_barter_obligation` exactly, which is the point of the second copy — a direct
  -- privileged INSERT is held to the same rule as the RPC, neither looser nor stricter.
  v_reported := exists (select 1 from public.barter_obligation_no_show_reports r
                         where r.obligation_id = v_o.id);
  v_requested := exists (select 1 from public.barter_obligation_review_requests rr
                          where rr.obligation_id = v_o.id);
  if not (public.barter_obligation_under_review(v_o.status, v_reported, false) or v_requested) then
    raise exception 'Only a trade under review can be adjudicated.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_adjudication_consistent() owner to postgres;
revoke all on function public.enforce_barter_adjudication_consistent() from public, anon, authenticated;

-- The trigger itself is NOT recreated: `create or replace function` preserves the OID, so
-- `barter_adjudication_consistent` on public.barter_obligation_adjudications keeps pointing at
-- the corrected body.
