-- Pre-Session-8 Correction 3 (item X) — a deliverer whose receiver never answered
-- can ask The Book to look.
--
-- ── THE GAP ───────────────────────────────────────────────────────────────
--
-- PD-057 gives the receiver a 7-day window. When it passes unanswered the
-- obligation becomes **Needs Attention** — an unresolved operational state that
-- decides nothing. PD-062 then made **Under Review** the entry condition for
-- adjudication, but reachable only by two RECEIVER acts: a `not_received` answer,
-- or a no-show report.
--
-- So the deliverer had no move. A receiver who simply stops opening the app left
-- the trade permanently in Needs Attention, and OQ-071 recorded the question of
-- how a plain Needs Attention might enter Under Review as deliberately open —
-- "no second timer, no automatic escalation, no participant escalation action,
-- no operator auto-escalation, and none may be created by implementation."
--
-- **This migration is the Founder ruling that closes OQ-071**, and it takes the
-- one option that answers the question without inventing a timer: a
-- PARTICIPANT-INITIATED, EXPLICIT act. Nothing escalates on its own. The
-- deliverer asks, and a human then has to look.
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
--
-- **Asking is not being answered.** A review request is a request. It does not
-- declare the obligation fulfilled, does not fault the receiver, does not
-- contradict the receiver's silence, and produces no outcome. PD-065's three
-- terminal outcomes remain reachable ONLY through `adjudicate_barter_obligation`,
-- which remains `service_role`-only with no participant-facing path (PD-068).
--
-- **It rewrites nothing.** Every immutable fact this codebase has accumulated —
-- `delivered_at`, `receipt_responded_at`, the no-show report and its reason, the
-- cancellation acts, any adjudication — stands exactly as its author left it. The
-- request is a new row in a new table, append-only, one per obligation.
--
-- **The receiver keeps their controls.** Under Review has never frozen them
-- (PD-062), and it does not here: a receiver who returns after the window can
-- still confirm or say they did not receive, and that answer is theirs to give.
--
-- ── WHAT SESSION 8 STILL HAS TO PROVIDE ───────────────────────────────────
--
-- **Nothing processes these requests yet, and the copy must not pretend
-- otherwise.** This migration creates the transition into the operator path; the
-- operator path itself is the minimal internal Review Queue that PD-068 makes a
-- pre-beta requirement and that is still unbuilt. Concretely, Session 8 owns:
--   * a surface where an authorised operator sees requested reviews;
--   * triage between a requested review and a receiver-reported one, which are
--     different evidence and may deserve different handling;
--   * whatever response policy exists — there is still NO SLA, and participant-
--     facing language stays "This trade is under review."
-- Until that exists, a requested review reaches Under Review and waits, exactly
-- as a receiver-reported one already does.

-- ── 1. The record ───────────────────────────────────────────────────────────
create table if not exists public.barter_obligation_review_requests (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null unique
    references public.barter_obligations(id) on delete cascade,
  agreement_id uuid not null
    references public.barter_agreements(id) on delete cascade,
  -- The deliverer who asked. Bound to auth.uid() by the consistency trigger, and
  -- re-checked there against the obligation's own deliverer, so a privileged
  -- insert cannot attribute the request to the counterparty.
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);

comment on table public.barter_obligation_review_requests is
  'One deliverer-initiated request per obligation for The Book to look at a trade '
  'whose receiver never answered (item X, closing OQ-071). Append-only. A request '
  'is NOT an outcome, NOT a fault finding and NOT a contradiction of the '
  'receiver''s silence — it makes the obligation eligible for the operator path '
  'and nothing more. Terminal outcomes remain reachable only through '
  'adjudicate_barter_obligation, which is service_role-only (PD-068).';

create index if not exists barter_obligation_review_requests_agreement_idx
  on public.barter_obligation_review_requests (agreement_id);

