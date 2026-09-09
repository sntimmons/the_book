-- Pre-Session-8 Correction 3 (item M) — "Available today" becomes a real filter.
--
-- ── THE DEFECT ────────────────────────────────────────────────────────────
--
-- `app/(tabs)/search.tsx` renders an "Available today" chip and a "Mobile only"
-- switch, passes both into `useProviderSearch`, and the hook applies **neither**.
-- Only `minRating` reaches the query. Two visible controls that change nothing —
-- the product principle this correction exists to enforce says a control that
-- does nothing should not be shown, and item M is explicit that the answer here
-- is to make them real rather than to hide them.
--
-- `mobileOnly` needs no server work: `providers.is_mobile` already exists and is
-- in the public column grant, so the hook can simply filter on it.
--
-- "Available today" is the one that needs authoritative data, and the failure
-- mode to avoid is named in the item: **do not create false "available today"
-- claims from stale or non-authoritative data.**
--
-- ── WHAT "AVAILABLE TODAY" MEANS HERE, EXACTLY ────────────────────────────
--
-- The provider has published working hours for today's weekday with
-- `is_available = true`, AND today is not one of their blocked dates.
--
-- That is a claim about what the PROVIDER THEMSELVES published, evaluated
-- against server time — not a claim that they have a free slot, and not an
-- inference from anything derived or cached. Both tables are written by the
-- provider's own availability editor and are already public-read, so nothing
-- about the visibility of this data changes.
--
-- **It deliberately does NOT consider existing bookings.** Subtracting booked
-- slots would need a real slot-availability engine — appointment durations,
-- overlaps, buffers — and this correction is explicit that no such system is to
-- be invented. Under-claiming is the safe direction: a provider who publishes
-- hours today genuinely is open today, whether or not they are busy. The filter
-- says "open today", which is what the chip means.
--
-- ── WHY A COMPUTED COLUMN ─────────────────────────────────────────────────
--
-- PostgREST exposes a function taking the table's row type as a virtual column,
-- so the filter composes with the search's existing `.eq` / `.or` / `.order` /
-- `.range` clauses in ONE query. An RPC returning a set of ids would have had to
-- be intersected client-side, which breaks pagination and the ordering the feed
-- depends on.
--
-- Houston-first: `America/Chicago` is the beta market, and it is what the
-- availability editor writes into every row's `timezone`. The provider's own
-- stored timezone is preferred where present so this stays correct if the market
-- widens; the constant is only the fallback.

create or replace function public.available_today(p public.providers)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
           select 1
             from public.provider_availability a
            where a.provider_id = p.id
              and a.is_available
              -- 0 = Sunday, matching both `extract(dow …)` and the app's
              -- DAY_TO_WEEKDAY map in components/AvailabilityEditor.tsx.
              and a.weekday = extract(
                    dow from (now() at time zone coalesce(a.timezone, 'America/Chicago'))
                  )::int
         )
     and not exists (
           select 1
             from public.provider_blocked_dates b
            where b.provider_id = p.id
              and b.date = (now() at time zone 'America/Chicago')::date
         );
$$;

alter function public.available_today(public.providers) owner to postgres;
revoke all on function public.available_today(public.providers) from public;
-- Granted to `anon` as well as `authenticated`: signed-out discovery reads the
-- same feed, and this computes only over two already-public-read tables. It
-- exposes nothing that a direct query of those tables would not.
grant execute on function public.available_today(public.providers) to anon, authenticated, service_role;

comment on function public.available_today(public.providers) is
  'PostgREST computed column on providers: true when the provider has published '
  'working hours for today''s weekday and today is not one of their blocked '
  'dates, evaluated against server time in the provider''s own timezone. Means '
  '"open today", NOT "has a free slot" — booked time is deliberately not '
  'subtracted, because that needs a slot engine this beta does not have and '
  'under-claiming is the safe direction. Backs the search screen''s '
  '"Available today" chip, which previously filtered nothing at all.';
