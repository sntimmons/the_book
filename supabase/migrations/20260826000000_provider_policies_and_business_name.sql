-- Provider booking policies + business name.
--
-- RUN THE PRE-FLIGHT VERIFICATION QUERY FIRST. The migration files here are a
-- reconstruction; the pre-flight already surfaced that provider_booking_
-- preferences exists live with ~14 columns, not the 2 the app uses.
--
-- OWNERSHIP (no value stored twice):
--   * cancellation_window_hours and lateness_grace_minutes already exist on
--     provider_booking_preferences — that table OWNS them. provider_policies
--     does NOT redefine them.
--   * provider_policies owns only the net-new terms with no existing home:
--     cancellation/no-show fee percents, reschedule terms, travel terms.
--   * Deposit terms already live on providers (deposit_type/deposit_value/
--     payment_mode/issue_window_hours) and are not touched here.

-- ── B. provider business name ───────────────────────────────────────────────
alter table public.providers
  add column if not exists business_name text;

-- ── A. provider_policies (1:1 with providers) ───────────────────────────────
-- Fees are PERCENT of the service price (int 0-100). Cancellation *window* and
-- grace period are intentionally absent — they live on provider_booking_
-- preferences (see below). Defaults are real terms.
create table if not exists public.provider_policies (
  provider_id                uuid primary key references public.providers(id) on delete cascade,
  cancellation_fee_percent   int     not null default 0,
  no_show_fee_percent        int     not null default 100,
  reschedule_window          text    not null default '24 hours before',
  reschedule_fee_enabled     boolean not null default false,
  reschedule_fee             numeric not null default 0,
  reschedule_limit           text    not null default 'Once per booking',
  travel_fee_type            text    not null default 'per-mile'
                               check (travel_fee_type in ('flat','per-mile','free')),
  travel_fee_amount          numeric not null default 0,
  free_travel_radius_miles   int     not null default 5,   -- 0 = no free radius
  max_travel_distance_miles  int,                          -- null = no limit
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz
);

alter table public.provider_policies enable row level security;

-- Clients must read a provider's terms before booking; only the owner writes.
drop policy if exists provider_policies_read on public.provider_policies;
create policy provider_policies_read on public.provider_policies
  for select using (true);

drop policy if exists provider_policies_owner on public.provider_policies;
create policy provider_policies_owner on public.provider_policies
  for all
  using (provider_id in (select id from public.providers where user_id = auth.uid()))
  with check (provider_id in (select id from public.providers where user_id = auth.uid()));

-- ── provider_booking_preferences — LIVE-SHAPE RECONCILIATION (documentation) ─
-- This table already exists in the live database with the columns below; it was
-- missing from the migrations entirely. The create-if-not-exists is a NO-OP on
-- the live DB and exists only so fresh setups get the real shape and the repo
-- stops lying about the schema.
--
-- The policy step writes cancellation_window_hours + lateness_grace_minutes
-- here; the availability step writes buffer_minutes + requires_manual_approval.
-- The remaining columns (minimum_notice_hours, same_day_booking,
-- max_bookings_per_day, appointment_time_required, vacation_mode) are currently
-- unused by the app — carried here for parity, not wired.
--
-- NOTE: column TYPES/defaults/nullability below are INFERRED from the live
-- column *names* (the pre-flight returned names only). Confirm against the live
-- DDL before relying on this for a fresh environment. RLS is intentionally NOT
-- declared here so this block never alters the live table's existing policies.
create table if not exists public.provider_booking_preferences (
  id                        uuid primary key default gen_random_uuid(),
  provider_id               uuid not null unique references public.providers(id) on delete cascade,
  minimum_notice_hours      int,
  same_day_booking          boolean,
  requires_manual_approval  boolean not null default true,
  appointment_time_required boolean,
  max_bookings_per_day      int,
  buffer_minutes            int not null default 15,
  lateness_grace_minutes    int,
  cancellation_window_hours int,
  vacation_mode             boolean not null default false,
  timezone                  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz
);

-- ── D. client neighborhood — NO SQL. clients.neighborhood already exists; this
-- pass only wires the onboarding write path to it.