-- ── 2. Append-only ─────────────────────────────────────────────────────────
-- Same posture as the no-show report: a participant statement, once made, is
-- history. No edit, no withdrawal. `service_role` may DELETE so account erasure
-- cascades still work, matching every neighbouring table.
create or replace function public.enforce_barter_review_request_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and (select auth.role()) = 'service_role' then
    return old;
  end if;
  raise exception 'A review request cannot be changed or withdrawn.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_review_request_append_only() owner to postgres;
revoke all on function public.enforce_barter_review_request_append_only() from public, anon;

drop trigger if exists barter_review_request_append_only
  on public.barter_obligation_review_requests;
create trigger barter_review_request_append_only
  before update or delete on public.barter_obligation_review_requests
  for each row execute function public.enforce_barter_review_request_append_only();

-- ── 3. Consistency: the requester is the deliverer, the time is the server's ─
create or replace function public.enforce_barter_review_request_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.barter_obligations%rowtype;
begin
  select o.* into v_o from public.barter_obligations o where o.id = new.obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- The agreement is derived, never taken from the caller: a mismatched pair
  -- would put the request on a trade it does not belong to.
  new.agreement_id := v_o.agreement_id;

  -- ONLY THE DELIVERER MAY ASK. The receiver already has two routes into Under
  -- Review (`not_received` and a no-show report) and does not need a third; this
  -- act exists for the side that has no move.
  if new.requested_by_user_id is distinct from v_o.deliverer_user_id then
    raise exception 'Only the provider who owed this delivery may ask for a review.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Bound to the caller for ordinary writers, so a privileged insert cannot
  -- fabricate the counterparty's act. `service_role` and the no-JWT path are
  -- exempt, matching every other consistency trigger on this surface.
  if (select auth.role()) is distinct from 'service_role'
     and (select auth.uid()) is not null
     and new.requested_by_user_id is distinct from (select auth.uid()) then
    raise exception 'A review request must be recorded by the provider making it.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A cancelled trade has nothing to review, and a resolved obligation has been
  -- reviewed already. Both refuse here as well as in the RPC.
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled.' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.barter_obligation_adjudications a
              where a.obligation_id = v_o.id) then
    raise exception 'This obligation has already been resolved.' using errcode = 'PT424';
  end if;

  new.created_at := clock_timestamp();
  return new;
end;
$$;

alter function public.enforce_barter_review_request_consistent() owner to postgres;
revoke all on function public.enforce_barter_review_request_consistent() from public, anon;

drop trigger if exists barter_review_request_consistent
  on public.barter_obligation_review_requests;
create trigger barter_review_request_consistent
  before insert on public.barter_obligation_review_requests
  for each row execute function public.enforce_barter_review_request_consistent();

-- ── 4. Both participants read it; nobody writes it directly ────────────────
alter table public.barter_obligation_review_requests enable row level security;

drop policy if exists barter_review_requests_participant_read
  on public.barter_obligation_review_requests;
create policy barter_review_requests_participant_read
  on public.barter_obligation_review_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.barter_obligations o
      where o.id = barter_obligation_review_requests.obligation_id
        and (select auth.uid()) in (o.deliverer_user_id, o.receiver_user_id)
    )
  );

revoke all on table public.barter_obligation_review_requests from public, anon, authenticated;
grant select on table public.barter_obligation_review_requests to authenticated;
grant all on table public.barter_obligation_review_requests to service_role;

