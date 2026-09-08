-- Adjudication hardening: the SECOND participant check, a survivable outcome, and an honest
-- privileged predicate. Three corrections raised by the security and codebase reviews of the
-- adjudication slice, none of which changes what the product does.
--
-- ── 1. THE OUTCOME MUST SURVIVE THE OPERATOR ──────────────────────────────
--
-- `20261019000000` declared `adjudicator_user_id … references auth.users(id) ON DELETE CASCADE`,
-- copied from the no-show reports table. There the cascade is coherent: the reporter IS a
-- participant, so their whole trade graph goes with them. Here it is exactly backwards — the
-- adjudicator is, by construction, NOT a participant (§ 3 refuses one), so erasing an operator's
-- account deleted their adjudications of OTHER PEOPLE'S trades.
--
-- The consequence was not a missing row. Every derived state keys on `exists (adjudications)`
-- (`20261020000000` § 4), so the two providers' resolved obligation would silently REVERT: back
-- to Under Review, controls restored, `terminal_outcome` back to NULL — and with the unique row
-- gone, a different outcome could then be recorded. PD-066 says an adjudication is never
-- withdrawn; routine operator offboarding withdrew it.
--
-- The column becomes NULLABLE with `ON DELETE SET NULL`. The DECISION survives; only the
-- operator's identity is forgotten, which is what an erasure is for and costs the participants
-- nothing — PD-067 already makes the adjudicator invisible to them. Recording an adjudication
-- with no adjudicator is still refused, now explicitly in the trigger (§ 3), because `not null`
-- can no longer do it.
--
-- ── 2. AN HONEST PRIVILEGED PREDICATE ─────────────────────────────────────
--
-- The RPC's in-function guard read `auth.role() = 'service_role' OR auth.uid() IS NULL`, above a
-- comment promising it would "still refuse everyone else" if the EXECUTE grant were widened. It
-- would not have: an `anon` PostgREST request carries no `sub`, so `auth.uid()` is null and the
-- second disjunct admitted it — precisely the scenario the comment claimed to cover. Narrowed to
-- "no claims at all AND no subject", which is what a direct privileged session actually looks
-- like, and which `anon` does not satisfy.
--
-- ── 3. THE SECOND PARTICIPANT CHECK, WHICH DID NOT EXIST ──────────────────
--
-- `20261019000000` states in five places — its header, the parameter comment, the column
-- comment, PD-064 and MIGRATION_LEDGER's functions table — that the adjudicator-may-not-be-a-
-- participant rule is checked in the RPC and RE-CHECKED in the trigger. It was only in the
-- trigger. Nothing was exploitable: the trigger refuses, and no participant can call the RPC at
-- all. What was false was the REDUNDANCY, and the ledger row whose whole purpose is to tell a
-- future editor which guards a copy-forward must not drop was describing a guard that had never
-- been written. The check is added to the RPC, so the documents are now true.
--
-- ── WHAT DOES NOT CHANGE ──────────────────────────────────────────────────
--
-- No grant, no policy, no RLS, no eligibility rule, no outcome vocabulary, no lock order, no
-- read model, no client-visible behaviour. Both function bodies were taken from
-- `20261019000000` — their live definition — and diffed before commit.
--
-- ── A NOTE ON THE DIRECT-INSERT LOCK ORDER, recorded rather than changed ───
--
-- `adjudicate_barter_obligation` takes `barter_agreements` FOR UPDATE and then the obligation,
-- the order `20261014000000` made total across this graph, so the INSERT's two FK `for key
-- share` acquisitions are no-ops against locks already held. A DIRECT privileged INSERT — which
-- `service_role` retains the privilege for — takes those same FK locks in CONSTRAINT DECLARATION
-- order instead: obligation, then agreement. That is the reverse of `cancel_barter_agreement`
-- and can deadlock against it. The FK order is NOT reordered here, because reordering it would
-- require dropping and re-adding a constraint on a live table to fix a path that has no
-- supported caller. **The RPC is the only supported writer.** A future operator tool must call
-- it rather than insert directly.

-- ── 1. The adjudicator reference survives the adjudicator ─────────────────
alter table public.barter_obligation_adjudications
  alter column adjudicator_user_id drop not null;

alter table public.barter_obligation_adjudications
  drop constraint if exists barter_obligation_adjudications_adjudicator_user_id_fkey;

alter table public.barter_obligation_adjudications
  add constraint barter_obligation_adjudications_adjudicator_user_id_fkey
  foreign key (adjudicator_user_id) references auth.users(id) on delete set null;

comment on column public.barter_obligation_adjudications.adjudicator_user_id is
  'The operator who decided. NEVER a participant — refused in the RPC and again in the BEFORE '
  'INSERT trigger. NULLABLE only so that erasing an operator account forgets WHO decided '
  'without withdrawing WHAT was decided; an insert may not omit it. Not participant-readable '
  '(PD-067): no column privilege is granted on it.';

-- ── 2 + 3. The RPC: honest privileged predicate, and the second check ─────
create or replace function public.adjudicate_barter_obligation(
  p_obligation_id uuid,
  p_outcome text,
  p_adjudicator_user_id uuid,
  p_rationale text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_o public.barter_obligations%rowtype;
  v_rationale text := nullif(btrim(coalesce(p_rationale, '')), '');
  v_existing text;
  v_reported boolean;
begin
  -- PRIVILEGED CALLERS ONLY, belt and braces behind the grant. If the EXECUTE grant were ever
  -- widened by accident, this still refuses everyone else.
  -- TIGHTENED. The previous predicate was `auth.role() = 'service_role' or auth.uid() is null`,
  -- and its comment claimed it would still refuse everyone if the EXECUTE grant were ever
  -- widened by accident. It would not: an `anon` PostgREST request carries no `sub`, so
  -- `auth.uid()` is null and the second disjunct ADMITTED it — the exact case the comment named.
  -- The no-JWT disjunct is still necessary (a direct privileged session sets no claims at all),
  -- so it is narrowed to that case rather than removed: no claims AND no subject.
  if not ((select auth.role()) = 'service_role'
          or ((select auth.role()) is null and (select auth.uid()) is null)) then
    raise exception 'Adjudication is not available.' using errcode = 'insufficient_privilege';
  end if;

  if p_outcome is null
     or p_outcome not in ('fulfilled', 'unfulfilled', 'closed_without_resolution') then
    raise exception 'Unknown adjudication outcome.' using errcode = 'internal_error';
  end if;
  if p_adjudicator_user_id is null then
    raise exception 'An adjudication must record who decided it.'
      using errcode = 'check_violation';
  end if;
  if v_rationale is null then
    raise exception 'An adjudication must record why.' using errcode = 'check_violation';
  end if;
  if char_length(v_rationale) > 500 then
    raise exception 'That rationale is too long.' using errcode = '22023';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  perform 1 from public.barter_agreements ag where ag.id = v_o.agreement_id for update;
  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;

  -- ADDED. THE LOAD-BEARING PRODUCT RULE, now actually checked here as well as in the trigger.
  -- `20261019000000` said in five places — its own header, this parameter's comment, the column
  -- comment, PD-064 and the migration ledger — that this rule was enforced in the RPC AND
  -- re-enforced in the BEFORE INSERT trigger. It was only ever in the trigger. Behaviour was
  -- correct, but the redundancy every one of those documents relied on did not exist, and the
  -- ledger row that exists to stop a copy-forward dropping a guard was describing a guard that
  -- was never written. Two independent checks, as designed: a future edit to either one alone
  -- cannot let a participant be recorded as the adjudicator of their own trade.
  if p_adjudicator_user_id in (v_o.deliverer_user_id, v_o.receiver_user_id)
     or exists (select 1 from public.barter_agreements ag
                 where ag.id = v_o.agreement_id
                   and p_adjudicator_user_id in (ag.owner_user_id, ag.responder_user_id)) then
    raise exception 'A participant cannot adjudicate their own trade.'
      using errcode = 'insufficient_privilege';
  end if;

  -- IDEMPOTENT on the SAME outcome; a DIFFERENT outcome is refused. A terminal decision is not
  -- re-openable, and the second caller must be told rather than silently ignored.
  select a.outcome into v_existing from public.barter_obligation_adjudications a
   where a.obligation_id = v_o.id;
  if found then
    if v_existing = p_outcome then
      return v_existing;
    end if;
    raise exception 'This obligation has already been resolved.' using errcode = 'PT412';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to adjudicate.'
      using errcode = 'PT409';
  end if;

  v_reported := exists (select 1 from public.barter_obligation_no_show_reports r
                         where r.obligation_id = v_o.id);
  if not public.barter_obligation_under_review(v_o.status, v_reported, false) then
    raise exception 'Only a trade under review can be adjudicated.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.barter_obligation_adjudications
    (obligation_id, agreement_id, outcome, adjudicator_user_id, rationale)
  values (v_o.id, v_o.agreement_id, p_outcome, p_adjudicator_user_id, v_rationale);

  return p_outcome;
exception
  -- Unreachable under the locks above, and the constraint exists so that "unreachable" is not
  -- load-bearing. Two operators racing the SAME outcome both succeed; different outcomes are
  -- decided by whichever commits first, and the loser is refused.
  when unique_violation then
    select a.outcome into v_existing from public.barter_obligation_adjudications a
     where a.obligation_id = p_obligation_id;
    if v_existing = p_outcome then
      return v_existing;
    end if;
    raise exception 'This obligation has already been resolved.' using errcode = 'PT412';
end;
$$;

alter function public.adjudicate_barter_obligation(uuid, text, uuid, text) owner to postgres;
revoke all on function public.adjudicate_barter_obligation(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.adjudicate_barter_obligation(uuid, text, uuid, text)
  to service_role;

-- ── 3b. The trigger: a null adjudicator is refused explicitly ─────────────
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

  -- ADDED, and load-bearing now that the column is NULLABLE (see § 1). A null adjudicator makes
  -- the participant test below evaluate to NULL rather than true, so without this an insert that
  -- named nobody would pass it. Nullable exists for ERASURE, which happens long after the
  -- insert; recording a decision with no decider was never allowed and still is not.
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

  -- ELIGIBILITY: the obligation must currently be UNDER REVIEW, which is exactly the two
  -- explicit routes PD-062 defines — a no-show report, or a `not_received` answer. An elapsed
  -- window (Needs Attention), a delivery, a passed due date and a passed scheduled time are all
  -- deliberately NOT sufficient. Whether a plain Needs Attention ever becomes Under Review is
  -- still an open Founder question and this migration does not answer it.
  v_reported := exists (select 1 from public.barter_obligation_no_show_reports r
                         where r.obligation_id = v_o.id);
  if not public.barter_obligation_under_review(v_o.status, v_reported, false) then
    raise exception 'Only a trade under review can be adjudicated.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_adjudication_consistent() owner to postgres;
revoke all on function public.enforce_barter_adjudication_consistent()
  from public, anon, authenticated;
-- The trigger itself is NOT recreated: `create or replace function` preserves the OID, so
-- `barter_obligation_adjudications_consistent` still points at this body.
