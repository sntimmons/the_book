-- Session 8 (F, G, H, N) — the operator Review Queue, and the authority to work it.
--
-- ══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
--
-- PD-068 makes a minimal internal Review Queue a PRE-BETA REQUIREMENT, and three
-- things are already waiting on it:
--
--   * PD-072's barter review requests. A deliverer whose receiver never answered
--     can ask The Book to look — and today that request reaches Under Review and
--     stops, because nothing processes it.
--   * PD-081's provider appeals. A de-approved provider was given the truthful
--     message and deliberately NO support button, because the only support entry
--     in the product is a stub that says "Coming soon". The button ships with the
--     path behind it or not at all.
--   * `public.reports`. Real reports have been accepted since the canonical
--     baseline and no operator has ever had a surface to work them.
--
-- ══ ONE TABLE, THREE SOURCES ══════════════════════════════════════════════
--
-- A case is the unit of operator work. Making it one table rather than three
-- queues is the difference between a queue an operator can actually work and
-- three places to forget to look. The SOURCE row stays where it is and stays
-- immutable — a case POINTS at it, and never copies its facts, so there is
-- exactly one version of what happened.
--
-- ══ WHAT THIS IS NOT ══════════════════════════════════════════════════════
--
-- Not an admin platform. No dashboards, no metrics, no bulk actions, no
-- assignment, no priority, no SLA field — PD-068 is explicit that there is no
-- SLA and that participant-facing language stays "under review". Four states,
-- an append-only event log, and enough context to make one decision.
--
-- **It decides nothing about barter value.** Resolution of a barter case goes
-- through the EXISTING `adjudicate_barter_obligation` (service_role-only, three
-- terminal outcomes, participant-may-not-adjudicate). This migration adds no
-- second adjudication path, and no notion of what a trade was worth.

-- ── 1. WHO IS AN OPERATOR ──────────────────────────────────────────────────
--
-- The same predicate `adjudicate_barter_obligation` already uses, extracted so
-- there is ONE answer. `20261023000000` narrowed that predicate and the ledger
-- records why: the earlier form admitted a no-`sub` `anon` request. Both
-- conditions are required — a JWT-less privileged session (psql, a migration, an
-- ops script) has no claims AND no subject; an `anon` PostgREST request has
-- claims naming the anon role.
--
-- **There is deliberately no operator ROLE TABLE and no `is_admin` column.**
-- Adding one would create a client-reachable path to operator authority, and the
-- authority here is exactly "holds the service key" — which is an infrastructure
-- fact, not a row a compromised session could flip.
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.role()) = 'service_role'
      or ((select auth.role()) is null and (select auth.uid()) is null);
$$;

alter function public.is_operator() owner to postgres;
revoke all on function public.is_operator() from public, anon, authenticated;
grant execute on function public.is_operator() to service_role;

comment on function public.is_operator() is
  'The single definition of operator authority: service_role, or a session with '
  'NO claims AND NO subject (psql/migration/ops). Both conjuncts are load-bearing '
  '— 20261023000000 narrowed this exact predicate because the looser form '
  'admitted an anon PostgREST request. EXECUTE is granted to service_role alone, '
  'so an ordinary user cannot even ask the question.';

