-- Manual operator adjudication, and the three terminal OBLIGATION outcomes.
--
-- This slice makes a trade that needs a human resolvable by one. It adds an immutable
-- adjudication record, a narrow operator-only write path, and nothing a participant can reach.
--
-- ── WHAT A TERMINAL OUTCOME IS, AND WHAT IT IS NOT ─────────────────────────
--
-- Exactly three, and they are OBLIGATION-level:
--
--   `fulfilled`                  — resolved as fulfilled.
--   `unfulfilled`                — resolved as not fulfilled.
--   `closed_without_resolution`  — the available information does not support making either
--                                  determination. It is NOT fulfilled, NOT unfulfilled, NOT a
--                                  finding of fault against either provider, and carries no
--                                  reputation effect. It is the honest answer when there is no
--                                  honest answer, and the product needs one so an operator is
--                                  never pushed into inventing a verdict to close a case.
--
-- **NO AGREEMENT-LEVEL OUTCOME EXISTS AND NONE IS CREATED HERE.** No Completed, no Partially
-- Fulfilled, no Not Completed. Adjudicating both obligations of a trade persists no agreement
-- status and triggers no roll-up — that is the next slice, and § 6 asserts its absence.
--
-- ── OBLIGATION-GRANULAR, DELIBERATELY ─────────────────────────────────────
--
-- Each agreement has exactly two obligations and they are resolved INDEPENDENTLY. One side may
-- be `fulfilled` while the other is still Under Review, or `unfulfilled`, or closed without
-- resolution. Forcing both to resolve together would make an operator decide a side they may
-- have no evidence about in order to close the side they do.
--
-- ── ADJUDICATION DOES NOT REWRITE HISTORY ─────────────────────────────────
--
-- Nothing here mutates `delivered_at`, `status`, `receipt_responded_at`, a no-show report or its
-- reason. A receiver who said "Didn't receive" and an operator who later determined `fulfilled`
-- are BOTH on the record, permanently, and that is correct: one is what a participant reported,
-- the other is what an operator concluded. Editing the first to agree with the second would
-- destroy the evidence the second was reached from. `20261011000000` § 3b already freezes the
-- contract fields against every writer; this migration adds no exemption to that.
--
-- ── WHY THERE IS NO PARTICIPANT-REACHABLE PATH ────────────────────────────
--
-- Participants may not adjudicate their own trade. That is enforced THREE ways, each of which
-- would be sufficient alone:
--
--   1. `execute` on the RPC is granted to `service_role` ONLY. `authenticated` and `anon` cannot
--      call it at all — there is no participant-facing adjudication RPC in this product.
--   2. The RPC itself refuses any caller that is not privileged.
--   3. **The adjudicator may not be a participant of the agreement**, checked in the RPC and
--      re-checked independently in the BEFORE INSERT trigger. This is the load-bearing one: it
--      holds even for a privileged caller, so a compromised or mistaken operator process cannot
--      record a provider as the adjudicator of their own trade.
--
-- No operator UI is built. `app/admin` is `__DEV__`-only and gated merely on "is a provider"
-- (`app/admin/_layout.tsx`), so it is NOT a trusted operator surface, and building the first real
-- one is a larger question than this slice. Per the Founder ruling, the secure server path lands
-- first and the UI is deferred rather than authorization being weakened to make a screen easy.

-- ── 1. The record ──────────────────────────────────────────────────────────
--
-- At most ONE adjudication per obligation, enforced by the unique constraint. There is no edit,
-- no withdrawal and no outcome flip: a correction, if the product ever needs one, must be its own
-- explicitly approved and audited mechanism, not an UPDATE to this row.
create table if not exists public.barter_obligation_adjudications (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null unique
    references public.barter_obligations(id) on delete cascade,
  agreement_id uuid not null references public.barter_agreements(id) on delete cascade,
  outcome text not null,
  -- The operator who decided. Never a participant — see § 3.
  adjudicator_user_id uuid not null references auth.users(id) on delete cascade,
  -- REQUIRED, and INTERNAL. See the grant block in § 4 for why participants cannot read it.
  rationale text not null,
  adjudicated_at timestamptz not null default clock_timestamp(),
  constraint barter_obligation_adjudications_outcome_check
    check (outcome in ('fulfilled', 'unfulfilled', 'closed_without_resolution')),
  constraint barter_obligation_adjudications_rationale_check
    check (char_length(btrim(rationale)) between 1 and 500)
);

create index if not exists barter_obligation_adjudications_agreement_idx
  on public.barter_obligation_adjudications (agreement_id);

alter table public.barter_obligation_adjudications owner to postgres;

comment on table public.barter_obligation_adjudications is
  'Immutable operator resolution of ONE obligation. At most one per obligation, never edited, '
  'never withdrawn, never flipped. Obligation-granular: the other side of the same agreement is '
  'unaffected. Creates no agreement-level outcome — none exists.';
comment on column public.barter_obligation_adjudications.outcome is
  'fulfilled | unfulfilled | closed_without_resolution. The third is NOT a finding of fault and '
  'NOT a weaker unfulfilled: it records that the information does not support either finding.';
comment on column public.barter_obligation_adjudications.adjudicator_user_id is
  'The operator. Re-checked against the agreement''s participants and REFUSED if it names one, '
  'in both the RPC and the BEFORE INSERT trigger, so no privileged caller can record a provider '
  'as the adjudicator of their own trade.';
comment on column public.barter_obligation_adjudications.rationale is
  'Required, operator-authored, and INTERNAL — participants hold no column privilege on it '
  '(§ 4). It is the operator''s working reasoning, not a statement addressed to the providers.';
comment on column public.barter_obligation_adjudications.adjudicated_at is
  'Server-stamped on every insert path by the consistency trigger, not merely defaulted.';

