-- ACCOUNT ERASURE — the request, the job, its steps, and its holds.
--
-- ══ WHY A JOB AND NOT A FUNCTION CALL ═════════════════════════════════════
--
-- Erasing an account touches eleven data classes across two dozen tables and two
-- storage buckets, and the approved policy gives each class a DIFFERENT
-- treatment: delete now, delete later, anonymize, retain under restriction. A
-- single function that does all of it has one failure mode that matters — it dies
-- half way, and nobody can tell which half.
--
-- So the deletion is a job with a memory. Four properties, each of which needs a
-- table rather than a convention:
--
--   * **IDEMPOTENT.** Every step is safe to run twice, and knows it already ran.
--   * **RESUMABLE.** A step that failed can be retried without redoing the ones
--     that succeeded — which matters most for the irreversible ones.
--   * **INCAPABLE OF CLAIMING SUCCESS EARLY.** `completed` is not something the
--     orchestrator decides; it is what remains when every required step is done
--     and no hold is open. That is a computed conclusion, not an assertion.
--   * **AUDITABLE.** Who asked, when, what ran, what failed, what was held and
--     why — for a process whose whole job is to destroy the evidence of itself.
--
-- ══ HOLDS ARE RECORD-SPECIFIC, DELIBERATELY ═══════════════════════════════
--
-- The ruling is explicit: *"Do not create a global 'legal hold keeps everything'
-- state unless genuinely required. Holds should be record-specific where
-- feasible."* A global hold is the easy design and the wrong one — it turns one
-- open report into a reason to keep somebody's profile photo, contact details and
-- device tokens indefinitely, which is exactly what the policy forbids
-- ("Legal/safety holds apply only to the specific retained records. They must not
-- preserve unrelated profile/account data.").
--
-- So a hold names a CLASS and, where it can, a specific record. The engine skips
-- what is held and finishes everything else, and the request sits in `completed`
-- with held classes recorded — not in a permanent limbo that keeps the account
-- alive.

-- ── 1. The request ────────────────────────────────────────────────────────
create table if not exists public.account_deletion_requests (
  id                    uuid primary key default gen_random_uuid(),
  -- The live FK, for as long as the account exists. SET NULL so the auth delete
  -- at the end of the job does not have to destroy its own paperwork.
  subject_user_id       uuid references auth.users(id) on delete set null,
  -- The DURABLE copy. `subject_user_id` goes null when the account goes; this is
  -- what the audit trail is keyed on afterwards, and it is restricted.
  subject_id            uuid not null,
  status                text not null,
  requested_at          timestamptz not null default now(),
  -- Stamped by the server from the configured grace period. Never supplied.
  grace_ends_at         timestamptz not null,
  finalizing_started_at timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  cancelled_by_user_id  uuid references auth.users(id) on delete set null,
  attempts              integer not null default 0,
  last_error            text,
  -- What the user was told at the time, so a support conversation months later
  -- can start from what they actually saw.
  disclosed_grace_days  integer not null,
  constraint account_deletion_requests_status_check
    check (status in ('requested', 'grace_period', 'cancelled',
                      'finalizing', 'completed', 'failed')),
  constraint account_deletion_requests_error_check
    check (last_error is null or char_length(last_error) <= 4000),
  -- A completed deletion has a completion time; an open one does not.
  constraint account_deletion_requests_completed_check
    check ((status = 'completed') = (completed_at is not null)),
  constraint account_deletion_requests_cancelled_check
    check ((status = 'cancelled') = (cancelled_at is not null))
);

-- ONE OPEN REQUEST PER ACCOUNT. Two concurrent requests would run two
-- orchestrators over the same rows, and the second would find its work already
-- done and could not tell that from a failure.
create unique index if not exists account_deletion_requests_one_open_idx
  on public.account_deletion_requests (subject_id)
  where status in ('requested', 'grace_period', 'finalizing');

create index if not exists account_deletion_requests_due_idx
  on public.account_deletion_requests (grace_ends_at)
  where status = 'grace_period';

comment on table public.account_deletion_requests is
  'One verified account-deletion request. `status` is the job state, and '
  '`completed` is a CONCLUSION rather than a claim — the orchestrator may only '
  'write it when every required step is done and no hold is open. '
  '`subject_user_id` is the live FK and goes null when the account does; '
  '`subject_id` is the durable copy the audit trail is keyed on afterwards.';

comment on column public.account_deletion_requests.grace_ends_at is
  'When permanent erasure becomes due. Stamped by the SERVER from '
  'retention_policy(''account_grace_period''), never supplied by the client — a '
  'user-chosen date is a user-chosen retention policy.';

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;

-- A user may SEE THEIR OWN request — they have to, to be shown the scheduled
-- date and the restore control. They may not write it: every transition goes
-- through an audited RPC, because "cancelled" is a security-relevant state and a
-- client that can set it directly can cancel somebody else's by guessing an id.
drop policy if exists account_deletion_requests_own_read on public.account_deletion_requests;
create policy account_deletion_requests_own_read on public.account_deletion_requests
  for select to authenticated
  using (auth.uid() = subject_user_id or public.is_operator());

-- ── 2. The steps ──────────────────────────────────────────────────────────
--
-- One row per data class per request. This is the memory: without it, "retry"
-- means "start again", and starting again is only safe because each step is
-- idempotent — which is a property to rely on for correctness, not for knowing
-- where you are.
create table if not exists public.account_deletion_steps (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.account_deletion_requests(id) on delete cascade,
  step_key     text not null,
  status       text not null default 'pending',
  attempts     integer not null default 0,
  last_error   text,
  started_at   timestamptz,
  completed_at timestamptz,
  -- What the step actually did, for the audit: counts, not content.
  result       jsonb,
  constraint account_deletion_steps_status_check
    check (status in ('pending', 'running', 'completed', 'held', 'failed')),
  constraint account_deletion_steps_error_check
    check (last_error is null or char_length(last_error) <= 4000),
  constraint account_deletion_steps_unique unique (request_id, step_key)
);

comment on table public.account_deletion_steps is
  'Per-class state for one deletion job: which steps have run, which failed, '
  'which are held. The reason a retry is resumable rather than a restart, and the '
  'reason the request cannot be marked completed while anything is outstanding. '
  '`result` records COUNTS, never content — an audit of a deletion must not '
  'become a copy of what was deleted.';

alter table public.account_deletion_steps enable row level security;
revoke all on public.account_deletion_steps from public, anon, authenticated;
-- Operators read this through an RPC; a user is shown a summary, not the steps.

-- ── 3. The holds ──────────────────────────────────────────────────────────
create table if not exists public.account_deletion_holds (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.account_deletion_requests(id) on delete cascade,
  -- The CLASS held, and where possible the specific record. Not the account.
  record_class   text not null,
  record_ref     text,
  reason         text not null,
  placed_by_user_id uuid references auth.users(id) on delete set null,
  placed_at      timestamptz not null default now(),
  released_at    timestamptz,
  released_by_user_id uuid references auth.users(id) on delete set null,
  constraint account_deletion_holds_class_check
    check (record_class in ('accepted_contracts', 'reports_evidence', 'messages',
                            'booking_photos', 'bookings', 'reviews', 'barter',
                            'provider_content', 'community_content', 'operator_audit')),
  constraint account_deletion_holds_reason_check
    check (char_length(reason) between 1 and 4000)
);

create index if not exists account_deletion_holds_open_idx
  on public.account_deletion_holds (request_id, record_class) where released_at is null;

comment on table public.account_deletion_holds is
  'A legal or safety hold on ONE CLASS of record, and where possible one record. '
  'Deliberately not a flag on the account: a global hold turns one open report '
  'into a reason to keep somebody''s profile photo and contact details, which is '
  'exactly what the policy forbids. The engine skips what is held, finishes '
  'everything else, and records what it could not do.';

alter table public.account_deletion_holds enable row level security;
revoke all on public.account_deletion_holds from public, anon, authenticated;

-- ── 4. The erased account: the only place the old identity survives ──────
--
-- Two values, and both exist for a reason the policy names.
--
-- `subject_id` is the "minimum party identity necessary" that accepted-contract
-- and report evidence are allowed to keep. It lives HERE, unreadable by any
-- client role, and the evidence rows hold it in a column that is equally
-- unreadable — so an operator can still answer "who accepted this contract" and
-- an ordinary caller cannot join anything back to anybody.
--
-- `pseudonym_id` is what makes ANONYMIZE work without destroying meaning. A
-- review's reviewer id cannot simply be nulled: the public rating is the mean of
-- the latest review from each DISTINCT client (PD-091/PD-092), so nulling two
-- erased reviewers would collapse two people into one voice and change every
-- rating they touched. A stable per-account pseudonym keeps them distinct while
-- resolving to no account at all — it is not an auth.users id, no FK points at
-- it, and no profile row exists for it.
create table if not exists public.erased_accounts (
  subject_id   uuid primary key,
  pseudonym_id uuid not null unique default gen_random_uuid(),
  erased_at    timestamptz not null default now(),
  request_id   uuid references public.account_deletion_requests(id) on delete set null
);

comment on table public.erased_accounts is
  'The ONLY surviving link between an erased account and the records the policy '
  'retains. `subject_id` is the minimum party identity accepted-contract and '
  'report evidence may keep, restricted to operators and service_role. '
  '`pseudonym_id` is what anonymized rows carry INSTEAD of a user id: it keeps '
  'distinct people distinct — the public rating averages one review per DISTINCT '
  'client, so nulling erased reviewers would merge them and move ratings — while '
  'resolving to no account, no profile and no FK.';

alter table public.erased_accounts enable row level security;
revoke all on public.erased_accounts from public, anon, authenticated;

-- A pseudonym must never be reused and a subject must never be re-keyed: both
-- would silently re-link history to a different person.
create or replace function public.enforce_erased_accounts_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    -- Even privileged callers may not re-point an erasure: that would reattach
    -- one person's retained history to another's identity.
    if tg_op = 'UPDATE'
       and (new.subject_id   is distinct from old.subject_id
         or new.pseudonym_id is distinct from old.pseudonym_id) then
      raise exception 'An erasure record cannot be re-keyed.' using errcode = 'check_violation';
    end if;
    return coalesce(new, old);
  end if;
  raise exception 'Erasure records are not client-writable.' using errcode = '42501';
end;
$$;
alter function public.enforce_erased_accounts_append_only() owner to postgres;
revoke all on function public.enforce_erased_accounts_append_only()
  from public, anon, authenticated;

drop trigger if exists erased_accounts_append_only on public.erased_accounts;
create trigger erased_accounts_append_only
  before insert or update or delete on public.erased_accounts
  for each row execute function public.enforce_erased_accounts_append_only();

-- ── 5. Deactivation is DERIVED, not a second flag ────────────────────────
--
-- An account is inactive exactly while it has an open deletion request. There is
-- no `is_deactivated` column anywhere, on purpose: a second copy of this fact
-- would drift from the request, and restoring an account would mean remembering
-- what its flags were before. Cancelling the request IS the restoration.
--
-- It also means `is_approved` is left alone. Reusing the operator eligibility
-- flag for "this person is deleting their account" would conflate a moderation
-- decision with a user's own choice, and restoration could not tell which of the
-- two had set it.
create or replace function public.account_pending_deletion(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_deletion_requests r
     where r.subject_user_id = p_user_id
       and r.status in ('requested', 'grace_period', 'finalizing')
  );
$$;

alter function public.account_pending_deletion(uuid) owner to postgres;
revoke all on function public.account_pending_deletion(uuid) from public;
-- Granted to `anon` as well: the public provider views filter on it, and a
-- signed-out visitor reads those. It answers about an account's ACTIVITY state,
-- which is already visible in the absence of the profile — it is not a block
-- oracle and it discloses nothing a missing card does not.
grant execute on function public.account_pending_deletion(uuid) to anon, authenticated, service_role;

comment on function public.account_pending_deletion(uuid) is
  'Is this account inactive because its owner asked to delete it? DERIVED from '
  'the open request rather than stored as a flag: a second copy would drift, and '
  'cancelling the request is what restoration IS. Deliberately does not touch '
  'providers.is_approved — conflating an operator''s moderation decision with a '
  'user''s own choice would make restoration unable to tell them apart.';

create or replace function public.caller_pending_deletion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then false
              else public.account_pending_deletion((select auth.uid())) end;
$$;

alter function public.caller_pending_deletion() owner to postgres;
revoke all on function public.caller_pending_deletion() from public;
grant execute on function public.caller_pending_deletion() to authenticated, service_role;

comment on function public.caller_pending_deletion() is
  'Is the CALLER inactive pending deletion? Takes no argument, which is what '
  'makes granting it safe — it can only answer about whoever is asking, the same '
  'property that made is_operator() grantable where the block predicates were not '
  '(20261055000000).';
