-- FORWARD CORRECTION to 20261040000000 (Correction 3, item M).
--
-- ── THE DEFECT ────────────────────────────────────────────────────────────
--
-- `20261040000000` exposed "is this provider open today?" as a PostgREST
-- COMPUTED COLUMN: `available_today(p public.providers)`, a function taking the
-- table's ROW TYPE. That is the documented way to get a virtual column, and it
-- composes with `.eq`/`.order`/`.range` in one query, which is why it was chosen.
--
-- **It cannot work on this table**, and the reason is Correction 2.
-- `20261030000000` revoked table-level SELECT on `public.providers` from `anon`
-- and `authenticated` and re-granted 28 NAMED COLUMNS out of ~49. PostgREST
-- renders a computed column as a WHOLE-ROW reference — `available_today(providers)`
-- — and PostgreSQL requires SELECT on **every** column of a relation for a
-- whole-row reference when the caller lacks the table-level privilege. Neither
-- client role can satisfy that, so the call is refused before the function is
-- ever entered:
--
--     set role anon;
--     select public.available_today(p) from public.providers p limit 1;
--     ERROR:  42501: permission denied for table providers
--
-- Reproduced against non-production, which is the only way it was ever going to
-- be found: the EXECUTE grant the original migration asserted is real, and the
-- B5B assertions for it passed, because **every behavioural check ran as
-- `service_role`** — the one role that does hold table-level SELECT. The guard
-- that checks the app's column list against the grant passed too, because it
-- compares NAMES and a computed column is not a granted column.
--
-- ── WHY THIS WAS WORSE THAN A BROKEN CHIP ─────────────────────────────────
--
-- The column name was added to `PUBLIC_PROVIDER_FIELDS`, the shared select list
-- used by the DISCOVERY FEED, the SINGLE-PROVIDER PROFILE fetch and SEARCH. So
-- the failure was not "the Available today filter returns nothing" — it was
-- every provider read failing with 42501 for every signed-out and signed-in user.
--
-- ── THE REPLACEMENT ───────────────────────────────────────────────────────
--
-- A set-returning function over the two availability tables, returning the IDS of
-- providers who are open today. The client asks for the set once and filters the
-- main query with `id in (…)`, which still leaves ONE ordered, paginated query
-- against `providers` — the property the computed column was chosen for — at the
-- cost of one small extra round trip taken only when the filter is actually on.
--
-- It touches no `providers` column at all, so no whole-row reference exists and
-- the 28-column grant is irrelevant to it. SECURITY INVOKER, because both source
-- tables are already public-read (`20261034000000` deliberately kept `SELECT` for
-- `anon` on them): this exposes nothing a direct query of those tables would not.
--
-- The MEANING is unchanged and still deliberately modest: **open today**, not
-- "has a free slot". Booked time is not subtracted, because that needs a slot
-- engine this beta does not have, and under-claiming is the safe direction for a
-- filter whose whole name is a claim.

drop function if exists public.available_today(public.providers);

create or replace function public.providers_open_today()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select a.provider_id
    from public.provider_availability a
   where a.is_available
     -- 0 = Sunday, matching both `extract(dow …)` and the app's DAY_TO_WEEKDAY
     -- map in components/AvailabilityEditor.tsx. Evaluated against SERVER time in
     -- the provider's own stored timezone, so a wrong device clock cannot put a
     -- provider into — or out of — this set.
     and a.weekday = extract(
           dow from (now() at time zone coalesce(a.timezone, 'America/Chicago'))
         )::int
     and not exists (
           select 1
             from public.provider_blocked_dates b
            where b.provider_id = a.provider_id
              and b.date = (now() at time zone 'America/Chicago')::date
         )
   group by a.provider_id;
$$;

alter function public.providers_open_today() owner to postgres;
revoke all on function public.providers_open_today() from public;
-- Granted to `anon` as well as `authenticated`: signed-out discovery reads the
-- same feed, and this computes only over two already-public-read tables.
grant execute on function public.providers_open_today() to anon, authenticated, service_role;

comment on function public.providers_open_today() is
  'The ids of providers who have published working hours for today''s weekday and '
  'have not blocked today, evaluated against server time in each provider''s own '
  'timezone. Means "open today", NOT "has a free slot" — booked time is '
  'deliberately not subtracted. Replaces the available_today(providers) computed '
  'column, which was unreachable for anon/authenticated: a PostgREST computed '
  'column is a WHOLE-ROW reference, and 20261030000000 left those roles with '
  'column-level grants only. Callers filter with id = any(...) rather than '
  'selecting a virtual column.';
