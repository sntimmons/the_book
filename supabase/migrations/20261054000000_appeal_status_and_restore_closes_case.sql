-- FORWARD CORRECTION to 20261050000000 (Session 8, PD-081 / PD-086).
--
-- ══ TWO DEFECTS, ONE ROOT ═════════════════════════════════════════════════
--
-- Both are the same mistake: a case that is FINISHED was left looking LIVE, and
-- two different surfaces then believed it.
--
-- ── 1. THE APPEAL ROUTE CLOSED PERMANENTLY AFTER ONE DISMISSAL ────────────
--
-- `my_provider_review_status()` returned the newest `provider_appeal` case with
-- **no status filter**. The dashboard hides "Request Review" whenever that
-- returns anything, so once an operator dismissed an appeal the provider — still
-- unavailable for new bookings — saw "The Book has reviewed this." and **no
-- control, forever**, while `request_provider_review` would happily have opened a
-- new case (it only refuses while one is `open`/`under_review`).
--
-- **That is exactly the failure PD-081 was written to prevent**, one round later:
-- a provider in a state they cannot change, on a terminal screen with no forward
-- action. A provider whose circumstances have since changed had no route left
-- anywhere in the product.
--
-- ── 2. RESTORING ELIGIBILITY LEFT THE APPEAL OPEN ─────────────────────────
--
-- `operator_set_provider_eligibility` restored `is_approved`, appended a `noted`
-- event, and left the case `open`. Invisible while the provider is approved — the
-- card only renders when they are not — but if that provider is later de-approved
-- again, the stale case resurfaces and tells them *"You asked The Book to review
-- this. Nothing has been decided yet."* about a request they never made, for a
-- de-approval that had not yet happened. Worse, `request_provider_review` would
-- short-circuit to that stale case, so **their real appeal would never enter the
-- queue.**
--
-- ══ THE RULE BOTH FIXES SHARE ═════════════════════════════════════════════
--
-- A case is live or it is not, and every reader must agree. The status function
-- now answers only about a LIVE case, and restoring eligibility CLOSES the appeal
-- it answers through the same audited path that made the decision.

-- ── 1. The status a provider sees is about a LIVE case only ────────────────
create or replace function public.my_provider_review_status()
returns table (case_id uuid, status text, requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.status, c.created_at
    from public.operator_cases c
    join public.providers p on p.id = c.provider_id
   where c.case_type = 'provider_appeal'
     and p.user_id = (select auth.uid())
     -- ONLY UNRESOLVED. A closed case is history, not a live request, and a
     -- surface that treats it as live withholds the one action the provider has.
     -- This function's answer decides whether the control is drawn, so its scope
     -- must match the RPC's own idempotency rule exactly — that rule is
     -- `status in ('open','under_review')`, and so is this.
     and c.status in ('open', 'under_review')
   order by c.created_at desc
   limit 1;
$$;

alter function public.my_provider_review_status() owner to postgres;
revoke all on function public.my_provider_review_status() from public, anon;
grant execute on function public.my_provider_review_status() to authenticated;

comment on function public.my_provider_review_status() is
  'Whether this provider has a LIVE eligibility review, and roughly where it '
  'stands. Deliberately scoped to open/under_review, matching '
  'request_provider_review''s idempotency rule: a closed case must not make the '
  'Request Review control disappear, because a provider whose appeal was '
  'dismissed and whose circumstances later changed still needs a route to ask.';

-- ── 2. Restoring eligibility closes the appeal it answers ──────────────────
--
-- Body carried forward from `20261050000000` with the closure added. Everything
-- else — the `is_operator()` gate, the actor requirement, the row lock, the
-- audited note — is unchanged.
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

alter function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  owner to postgres;
revoke all on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text)
  to service_role;

comment on function public.operator_set_provider_eligibility(uuid, boolean, uuid, text) is
  'The audited path for changing a provider''s marketplace eligibility. Closes the '
  'live appeal case it answers, so a decision and the question it settles are one '
  'record — and so a stale open case cannot resurface on a later de-approval and '
  'swallow the provider''s real appeal. service_role only.';
