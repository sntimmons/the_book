-- Session 8B. WHAT AN OPERATOR IS ALLOWED TO SEE.
--
-- ══ WHY THESE ARE FUNCTIONS AND NOT GRANTS ════════════════════════════════
--
-- `20261059000000` let operators read `operator_cases`. A case POINTS at its
-- source and never copies its facts (`20261049000000`), which is the right
-- design — one version of what happened — but it means the case alone tells an
-- operator almost nothing. The facts live in `reports`, `barter_obligations` and
-- `providers`, and an operator is not a participant in any of them, so RLS
-- correctly hides them.
--
-- The lazy fix would be a policy on each of those tables saying "or
-- is_operator()". That would be a mistake with a long tail: it would let an
-- operator read EVERY report, EVERY obligation and EVERY provider row for any
-- purpose at any time, forever, and there would be no record of it. What the
-- requirement actually asks for is narrower — *inspect the relevant immutable
-- facts for a case* — so access is scoped to A CASE, and these two functions are
-- the whole of it.
--
-- ══ WHAT IS DELIBERATELY NOT HERE ═════════════════════════════════════════
--
-- No search across users. No "show me this person's other reports". No message
-- contents — a moderation decision in this beta is made on what was REPORTED,
-- not by reading a private thread, and a surface that reads threads is a
-- different product with a different consent story. No bulk actions. If an
-- operator needs something not returned here, that is a scope conversation, not
-- a `select *`.

