-- A terminal outcome DOMINATES, and the participant write paths refuse once one exists.
--
-- `20261019000000` records the operator's decision. This migration makes it the one answer:
-- a resolved obligation is no longer Action needed, Waiting for confirmation, Needs Attention or
-- Under Review, and no later participant action can reopen or overwrite it.
--
-- ── ONE ANSWER, NOT TWO VOCABULARIES ──────────────────────────────────────
--
-- The failure this is written against is the read model saying "Under Review" while the record
-- says "unfulfilled". So the suppression happens ONCE, in the view, by feeding the existing
-- derived-state functions a cancelled-equivalent input when a terminal outcome exists — rather
-- than by adding a second set of predicates that could disagree with the first.
--
-- `barter_obligations.status` is UNCHANGED at four values. A terminal outcome is deliberately
-- NOT a fifth: a participant lifecycle value ("what the two of them did") and an operator
-- resolution ("what was concluded") are different kinds of fact, and one vocabulary for both is
-- how a status field starts lying.
--
-- ── THE PARTICIPANT WRITE PATHS REFUSE ────────────────────────────────────
--
-- `mark_barter_obligation_delivered`, `record_barter_obligation_receipt` and
-- `report_barter_obligation_no_show` all refuse with `PT412` once an adjudication exists. Each
-- check sits AFTER the obligation row lock and BEFORE that function's idempotent branch, so a
-- resolved obligation is never reported back as a successful write.
--
-- Live definitions taken from MIGRATION_LEDGER.md's functions table, not from the migrations
-- that created them: `20261005000000` for the first two, `20261014000000` for the third.

