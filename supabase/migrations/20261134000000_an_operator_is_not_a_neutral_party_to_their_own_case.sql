-- FORWARD CORRECTION to 20261050000000 / 20261054000000 / 20261059000000. From the
-- Grok whole-app audit, finding F9, verified against non-production.
--
-- ══ THE CONFLICT-OF-INTEREST RULE WAS APPLIED TO ONE OPERATOR SURFACE ═════
--
-- `20261059000000` gave operator authority a real IDENTITY: a row in
-- `public.operators` makes `is_operator()` true for an ORDINARY signed-in
-- `authenticated` caller. Until then every operator was `service_role` or a
-- no-claims psql session — a server process with no `auth.uid()`, which therefore
-- could not be a party to anything it looked at.
--
-- That migration saw the consequence and guarded ONE surface. Its own words, at
-- `adjudicate_barter_obligation`:
--
--     "Until today every adjudicator was a server process; from today one is a
--      signed-in person who is also a user of this product, and may be a
--      participant in the very trade they are looking at."
--
-- The same sentence is true of the Review Queue, and the Review Queue was not
-- guarded. `operator_update_case` and `operator_set_provider_eligibility` check
-- `is_operator()` and then check that the NAMED ACTOR IS THE CALLER — which is
-- accountability, not neutrality. Nothing asked whether the caller is the person
-- the case is about.
--
-- ── PROVEN, NOT REASONED ABOUT (non-production, rolled back) ───────────────
--
-- One account: a row in `public.operators`, a de-approved `providers` row it owns,
-- and a `provider_appeal` case naming that provider. Acting as that signed-in user
-- with `role = authenticated` — not `service_role`:
--
--     is_operator()                                            -> true
--     operator_update_case(own case, 'resolved', self)          -> SUCCEEDED
--     operator_set_provider_eligibility(own provider, true)     -> SUCCEEDED
--     final: case status = resolved, provider is_approved = true
--
-- An operator restored their own suspended business and closed the appeal about
-- it, alone, with no second party anywhere in the path.
--
-- ── WHY THE EXISTING COVERAGE MISSED IT ───────────────────────────────────
--
-- `safety_operator.test.sql` asserts "a provider cannot restore their own
-- eligibility" — and that assertion is about a PLAIN provider issuing a direct
-- `update public.providers set is_approved = true`, which RLS refuses. It says
-- nothing about a provider who is also an operator calling the RPC, because when
-- it was written no operator could be a provider. The test did not rot; the world
-- underneath it changed and nobody re-asked its question.
--
-- ── THE RULE ──────────────────────────────────────────────────────────────
--
-- PD-068: participants never self-adjudicate. An operator is a participant
-- whenever the case is about them, so the same refusal applies. This is a
-- NEUTRALITY check and it is deliberately separate from the authority check
-- (`is_operator()`) and the accountability check (actor = caller): those ask WHO
-- is acting, and this asks WHETHER THEY MAY act on THIS case.
--
-- `service_role` and no-claims sessions are unaffected by construction — the guard
-- only engages when there IS a caller identity, which is the only case in which
-- self-dealing is possible. Operations tooling keeps working exactly as before.
--
-- NOT CHANGED, deliberately: nothing about who may BE an operator, no new column
-- on any table, no second operator required for an ordinary case, and no SLA. The
-- product decision that one operator works the queue stands; what is refused is
-- that operator working their OWN case.

-- ── 1. Is this caller a party to this case? ───────────────────────────────
--
-- One predicate, covering every `case_type`, so a fourth type added later fails
-- loudly here rather than silently skipping the check. Each arm names the parties
-- of one source: the appeal's provider owner, the report's reporter AND its
-- subject, the trade's four participants, and in every case the requester.
create or replace function public.operator_case_involves_user(p_case_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
      from public.operator_cases c
     where c.id = p_case_id
       and (
         -- Whoever asked for the case. An appeal's appellant, a review requester.
         c.requested_by_user_id = p_user_id

         -- provider_appeal: the business the case is about.
         or exists (select 1 from public.providers p
                     where p.id = c.provider_id and p.user_id = p_user_id)

         -- user_report: BOTH sides. A reporter must not close their own report,
         -- and the reported person must not close the report against them.
         or exists (select 1 from public.reports r
                     where r.id = c.report_id
                       and p_user_id in (r.reporter_user_id, r.reported_user_id))

         -- barter_review: the obligation's two sides and the agreement's two.
         or exists (select 1 from public.barter_obligations o
                     where o.id = c.obligation_id
                       and (p_user_id in (o.deliverer_user_id, o.receiver_user_id)
                            or exists (select 1 from public.barter_agreements ag
                                        where ag.id = o.agreement_id
                                          and p_user_id in (ag.owner_user_id, ag.responder_user_id))))
       )
  );
