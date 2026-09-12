-- FORWARD CORRECTION to 20261130000000 (PD-108). From the security review of
-- `f44a91b`: one HIGH already addressed, and three MEDIUMs that all point at the
-- same thing.
--
-- ══ THE SHAPE OF ALL THREE ════════════════════════════════════════════════
--
-- PD-108 replaced *"somebody has to remember to run it"* with *"somebody has to
-- notice it stopped"*. That is a better promise only if the system can actually
-- TELL them — and it could not.
--
-- ── (1) AN INVOCATION THAT NEVER ARRIVED LEFT NO TRACE (SEC-DATA-002) ─────
--
-- `invoke_account_deletion_worker` is fire-and-forget: it returns the pg_net
-- request id and never looks at the response. The run row is written by the EDGE
-- FUNCTION, and only after it has passed the secret gate. So every one of these
-- wrote **nothing, anywhere**:
--
--   * a vault secret missing or wrong → the raise happens inside cron
--   * pg_net cannot deliver → the status lands only in `net._http_response`,
--     which pg_net prunes and `20261132000000` now clears
--   * the worker secret rotated on one side only → a 401, nightly, forever
--
-- and `cron.job_run_details` records **SUCCESS** for every one of them, because
-- the SQL statement succeeded. Erasures would silently stop, users who were told
-- a date would not be deleted, and the only signal would be a human noticing an
-- ABSENCE of rows — which is the human-memory dependency this workstream exists
-- to remove, moved one link up the chain.
--
-- **A dispatch is now recorded before the call goes out**, and the Edge Function
-- stamps its run with the dispatch id it was given. A dispatch with no run is
-- therefore a call that never arrived, and it is a POSITIVE row rather than a
-- missing one.
--
-- ── (2) OVERLAPPING DRAINS INVENTED FAILURES (SEC-DATA-003) ───────────────
--
-- The drain loop took no lock — unlike the purge-step loop beside it, which has
-- used `for update skip locked` since `20261114000000`. Two runs (the nightly one
-- and an operator draining a backlog, which the operations note explicitly
-- sanctions) could list the same row: the first deletes and confirms it, the
-- second gets `{error: null, data: []}`, counts a media FAILURE, writes
-- "the Storage API removed nothing" onto an already-confirmed row, and reports
-- the whole run `ok: false`. Nobody lost data; somebody got paged for a deletion
-- that had in fact succeeded.
--
-- Rows are now CLAIMED, with a lease, so two runs never hold the same object.
--
-- ── (3) A SUCCEEDED DELETE WITH A FAILED CONFIRM WEDGED THE ERASURE ───────
--
-- `reallyGone` requires the Storage API to return the removed object. An object
-- that is ALREADY absent can therefore never be confirmed: every later run gets
-- `data: []`, `adel_media_purge` keeps raising `PT446`, and the request can never
-- reach `completed`. Reached with no attacker at all — the delete succeeds and
-- the confirming RPC errors, and the bytes are gone while the row says they are
-- not, permanently.
--
-- **The fix is not to assume absence means deletion.** It is to go and look:
-- the worker now asks the Storage API whether the object is there, and confirms
-- only on positive evidence that it is not. That keeps the original rule intact
-- — a confirmation is a claim about bytes, never a shrug — while removing the
-- state that had no exit.

-- ── 1. A dispatch is a fact, recorded before the call ────────────────────
create table if not exists public.account_deletion_worker_dispatches (
  id              uuid primary key default gen_random_uuid(),
  dispatched_at   timestamptz not null default now(),
  net_request_id  bigint,
  note            text
);

create index if not exists account_deletion_worker_dispatches_recent_idx
  on public.account_deletion_worker_dispatches (dispatched_at desc);

comment on table public.account_deletion_worker_dispatches is
  'One row per attempt to invoke the deletion worker, written BEFORE the call '
  'goes out. A dispatch with no matching run row is a call that never arrived — '
  'a wrong vault secret, a rotated worker secret, an undelivered pg_net request. '
  'Without this the failure was invisible: cron reports SUCCESS because the SQL '
  'succeeded, and the run table is written only by the function that never ran.';

alter table public.account_deletion_worker_dispatches enable row level security;
revoke all on public.account_deletion_worker_dispatches from public, anon, authenticated;

alter table public.account_deletion_worker_runs
  add column if not exists dispatch_id uuid;
