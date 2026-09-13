-- ACCOUNT ERASURE — OQ-088. The deletion finalisation runs itself.
--
-- ══ WHAT WAS MISSING, AND WHAT IS BEING DECIDED HERE ══════════════════════
--
-- The engine has been complete since `20261129000000`: `sweep_account_deletions()`
-- finalises every request past its grace date and runs every purge whose window
-- has expired, `pending_media_deletions` holds the objects SQL cannot delete,
-- `confirm_media_deleted(...)` records that each one actually went, and
-- `overdue_account_deletion_work()` reports what is late. **Nothing invoked any
-- of it.** An operator ran a CLI worker, and a retention promise that depends on
-- somebody remembering is not a retention guarantee — which is why OQ-088 was
-- returned as a pre-external-beta blocker rather than closed.
--
-- The platform decision is **native Supabase scheduling**, and this file is it:
--
--     pg_cron  →  public.invoke_account_deletion_worker()  →  pg_net
--              →  the account-deletion-worker Edge Function
--              →  the erasure engine and the Storage API
--              →  public.account_deletion_worker_runs (durable evidence)
--
-- ══ THIS REVERSES A PINNED ASSERTION, ON PURPOSE AND IN THE OPEN ══════════
--
-- `supabase/tests/receiver_window.test.sql` and `no_show_under_review.test.sql`
-- have asserted since their first run that **no scheduler extension is
-- installed**. That assertion was never about erasure. It exists because a barter
-- obligation's state must only ever move when a PARTICIPANT acts — no second
-- timer, no automatic escalation (the deliberately-undecided note in
-- OPEN_QUESTIONS, and PD-072) — and "no scheduler exists" was the cheapest way to
-- make a clock impossible.
--
-- Installing `pg_cron` removes that guarantee-by-absence, so it is replaced by a
-- guarantee-by-inspection rather than deleted: the suites now assert that the
-- ONLY scheduled job in this database is this one, and that its command touches
-- no barter object. **A weakened test would have been the dishonest way to ship
-- a changed decision.** If a second job ever appears, those assertions fail and
-- somebody has to say why it exists.

-- ── 1. The two extensions, and nothing else ──────────────────────────────
--
-- `pg_net` lands in `extensions` and creates its own `net` schema; `pg_cron`
-- lands in `pg_catalog` and creates `cron`. Both are Supabase-supported and
-- already available in this project — neither is vendored, patched or wrapped.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ── 2. Durable evidence that a run happened, and what it found ───────────
--
-- `net._http_response` is transient and pg_net prunes it, so it cannot answer
-- "did last Tuesday's deletion run?" three weeks later. This table can. It holds
-- counts and the overdue rows, which name SUBJECT IDS — so it is restricted to
-- `service_role` exactly like `account_deletion_steps`, and an operator reads it
-- through the operations note rather than through a client role (PD-105).
create table if not exists public.account_deletion_worker_runs (
  id              uuid primary key default gen_random_uuid(),
  ran_at          timestamptz not null default now(),
  source          text not null default 'scheduled',
  ok              boolean not null default false,
  media_examined  integer not null default 0,
  media_deleted   integer not null default 0,
  media_failed    integer not null default 0,
  overdue_count   integer not null default 0,
  result          jsonb,
  log             text,
  constraint account_deletion_worker_runs_source_check
    check (source in ('scheduled', 'manual'))
);

create index if not exists account_deletion_worker_runs_recent_idx
  on public.account_deletion_worker_runs (ran_at desc);
create index if not exists account_deletion_worker_runs_failed_idx
  on public.account_deletion_worker_runs (ran_at desc) where not ok;

comment on table public.account_deletion_worker_runs is
  'One row per execution of the account-erasure worker, scheduled or manual. The '
  'durable answer to "did promised deletion work run, and did it succeed?" — '
  'pg_net''s own response table is pruned and cannot answer it later. Restricted '
  'to service_role: `result` carries overdue rows that name subject ids, and '
  'PD-105 keeps those out of every client role, operators included.';

