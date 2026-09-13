-- FORWARD CORRECTION to 20261135000000, caught by the committed suite before it
-- left the branch.
--
-- ══ WHAT BROKE, AND WHY IT WAS NOT OBVIOUS ════════════════════════════════
--
-- `20261135000000` added `providers.discovery_tiebreak`, a GENERATED ALWAYS column
-- derived from the row id. It broke ONE assertion in `account_erasure.test.sql`:
--
--     FAIL [erasure] a departing provider's server-derived counters can still be
--     recomputed :: expected=OK actual=PT440
--
-- `refuse_provider_write_when_account_inactive` decides "is this caller starting new
-- activity, or is a server recompute touching derived columns" by comparing the
-- whole row minus an allow-list:
--
--     if (to_jsonb(new) - v_derived) = (to_jsonb(old) - v_derived) then return new;
--
-- **PostgreSQL computes generated columns AFTER BEFORE-row triggers run.** So inside
-- this trigger `new.discovery_tiebreak` is NULL while `old.discovery_tiebreak` holds
-- the stored md5 — a difference that is not a difference. The comparison failed, and
-- a provider in their 30-day grace period could no longer have their reputation
-- counters recomputed. That is a real erasure regression: PD-102 keeps the
-- operational record accurate during grace, and a booking completed by somebody else
-- would have started failing.
--
-- Worth stating plainly because the next generated column will hit it too: **any
-- whole-row `to_jsonb(new) = to_jsonb(old)` comparison in a BEFORE trigger is broken
-- by adding a generated column**, and it fails in the safe-looking direction — a
-- refusal, not a leak — so it surfaces as a mysterious permission error rather than
-- as anything that points at the cause.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
--
-- `discovery_tiebreak` joins `v_derived`. It belongs there on the array's own terms
-- — *"columns no person sets: every one is written by a server-side recompute or an
-- operator flag"* — and it is the strongest member of that set, because it is
-- generated and therefore writable by NOBODY, not even `service_role`. Listing it
-- cannot widen what a departing account may do.
--
-- The body is otherwise the LIVE definition from `pg_get_functiondef`, not retyped.
create or replace function public.refuse_provider_write_when_account_inactive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  -- Columns no person sets: every one is written by a server-side recompute or
  -- an operator flag. Changing ONLY these is not "starting new activity".
  --
  -- `discovery_tiebreak` is here for TWO reasons. It is derived — generated from the
  -- id, so nobody can set it at all. And it MUST be listed regardless: it is a
  -- GENERATED column, and generated columns are computed AFTER before-row triggers,
  -- so `new.discovery_tiebreak` is NULL here while `old` holds its value. Without it
  -- the comparison below sees a phantom change on every update and refuses the
  -- recompute (20261136000000).
  v_derived constant text[] := array[
    'rating', 'average_rating', 'review_count', 'rating_client_count',
    'total_bookings', 'completed_count', 'repeat_client_rate',
    'follower_count', 'next_available', 'is_trending', 'is_featured',
    'is_approved', 'updated_at', 'discovery_tiebreak'
  ];
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and v_uid is null) then
    return new;
  end if;
  if not public.caller_account_unavailable() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'This account is scheduled for deletion and cannot start new activity.'
      using errcode = 'PT440';
  end if;

  -- Somebody else's business. Their row, their rules; this trigger is about the
  -- caller's own public presence, and the recompute of another provider's
  -- reputation runs under whichever JWT happened to complete the booking.
  if old.user_id is distinct from v_uid then
    return new;
  end if;

  -- Their own row: only the derived columns may move.
  if (to_jsonb(new) - v_derived) = (to_jsonb(old) - v_derived) then
    return new;
  end if;

  raise exception 'This account is scheduled for deletion and cannot start new activity.'
    using errcode = 'PT440';
end;
$$;

alter function public.refuse_provider_write_when_account_inactive() owner to postgres;
revoke all on function public.refuse_provider_write_when_account_inactive()
  from public, anon, authenticated;

comment on function public.refuse_provider_write_when_account_inactive() is
  'Refuses a departing provider editing their own public presence during grace, '
  'while still allowing server-side recomputes of derived columns. The allow-list '
  'includes discovery_tiebreak because it is generated — and because generated '
  'columns are NULL in a BEFORE trigger, so omitting it made every update look like '
  'a change and refused the recompute (20261136000000).';
