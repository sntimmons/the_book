-- The no-show report's `created_at` is stamped by the SERVER on every insert path.
--
-- FORWARD CORRECTION to `20261012000000`, which is applied and is therefore not edited.
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
--
-- `20261012000000` gave the column `default clock_timestamp()` and a comment promising
-- *"Server-stamped and immutable ... so the record of when the complaint was first made cannot be
-- moved."* **A DEFAULT is not a stamp.** An explicit INSERT that supplies `created_at` overrides
-- it, and `enforce_barter_no_show_consistent` only READ the value (refusing one earlier than the
-- appointment) — so any supplied value at or after `scheduled_at`, including an arbitrarily
-- FUTURE one, was accepted. The comment was false.
--
-- This repo has already ruled on this exact shape once: `20261006000000` made the CANCELLATION
-- act's `created_at` trigger-stamped for precisely this reason, and `20261017000000` had to
-- restore that property a day later. The two sibling tables were asymmetric — the cancellation
-- act stamped, the no-show report merely defaulted — while both comments claimed the same
-- guarantee.
--
-- ── WHY IT MATTERS EVEN THOUGH NO CLIENT CAN REACH IT ──────────────────────
--
-- `authenticated` holds no INSERT on this table and there is no INSERT policy, so the reachable
-- writers are `service_role` and no-JWT sessions — a trusted path, not a crafted client. That is
-- why this is a hardening fix rather than an authorization defect.
--
-- It is worth doing now anyway: `no_show_reported_at` is ALREADY surfaced to both participants on
-- `my_barter_obligations` and `my_trade_activity`, and it is the obvious anchor for the
-- adjudication slice that everything says comes next. The moment any rule measures a deadline
-- from it, a movable timestamp stops being a display fact and becomes an authorization boundary.
-- Fixing it before that happens is cheaper than fixing it after.
--
-- The live definition of this trigger is `20261012000000`; this migration supersedes it. Only
-- the stamp is added — every existing guard is reproduced verbatim.
create or replace function public.enforce_barter_no_show_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.barter_obligations%rowtype;
begin
  -- SERVER-STAMPED ON EVERY PATH, not only via the column DEFAULT, which an explicit insert
  -- overrides. Assigned BEFORE the arrival check below, so that check now compares the SERVER's
  -- clock to the appointment rather than a value the writer chose.
  new.created_at := clock_timestamp();

  select o.* into v_o from public.barter_obligations o where o.id = new.obligation_id;
  if not found then
    raise exception 'That obligation no longer exists.' using errcode = 'check_violation';
  end if;

  if new.agreement_id <> v_o.agreement_id then
    raise exception 'A no-show report must belong to its obligation''s agreement.'
      using errcode = 'check_violation';
  end if;
  -- Only the RECEIVER. The deliverer cannot report themselves as a no-show, and nobody outside
  -- the obligation can report at all.
  if new.reporter_user_id <> v_o.receiver_user_id
     or new.reporter_provider_id <> v_o.receiver_provider_id then
    raise exception 'Only the provider receiving this can report a no-show.'
      using errcode = 'check_violation';
  end if;
  -- No-show exists ONLY for a scheduled obligation, and only once the appointment has arrived.
  if v_o.scheduled_at is null then
    raise exception 'This trade has no scheduled time, so there is no appointment to miss.'
      using errcode = 'check_violation';
  end if;
  if new.scheduled_at <> v_o.scheduled_at then
    raise exception 'A no-show report must carry its obligation''s scheduled time.'
      using errcode = 'check_violation';
  end if;
  if new.created_at < v_o.scheduled_at then
    raise exception 'A no-show cannot be reported before the scheduled time.'
      using errcode = 'check_violation';
  end if;
  -- An explicitly RECEIVED obligation is settled by the receiver's own word; they cannot then
  -- report that the same service never happened. `not_received` is deliberately NOT blocked.
  if v_o.status = 'received' then
    raise exception 'You already confirmed you received this.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = v_o.agreement_id) then
    raise exception 'This trade was cancelled.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_no_show_consistent() owner to postgres;
revoke all on function public.enforce_barter_no_show_consistent()
  from public, anon, authenticated;

comment on column public.barter_obligation_no_show_reports.created_at is
  'Server-stamped by enforce_barter_no_show_consistent on every insert path, not merely '
  'defaulted, and immutable thereafter. A repeat report returns the existing act rather than '
  're-stamping it. The column DEFAULT remains as a second line of defence only.';

-- Nothing else changes: no table, no column, no policy, no grant, no write path, and no
-- terminal outcome.
