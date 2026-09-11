-- FORWARD CORRECTION to 20261088000000 (Community Reshape).
--
-- ══ ONE PROVIDER'S OWN-ROW WRITE CAN CLOSE COMMUNITY FOR EVERYONE ═════════
--
-- `providers_open_today()` computes
--
--     now() at time zone coalesce(a.timezone, 'America/Chicago')
--
-- across EVERY provider's availability rows. `provider_availability.timezone` is
-- `text NOT NULL DEFAULT 'America/Chicago'` with **no CHECK**, and the RLS policy
-- is `FOR ALL` over the whole row — so a provider can PATCH it to anything with
-- the anon key and their own JWT. `AvailabilityEditor.tsx` hardcodes the right
-- value, but that is UI, not a boundary.
--
-- `at time zone 'not-a-zone'` raises `22023`, which aborts the whole query.
--
-- **This branch is what made that a shared-surface failure.** Before, the
-- function ran only when the Discover "Open today" filter was explicitly on — one
-- provider's bad value broke one optional filter. `20261088000000` put it in the
-- WHERE clause of `community_posts_visible`, and every community read goes
-- through that view. So one provider writing `'x'` into their own row takes down
-- the feed, every thread, the Discover Community module and provider-profile
-- shoutouts — for every user — and the app swallows it into a `console.log` and
-- renders an empty list. Silent, cross-user, no elevation required.
--
-- ── THE FIX BELONGS ON THE WRITE, NOT THE READ ────────────────────────────
--
-- Making the reader tolerant would leave invalid data in the column for every
-- other consumer to rediscover, and would cost a `pg_timezone_names` lookup per
-- row on a hot path. An unrecognised timezone is not a value to work around; it
-- is a value that should never have been stored.
--
-- A CHECK constraint cannot express it — `pg_timezone_names` is a set-returning
-- view and CHECKs may not contain subqueries — so this is a trigger, which is
-- also the only form that can NORMALISE rather than merely refuse.
create or replace function public.enforce_availability_timezone_is_real()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.timezone is null or btrim(new.timezone) = '' then
    new.timezone := 'America/Chicago';
    return new;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone
  ) then
    raise exception 'That is not a recognised time zone.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_availability_timezone_is_real() owner to postgres;
revoke all on function public.enforce_availability_timezone_is_real()
  from public, anon, authenticated;

comment on function public.enforce_availability_timezone_is_real() is
  'A provider''s availability timezone must be a zone PostgreSQL recognises. '
  'REFUSED rather than coerced when it is not: silently rewriting a provider''s '
  'stated timezone would move their published hours without telling them. Empty '
  'and null normalise to the default. This exists because the column feeds '
  'providers_open_today(), which 20261088000000 put in the WHERE clause of the '
  'community feed view — so an unrecognised value raised 22023 and closed the '
  'whole surface for every user, from one provider''s own-row write.';

drop trigger if exists a_provider_availability_timezone_is_real on public.provider_availability;
create trigger a_provider_availability_timezone_is_real
  before insert or update on public.provider_availability
  for each row execute function public.enforce_availability_timezone_is_real();

-- Any value already stored that PostgreSQL does not recognise. Normalised rather
-- than deleted: an availability row is a provider's published hours, and
-- removing it would withdraw them from discovery to fix a text field.
update public.provider_availability a
   set timezone = 'America/Chicago'
 where a.timezone is null
    or btrim(a.timezone) = ''
    or not exists (
         select 1 from pg_catalog.pg_timezone_names tz where tz.name = a.timezone
       );