-- ── 5. The one write path ───────────────────────────────────────────────────
--
-- The client sends the OBLIGATION ID and nothing else. It cannot name the
-- requester, the agreement or the time, and there is no parameter for an outcome
-- because asking for a review is not deciding one.
--
-- ELIGIBILITY IS THE NARROW PART. Only while the obligation is genuinely in
-- **Needs Attention** — delivered, unanswered, and past the PD-057 deadline —
-- evaluated with `barter_receiver_window` so this function cannot drift from the
-- state the participant is actually looking at. Server time throughout: there is
-- no `p_as_of`, and no client value reaches the comparison.
--
-- LOCK ORDER: agreement, then obligation — the order `20261014000000` made total
-- across this graph, so this cannot deadlock against `cancel_barter_agreement`.
create or replace function public.request_barter_obligation_review(p_obligation_id uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
  v_existing timestamptz;
  v_window text;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- NOT AN EXISTENCE ORACLE: a non-participant gets the same message and SQLSTATE
  -- as a caller naming an id that does not exist.
  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  perform 1 from public.barter_agreements ag where ag.id = v_o.agreement_id for update;
  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;

  -- IDEMPOTENT. Asking twice is the same ask; it returns the original time rather
  -- than re-stamping it or raising, so a double tap cannot rewrite when the
  -- provider actually asked.
  select r.created_at into v_existing
    from public.barter_obligation_review_requests r
   where r.obligation_id = v_o.id;
  if found then
    return v_existing;
  end if;

  if v_uid is distinct from v_o.deliverer_user_id then
    raise exception 'Only the provider who owed this delivery may ask for a review.'
      using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to review.'
      using errcode = 'PT409';
  end if;
  if exists (select 1 from public.barter_obligation_adjudications a
              where a.obligation_id = v_o.id) then
    raise exception 'This obligation has already been resolved.' using errcode = 'PT424';
  end if;

  v_window := public.barter_receiver_window(
    v_o.status, v_o.delivered_at, v_o.scheduled_at, v_o.due_at, false, now()
  );
  if v_window is distinct from 'needs_attention' then
    raise exception 'This trade is not waiting on a review yet.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.barter_obligation_review_requests
    (obligation_id, agreement_id, requested_by_user_id)
  values (v_o.id, v_o.agreement_id, v_uid)
  returning created_at into v_existing;

  return v_existing;
exception
  -- Unreachable under the locks above; the unique constraint exists so that
  -- "unreachable" is not load-bearing.
  when unique_violation then
    select r.created_at into v_existing
      from public.barter_obligation_review_requests r
     where r.obligation_id = p_obligation_id;
    return v_existing;
end;
$$;

alter function public.request_barter_obligation_review(uuid) owner to postgres;
revoke all on function public.request_barter_obligation_review(uuid) from public, anon;
grant execute on function public.request_barter_obligation_review(uuid) to authenticated;

comment on function public.request_barter_obligation_review(uuid) is
  'The deliverer asks The Book to look at an obligation whose receiver never '
  'answered. Only the deliverer, only while barter_receiver_window is '
  'needs_attention, never on a cancelled or already-resolved obligation. '
  'Idempotent: a repeat returns the original timestamp. Records a REQUEST, not an '
  'outcome — adjudication stays service_role-only (PD-068), and nothing processes '
  'these until Session 8 builds the Review Queue.';

-- ── 6. The obligation read model gains the third route ─────────────────────
--
-- `create or replace view`, not drop-and-recreate: the column list and its order
-- are unchanged, so the dependent `my_trade_activity` — which derives
-- `my_under_review` / `their_under_review` / `agreement_under_review` from THIS
-- view's `under_review` — picks the new route up without being touched.
--
-- Body taken from `pg_get_viewdef` on the live object, which is the technique
-- `20261027000000` established for exactly this table, rather than from any
-- migration file. Its live definition IS `20261027000000`; the only change below
-- is the added disjunct on the `under_review` expression.
--
-- WHY THE DISJUNCT LIVES HERE AND NOT IN THE FUNCTION. `barter_obligation_under_review`
-- is documented as "three inputs, boolean algebra, no clock and no calendar" and
-- is IMMUTABLE. Widening its signature would mean dropping it, dropping both
-- views that depend on it, and recreating all three — churn on the most sensitive
-- objects in the codebase to express one `or`. The view already assembles every
-- other `exists (...)` fact this predicate consumes (`suppressed`,
-- `no_show_reported`), so the third belongs beside them. `suppressed` still wins:
-- a cancelled or adjudicated obligation is not under review however it got there.
create or replace view public.my_barter_obligations
with (security_invoker = true) as
 SELECT o.id,
    o.agreement_id,
    o.side,
    o.agreed_description,
    o.due_at,
    o.scheduled_at,
    o.status,
    o.delivered_at,
    o.receipt_responded_at,
    o.deliverer_user_id,
    o.receiver_user_id,
    public.barter_confirmation_anchor(o.delivered_at, o.scheduled_at, o.due_at) AS confirmation_anchor,
    public.barter_confirmation_deadline(o.delivered_at, o.scheduled_at, o.due_at) AS confirmation_deadline,
    public.barter_receiver_window(o.status, o.delivered_at, o.scheduled_at, o.due_at, f.suppressed, now()) AS receiver_window_state,
    now() AS server_now,
    ( SELECT r.created_at
           FROM public.barter_obligation_no_show_reports r
          WHERE r.obligation_id = o.id) AS no_show_reported_at,
    (public.barter_obligation_under_review(o.status, f.no_show_reported, f.suppressed)
      OR (f.review_requested AND NOT f.suppressed)) AS under_review,
    public.barter_can_report_no_show(o.scheduled_at, o.status, f.no_show_reported, f.suppressed, now()) AS can_report_no_show,
    ( SELECT r.reason
           FROM public.barter_obligation_no_show_reports r
          WHERE r.obligation_id = o.id) AS no_show_reason,
    ( SELECT a.outcome
           FROM public.barter_obligation_adjudications a
          WHERE a.obligation_id = o.id) AS terminal_outcome,
    ( SELECT a.adjudicated_at
           FROM public.barter_obligation_adjudications a
          WHERE a.obligation_id = o.id) AS adjudicated_at
   FROM public.barter_obligations o
     LEFT JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                   FROM public.barter_agreement_cancellations c
                  WHERE c.agreement_id = o.agreement_id)) OR (EXISTS ( SELECT 1
                   FROM public.barter_obligation_adjudications a
                  WHERE a.obligation_id = o.id)) AS suppressed,
            (EXISTS ( SELECT 1
                   FROM public.barter_obligation_no_show_reports r
                  WHERE r.obligation_id = o.id)) AS no_show_reported,
            (EXISTS ( SELECT 1
                   FROM public.barter_obligation_review_requests rr
                  WHERE rr.obligation_id = o.id)) AS review_requested) f ON true;