-- ── 1. Delivery refuses after resolution ──────────────────────────────────
create or replace function public.mark_barter_obligation_delivered(p_obligation_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_o.deliverer_user_id <> v_uid then
    raise exception 'Only the provider who owes this can mark it delivered.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- READ UNDER THE LOCK. A cancellation that committed before we took this lock is visible
  -- here; one that is still trying cannot commit, because cancel_barter_agreement locks this
  -- same row before it decides. Checked before the idempotent branch below so a cancelled
  -- trade is never reported as a successful delivery.
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so it can no longer be delivered.'
      using errcode = 'PT409';
  end if;

  -- ADDED: a resolved obligation takes no further participant action. Placed before the
  -- idempotent branch for the same reason the cancellation check is — otherwise a resolved
  -- obligation whose status already moved would be reported back as a success.
  if exists (select 1 from public.barter_obligation_adjudications a
              where a.obligation_id = v_o.id) then
    raise exception 'This has been resolved, so it can no longer be changed.'
      using errcode = 'PT412';
  end if;

  if v_o.status <> 'pending' then
    return v_o.status;
  end if;

  perform set_config('app.barter_obligation_write', v_o.id::text, true);
  update public.barter_obligations
     set status = 'delivered',
         delivered_at = clock_timestamp()
   where id = v_o.id;
  perform set_config('app.barter_obligation_write', '', true);

  return 'delivered';
end;
$$;

alter function public.mark_barter_obligation_delivered(uuid) owner to postgres;
revoke all on function public.mark_barter_obligation_delivered(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_barter_obligation_delivered(uuid) to authenticated;

-- ── 2. The receiver's answer refuses after resolution ─────────────────────
create or replace function public.record_barter_obligation_receipt(
  p_obligation_id uuid,
  p_status text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
begin
  if p_status is null or p_status not in ('received', 'not_received') then
    raise exception 'Unknown receipt answer.' using errcode = 'internal_error';
  end if;
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_o.receiver_user_id <> v_uid then
    raise exception 'Only the provider receiving this can answer for it.'
      using errcode = 'insufficient_privilege';
  end if;

  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to answer for.'
      using errcode = 'PT409';
  end if;

  -- ADDED: resolved obligations take no further answer.
  if exists (select 1 from public.barter_obligation_adjudications a
              where a.obligation_id = v_o.id) then
    raise exception 'This has been resolved, so it can no longer be answered.'
      using errcode = 'PT412';
  end if;

  if v_o.delivered_at is null then
    raise exception 'This has not been marked delivered yet.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_o.status = p_status then
    return v_o.status;
  end if;

  if v_o.status <> 'delivered' then
    raise exception 'You have already answered this.' using errcode = 'PT412';
  end if;

  perform set_config('app.barter_obligation_write', v_o.id::text, true);
  update public.barter_obligations
     set status = p_status,
         receipt_responded_at = clock_timestamp()
   where id = v_o.id;
  perform set_config('app.barter_obligation_write', '', true);

  return p_status;
end;
$$;

alter function public.record_barter_obligation_receipt(uuid, text) owner to postgres;
revoke all on function public.record_barter_obligation_receipt(uuid, text)
  from public, anon, authenticated;

-- ── 3. The no-show report refuses after resolution ────────────────────────
-- Live body from `20261014000000`, whose lock order (AGREEMENT first) is preserved exactly —
-- see that migration's header for why reversing it reintroduces a reproduced deadlock.
create or replace function public.report_barter_obligation_no_show(
  p_obligation_id uuid,
  p_reason text default null
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_o public.barter_obligations%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_at timestamptz;
  v_ag uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;
  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'That reason is too long.' using errcode = '22023';
  end if;

  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_o.receiver_user_id <> v_uid then
    raise exception 'Only the provider receiving this can report a no-show.'
      using errcode = 'insufficient_privilege';
  end if;

  v_ag := v_o.agreement_id;
  perform 1 from public.barter_agreements ag where ag.id = v_ag for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  select o.* into v_o from public.barter_obligations o
   where o.id = p_obligation_id for update;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to report.'
      using errcode = 'PT409';
  end if;

  -- ADDED: a resolved obligation takes no further report.
  if exists (select 1 from public.barter_obligation_adjudications a
              where a.obligation_id = v_o.id) then
    raise exception 'This has been resolved, so it can no longer be reported.'
      using errcode = 'PT412';
  end if;

  if v_o.scheduled_at is null then
    raise exception 'This trade has no scheduled time, so there is no appointment to miss.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if now() < v_o.scheduled_at then
    raise exception 'That scheduled time has not arrived yet.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_o.status = 'received' then
    raise exception 'You already confirmed you received this.' using errcode = 'PT412';
  end if;

  select r.created_at into v_at
    from public.barter_obligation_no_show_reports r
   where r.obligation_id = v_o.id;
  if found then
    return v_at;
  end if;

  insert into public.barter_obligation_no_show_reports
    (obligation_id, agreement_id, reporter_user_id, reporter_provider_id, scheduled_at, reason)
  values
    (v_o.id, v_o.agreement_id, v_uid, v_o.receiver_provider_id, v_o.scheduled_at, v_reason)
  returning created_at into v_at;

  return v_at;
exception
  when unique_violation then
    select r.created_at into v_at
      from public.barter_obligation_no_show_reports r
     where r.obligation_id = p_obligation_id;
    return v_at;
end;
$$;

alter function public.report_barter_obligation_no_show(uuid, text) owner to postgres;
revoke all on function public.report_barter_obligation_no_show(uuid, text)
  from public, anon, authenticated;
grant execute on function public.report_barter_obligation_no_show(uuid, text) to authenticated;

-- ── 4. The read model: one answer, terminal outcome dominating ────────────
--
-- The three derived states are suppressed by passing `true` for the "trade cancelled" input,
-- which every one of those functions already treats as "say nothing". That reuses the existing
-- dominance rule instead of writing a second one, so there is no new predicate to disagree with
-- the old ones — and `terminal_outcome` is the single place the resolution is reported.
create or replace view public.my_barter_obligations
with (security_invoker = true) as
select
  o.id,
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
  public.barter_confirmation_anchor(o.delivered_at, o.scheduled_at, o.due_at)
    as confirmation_anchor,
  public.barter_confirmation_deadline(o.delivered_at, o.scheduled_at, o.due_at)
    as confirmation_deadline,
  public.barter_receiver_window(
    o.status, o.delivered_at, o.scheduled_at, o.due_at,
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id)
      or exists (select 1 from public.barter_obligation_adjudications a
                  where a.obligation_id = o.id),
    now()
  ) as receiver_window_state,
  now() as server_now,
  (select r.created_at from public.barter_obligation_no_show_reports r
    where r.obligation_id = o.id) as no_show_reported_at,
  public.barter_obligation_under_review(
    o.status,
    exists (select 1 from public.barter_obligation_no_show_reports r
             where r.obligation_id = o.id),
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id)
      or exists (select 1 from public.barter_obligation_adjudications a
                  where a.obligation_id = o.id)
  ) as under_review,
  public.barter_can_report_no_show(
    o.scheduled_at,
    o.status,
    exists (select 1 from public.barter_obligation_no_show_reports r
             where r.obligation_id = o.id),
    exists (select 1 from public.barter_agreement_cancellations c
             where c.agreement_id = o.agreement_id)
      or exists (select 1 from public.barter_obligation_adjudications a
                  where a.obligation_id = o.id),
    now()
  ) as can_report_no_show,
  (select r.reason from public.barter_obligation_no_show_reports r
    where r.obligation_id = o.id) as no_show_reason,
  -- APPENDED. The operator's resolution, or NULL while there is none. The RATIONALE is NOT here
  -- and must not be: participants hold no column privilege on it, and adding it would defeat
  -- that. `adjudicator_user_id` is likewise absent.
  (select a.outcome from public.barter_obligation_adjudications a
    where a.obligation_id = o.id) as terminal_outcome,
  (select a.adjudicated_at from public.barter_obligation_adjudications a
    where a.obligation_id = o.id) as adjudicated_at
from public.barter_obligations o;

alter view public.my_barter_obligations owner to postgres;
revoke all on public.my_barter_obligations from public, anon;
grant select on public.my_barter_obligations to authenticated;
revoke insert, update, delete on table public.my_barter_obligations from authenticated;

comment on view public.my_barter_obligations is
  'Participant-scoped obligations. UNRESOLVED lifecycle state (receiver window, Under Review, '
  'the no-show offer) and the TERMINAL operator resolution are separate fields, and the terminal '
  'one dominates: once it is set the other three are silenced, so the row carries exactly one '
  'answer. The operator rationale is deliberately absent.';

-- ── 5. What this migration deliberately does NOT create ───────────────────
-- No agreement-level outcome, no roll-up, no column on `barter_obligations`, no fifth status
-- value, no escalation from Needs Attention into Under Review, no reputation, no review, no
-- notification. `my_trade_activity` is untouched here; the client derives its agreement-level
-- presentation from the per-obligation facts, and nothing persists one.