-- ── 2. THE CASE ────────────────────────────────────────────────────────────
create table if not exists public.operator_cases (
  id uuid primary key default gen_random_uuid(),

  -- WHAT KIND. Three, matching the three things that need handling. A fourth
  -- means a new source, not a new workflow.
  case_type text not null
    check (case_type in ('barter_review', 'provider_appeal', 'user_report')),

  -- WHERE THE FACTS LIVE. Exactly one is set, enforced below. The case never
  -- copies the source's content — it points, so there is one version of events
  -- and no way for a case to drift from what actually happened.
  obligation_id uuid references public.barter_obligations(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  report_id uuid references public.reports(id) on delete cascade,

  -- WHO ASKED. Null for a case an operator opened themselves.
  requested_by_user_id uuid references auth.users(id) on delete set null,

  -- STATE. Four, deliberately: open (nobody has looked), under_review (someone
  -- is looking), resolved (an outcome was recorded), dismissed (looked at, no
  -- action). `reports.report_status` already uses this vocabulary.
  status text not null default 'open'
    check (status in ('open', 'under_review', 'resolved', 'dismissed')),

  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users(id) on delete set null,

  -- OPERATOR-ONLY. Never readable by a participant — see the grants below, which
  -- withhold this table from `authenticated` entirely.
  operator_notes text
    check (operator_notes is null or char_length(operator_notes) <= 4000),

  -- Exactly one subject, matching the type.
  constraint operator_cases_subject_matches_type check (
    (case_type = 'barter_review'
       and obligation_id is not null and provider_id is null and report_id is null)
    or (case_type = 'provider_appeal'
       and provider_id is not null and obligation_id is null and report_id is null)
    or (case_type = 'user_report'
       and report_id is not null and obligation_id is null and provider_id is null)
  )
);

comment on table public.operator_cases is
  'The minimal operator Review Queue required before barter beta (PD-068). One '
  'case per thing needing human handling, over three sources: barter review '
  'requests (PD-072), provider eligibility appeals (PD-081) and user reports. A '
  'case POINTS at its source and never copies its facts, so there is exactly one '
  'version of what happened. NOT readable by any ordinary user — operator_notes '
  'in particular is operator-only, which is why authenticated holds no grant on '
  'this table at all.';

-- ONE OPEN CASE PER SUBJECT. This is what stops a duplicate appeal or a duplicate
-- barter review from filling the queue with the same question — the requirement
-- names both. Partial, so a subject may have any number of RESOLVED cases in its
-- history and can be looked at again after an outcome.
create unique index if not exists operator_cases_one_live_obligation
  on public.operator_cases (obligation_id)
  where obligation_id is not null and status in ('open', 'under_review');

create unique index if not exists operator_cases_one_live_provider
  on public.operator_cases (provider_id)
  where provider_id is not null and status in ('open', 'under_review');

create unique index if not exists operator_cases_one_live_report
  on public.operator_cases (report_id)
  where report_id is not null and status in ('open', 'under_review');

create index if not exists operator_cases_queue_idx
  on public.operator_cases (status, created_at desc);

-- ── 3. AUDIT: what happened to a case, append-only ─────────────────────────
--
-- Requirement N. A case row holds the CURRENT state; this holds how it got there.
-- Without it, `status` is a field an operator can overwrite with no trace, and
-- "who decided this, and when" becomes unanswerable — which is the question that
-- matters most when a decision is challenged.
create table if not exists public.operator_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.operator_cases(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null
    check (action in ('opened', 'claimed', 'resolved', 'dismissed', 'noted')),
  from_status text,
  to_status text,
  note text check (note is null or char_length(note) <= 4000),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists operator_case_events_case_idx
  on public.operator_case_events (case_id, created_at);

comment on table public.operator_case_events is
  'Append-only history of operator action on a case: who, what, when, from which '
  'state to which, and an optional internal note. A case row can be updated; this '
  'cannot, so a material moderation fact is never silently overwritten (Session 8, '
  'requirement N).';

create or replace function public.enforce_operator_case_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Case history cannot be changed.' using errcode = 'check_violation';
end;
$$;

alter function public.enforce_operator_case_event_append_only() owner to postgres;
revoke all on function public.enforce_operator_case_event_append_only()
  from public, anon, authenticated;

drop trigger if exists operator_case_events_append_only on public.operator_case_events;
create trigger operator_case_events_append_only
  before update or delete on public.operator_case_events
  for each row execute function public.enforce_operator_case_event_append_only();

-- ── 4. NOBODY BUT AN OPERATOR TOUCHES EITHER TABLE ─────────────────────────
--
-- RLS is enabled with NO policy for `authenticated`, and the grants withhold the
-- tables from that role entirely. Two independent refusals: a client cannot read
-- a case even if a policy were added by mistake, and cannot write one even if a
-- grant were.
--
-- `service_role` bypasses RLS, which is how the operator path works. That is the
-- established pattern for `adjudicate_barter_obligation` and its adjacent tables,
-- and it is the reason there is no operator role table to compromise.
alter table public.operator_cases enable row level security;
alter table public.operator_case_events enable row level security;

revoke all on table public.operator_cases from public, anon, authenticated;
revoke all on table public.operator_case_events from public, anon, authenticated;
grant all on table public.operator_cases to service_role;
grant all on table public.operator_case_events to service_role;

-- ── 5. `updated_at` is the server's ────────────────────────────────────────
create or replace function public.touch_operator_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

alter function public.touch_operator_case() owner to postgres;
revoke all on function public.touch_operator_case() from public, anon, authenticated;

drop trigger if exists operator_cases_touch on public.operator_cases;
create trigger operator_cases_touch
  before update on public.operator_cases
  for each row execute function public.touch_operator_case();
