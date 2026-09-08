-- A resolved obligation gets its OWN SQLSTATE: `PT424`.
--
-- WHY THIS EXISTS, AND WHY IT IS A SEPARATE MIGRATION. `20261020000000` made the three
-- participant write paths refuse once an adjudication exists, and reused **`PT412`** for that
-- refusal. `PT412` already means something specific and different on those very functions —
-- "your answer is already recorded" and "you already confirmed you received this" — and the
-- client maps it to exactly that copy. So a receiver whose obligation had been RESOLVED, and who
-- had never answered anything, was told *"You already answered this. Your answer was recorded and
-- cannot be changed."* That is a false statement about their own trade. On
-- `mark_barter_obligation_delivered` it was worse: no `PT412` mapping exists there at all, so the
-- refusal fell through to the RETRY copy — *"Could not mark this delivered. Please try again."* —
-- inviting a retry that can never succeed.
--
-- This is the same reasoning, and the same fix, as PD-063's `PT423`: a refusal that means
-- something new gets a code of its own rather than borrowing one whose copy would lie. That
-- ruling is recorded in `PRODUCT_DECISIONS.md` (PD-063 *Consequences*) and it applies here
-- unchanged.
--
-- `20261020000000` IS ALREADY APPLIED AND IS NOT EDITED. Applied migrations are immutable
-- history; this migration supersedes those three function bodies forward, which is the only way
-- the repository is permitted to change them.
--
-- WHAT CHANGES, EXACTLY. Three `raise exception` sites move from `PT412` to `PT424`, and one
-- message is made specific to its function. **Nothing else.** The bodies below were taken from
-- `20261020000000` — their live definition — and diffed before commit; every guard, every lock,
-- the AGREEMENT-first lock order from `20261014000000`, the cancellation checks, the idempotent
-- branches and the two PRE-EXISTING `PT412` raises (which still mean what they always meant) are
-- carried through untouched.
--
-- `PT424` is deliberately not `PT409` (cancelled), not `PT410` (expired terms), not `PT412`
-- (already answered) and not `PT423` (under review). A resolved obligation is none of those: it
-- was not cancelled, its terms did not expire, its receiver may never have answered, and the
-- review it was in has ENDED. Saying any of those instead would be a false statement.

-- ── 1. Delivery refuses after resolution, and now says so with PT424 ─────
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
    raise exception 'This has been resolved, so it can no longer be marked delivered.'
      using errcode = 'PT424';
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

-- ── 2. The receiver's answer refuses after resolution, with PT424 ────────
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
      using errcode = 'PT424';
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

-- ── 3. The no-show report refuses after resolution, with PT424 ───────────
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
      using errcode = 'PT424';
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
-- ── What this migration deliberately does NOT change ──────────────────────
--
-- * The VIEWS. `my_barter_obligations` and `my_trade_activity` are untouched — this changes a
--   refusal code, not a read model.
-- * `adjudicate_barter_obligation`. Its own `PT412` is CORRECT and stays: there, the caller is an
--   operator and the obligation genuinely has already been resolved, which is what `PT412` says.
-- * The two pre-existing `PT412` raises inside the functions above. "You have already answered
--   this" and "You already confirmed you received this" are both still true statements in the
--   situations that raise them.