alter table public.account_deletion_worker_runs enable row level security;
revoke all on public.account_deletion_worker_runs from public, anon, authenticated;

-- ── 3. The invocation, with every secret in the Vault ───────────────────
--
-- The cron COMMAND is `select public.invoke_account_deletion_worker();` and
-- carries no URL and no credential, because `cron.job.command` is a plain text
-- column. The three values it needs live in `vault.secrets`, encrypted, and are
-- provisioned out of band — **nothing secret is ever committed to this
-- repository.**
--
-- It RAISES on a missing secret rather than returning quietly: a scheduler that
-- fires into a void every night while reporting nothing is the failure this
-- whole workstream exists to remove.
create or replace function public.invoke_account_deletion_worker()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_url text; v_secret text; v_anon text; v_req bigint;
begin
  -- The cron job runs with no JWT claims; service_role covers a manual kick from
  -- trusted infrastructure. No client role can reach this.
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'The deletion worker is not client-invocable.' using errcode = '42501';
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'account_deletion_worker_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'account_deletion_worker_secret';
  select decrypted_secret into v_anon
    from vault.decrypted_secrets where name = 'account_deletion_worker_anon_key';

  if v_url is null or v_secret is null or v_anon is null then
    raise exception
      'The deletion worker is not configured: vault secrets account_deletion_worker_url, _secret and _anon_key must all exist.'
      using errcode = 'check_violation';
  end if;

  select net.http_post(
           url := v_url,
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             -- The platform gateway's check. The anon key is public; it is the
             -- outer of two gates, not the boundary.
             'Authorization', 'Bearer ' || v_anon,
             -- The boundary. A dedicated secret whose only capability is to make
             -- the engine do work it was already going to do.
             'x-worker-secret', v_secret),
           body := jsonb_build_object('source', 'scheduled'),
           timeout_milliseconds := 120000
         ) into v_req;
  return v_req;
end;
$$;
alter function public.invoke_account_deletion_worker() owner to postgres;
revoke all on function public.invoke_account_deletion_worker() from public, anon, authenticated;

comment on function public.invoke_account_deletion_worker() is
  'Calls the account-deletion-worker Edge Function through pg_net. Every secret '
  'comes from vault.decrypted_secrets, so cron.job.command — a plain text column '
  '— carries none. Raises when unconfigured rather than firing into a void.';

-- ── 4. The cadence lives in ONE place ───────────────────────────────────
--
-- Changing it means calling this function; it is never edited in two places and
-- never inferred from a comment. `cron.job` is then the single source of truth
-- and the operations note reads it rather than restating it.
create or replace function public.set_account_deletion_worker_schedule(p_schedule text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_existing bigint;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Scheduling is not client-callable.' using errcode = '42501';
  end if;
  select jobid into v_existing from cron.job where jobname = 'account-deletion-worker';
  if v_existing is not null then
    perform cron.unschedule('account-deletion-worker');
  end if;
  perform cron.schedule('account-deletion-worker', p_schedule,
                        'select public.invoke_account_deletion_worker();');
  return p_schedule;
end;
$$;
alter function public.set_account_deletion_worker_schedule(text) owner to postgres;
revoke all on function public.set_account_deletion_worker_schedule(text)
  from public, anon, authenticated;

comment on function public.set_account_deletion_worker_schedule(text) is
  'The ONLY supported way to change the deletion worker''s cadence. cron.job is '
  'the single source of truth for what it currently is; nothing restates it.';

-- ── 5. Daily, at a deliberately unremarkable minute ─────────────────────
--
-- **Daily is the right cadence and hourly would be false precision.** PD-102's
-- promise to a person is a DATE — "permanently deleted on the 12th" — not a
-- minute, and the closed-beta cohort is 25-30 people. A run an hour would add
-- nothing a user could perceive and 24x the failure surface.
--
-- 04:17 UTC: off-peak, and a minute nobody else picks. A job on the hour shares
-- its slot with every other `0 * * * *` on the instance.
select public.set_account_deletion_worker_schedule('17 4 * * *');
