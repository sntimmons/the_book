-- The no-show write path takes the AGREEMENT lock first, like every other multi-row barter act.
--
-- FORWARD CORRECTION to `20261012000000`, which is applied and is therefore not edited.
--
-- ── WHAT WAS WRONG, AND WHY THE COMMENT MADE IT WORSE ──────────────────────
--
-- `20261012000000` § 6 states: "This takes the OBLIGATION row lock and nothing else, exactly as
-- `record_barter_obligation_receipt` and `mark_barter_obligation_delivered` do ... because this
-- function never takes the agreement lock it can wait for a cancellation but can never hold
-- something that cancellation needs first, so the pair cannot deadlock. A future writer here
-- must keep that property."
--
-- **Both halves of that are false.** The function DOES take a lock on `barter_agreements`, just
-- not with a visible `for update`: its INSERT carries
-- `agreement_id ... references public.barter_agreements(id)`, and PostgreSQL enforces a
-- referential-integrity check on INSERT by running, in effect,
-- `select 1 from only public.barter_agreements where id = $1 for key share`. `FOR KEY SHARE`
-- conflicts with `FOR UPDATE`. So the real order was **obligation, then agreement** — the exact
-- reverse of `cancel_barter_agreement`, which takes the agreement `for update` first and then
-- its obligations in id order (`20261005000000`).
--
-- The parity claim was wrong for the same reason. `mark_barter_obligation_delivered` and
-- `record_barter_obligation_receipt` only UPDATE the three lifecycle columns; PostgreSQL skips
-- the FK re-check when the referencing columns are unchanged, so those two genuinely take no
-- agreement lock. This RPC was the FIRST obligation-scoped writer to INSERT a row referencing
-- `barter_agreements` while already holding the obligation lock, and it inherited a contract
-- written for functions that do something different.
--
-- THE CYCLE, with both participants acting legitimately and concurrently:
--   T1 (either participant) `cancel_barter_agreement(A)` — takes A `for update`, then waits for
--      obligation O.
--   T2 (the receiver) `report_barter_obligation_no_show(O)` — holds O `for update`, sees no
--      cancellation because T1 has not committed, reaches the INSERT, and waits for A
--      `for key share`.
--   → deadlock, and PostgreSQL aborts one side with SQLSTATE `40P01`.
--
-- That is not a hypothetical interleaving. It is the "they did not show up" versus "I am
-- cancelling this" moment, which is exactly when both acts are most likely at once.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- Take the AGREEMENT lock first, then the obligation — the same order `cancel_barter_agreement`
-- uses. The order across the whole barter graph is now total: **agreement before obligation,
-- obligations in id order**, and the implicit FK lock this function was already taking is now
-- acquired explicitly, first, where it can be seen.
--
-- Nothing else changes. Every authority check, every refusal SQLSTATE, the idempotent branch and
-- the returned value are identical, so no client copy and no test expectation moves. The
-- function neither gains nor loses a capability; it only stops being able to deadlock.
--
-- LOCK RULE FOR FUTURE WRITERS, restated because the old one was wrong in a way that was easy to
-- believe: **enumerate the IMPLICIT locks too.** An INSERT or an UPDATE that writes a foreign-key
-- column takes `for key share` on the parent row. A function that only touches non-key columns
-- does not. "I wrote no `for update` on that table" is not the same as "I take no lock on it".

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

  -- AUTHORIZATION FIRST, ON AN UNLOCKED READ, exactly as before. A caller with no authority is
  -- refused without ever contending for a lock, so a stranger cannot make a legitimate reporter
  -- wait — a property the concurrency harness asserts directly.
  select o.* into v_o from public.barter_obligations o where o.id = p_obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  -- NOT AN EXISTENCE ORACLE. A non-participant gets the same message and SQLSTATE as a caller
  -- naming an id that does not exist, so neither learns which it was.
  if v_uid not in (v_o.deliverer_user_id, v_o.receiver_user_id) then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if v_o.receiver_user_id <> v_uid then
    raise exception 'Only the provider receiving this can report a no-show.'
      using errcode = 'insufficient_privilege';
  end if;

  -- THE AGREEMENT FIRST. This is the whole correction. It is the lock the INSERT's foreign key
  -- would have taken anyway, moved ahead of the obligation lock so this function and
  -- `cancel_barter_agreement` acquire the two rows in the SAME order and cannot form a cycle.
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

  -- Re-read under BOTH locks. A cancellation that commits from here on must wait for the
  -- agreement row, so this check can no longer be overtaken.
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled, so there is nothing to report.'
      using errcode = 'PT409';
  end if;

  if v_o.scheduled_at is null then
    raise exception 'This trade has no scheduled time, so there is no appointment to miss.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- SERVER TIME, always. `now()` is the transaction clock; there is no `p_as_of` parameter and
  -- no client value reaches this comparison.
  if now() < v_o.scheduled_at then
    raise exception 'That scheduled time has not arrived yet.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_o.status = 'received' then
    raise exception 'You already confirmed you received this.' using errcode = 'PT412';
  end if;

  -- IDEMPOTENT. The original report and its timestamp are returned unchanged; the reason is NOT
  -- merged in, because silently rewriting the words someone filed is exactly the "original
  -- report not overwritten" failure.
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
  -- Unreachable under the locks above, and that is the point: `cancel_barter_agreement` carries
  -- the same handler for the same shape, so that "unreachable" is not load-bearing. Two
  -- receivers cannot exist, so this can only fire if the lock discipline above is ever broken.
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

comment on function public.report_barter_obligation_no_show(uuid, text) is
  'Receiver-only report that a scheduled service did not happen. Takes the AGREEMENT lock before '
  'the obligation lock, matching cancel_barter_agreement, so the two cannot deadlock. Server '
  'derives the reporter, the provider, the appointment and the time. Idempotent: a repeat call '
  'returns the original timestamp. Creates no outcome, no fault and no reputation effect.';
