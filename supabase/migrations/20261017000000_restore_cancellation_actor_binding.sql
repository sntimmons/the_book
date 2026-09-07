-- Restores the actor binding and the server-stamped `created_at` that `20261015000000` dropped.
--
-- FORWARD CORRECTION. `20261015000000` is applied and is therefore not edited.
--
-- ── WHAT HAPPENED, STATED PLAINLY ──────────────────────────────────────────
--
-- `20261015000000` added the PD-063 review check to `enforce_barter_cancellation_consistent` by
-- writing a new body **from `20261005000000`, the migration that CREATED the function** — not
-- from `20261006000000`, which is its LIVE definition. Two properties `20261006000000` had added
-- were silently reverted:
--
--   1. `new.created_at := clock_timestamp()` — server-stamped on EVERY insert path, not merely
--      defaulted. Without it a direct insert can supply any value, including a backdated one.
--   2. THE ACTOR IS THE CALLER — `if v_uid is not null and new.actor_user_id <> v_uid then
--      raise ... insufficient_privilege`. Without it, a privileged writer holding one
--      participant's session could record the OTHER participant's cancellation, and two acts is
--      exactly what the product reads as **mutually cancelled**. That would fabricate assent
--      nobody gave — the one thing `20261006000000` says can never be inferred.
--
-- This is precisely the hazard MIGRATION_LEDGER.md's "Functions redefined across migrations"
-- table exists to prevent, and the standing instruction is to read that table BEFORE redefining
-- an object. It was not read. Recorded here rather than quietly fixed, because the repo has paid
-- for this exact mistake before (`20261008000000` restored four properties `20261007000000`
-- dropped the same way) and the pattern is worth being able to find.
--
-- **B5B caught it on the first run after apply**, at
-- `supabase/tests/cancellation.test.sql:752-759` — "a participant cannot record the
-- COUNTERPARTY's cancellation" — which is the assertion `20261006000000` added for this. Nothing
-- reached a shared environment beyond the linked non-production project.
--
-- ── THIS BODY ──────────────────────────────────────────────────────────────
--
-- `20261006000000`'s live body, unchanged, PLUS the PD-063 review check that `20261015000000`
-- was adding. Read the ledger's functions table before touching this again: the live definition
-- is now THIS migration.
create or replace function public.enforce_barter_cancellation_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ok boolean;
  v_delivered integer;
  v_reported integer;
begin
  -- SERVER-STAMPED ON EVERY PATH, not only via the column default. An explicit insert could
  -- previously supply any value, including a backdated one.
  new.created_at := clock_timestamp();

  -- THE ACTOR IS THE CALLER. Checked before the participant-pair test, because "you may not
  -- act as someone else" is the stronger statement: without it a privileged writer holding
  -- one participant's session could record the OTHER participant's cancellation, and two acts
  -- is precisely what the product reads as "mutually cancelled". A null uid is a migration,
  -- an erasure cascade or a service_role backfill, which this guard has never policed.
  if v_uid is not null and new.actor_user_id <> v_uid then
    raise exception 'You can only record your own cancellation.'
      using errcode = 'insufficient_privilege';
  end if;

  select exists (
    select 1 from public.barter_agreements ag
     where ag.id = new.agreement_id
       and (
         (new.actor_user_id = ag.owner_user_id
          and new.actor_provider_id = ag.owner_provider_id)
         or
         (new.actor_user_id = ag.responder_user_id
          and new.actor_provider_id = ag.responder_provider_id)
       )
  ) into v_ok;
  if not v_ok then
    raise exception 'Only a participant of that agreement can cancel it.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Unchanged, and still a SEQUENTIAL guard on an unlocked read: it catches a direct
  -- privileged insert against an already-delivered agreement and does NOT decide a race.
  -- Race-safety remains owned by the lock order in cancel_barter_agreement and the matching
  -- post-lock check in mark_barter_obligation_delivered.
  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = new.agreement_id
     and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- PD-063, the same rule `cancel_barter_agreement` enforces: a trade under review cannot be
  -- cancelled out of review. Also a SEQUENTIAL guard, for the same reason as the delivered check
  -- above — the race is decided by the shared agreement lock in the two RPCs, not here.
  select count(*) into v_reported
    from public.barter_obligation_no_show_reports r
   where r.agreement_id = new.agreement_id;
  if v_reported > 0 then
    raise exception 'This trade needs review, so it can no longer be cancelled.'
      using errcode = 'PT423';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_cancellation_consistent() owner to postgres;
revoke all on function public.enforce_barter_cancellation_consistent()
  from public, anon, authenticated;

-- `cancel_barter_agreement` is NOT touched here. `20261015000000` wrote that one from
-- `20261010000000`, which IS its live definition, and it was diffed before commit: exactly one
-- block was added. The mistake was confined to the trigger.
