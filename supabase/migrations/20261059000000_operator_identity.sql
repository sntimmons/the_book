-- Session 8B. THE OPERATOR IS A PERSON, NOT A KEY.
--
-- ══ WHY THIS MIGRATION HAS TO EXIST ═══════════════════════════════════════
--
-- Session 8 built the Review Queue's backend and PD-068 was amended to
-- PARTIALLY SATISFIED, because working a case required a `psql` session. The
-- surface that finishes it cannot be built on the authority as it stands:
--
--     is_operator() = auth.role() = 'service_role'
--                  or (auth.role() is null and auth.uid() is null)
--
-- An operator opening a screen in the app is `authenticated` with a real
-- `auth.uid()`. **NEITHER ARM ADMITS THEM.** So the surface could not read
-- `operator_cases`, could not call `operator_update_case`, and could not resolve
-- anything. A third arm is not scope creep; it is the load-bearing piece.
--
-- ══ THE SHAPE, AND THE THINGS IT DELIBERATELY REFUSES TO DO ═══════════════
--
-- **An allow-list, and nothing cleverer.** No `is_admin` column on `profiles`
-- (a mutable trust field on a row users can write is how privilege escalation
-- happens), no role string parsed from a JWT, no "operators are providers with
-- a flag". One table whose only content is *this person is an operator*.
--
-- **NO CLIENT MAY WRITE IT.** `authenticated` holds no INSERT, UPDATE or DELETE
-- on `public.operators` and there is no RLS policy that would permit one, so an
-- operator cannot be created, removed or edited from the app by anyone —
-- including an operator. Making someone an operator is a `service_role` or
-- `psql` act, deliberately, because the alternative is a surface that can grant
-- its own authority.
--
-- **NOBODY MAY READ THE LIST.** Not even operators. The roster of who can act on
-- reports is exactly the kind of thing that should not be enumerable from a
-- client, and no screen needs it — a surface needs to know whether YOU are an
-- operator, which `is_operator()` answers about the caller and nobody else.
--
-- **THE TWO EXISTING ARMS ARE UNCHANGED.** Migrations, ops scripts and the
-- account-erasure cascades all depend on the no-claims arm (`20261053000000`
-- exists because that was once forgotten), and `service_role` is how the
-- concurrency harness and every server-side path still works.
--
-- ══ AND ONE CONSOLIDATION THIS FORCED INTO THE OPEN ═══════════════════════
--
-- `is_operator()`'s own comment calls it "the single definition of operator
-- authority". **It was not.** `adjudicate_barter_obligation` — the only writer
-- of a terminal obligation outcome — carried its own inline copy of the same
-- predicate, so the two could drift and extending one would silently fail to
-- extend the other. Reconciled below.

-- ── 1. The allow-list ──────────────────────────────────────────────────────
create table if not exists public.operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- WHO made them one, and when. An authority with no provenance is an
  -- authority nobody can audit, and PD-068 requires this one be auditable.
  granted_at timestamptz not null default clock_timestamp(),
  granted_by_user_id uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 500)
);

comment on table public.operators is
  'The allow-list of people who may work the Review Queue (PD-068, Session 8B). '
  'NO CLIENT ROLE HOLDS ANY PRIVILEGE ON THIS TABLE — not select, not insert, '
  'not update, not delete — and no RLS policy grants one. Making someone an '
  'operator is a service_role or psql act by design: a surface that can grant '
  'its own authority is not an authority. Not even an operator may read the '
  'roster; a screen needs to know whether YOU are one, which is_operator() '
  'answers about the caller alone.';

alter table public.operators enable row level security;
revoke all on public.operators from public, anon, authenticated;
grant select, insert, update, delete on public.operators to service_role;

-- Deliberately NO policy for `authenticated`. RLS with no policy denies, and the
-- absent grant denies before that — two refusals, neither of them the only one.

-- ── 2. The third arm ───────────────────────────────────────────────────────
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.role()) = 'service_role'
      or ((select auth.role()) is null and (select auth.uid()) is null)
      -- The new arm. `auth.uid()` is null for anon, and `user_id = null` is
      -- never true, so an unauthenticated caller cannot reach it — but the
      -- `is not null` is written out anyway, because the reader of a security
      -- predicate should not have to reason about three-valued logic to be sure.
      or ((select auth.uid()) is not null
          and exists (select 1 from public.operators o
                       where o.user_id = (select auth.uid())));
$$;

alter function public.is_operator() owner to postgres;
revoke all on function public.is_operator() from public, anon;

-- GRANTED TO `authenticated`, which is safe here and was NOT safe for the block
-- predicates. The difference is the argument list: `contact_blocked(uuid, uuid)`
-- let a caller ask about ANY pair, which is what made it an oracle
-- (`20261055000000`). This takes no arguments and can only answer about the
-- caller, who already knows the answer. The grant is required because an RLS
-- policy is evaluated AS THE CALLER, and the policies below are the mechanism
-- that keeps case data operator-only.
grant execute on function public.is_operator() to authenticated;

comment on function public.is_operator() is
  'The single definition of operator authority, and since 20261059000000 that '
  'is finally true — adjudicate_barter_obligation carried an inline copy until '
  'then. Three arms: service_role; a no-claims/no-subject privileged session '
  '(psql, migration, ops script — load-bearing for erasure cascades, see '
  '20261053000000); and a user in public.operators. Both original arms are '
  'unchanged. EXECUTE is granted to authenticated because it TAKES NO ARGUMENTS '
  'and answers only about the caller — do not add a parameter to this function; '
  'that is what turned the block predicates into an oracle.';