-- ── 2. The record is append-only ───────────────────────────────────────────
-- No edit, no withdrawal, no outcome flip. The privileged branch permits DELETE only, which is
-- what account erasure and the agreement CASCADE depend on — the same shape
-- `enforce_barter_no_show_append_only` uses, and for the same reason.
create or replace function public.enforce_barter_adjudication_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
      return old;
    end if;
    raise exception 'An adjudication cannot be deleted.' using errcode = 'check_violation';
  end if;
  -- UPDATE is refused for EVERYONE, privileged callers included. A terminal outcome that could
  -- be edited by the trusted path is not terminal; a correction needs its own audited mechanism.
  raise exception 'An adjudication cannot be changed once recorded.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_adjudication_append_only() owner to postgres;
revoke all on function public.enforce_barter_adjudication_append_only()
  from public, anon, authenticated;

drop trigger if exists barter_obligation_adjudications_append_only
  on public.barter_obligation_adjudications;
create trigger barter_obligation_adjudications_append_only
  before update or delete on public.barter_obligation_adjudications
  for each row execute function public.enforce_barter_adjudication_append_only();

-- ── 3. A row must describe a real, eligible, operator-decided resolution ───
-- Defense in depth behind the RPC. `authenticated` holds no INSERT, so this exists for a
-- privileged or direct insert, and it re-derives everything from the obligation rather than
-- trusting the row.
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

drop trigger if exists barter_obligation_adjudications_consistent
  on public.barter_obligation_adjudications;
create trigger barter_obligation_adjudications_consistent
  before insert on public.barter_obligation_adjudications
  for each row execute function public.enforce_barter_adjudication_consistent();

-- ── 4. RLS: the OUTCOME is participant-visible, the RATIONALE is not ───────
alter table public.barter_obligation_adjudications enable row level security;

-- Both participants may see that their obligation was resolved, and how. Scoped through the
-- OBLIGATION's participant columns, which are frozen against every writer
-- (`20261011000000` § 3b), so the policy cannot be widened by moving an obligation.
drop policy if exists barter_adjudications_participant_read
  on public.barter_obligation_adjudications;
create policy barter_adjudications_participant_read
  on public.barter_obligation_adjudications
  for select to authenticated
  using (
    exists (
      select 1 from public.barter_obligations o
       where o.id = barter_obligation_adjudications.obligation_id
         and (select auth.uid()) in (o.deliverer_user_id, o.receiver_user_id)
    )
  );

-- COLUMN-LEVEL GRANTS, and this is the whole mechanism for the visibility split.
--
-- A row policy decides WHICH ROWS a caller may read; it cannot hide a COLUMN. Granting
-- `select` on the table would therefore expose `rationale` — the operator's internal reasoning —
-- to both providers through PostgREST, which is precisely what the ruling forbids. Granting the
-- four participant-visible columns and NOT `rationale` is the narrowest correct tool, and it is
-- enforced by the database rather than by every future query remembering to omit a field.
--
-- `adjudicator_user_id` is also withheld: which operator decided a case is not a participant's
-- business and naming them invites pressure on an individual.
revoke all on table public.barter_obligation_adjudications from public, anon, authenticated;
grant select (id, obligation_id, agreement_id, outcome, adjudicated_at)
  on table public.barter_obligation_adjudications to authenticated;

-- No INSERT, UPDATE or DELETE policy of any kind. Every write goes through § 5.

-- ── 5. The one write path, and it is not reachable by any client ──────────
--
-- **`execute` is granted to `service_role` ONLY.** `authenticated` and `anon` are revoked, so
-- there is no participant-facing adjudication RPC in this product — a participant cannot call
-- this, correctly or otherwise.
--
-- ON THE ADJUDICATOR PARAMETER. The operator id is passed in rather than read from `auth.uid()`,
-- because a `service_role` call carries no JWT and `auth.uid()` is null there. That is only safe
-- because the parameter is not client-reachable AND because the value is re-checked: naming a
-- participant is refused here and again in the trigger. A trusted server process supplying its
-- authenticated operator's id is the intended and only caller.
--
-- LOCK ORDER: agreement, then obligation — the same order `cancel_barter_agreement` and
-- `report_barter_obligation_no_show` use, so the order across the barter graph stays total and
-- no pair can deadlock.
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
  if not ((select auth.role()) = 'service_role' or (select auth.uid()) is null) then
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

comment on function public.adjudicate_barter_obligation(uuid, text, uuid, text) is
  'Operator-only resolution of ONE obligation. EXECUTE is granted to service_role alone — no '
  'participant-facing adjudication RPC exists. Refuses a participant adjudicator, a cancelled '
  'trade, and any obligation not currently Under Review. Idempotent on the same outcome; a '
  'different outcome is refused. Creates no agreement-level outcome.';

-- ── 6. What this migration deliberately does NOT create ───────────────────
-- No agreement-level outcome of any kind: no Completed, no Partially Fulfilled, no Not
-- Completed, no agreement status column and no roll-up trigger. Adjudicating both obligations of
-- a trade persists nothing at the agreement level.
--
-- No reputation, no score, no review, no notification, no appeal and no correction workflow. No
-- change to `barter_obligations` — no column added, the four-value `status` vocabulary is
-- unchanged, and the terminal outcome deliberately lives in its own table rather than becoming a
-- fifth status: a participant lifecycle value and an operator resolution are different kinds of
-- fact and must not share a vocabulary.
--
-- No escalation from Needs Attention into Under Review. The two Under Review routes are still
-- exactly the two PD-062 defines, and § 3's eligibility check is written in terms of
-- `barter_obligation_under_review` so it cannot drift from them.
