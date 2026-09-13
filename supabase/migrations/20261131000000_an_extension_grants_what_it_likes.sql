-- FORWARD CORRECTION to 20261130000000. Found by probing the grants the new
-- extensions install, rather than the ones this repository writes.
--
-- ══ AN EXTENSION DECIDES ITS OWN GRANTS, AND pg_net IS GENEROUS ═══════════
--
-- `create extension pg_net` grants **USAGE on schema `net` and EXECUTE on
-- `net.http_post` to `anon` and `authenticated`**. Nothing in `20261130000000`
-- asked for that and nothing in this product needs it. What it means, stated
-- plainly:
--
--   * `net.http_post` from a client role is a **server-side request forgery
--     primitive** — the database issuing arbitrary HTTP requests from inside the
--     project's network, with whatever the caller puts in the URL and headers.
--   * `net._http_response` holds the **response bodies** of every pg_net call.
--     This worker's response body is its full JSON result, and a failing run's
--     result carries `overdue` rows that name **subject ids** — the one thing
--     PD-105 keeps out of every client role, operators included.
--
-- ══ IT IS NOT CURRENTLY REACHABLE, AND THAT IS NOT THE POINT ══════════════
--
-- Probed against the live project: PostgREST answers `PGRST106 — Only the
-- following schemas are exposed: public, graphql_public` for `net` and for
-- `cron`, as `anon` and as a signed-in user. So there is no path today.
--
-- **The path is one project setting away, and that setting is not in this
-- repository.** Somebody exposing `net` for an unrelated reason would hand every
-- signed-in account an SSRF primitive and a read of erased subjects' ids, and
-- nothing here would fail. A guarantee that depends on a dashboard toggle nobody
-- in this repo can see is not a guarantee — the same reasoning `20261111000000`
-- applied when it moved the hiding rule out of the views and into the data.
--
-- So the grants go. `service_role` and `postgres` keep everything; the worker is
-- unaffected, because it has never run as a client role.
revoke all on schema net from anon, authenticated;
revoke all on all tables in schema net from anon, authenticated;
revoke all on all functions in schema net from anon, authenticated;
revoke all on all sequences in schema net from anon, authenticated;

-- `cron` ships with EXECUTE on `cron.schedule` and SELECT on `cron.job` granted
-- to the same roles, and withholds schema USAGE — so they are unreachable by
-- construction rather than by intent. Made explicit, because "unreachable
-- because a second grant is missing" is exactly the shape that turns into a hole
-- when somebody adds the missing grant for an unrelated reason.
revoke all on schema cron from anon, authenticated;
revoke all on all tables in schema cron from anon, authenticated;
revoke all on all functions in schema cron from anon, authenticated;

-- AND FOR ANYTHING THESE EXTENSIONS ADD LATER. A future pg_net upgrade that
-- introduces a new function would grant it under the extension's own defaults
-- and land back where this file started.
alter default privileges in schema net revoke all on tables from anon, authenticated;
alter default privileges in schema net revoke all on functions from anon, authenticated;
alter default privileges in schema cron revoke all on tables from anon, authenticated;
alter default privileges in schema cron revoke all on functions from anon, authenticated;