alter view public.my_barter_obligations owner to postgres;
revoke all on public.my_barter_obligations from public, anon;
grant select on public.my_barter_obligations to authenticated;
revoke insert, update, delete on table public.my_barter_obligations from authenticated;

-- ── 7. A requested review is adjudicable ───────────────────────────────────
--
-- Without this the transition would be cosmetic: the trade would read Under
-- Review while `adjudicate_barter_obligation` still refused it as
-- `object_not_in_prerequisite_state`, and the operator queue Session 8 builds
-- would be unable to act on the very rows it was built for.
--
-- Body copied forward from `20261023000000_adjudication_hardening.sql`, which is
-- this function's LIVE definition per the ledger — NOT the `20261019000000` that
-- created it. `20261023000000` added the in-RPC adjudicator-may-not-be-a-
-- participant check and narrowed the privileged predicate that had admitted a
-- no-`sub` `anon` request; copying the older body forward would silently delete
-- both. The ONLY change here is the eligibility disjunct.
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
  -- THE THIRD ROUTE. A deliverer's review request makes the obligation eligible
  -- exactly as a receiver's report does. Same operator path, same three outcomes,
  -- no new vocabulary — and it does not weaken the rule that SOMETHING must have
  -- put the obligation into review before anyone may resolve it.
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
  from public, anon, authenticated;
grant execute on function public.adjudicate_barter_obligation(uuid, text, uuid, text)
  to service_role;