create index if not exists account_deletion_worker_runs_dispatch_idx
  on public.account_deletion_worker_runs (dispatch_id);

comment on column public.account_deletion_worker_runs.dispatch_id is
  'The dispatch this run answers, echoed back by the Edge Function from the '
  'request body. NULL for a manual CLI run, which dispatches nothing.';

-- ── 2. The invoke records its attempt, then makes it ─────────────────────
create or replace function public.invoke_account_deletion_worker()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_url text; v_secret text; v_anon text; v_req bigint; v_dispatch uuid;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'The deletion worker is not client-invocable.' using errcode = '42501';
  end if;

  -- RECORDED FIRST, and deliberately not inside the success path: a dispatch that
  -- is never answered is the whole signal.
  insert into public.account_deletion_worker_dispatches default values
  returning id into v_dispatch;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'account_deletion_worker_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'account_deletion_worker_secret';
  select decrypted_secret into v_anon
    from vault.decrypted_secrets where name = 'account_deletion_worker_anon_key';

  if v_url is null or v_secret is null or v_anon is null then
    update public.account_deletion_worker_dispatches
       set note = 'unconfigured: a vault secret is missing' where id = v_dispatch;
    raise exception
      'The deletion worker is not configured: vault secrets account_deletion_worker_url, _secret and _anon_key must all exist.'
      using errcode = 'check_violation';
  end if;

  select net.http_post(
           url := v_url,
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'Authorization', 'Bearer ' || v_anon,
             'x-worker-secret', v_secret),
           -- The dispatch id travels WITH the call so the run can name it. The
           -- previous body sent `source` and the function never read it — a dead
           -- contract, and the review said so.
           body := jsonb_build_object('source', 'scheduled', 'dispatch_id', v_dispatch),
           timeout_milliseconds := 120000
         ) into v_req;

  update public.account_deletion_worker_dispatches
     set net_request_id = v_req where id = v_dispatch;
  return v_req;
end;
$$;
alter function public.invoke_account_deletion_worker() owner to postgres;
revoke all on function public.invoke_account_deletion_worker() from public, anon, authenticated;

-- ── 3. Claim the objects, so two runs never hold the same one ────────────
alter table public.pending_media_deletions
  add column if not exists claimed_at timestamptz;

comment on column public.pending_media_deletions.claimed_at is
  'When a worker took this row to delete. A LEASE, not a lock: a run that dies '
  'mid-drain leaves rows claimed, and they become claimable again after the '
  'lease expires, so a crash costs one cycle rather than the row.';

create or replace function public.claim_pending_media_deletions(p_limit integer)
returns setof public.pending_media_deletions
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Claiming media deletions is not client-callable.' using errcode = '42501';
  end if;
  return query
  update public.pending_media_deletions p
     set claimed_at = now()
   where p.id in (
     select c.id from public.pending_media_deletions c
      where c.deleted_at is null
        and (c.claimed_at is null or c.claimed_at < now() - interval '15 minutes')
      order by c.enqueued_at
      -- The same idiom the purge-step loop has used since 20261114000000. Two
      -- overlapping runs take disjoint sets instead of fighting over one.
      for update skip locked
      limit greatest(1, least(5000, coalesce(p_limit, 200)))
   )
  returning p.*;
end;
$$;
alter function public.claim_pending_media_deletions(integer) owner to postgres;
revoke all on function public.claim_pending_media_deletions(integer)
  from public, anon, authenticated;

comment on function public.claim_pending_media_deletions(integer) is
  'Takes an exclusive, leased batch of queued objects for one worker run. Exists '
  'because the drain loop took no lock while the purge loop beside it did: two '
  'runs could list the same row, and the loser reported a media FAILURE for an '
  'object the winner had just deleted successfully.';