$$;

alter function public.operator_case_involves_user(uuid, uuid) owner to postgres;
revoke all on function public.operator_case_involves_user(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.operator_case_involves_user(uuid, uuid) to service_role;

comment on function public.operator_case_involves_user(uuid, uuid) is
  'True when this user is a PARTY to this case — requester, the appealing '
  'provider''s owner, either side of a report, or any of the four participants '
  'behind a barter review. The neutrality half of PD-068, kept in one place so '
  'the two operator RPCs cannot drift apart. EXECUTE is service_role only: an '
  'ordinary caller must not be able to ask "is this case about me", which is a '
  'question about a queue they cannot read.';

-- ── 2. The case RPC refuses a party ──────────────────────────────────────
--
-- The body below is the LIVE definition as of `20261061000000`, reproduced from
-- `pg_get_functiondef` rather than retyped, with the neutrality guard inserted
-- after the actor check and nothing else altered. That matters: a hand-written
-- copy of this function dropped the `noted` action, the `PT412` closed-case
-- refusal, the note-length bound and the real `reports` column names on the first
-- attempt. A `create or replace` is a full rewrite, so the only safe source for
-- the parts not being changed is the database.
create or replace function public.operator_update_case(p_case_id uuid, p_action text, p_actor_user_id uuid, p_note text default null)
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

  -- ── NEUTRALITY (20261134000000, PD-068): AND NOT A PARTY TO THIS CASE ────
  --
  -- The check above asks that the record NAME whoever acted. It does not ask
  -- whether they may act at all. Since `20261059000000` an operator is a signed-in
  -- person who is also a user of this product, so they can be the subject of the
  -- very case they are working — and nothing stopped them closing it.
  --
  -- Engages only when there IS a caller identity: `service_role`, a migration and
  -- an ops session have no self to favour, so every trusted server path is
  -- untouched, exactly as the actor check above is.
  if (select auth.uid()) is not null
     and public.operator_case_involves_user(p_case_id, p_actor_user_id) then
    raise exception 'An operator cannot act on a case they are a party to.'
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

alter function public.operator_update_case(uuid, text, uuid, text) owner to postgres;
revoke all on function public.operator_update_case(uuid, text, uuid, text) from public, anon;
grant execute on function public.operator_update_case(uuid, text, uuid, text)
  to authenticated, service_role;

comment on function public.operator_update_case(uuid, text, uuid, text) is
  'Moves a case and writes its event. THREE checks that ask DIFFERENT questions: '
  'is_operator() asks who may work the queue; the actor check asks that the record '
  'name whoever acted; operator_case_involves_user() asks whether this operator is '
  'NEUTRAL on THIS case. The third was missing until 20261134000000 — an operator '
  'could resolve the appeal about their own suspended business (audit F9, proven '
  'against non-production).';

-- ── 3. Eligibility refuses the operator's own provider row ───────────────
--
-- Same method: live body, one guard inserted, everything else verbatim.
create or replace function public.operator_set_provider_eligibility(p_provider_id uuid, p_approved boolean, p_actor_user_id uuid, p_note text default null)
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

  -- ── NEUTRALITY (20261134000000, PD-068): NOT YOUR OWN PROVIDER ROW ──────
  --
  -- The sharper half of the same hole. This function does not take a case id, it
  -- takes a provider id, and it is what actually reverses a suspension — and then
  -- closes the appeal about it. An operator calling it on a `providers` row they
  -- OWN is restoring themselves and marking the question answered.
  if (select auth.uid()) is not null
     and exists (select 1 from public.providers p
                  where p.id = p_provider_id and p.user_id = p_actor_user_id) then
    raise exception 'An operator cannot change the eligibility of their own provider account.'
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

alter function public.operator_set_provider_eligibility(uuid, boolean, uuid, text) owner to postgres;
revoke all on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  from public, anon;
grant execute on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  to authenticated, service_role;

comment on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text) is
  'Sets a provider''s eligibility and closes any live appeal about them. Refuses '
  'when the acting operator OWNS that provider row: such a call is an operator '
  'restoring their own suspended business and then marking the appeal resolved, '
  'which is the conflict of interest PD-068 exists to prevent (audit F9). '
  'service_role and ops sessions are unaffected — the guard engages only when '
  'there is a caller identity.';
