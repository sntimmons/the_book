-- FORWARD CORRECTION to 20261059000000 (Session 8B).
--
-- ══ WHAT THE GRANT BROKE, AND THE REPO SAID SO IN ADVANCE ═════════════════
--
-- Session 8B granted three operator RPCs to `authenticated` so a signed-in
-- operator could work the queue. Each takes the acting operator's id as a
-- PARAMETER — and `20261019000000` had already written down why that was safe:
--
--     "The operator id is passed in rather than read from auth.uid(), because a
--      service_role call carries no JWT and auth.uid() is null there. THAT IS
--      ONLY SAFE BECAUSE THE PARAMETER IS NOT CLIENT-REACHABLE and because the
--      value is re-checked."
--
-- Session 8B made it client-reachable and added nothing to bind it. The
-- re-checks were all still present and all still tested THE NAMED ID — which is
-- a different thing from the caller the moment a client can choose the name.
--
-- ── 1. AN OPERATOR COULD ADJUDICATE THEIR OWN TRADE ───────────────────────
--
-- `adjudicate_barter_obligation` refuses an adjudicator who is a party to the
-- trade. It tested `p_adjudicator_user_id`. So an operator who WAS a party
-- could pass a colleague's id: `is_operator()` passed (they are an operator),
-- the participant check passed (the NAMED id is not a party), and the trigger
-- re-made the same test on the same value and passed too. The result is
-- immutable and terminal, and PD-067 hides the adjudicator from participants —
-- so the falsification would be invisible to everyone except another operator
-- reading the row.
--
-- **`20261059000000`'s own header claims this check "is now load-bearing
-- against a real signed-in person".** It was not. It is now.
--
-- ── 2. THE AUDIT TRAIL COULD NAME THE WRONG PERSON ────────────────────────
--
-- `operator_update_case` and `operator_set_provider_eligibility` write
-- `p_actor_user_id` verbatim into `operator_case_events.actor_user_id`,
-- `operator_cases.resolved_by_user_id` and `reports.resolved_by`. An operator
-- could attribute a dismissal or an eligibility change to a colleague — and the
-- event log is APPEND-ONLY, so the false attribution is permanent.
--
-- That is the audit trail PD-068 makes a pre-beta requirement, and
-- `20261049000000` says it matters most "when a decision is challenged" — which
-- is exactly when a wrong name is worse than no name.
--
-- ══ THE FIX, AND WHY IT IS THIS SHAPE ═════════════════════════════════════
--
-- One guard, inserted immediately after the `is_operator()` gate in all three:
-- **when there IS a caller identity, the actor must be it.** When there is not —
-- `service_role`, a migration, an ops script — `auth.uid()` is null, the
-- parameter keeps its original meaning, and every trusted server path is
-- untouched. The concurrency harness's maintenance sessions and every existing
-- B5B call that acts as service_role are unaffected.
--
-- **This also closes the participant hole without a second rule.** Once the
-- named id is forced to be the caller, the EXISTING participant check finally
-- protects against the operator themselves: an operator who is a party to the
-- trade now fails it, because the id they are compelled to name is their own.
--
-- Bodies are carried forward from their LIVE definitions —
-- `adjudicate_barter_obligation` from `20261059000000`, `operator_update_case`
-- from `20261050000000`, `operator_set_provider_eligibility` from
-- `20261054000000` — with exactly one block inserted into each and nothing else
-- changed.

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

  -- ── SESSION 8B CORRECTION: THE NAMED ACTOR MUST BE THE CALLER ───────────
  --
  -- `20261019000000` stated the precondition in writing: the operator id is a
  -- PARAMETER rather than `auth.uid()` because a service_role call carries no
  -- JWT — and *"that is only safe because the parameter is not client-reachable
  -- AND because the value is re-checked."*
  --
  -- `20261059000000` granted EXECUTE to `authenticated`, which made it
  -- client-reachable, and added nothing to bind it. The re-check was still there
  -- and still tested THE NAMED ID rather than the caller, which are different
  -- things the moment a client can choose the name.
  --
  -- Bound here. When there IS a caller identity, the actor must be it. When
  -- there is not — `service_role`, a migration, an ops script — `auth.uid()` is
  -- null and the parameter keeps its original meaning, so every trusted server
  -- path is untouched.
  if (select auth.uid()) is not null
     and p_adjudicator_user_id is distinct from (select auth.uid()) then
    raise exception 'An adjudication must be recorded against the operator who made it.'
      using errcode = 'insufficient_privilege';
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
create or replace function public.operator_update_case(
  p_case_id uuid,
  p_action text,
  p_actor_user_id uuid,
  p_note text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_case public.operator_cases%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_to text;
begin
  if not public.is_operator() then
    raise exception 'Case handling is not available.' using errcode = 'insufficient_privilege';
  end if;

  -- ── SESSION 8B CORRECTION: THE NAMED ACTOR MUST BE THE CALLER ───────────
  --
  -- `20261019000000` stated the precondition in writing: the operator id is a
  -- PARAMETER rather than `auth.uid()` because a service_role call carries no
  -- JWT — and *"that is only safe because the parameter is not client-reachable
  -- AND because the value is re-checked."*
  --
  -- `20261059000000` granted EXECUTE to `authenticated`, which made it
  -- client-reachable, and added nothing to bind it. The re-check was still there
  -- and still tested THE NAMED ID rather than the caller, which are different
  -- things the moment a client can choose the name.
  --
  -- Bound here. When there IS a caller identity, the actor must be it. When
  -- there is not — `service_role`, a migration, an ops script — `auth.uid()` is
  -- null and the parameter keeps its original meaning, so every trusted server
  -- path is untouched.
  if (select auth.uid()) is not null
     and p_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'A case action must be recorded against the operator who took it.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action not in ('claimed', 'resolved', 'dismissed', 'noted') then
    raise exception 'Unknown case action.' using errcode = 'internal_error';
  end if;
  if p_actor_user_id is null then
    raise exception 'A case action must record who took it.' using errcode = 'check_violation';
  end if;
  if v_note is not null and char_length(v_note) > 4000 then
    raise exception 'That note is too long.' using errcode = '22023';
  end if;

  select c.* into v_case from public.operator_cases c where c.id = p_case_id for update;
  if not found then
    raise exception 'That case no longer exists.' using errcode = 'check_violation';
  end if;

  -- A resolved or dismissed case is finished. Reopening one would make the event
  -- log ambiguous about which decision stands; a new case is the way back.
  if v_case.status in ('resolved', 'dismissed') and p_action <> 'noted' then
    raise exception 'This case is already closed.' using errcode = 'PT412';
  end if;

  v_to := case p_action
            when 'claimed' then 'under_review'
            when 'resolved' then 'resolved'
            when 'dismissed' then 'dismissed'
            else v_case.status
          end;

  update public.operator_cases
     set status = v_to,
         operator_notes = coalesce(v_note, operator_notes),
         resolved_at = case when p_action in ('resolved', 'dismissed')
                            then clock_timestamp() else resolved_at end,
         resolved_by_user_id = case when p_action in ('resolved', 'dismissed')
                                    then p_actor_user_id else resolved_by_user_id end
   where id = p_case_id;

  insert into public.operator_case_events
    (case_id, actor_user_id, action, from_status, to_status, note)
  values (p_case_id, p_actor_user_id, p_action, v_case.status, v_to, v_note);

  -- A user_report case keeps its source row's status in step, so the reporter's
  -- own view of "where does this stand" does not disagree with the queue.
  if v_case.case_type = 'user_report' and p_action in ('claimed', 'resolved', 'dismissed') then
    update public.reports
       set report_status = case v_to when 'under_review' then 'reviewing' else v_to end,
           resolved_at = case when p_action in ('resolved', 'dismissed')
                              then clock_timestamp() else resolved_at end,
           resolved_by = case when p_action in ('resolved', 'dismissed')
                              then p_actor_user_id else resolved_by end
     where id = v_case.report_id;
  end if;

  return v_to;
end;
$$;
create or replace function public.operator_set_provider_eligibility(
  p_provider_id uuid,
  p_approved boolean,
  p_actor_user_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_case uuid;
  v_case_status text;
  v_was boolean;
  v_outcome text;
begin
  if not public.is_operator() then
    raise exception 'Eligibility changes are not available.'
      using errcode = 'insufficient_privilege';
  end if;

  -- ── SESSION 8B CORRECTION: THE NAMED ACTOR MUST BE THE CALLER ───────────
  --
  -- `20261019000000` stated the precondition in writing: the operator id is a
  -- PARAMETER rather than `auth.uid()` because a service_role call carries no
  -- JWT — and *"that is only safe because the parameter is not client-reachable
  -- AND because the value is re-checked."*
  --
  -- `20261059000000` granted EXECUTE to `authenticated`, which made it
  -- client-reachable, and added nothing to bind it. The re-check was still there
  -- and still tested THE NAMED ID rather than the caller, which are different
  -- things the moment a client can choose the name.
  --
  -- Bound here. When there IS a caller identity, the actor must be it. When
  -- there is not — `service_role`, a migration, an ops script — `auth.uid()` is
  -- null and the parameter keeps its original meaning, so every trusted server
  -- path is untouched.
  if (select auth.uid()) is not null
     and p_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'An eligibility change must be recorded against the operator who made it.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_actor_user_id is null then
    raise exception 'An eligibility change must record who made it.'
      using errcode = 'check_violation';
  end if;

  select p.is_approved into v_was from public.providers p where p.id = p_provider_id for update;
  if not found then
    raise exception 'That provider no longer exists.' using errcode = 'check_violation';
  end if;

  update public.providers set is_approved = p_approved where id = p_provider_id;

  v_outcome := case when v_was = p_approved then 'eligibility unchanged'
                    when p_approved then 'eligibility restored'
                    else 'eligibility removed' end;

  select c.id, c.status into v_case, v_case_status
    from public.operator_cases c
   where c.provider_id = p_provider_id and c.status in ('open', 'under_review')
   for update;

  if found then
    -- THE DECISION CLOSES THE QUESTION IT ANSWERS. Leaving the case open left a
    -- stale "nothing has been decided yet" waiting to resurface on the provider's
    -- dashboard the next time they were de-approved — about a request they never
    -- made — and would have swallowed their real appeal.
    update public.operator_cases
       set status = 'resolved',
           resolved_at = clock_timestamp(),
           resolved_by_user_id = p_actor_user_id,
           operator_notes = coalesce(v_note, operator_notes)
     where id = v_case;

    insert into public.operator_case_events
      (case_id, actor_user_id, action, from_status, to_status, note)
    values (v_case, p_actor_user_id, 'resolved', v_case_status, 'resolved',
            coalesce(v_note || ' — ', '') || v_outcome);
  end if;

  return p_approved;
end;
$$;

alter function public.adjudicate_barter_obligation(uuid, text, uuid, text) owner to postgres;
revoke all on function public.adjudicate_barter_obligation(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.adjudicate_barter_obligation(uuid, text, uuid, text)
  to service_role, authenticated;

alter function public.operator_update_case(uuid, text, uuid, text) owner to postgres;
revoke all on function public.operator_update_case(uuid, text, uuid, text) from public, anon;
grant execute on function public.operator_update_case(uuid, text, uuid, text)
  to service_role, authenticated;

alter function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  owner to postgres;
revoke all on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  from public, anon;
grant execute on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  to service_role, authenticated;

-- ── 3. THE LIVE COMMENTS STILL SAID "service_role only" ───────────────────
--
-- `create or replace function` PRESERVES the existing comment, so every one of
-- these survived Session 8B unchanged and now describes a caller set that has
-- not been true since `20261059000000`. This repo treats a catalog comment as an
-- instruction — `20261057000000` exists solely because a comment has four times
-- been the thing the next engineer trusted — and all of these mislead in the
-- PERMISSIVE direction, which is the worse one.
comment on function public.operator_update_case(uuid, text, uuid, text) is
  'The only writer of case state. Callable by service_role, a no-claims '
  'privileged session, and (since 20261059000000) an allow-listed operator — '
  'is_operator() decides, never the grant. p_actor_user_id RECORDS who acted and '
  'since 20261061000000 must EQUAL auth.uid() whenever there is one, so the '
  'append-only history cannot be made to name someone else. Every call appends an '
  'event.';

comment on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text) is
  'The audited path for changing a provider''s marketplace eligibility. Closes the '
  'live appeal case it answers. Callable by service_role, a no-claims session, or '
  'an allow-listed operator; p_actor_user_id must equal auth.uid() whenever there '
  'is one (20261061000000).';

comment on function public.adjudicate_barter_obligation(uuid, text, uuid, text) is
  'LIVE DEFINITION: 20261061000000. The only writer of a terminal obligation '
  'outcome. Gated on is_operator(); p_adjudicator_user_id must equal auth.uid() '
  'whenever there is one, which is what makes the participant check protect '
  'against an OPERATOR who is a party to the trade — before 20261061000000 they '
  'could name a colleague and pass it.';

comment on table public.operator_cases is
  'The minimal operator Review Queue required before barter beta (PD-068). One '
  'case per thing needing human handling, over three sources: barter review '
  'requests (PD-072), provider eligibility appeals (PD-081) and user reports. A '
  'case POINTS at its source and never copies its facts. NOT readable by any '
  'ordinary user: since 20261059000000 authenticated holds table-level SELECT and '
  'THE RLS POLICY is the gate — operator_notes in particular is operator-only, so '
  'do not add a second permissive SELECT policy here, and do not disable RLS.';