-- ── 3. Operators can read the queue ────────────────────────────────────────
--
-- `20261049000000` withheld these tables from `authenticated` entirely, because
-- at the time no authenticated caller could legitimately read them. One can now,
-- and only one: `operator_notes` and the whole case history stay invisible to
-- every ordinary user exactly as before, because the policy is the gate.
grant select on public.operator_cases to authenticated;
grant select on public.operator_case_events to authenticated;

drop policy if exists "operators_read_cases" on public.operator_cases;
create policy "operators_read_cases" on public.operator_cases
  for select to authenticated
  using (public.is_operator());

drop policy if exists "operators_read_case_events" on public.operator_case_events;
create policy "operators_read_case_events" on public.operator_case_events
  for select to authenticated
  using (public.is_operator());

-- READ ONLY, and that is the whole point. Every change still goes through the
-- audited RPCs, which append an event and stamp the actor; a direct UPDATE would
-- change a case without recording who did it or why.
revoke insert, update, delete, truncate on public.operator_cases from authenticated;
revoke insert, update, delete, truncate on public.operator_case_events from authenticated;

-- ── 4. The audited actions become reachable from a client ──────────────────
--
-- Both already refuse a non-operator internally, so the grant is not the gate —
-- `is_operator()` is, and it now admits the right people. `p_actor_user_id`
-- remains a RECORD of who acted and is never trusted as authority.
grant execute on function public.operator_update_case(uuid, text, uuid, text) to authenticated;
grant execute on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  to authenticated;

-- ── 5. Adjudication stops carrying its own copy of the predicate ───────────
--
-- **READ THIS BEFORE TOUCHING THE FUNCTION BELOW.** Its body is carried forward
-- from `20261039000000_barter_review_request.sql`, which is the LIVE definition
-- — NOT from `20261023000000`, which the ledger named until today and which is
-- two generations stale. Copying `20261023000000` forward would have silently
-- deleted PD-072's eligibility disjunct (`v_requested`), removing the deliverer
-- review request as a route into Under Review for the SECOND time; the first is
-- recorded in `20261042000000`'s header.
--
-- EXACTLY ONE STATEMENT CHANGES: the caller check becomes `public.is_operator()`.
-- Everything else is byte-identical — the outcome allow-list, the non-null
-- adjudicator, the mandatory rationale and its 500-char cap, the agreement lock
-- taken before the obligation lock, the participant check made against BOTH the
-- obligation's two parties and the agreement's two, the idempotent same-outcome
-- return, `PT412` on a different outcome, `PT409` on a cancelled trade, the
-- three-way eligibility test, and the `unique_violation` handler that re-reads
-- and returns rather than erroring.
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
  v_requested boolean;
begin
  -- THE ONE CHANGED STATEMENT. Was an inline copy of two of is_operator()'s
  -- three arms; now it IS is_operator(), so operator authority has one
  -- definition and extending it cannot extend one caller and miss another.
  if not public.is_operator() then
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

  -- STILL ENFORCED, AND NOW IT MATTERS MORE. Until today every adjudicator was a
  -- server process; from today one is a signed-in person who is also a user of
  -- this product, and may be a participant in the very trade they are looking
  -- at. This check is what stops that, and it is deliberately made twice — here
  -- and again in enforce_barter_adjudication_consistent — so a direct privileged
  -- INSERT cannot bypass it either.
  if p_adjudicator_user_id in (v_o.deliverer_user_id, v_o.receiver_user_id)
     or exists (select 1 from public.barter_agreements ag
                 where ag.id = v_o.agreement_id
                   and p_adjudicator_user_id in (ag.owner_user_id, ag.responder_user_id)) then
    raise exception 'A participant cannot adjudicate their own trade.'
      using errcode = 'insufficient_privilege';
  end if;

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
  -- THE THIRD ROUTE (PD-072). A deliverer's review request makes the obligation
  -- eligible exactly as a receiver's report does. **This disjunct is the thing a
  -- copy-forward from 20261023000000 would have deleted.**
  v_requested := exists (select 1 from public.barter_obligation_review_requests rr
                          where rr.obligation_id = v_o.id);
  if not (public.barter_obligation_under_review(v_o.status, v_reported, false) or v_requested) then
    raise exception 'Only a trade under review can be adjudicated.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.barter_obligation_adjudications
    (obligation_id, agreement_id, outcome, adjudicator_user_id, rationale)
  values (v_o.id, v_o.agreement_id, p_outcome, p_adjudicator_user_id, v_rationale);

  return p_outcome;
exception
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
  from public, anon;
grant execute on function public.adjudicate_barter_obligation(uuid, text, uuid, text)
  to service_role, authenticated;

comment on function public.adjudicate_barter_obligation(uuid, text, uuid, text) is
  'LIVE DEFINITION: 20261059000000_operator_identity.sql, carried forward from '
  '20261039000000 (NOT 20261023000000, which the ledger named until 2026-09-10 '
  'and which predates PD-072''s eligibility disjunct). The only writer of a '
  'terminal obligation outcome. Gated on is_operator(), which since Session 8B '
  'admits an allow-listed signed-in operator as well as service_role — so the '
  'participant check is now load-bearing against a real person, not only against '
  'a mistaken server process.';

-- ── 6. The append-only DELETE carve-out is NOT widened ─────────────────────
--
-- `enforce_barter_adjudication_append_only` permits DELETE only for service_role
-- and a no-claims session, so account erasure still cascades. It is deliberately
-- NOT extended to the new arm: an operator may RECORD an outcome and may never
-- delete one. Nothing below changes it; this note exists so that "extend
-- is_operator() everywhere" is not read as covering it.
