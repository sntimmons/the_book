-- Pre-Beta Correction 2 — least-privilege defaults, and the anon write sweep.
--
-- ── THE DEFECT, READ OUT OF THE LIVE CATALOG ──────────────────────────────
--
-- `pg_default_acl` on the non-production project, for grantor `postgres` in
-- schema `public`:
--
--   objtype 'r' (tables)     anon=arwdDxtm  authenticated=arwdDxtm
--   objtype 'S' (sequences)  anon=rwU       authenticated=rwU
--   objtype 'f' (functions)  anon=X         authenticated=X
--
-- `arwdDxtm` is every privilege there is. Migrations run as `postgres`, so EVERY
-- FUTURE TABLE created by a migration is granted INSERT, UPDATE, DELETE, TRUNCATE,
-- SELECT, REFERENCES and TRIGGER to `anon` and `authenticated` the moment it
-- exists — before any policy is written, and whether or not RLS is ever enabled
-- on it. Every future function is EXECUTE-able by `anon`, which is exactly the
-- shape a `SECURITY DEFINER` operator path must never have.
--
-- The barter migrations have been compensating for this by hand, every time, and
-- said why: a grant nobody revoked is "invisible in pg_dump, re-granted on a fresh
-- apply, and converted from latent to total by any future permissive policy"
-- (`20260906000000` § 10). This removes the need to remember.
--
-- ── AND THE BACKLOG THAT DEFAULT LEFT BEHIND ──────────────────────────────
--
-- Surveying all 48 tables in `public`:
--
--   anon holds INSERT   on 32 tables
--   anon holds UPDATE   on 32 tables
--   anon holds DELETE   on 33 tables
--   anon holds TRUNCATE on 33 tables
--
-- RLS is enabled on all 48 (Batch 1 closed the last three), and there is no
-- permissive write policy for `anon` anywhere, so INSERT/UPDATE/DELETE are denied
-- today. TRUNCATE IS DIFFERENT AND IS THE REASON THIS IS NOT MERELY TIDYING:
-- **TRUNCATE is not filtered by row-level security.** The privilege is currently
-- unreachable only because PostgREST offers no way to issue one — that is a
-- property of the API gateway, not of the database, and it is the wrong thing to
-- be relying on. The tables include `bookings`, `messages`, `conversation`,
-- `contracts`, `provider_reviews`, `client_reviews`, `reports` and
-- `rate_limit_log`.
--
-- ── WHAT THIS MIGRATION DOES, AND WHAT IT DELIBERATELY DOES NOT ───────────
--
-- Changing a DEFAULT privilege affects only objects created AFTERWARDS; nothing
-- existing moves. So § 1 cannot break a running surface, and § 2 is what actually
-- touches today's objects.
--
-- SELECT IS NOT REVOKED from `anon` in § 2. Several tables carry deliberate
-- public-read policies — `provider_availability`, `provider_blocked_dates`,
-- `provider_policies`, `post_comments`, `post_likes`, `provider_follows`,
-- `categories`, and revealed `provider_reviews` — and signed-out discovery is a
-- beta posture this slice is not authorised to change. `providers` gets its own
-- precise column grant in `20261030000000`.
--
-- `service_role` is untouched throughout. It is the trusted server role, it
-- bypasses RLS by design, and the rate-limit Edge Function depends on it.
--
-- THE FAILURE DIRECTION IS DELIBERATE. After this, a migration that creates a
-- table or an RPC and forgets to grant will produce a loud 404/permission error
-- in development, instead of a silent over-exposure that nobody sees until an
-- audit. Every migration since `20260906000000` already grants explicitly, so
-- this codifies the practice rather than introducing it.

-- ── 1. Defaults: future objects start with nothing for the client roles ────
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;

-- A new SECURITY DEFINER function must not be executable by an unauthenticated
-- caller because nobody remembered to revoke. Both client roles are cleared;
-- every RPC in this codebase already carries its own explicit grant.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;

-- Sequences: `anon` only. `authenticated` is left alone because a future serial
-- column would need USAGE to insert, and breaking that is a bigger risk than the
-- one being closed — this schema uses `gen_random_uuid()`, so anon has no
-- conceivable need for `nextval` on anything.
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon;

-- NOTE, recorded because it is a real limit of this fix: `pg_default_acl` also
-- holds a row for grantor `supabase_admin` on `public` tables with the same
-- `arwdDxtm`. It is not ours to alter and it governs objects created BY
-- supabase_admin, which our migrations are not. Objects created outside this
-- migration chain can therefore still arrive over-granted.

-- ── 2. Today's backlog: anon may hold no write privilege anywhere ──────────
-- Written as a loop rather than 33 hand-listed statements so it cannot miss a
-- table, and so it stays correct if the survey above is off by one. SELECT is
-- deliberately absent from the revoke list; see the header.
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind = 'r'
     order by c.relname
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from anon',
      r.relname
    );
    -- TRUNCATE is the one privilege row-level security does not constrain, so a
    -- client role holding it is a standing hazard even with correct policies.
    -- `authenticated` keeps its INSERT/UPDATE/DELETE, which real policies govern.
    execute format(
      'revoke truncate on table public.%I from authenticated',
      r.relname
    );
  end loop;
end $$;

-- ── 3. Views are tables too, for privilege purposes ────────────────────────
-- The read models are `security_invoker` and carry deliberate `select`-only
-- grants; the loop above skips them (`relkind = 'v'`). Restated so the omission
-- reads as a decision: their posture is set where they are defined, most recently
-- `20261027000000`, and this migration does not disturb it.
