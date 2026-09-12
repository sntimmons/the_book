-- ACCOUNT ERASURE & RETENTION — the durations live in ONE place.
--
-- ══ WHY A TABLE AND NOT CONSTANTS ═════════════════════════════════════════
--
-- The approved closed-beta policy sets six retention windows. Two of them —
-- accepted-contract evidence and report/safety evidence — are **interim, pending
-- attorney review**, and the ruling is explicit that they must be configurable
-- with **no hard-coded permanent duration**. A constant in a function body is a
-- duration that has to be found in a migration diff and changed by an engineer;
-- a row is one an operator can change when counsel answers.
--
-- The other four are simply better here too. `90 days` written into a booking
-- photo cleanup, a support script, an FAQ and a test is four numbers that agree
-- until somebody changes one.
--
-- ══ THE APPROVED BETA VALUES, AND WHAT THEY ARE NOT ═══════════════════════
--
-- These are PRODUCT decisions for a closed beta. This migration makes **no legal
-- claim**: not that any period is statutorily required, not that it is
-- sufficient, and not that this constitutes compliance with any regime. Where
-- counsel has not yet ruled, the value is **NULL and marked for review** rather
-- than guessed — a number nobody decided becomes the answer support gives.

create table if not exists public.retention_policy (
  key                   text primary key,
  days                  integer,
  label                 text not null,
  note                  text not null,
  legal_review_required boolean not null default false,
  updated_at            timestamptz not null default now(),
  updated_by_user_id    uuid references auth.users(id) on delete set null,
  constraint retention_policy_days_check
    check (days is null or (days >= 0 and days <= 36500))
);

comment on table public.retention_policy is
  'The ONE place a retention window is written down. Read by the deletion engine, '
  'the app and the support docs, so "90 days" is one fact rather than four that '
  'agree until somebody changes one. A NULL `days` means NOT YET DECIDED — it is '
  'not "forever", and the engine refuses to finalise a class whose window is '
  'unset rather than inventing one. Rows with legal_review_required are INTERIM '
  'closed-beta policy pending attorney review; changing them is a legal decision, '
  'not an engineering one.';

comment on column public.retention_policy.days is
  'Days to retain, from whatever event that class counts from. NULL means the '
  'period is UNDECIDED and the class is retained under interim policy until '
  'counsel rules — never treated as zero and never treated as infinite.';

alter table public.retention_policy enable row level security;

-- READABLE by any signed-in user, because the app must be able to tell a person
-- the real grace period rather than a number compiled into the client. Writable
-- by nobody but service_role: these are policy, and a user editing their own
-- retention window would be editing the policy that governs them.
revoke all on public.retention_policy from public, anon, authenticated;
grant select on public.retention_policy to authenticated;

drop policy if exists retention_policy_read on public.retention_policy;
create policy retention_policy_read on public.retention_policy
  for select to authenticated using (true);

-- Append/update is service_role only, and every change is stamped.
create or replace function public.stamp_retention_policy()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
alter function public.stamp_retention_policy() owner to postgres;
revoke all on function public.stamp_retention_policy() from public, anon, authenticated;

drop trigger if exists retention_policy_stamp on public.retention_policy;
create trigger retention_policy_stamp
  before insert or update on public.retention_policy
  for each row execute function public.stamp_retention_policy();

-- ── The approved closed-beta values ──────────────────────────────────────
insert into public.retention_policy (key, days, label, note, legal_review_required) values
  ('account_grace_period', 30, 'Account deletion grace period',
   'Days between a verified deletion request and permanent erasure. The account is '
   'inactive and hidden for the whole window, and the user may restore during it. '
   'Approved closed-beta value.', false),

  ('booking_photos', 90, 'Booking reference photos',
   'Days after a booking is completed or cancelled. On account deletion the '
   'effective date is the LATER of this and the grace-period end — a photo does '
   'not outlive its own clock because an account was deleted, and it does not '
   'die early either. Approved closed-beta value.', false),

  ('messages', 180, 'Messages',
   'Days after the related booking or conversation closes. On account deletion '
   'the effective date is the LATER of this and the grace-period end. Approved '
   'closed-beta value.', false),

  ('operator_audit', 1460, 'Operator audit history',
   'Four years of append-only operator action records: action, timestamp, reason, '
   'affected record, operator identity. References evidence rather than copying '
   'it. Approved closed-beta value.', false),

  ('accepted_contracts', null, 'Accepted contract evidence',
   'INTERIM CLOSED-BETA POLICY PENDING ATTORNEY REVIEW. Retained under restricted '
   'access: the exact accepted version, the acceptance timestamp, the booking id '
   'and the minimum party identity needed to establish who accepted it. NOT '
   'deleted by account erasure. No duration is set because none has been ruled — '
   'and this is NOT a claim that the record is a verified legal e-signature.', true),

  ('reports_evidence', null, 'Reports and safety evidence',
   'INTERIM CLOSED-BETA POLICY PENDING ATTORNEY REVIEW. Retained under restricted '
   'operator access: reports, evidence, operator decisions, appeals, and the '
   'minimum reporter/subject identity needed for a safety record. Open reports '
   'and records under a safety hold are not deleted. No duration is set because '
   'none has been ruled.', true),

  ('provider_content', 30, 'Provider portfolio, Reels and captions',
   'Hidden from public access immediately on a deletion request; permanently '
   'deleted after the grace period. Tracks the grace period by design — the '
   'restoration window and the content window are the same window.', false),

  ('community_content', 30, 'Community posts and replies',
   'Hidden from ordinary access immediately on a deletion request; deleted after '
   'the grace period, leaving a neutral tombstone only where thread structure '
   'requires one. Tracks the grace period.', false)
on conflict (key) do nothing;

-- ── The accessor ─────────────────────────────────────────────────────────
--
-- Every consumer goes through this rather than reading the table directly, so a
-- missing key is a loud failure instead of a silent NULL that some arithmetic
-- turns into "now".
create or replace function public.retention_days(p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_days integer; v_found boolean;
begin
  select rp.days, true into v_days, v_found
    from public.retention_policy rp where rp.key = p_key;
  if not coalesce(v_found, false) then
    -- A typo must not read as "no retention". This is the failure mode the
    -- accessor exists to produce.
    raise exception 'Unknown retention policy key: %', p_key
      using errcode = 'internal_error';
  end if;
  return v_days;   -- may be NULL: undecided, and the caller must say so
end;
$$;

alter function public.retention_days(text) owner to postgres;
revoke all on function public.retention_days(text) from public, anon;
grant execute on function public.retention_days(text) to authenticated, service_role;

comment on function public.retention_days(text) is
  'The configured retention window for one class, in days. RAISES on an unknown '
  'key — a typo must not read as "no retention". Returns NULL when the period is '
  'undecided (attorney review pending), which callers must treat as "retain under '
  'interim policy", never as zero.';
