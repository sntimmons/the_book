-- Session 8 (B, D, E, F, G, I) — how cases get in, and how an operator works them.
--
-- `20261049000000` built the queue. This is the intake and the controls.
--
--   INTAKE (participant-facing, one RPC each, all narrowly bound):
--     * a de-approved provider asks for review        — PD-081
--     * a deliverer's barter review request opens a case — PD-072
--     * a user report opens a case                    — requirement B
--
--   OPERATOR (service_role only):
--     * claim, resolve, dismiss, note
--
-- ══ THE REPORTS LEAK, FIXED HERE ══════════════════════════════════════════
--
-- `public.reports` has carried an `admin_notes` column since the canonical
-- baseline, and its only SELECT policy is `auth.uid() = reporter_user_id` — with
-- no column restriction. **So a reporter could read the operator's private notes
-- on their own report.** Session 8's requirement B says private operator notes
-- must not be exposed to normal users; this is that defect, and it predates the
-- session. Fixed by column-level grants plus a `my_reports` view, which is the
-- pattern Correction 2 established for `providers`.

-- ── 1. A de-approved provider asks for review (PD-081) ─────────────────────
--
-- The action Correction 3 deliberately did NOT ship as a dead button. It ships
-- now because there is somewhere for it to land.
create or replace function public.request_provider_review(p_message text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_provider public.providers%rowtype;
  v_existing uuid;
  v_note text := nullif(btrim(coalesce(p_message, '')), '');
  v_case uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'That message is too long.' using errcode = '22023';
  end if;

  select p.* into v_provider from public.providers p where p.user_id = v_uid;
  if not found then
    raise exception 'You do not have a provider profile.' using errcode = 'check_violation';
  end if;

  -- ONLY WHILE INELIGIBLE. An approved provider has nothing to appeal, and
  -- letting them file anyway would fill the queue with cases that answer
  -- themselves.
  if v_provider.is_approved then
    raise exception 'Your business is available for new bookings.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- IDEMPOTENT PER UNRESOLVED ELIGIBILITY STATE. The requirement names duplicate
  -- appeals specifically. A repeat returns the case they already have rather than
  -- erroring — the provider did nothing wrong, and a second identical case is
  -- noise for the operator and no help to them. The partial unique index in
  -- 20261049000000 makes this true even under a race.
  select c.id into v_existing
    from public.operator_cases c
   where c.provider_id = v_provider.id
     and c.status in ('open', 'under_review');
  if found then
    return v_existing;
  end if;

  insert into public.operator_cases
    (case_type, provider_id, requested_by_user_id, status)
  values ('provider_appeal', v_provider.id, v_uid, 'open')
  returning id into v_case;

  insert into public.operator_case_events (case_id, actor_user_id, action, to_status, note)
  values (v_case, v_uid, 'opened', 'open', v_note);

  return v_case;
exception
  -- Unreachable under the index; it exists so "unreachable" is not load-bearing.
  when unique_violation then
    select c.id into v_existing from public.operator_cases c
     where c.provider_id = v_provider.id and c.status in ('open', 'under_review');
    return v_existing;
end;
$$;

alter function public.request_provider_review(text) owner to postgres;
revoke all on function public.request_provider_review(text) from public, anon;
grant execute on function public.request_provider_review(text) to authenticated;

comment on function public.request_provider_review(text) is
  'A provider whose business is not currently available for new bookings asks for '
  'it to be reviewed (PD-081). Own provider row only, only while is_approved is '
  'false, idempotent per unresolved eligibility state. Creates an operator case. '
  'Grants the caller NOTHING else — it cannot restore eligibility, and there is '
  'no participant-facing path that can.';

-- ── 2. What the provider is allowed to see about their own appeal ──────────
--
-- Broad status only. Never `operator_notes`, never the event log, never who
-- looked at it. A provider should be able to see THAT review was requested and
-- roughly where it stands — nothing that would turn an internal deliberation
-- into a document they are reading over the operator's shoulder.
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
   order by c.created_at desc
   limit 1;
$$;

alter function public.my_provider_review_status() owner to postgres;
revoke all on function public.my_provider_review_status() from public, anon;
grant execute on function public.my_provider_review_status() to authenticated;

-- ── 3. A barter review request opens a case (PD-072) ───────────────────────
--
-- The operator half PD-072 recorded as owed. The participant RPC is unchanged —
-- this trigger bridges the request into the queue, so the deliverer's act and the
-- operator's work stay one flow with no second thing for a participant to do.
create or replace function public.open_case_for_barter_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case uuid;
begin
  -- One live case per obligation; a repeat request is idempotent upstream, and
  -- the index makes it safe here too.
  if exists (
    select 1 from public.operator_cases c
     where c.obligation_id = new.obligation_id
       and c.status in ('open', 'under_review')
  ) then
    return new;
  end if;

  insert into public.operator_cases
    (case_type, obligation_id, requested_by_user_id, status)
  values ('barter_review', new.obligation_id, new.requested_by_user_id, 'open')
  returning id into v_case;

  insert into public.operator_case_events (case_id, actor_user_id, action, to_status)
  values (v_case, new.requested_by_user_id, 'opened', 'open');

  return new;
exception
  when unique_violation then
    return new;
end;
$$;

alter function public.open_case_for_barter_review() owner to postgres;
revoke all on function public.open_case_for_barter_review() from public, anon, authenticated;

drop trigger if exists barter_review_request_opens_case
  on public.barter_obligation_review_requests;
create trigger barter_review_request_opens_case
  after insert on public.barter_obligation_review_requests
  for each row execute function public.open_case_for_barter_review();

-- ── 4. A report opens a case (requirement B) ───────────────────────────────
create or replace function public.open_case_for_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case uuid;
begin
  insert into public.operator_cases
    (case_type, report_id, requested_by_user_id, status)
  values ('user_report', new.id, new.reporter_user_id, 'open')
  returning id into v_case;

  insert into public.operator_case_events (case_id, actor_user_id, action, to_status)
  values (v_case, new.reporter_user_id, 'opened', 'open');

  return new;
exception
  when unique_violation then
    return new;
end;
$$;

alter function public.open_case_for_report() owner to postgres;
revoke all on function public.open_case_for_report() from public, anon, authenticated;

drop trigger if exists reports_open_case on public.reports;
create trigger reports_open_case
  after insert on public.reports
  for each row execute function public.open_case_for_report();

-- ── 5. THE REPORTS LEAK ────────────────────────────────────────────────────
--
-- `admin_notes` and `resolved_by` are operator-only and were readable by the
-- reporter. Column-level revoke, then a view for what a reporter may legitimately
-- see about their own report: that it was received, and roughly where it stands.
revoke select (admin_notes, resolved_by) on public.reports from authenticated;
revoke select (admin_notes, resolved_by) on public.reports from anon;

create or replace view public.my_reports
with (security_invoker = true) as
  select r.id, r.created_at, r.updated_at, r.report_type, r.report_reason,
         r.report_status, r.notes, r.reported_provider_id, r.reported_user_id,
         r.booking_id, r.resolved_at
    from public.reports r
   where r.reporter_user_id = (select auth.uid());

alter view public.my_reports owner to postgres;
revoke all on public.my_reports from public, anon;
grant select on public.my_reports to authenticated;

comment on view public.my_reports is
  'What a reporter may see about their own report. Deliberately omits '
  'admin_notes and resolved_by: the base table''s SELECT policy is '
  '`auth.uid() = reporter_user_id` with no column restriction, so before this a '
  'reporter could read the operator''s private notes on their own report. The '
  'column-level revoke is the boundary; this view is the supported read.';

-- ── 6. OPERATOR CONTROLS ───────────────────────────────────────────────────
--
-- One RPC per verb, each refusing any caller that is not an operator, each
-- writing an event. The actor is a PARAMETER rather than derived, because a
-- service_role session has no `auth.uid()` — but it is never trusted as
-- authority: `is_operator()` decides that, and the id only records WHO.
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
revoke all on function public.operator_update_case(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.operator_update_case(uuid, text, uuid, text) to service_role;

comment on function public.operator_update_case(uuid, text, uuid, text) is
  'The only writer of case state. service_role only. The actor id is a parameter '
  'because a service_role session has no auth.uid() — it RECORDS who acted and is '
  'never trusted as authority; is_operator() decides that. Every call appends an '
  'event, so no state change is untraceable. Resolving a BARTER case does not '
  'adjudicate the obligation: that remains adjudicate_barter_obligation, which is '
  'the only writer of a terminal outcome (PD-064, PD-068).';

-- ── 7. Restoring provider eligibility, through one audited path ────────────
--
-- The narrow governance question Session 8 raises: an appeal is worthless if no
-- one can act on it. `providers.is_approved` is already writable by service_role
-- directly; this does not widen anything — it makes the change GO THROUGH a case
-- so that "who restored this provider, when, and against which appeal" has an
-- answer. An unaudited UPDATE remains possible for an operator with the service
-- key, exactly as it was; this is the supported path, not a new boundary.
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
  v_was boolean;
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

  -- Attach to the live appeal when there is one, so the decision and the request
  -- it answers are the same record.
  select c.id into v_case from public.operator_cases c
   where c.provider_id = p_provider_id and c.status in ('open', 'under_review');
  if found then
    insert into public.operator_case_events
      (case_id, actor_user_id, action, from_status, to_status, note)
    values (v_case, p_actor_user_id, 'noted', null, null,
            coalesce(v_note, '') ||
            case when v_was = p_approved then ' (eligibility unchanged)'
                 when p_approved then ' (eligibility restored)'
                 else ' (eligibility removed)' end);
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