-- A failure may only be recorded against a row that is still outstanding.
-- Without this the losing run of a race annotated a CONFIRMED row with
-- "the Storage API removed nothing for this path".
create or replace function public.record_media_deletion_failure(
  p_id uuid, p_error text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Recording a media failure is not client-callable.' using errcode = '42501';
  end if;
  update public.pending_media_deletions
     set attempts = attempts + 1,
         last_error = left(p_error, 4000),
         claimed_at = null            -- released, so the next run may retry it
   where id = p_id and deleted_at is null;
  return found;
end;
$$;
alter function public.record_media_deletion_failure(uuid, text) owner to postgres;
revoke all on function public.record_media_deletion_failure(uuid, text)
  from public, anon, authenticated;

-- ── 4. "Did the promise break?" — one query, positive signals only ───────
create or replace function public.account_deletion_worker_health()
returns table (problem text, detail text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- A dispatch nothing answered. This is the failure that used to be invisible.
  select 'dispatch_never_answered'::text,
         format('dispatch %s went out and no run recorded it%s',
                d.id, coalesce(' — ' || d.note, '')),
         d.dispatched_at
    from public.account_deletion_worker_dispatches d
   where not exists (select 1 from public.account_deletion_worker_runs r
                      where r.dispatch_id = d.id)
     and d.dispatched_at < now() - interval '10 minutes'
     and d.dispatched_at > now() - interval '30 days'

  union all
  -- The scheduler has stopped firing altogether. An ABSENCE turned into a row,
  -- because nobody notices an absence.
  select 'no_successful_run'::text,
         format('no successful worker run in %s',
                coalesce((now() - max(r.ran_at))::text, 'any recorded period')),
         max(r.ran_at)
    from public.account_deletion_worker_runs r
   where r.ok
  having max(r.ran_at) is null or max(r.ran_at) < now() - interval '2 days'

  union all
  -- A run that arrived and failed.
  select 'run_failed'::text,
         format('run %s: %s examined, %s deleted, %s failed, %s overdue',
                r.id, r.media_examined, r.media_deleted, r.media_failed, r.overdue_count),
         r.ran_at
    from public.account_deletion_worker_runs r
   where not r.ok and r.ran_at > now() - interval '30 days'

  union all
  -- An object nothing can shift. Distinguished from a transient failure by its
  -- attempt count, so it is visible as "somebody has to look at this one".
  select 'media_stuck'::text,
         format('%s/%s has failed %s times: %s',
                m.bucket_id, m.object_path, m.attempts, coalesce(m.last_error, '(no reason)')),
         m.enqueued_at
    from public.pending_media_deletions m
   where m.deleted_at is null and m.attempts >= 3

  order by 3 nulls first;
$$;
alter function public.account_deletion_worker_health() owner to postgres;
revoke all on function public.account_deletion_worker_health()
  from public, anon, authenticated;

comment on function public.account_deletion_worker_health() is
  'Everything wrong with the EXECUTION of deletion, as opposed to '
  'overdue_account_deletion_work() which reports the WORK. Empty is healthy. '
  'Every entry is a positive row rather than a missing one: an absence is the '
  'one thing nobody notices, so "the scheduler has not fired" is itself a row.';

-- ── 5. THREE LIVE COMMENTS STILL SAID THERE IS NO SCHEDULER ─────────────
--
-- SEC-TRUTH-006. `20261130000000` refreshed no comment on any pre-existing
-- object, so the durable, schema-dumped documentation for the three objects the
-- scheduler drives asserted the opposite of what ships. The next person reading
-- `\df+ sweep_account_deletions` was told a person has to run it — and given
-- SEC-DATA-002, believing that is a plausible route to nobody watching the
-- automation at all.
comment on function public.sweep_account_deletions() is
  'Finalises every request whose grace period has ended and runs every purge that '
  'has come due. Idempotent and safe to run repeatedly. Called by the '
  'account-deletion-worker Edge Function, which pg_cron invokes daily (PD-108); '
  'scripts/account-deletion-worker.mjs runs the same sequence as the manual '
  'fallback. Not client-callable.';

comment on table public.pending_media_deletions is
  'Storage objects that MUST be deleted and cannot be deleted from SQL — Supabase '
  'refuses direct writes to storage.objects and requires the Storage API. Each row '
  'is outstanding work, and the `media_purge` deletion step stays incomplete while '
  'any row for that subject is undeleted, so an erasure cannot report success with '
  'the bytes still in the bucket. Drained by the scheduled account-deletion worker '
  '(PD-108), which claims rows under a lease and confirms each delete only on '
  'evidence the object is gone.';

comment on function public.overdue_account_deletion_work() is
  'Everything that is late: any request past its grace date that nothing has '
  'finalised, and any step that is failed, held or past due. Reports the WORK; '
  'account_deletion_worker_health() reports whether the thing that does the work '
  'is running at all. Both are empty when healthy.';