-- ── 1. The queue ───────────────────────────────────────────────────────────
create or replace function public.operator_list_cases(
  p_status text default null,
  p_case_type text default null
)
returns table (
  case_id uuid,
  case_type text,
  status text,
  subject text,
  requested_by_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  event_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.case_type,
    c.status,
    -- ONE HUMAN-READABLE LINE, chosen per type. Enough to triage without opening
    -- the case, and not one word more than that needs.
    case c.case_type
      when 'provider_appeal' then
        coalesce((select p.display_name from public.providers p where p.id = c.provider_id),
                 'a provider who no longer exists')
      when 'user_report' then
        coalesce((select r.report_reason from public.reports r where r.id = c.report_id),
                 'a report that no longer exists')
      when 'barter_review' then
        coalesce((select o.agreed_description from public.barter_obligations o
                   where o.id = c.obligation_id),
                 'an obligation that no longer exists')
    end,
    c.requested_by_user_id,
    c.created_at,
    c.updated_at,
    (select count(*)::integer from public.operator_case_events e where e.case_id = c.id)
  from public.operator_cases c
  where public.is_operator()
    and (p_status is null or c.status = p_status)
    and (p_case_type is null or c.case_type = p_case_type)
  -- OLDEST FIRST, and not configurable. A queue ordered by anything else is a
  -- queue where something waits forever, and PD-068 promises no SLA precisely
  -- because nobody is committing to a deadline — which makes the ORDER the only
  -- fairness guarantee anyone has.
  order by c.status = 'open' desc, c.created_at asc
  limit 200;
$$;

alter function public.operator_list_cases(text, text) owner to postgres;
revoke all on function public.operator_list_cases(text, text) from public, anon;
grant execute on function public.operator_list_cases(text, text) to authenticated, service_role;

comment on function public.operator_list_cases(text, text) is
  'The Review Queue as an operator sees it (PD-068, Session 8B). Refuses every '
  'non-operator by returning ZERO ROWS rather than raising — a queue is a list, '
  'and an empty list is the honest answer to "what may you work on". Oldest open '
  'case first, and the order is not configurable: with no SLA, order is the only '
  'fairness guarantee a waiting person has.';

-- ── 2. One case, with the facts behind it ──────────────────────────────────
create or replace function public.operator_case_detail(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.operator_cases%rowtype;
  v_facts jsonb;
begin
  -- RAISES here, unlike the list. Asking for a specific case you may not see is
  -- a different act from listing what you may, and it should be refused out loud.
  if not public.is_operator() then
    raise exception 'Case handling is not available.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.operator_cases where id = p_case_id;
  if not found then
    raise exception 'That case no longer exists.' using errcode = 'check_violation';
  end if;

  if c.case_type = 'provider_appeal' then
    select jsonb_build_object(
      'provider_id', p.id,
      'display_name', p.display_name,
      'username', p.username,
      'is_approved', p.is_approved,
      'provider_since', p.created_at
    ) into v_facts
    from public.providers p where p.id = c.provider_id;

  elsif c.case_type = 'user_report' then
    -- The operator columns ARE included, because this is the operator: the
    -- boundary in 20261052000000 withholds them from the REPORTER, not from the
    -- person handling it.
    select jsonb_build_object(
      'report_id', r.id,
      'reason', r.report_reason,
      'notes', r.notes,
      'report_type', r.report_type,
      'report_status', r.report_status,
      'admin_notes', r.admin_notes,
      'reported_at', r.created_at,
      'reporter_user_id', r.reporter_user_id,
      'reported_user_id', r.reported_user_id,
      'reported_provider_id', r.reported_provider_id,
      'reported_provider_name',
        (select p.display_name from public.providers p where p.id = r.reported_provider_id),
      'booking_id', r.booking_id
    ) into v_facts
    from public.reports r where r.id = c.report_id;

  elsif c.case_type = 'barter_review' then
    -- THE IMMUTABLE FACTS, and nothing derived. An operator decides from what
    -- happened — who owed what, whether it was marked delivered, what the
    -- receiver said and when — not from a label the product computed. PD-070:
    -- no roll-up may overstate what was found, and that applies hardest to the
    -- screen where someone is about to decide.
    select jsonb_build_object(
      'obligation_id', o.id,
      'agreement_id', o.agreement_id,
      'promised', o.agreed_description,
      'status', o.status,
      'due_at', o.due_at,
      'scheduled_at', o.scheduled_at,
      'delivered_at', o.delivered_at,
      'receipt_responded_at', o.receipt_responded_at,
      'deliverer_user_id', o.deliverer_user_id,
      'receiver_user_id', o.receiver_user_id,
      'deliverer_name',
        (select p.display_name from public.providers p where p.id = o.deliverer_provider_id),
      'receiver_name',
        (select p.display_name from public.providers p where p.id = o.receiver_provider_id),
      -- HOW it got here, because the two routes are different evidence and the
      -- requirement names triage between them. A receiver saying "they never
      -- came" and a deliverer saying "they never answered me" are not the same
      -- claim and must not read as one.
      'no_show_reported', exists (select 1 from public.barter_obligation_no_show_reports nr
                                   where nr.obligation_id = o.id),
      'no_show_reason', (select nr.reason from public.barter_obligation_no_show_reports nr
                          where nr.obligation_id = o.id),
      'review_requested', exists (select 1 from public.barter_obligation_review_requests rr
                                   where rr.obligation_id = o.id),
      'trade_cancelled', exists (select 1 from public.barter_agreement_cancellations cx
                                  where cx.agreement_id = o.agreement_id),
      -- Already decided? The screen must not offer an action the server will
      -- refuse with PT412.
      'existing_outcome', (select a.outcome from public.barter_obligation_adjudications a
                            where a.obligation_id = o.id)
    ) into v_facts
    from public.barter_obligations o where o.id = c.obligation_id;
  end if;

  return jsonb_build_object(
    'case_id', c.id,
    'case_type', c.case_type,
    'status', c.status,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'resolved_at', c.resolved_at,
    'resolved_by_user_id', c.resolved_by_user_id,
    'requested_by_user_id', c.requested_by_user_id,
    'operator_notes', c.operator_notes,
    -- Null when the subject was deleted. The case survives its subject by
    -- design (`on delete cascade` removes the case, but a race or a partially
    -- erased account can still land here), and a null `facts` must render as
    -- "the subject is gone" rather than crash a screen.
    'facts', v_facts,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'action', e.action, 'actor_user_id', e.actor_user_id,
        'from_status', e.from_status, 'to_status', e.to_status,
        'note', e.note, 'created_at', e.created_at
      ) order by e.created_at)
      from public.operator_case_events e where e.case_id = c.id
    ), '[]'::jsonb)
  );
end;
$$;

alter function public.operator_case_detail(uuid) owner to postgres;
revoke all on function public.operator_case_detail(uuid) from public, anon;
grant execute on function public.operator_case_detail(uuid) to authenticated, service_role;

comment on function public.operator_case_detail(uuid) is
  'One case and the immutable facts behind it, scoped to THAT case (PD-068, '
  'Session 8B). Deliberately not a policy on reports/obligations/providers '
  'saying "or is_operator()": that would grant an operator every row of those '
  'tables for any purpose forever, with no record. Returns no message contents — '
  'a beta moderation decision is made on what was REPORTED, not by reading a '
  'private thread.';
