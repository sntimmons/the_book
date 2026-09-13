-- FORWARD CORRECTION to 20261131000000, which DID NOT DO WHAT IT SAID.
--
-- ══ THE REVOKES WERE SILENT NO-OPS ════════════════════════════════════════
--
-- `20261131000000` revoked `net` and `cron` from `anon` and `authenticated`. It
-- applied cleanly, reported success, and **changed nothing** — verified by
-- re-reading `has_schema_privilege` afterwards, which returned exactly what it
-- had before.
--
-- **A REVOKE only removes grants made by the role issuing it.** These migrations
-- run as `postgres`; the extension's grants were made by `supabase_admin`:
--
--     net schema:        {supabase_admin=UC/supabase_admin, =U/supabase_admin,
--                         anon=U/supabase_admin, authenticated=U/supabase_admin, …}
--     net.http_post:     {=X/supabase_admin, supabase_admin=X/supabase_admin}
--     net._http_response: {=arwdDxtm/supabase_admin, …}   ← PUBLIC, all privileges
--
-- and `pg_has_role('postgres','supabase_admin','MEMBER')` is **false**, so
-- `postgres` cannot revoke them and cannot assume the role that could. There is
-- no SQL this repository can run that removes these grants. That is a platform
-- fact, not an oversight, and **a migration that looks like it fixes something
-- and does not is worse than no migration at all** — it is the exact shape of
-- `20261103000000`'s column-level revoke, which also looked right and did
-- nothing.
--
-- This file supersedes `20261131000000`'s CLAIM. The statements there are left
-- applied and harmless; nothing depends on them having worked.
--
-- ══ WHAT IS ACTUALLY TRUE, AND WHAT ACTUALLY BOUNDS IT ════════════════════
--
-- On this and every Supabase project with `pg_net` installed, PUBLIC holds
-- EXECUTE on `net.http_post` and ALL on `net._http_response` at the DATABASE
-- level. What keeps them unreachable is that **PostgREST exposes `public` and
-- `graphql_public` only** — probed live, as `anon` and as a signed-in user, for
-- both schemas:
--
--     PGRST106 — Only the following schemas are exposed: public, graphql_public
--
-- **That setting is not in this repository**, so the guarantee is one dashboard
-- toggle away from someone who has never read this file.
--
-- ══ SO THE MITIGATION IS THE ONE WE CONTROL: PUT NOTHING THERE ════════════
--
-- `net._http_response` stores the response BODY. The worker's body used to be its
-- full result, and a failing run's result carries `overdue` rows naming
-- **subject ids** — precisely what PD-105 keeps out of every role but
-- `service_role`. The Edge Function now returns COUNTS ONLY
-- (`summarizeRun`), and the detail lives in `account_deletion_worker_runs`,
-- which this repository does control and has restricted.
--
-- So the residual is an SSRF-shaped GRANT with no route to it, rather than a
-- route to other people's identities. Recorded for Operations as a standing
-- rule: **do not add `net` or `cron` to the exposed schemas.**

comment on extension pg_net is
  'Installed by 20261130000000 for the scheduled account-deletion worker. NOTE: '
  'the extension grants PUBLIC execute on net.http_post and ALL on '
  'net._http_response, and those grants were made by supabase_admin so postgres '
  'cannot revoke them (20261132000000). They are unreachable only because '
  'PostgREST exposes public and graphql_public and not net. DO NOT ADD net OR '
  'cron TO THE EXPOSED SCHEMAS. The worker puts no subject id in its response '
  'body for this reason.';

-- Fixture residue from the end-to-end proof: response bodies from the runs that
-- verified this chain. pg_net prunes its own table, but leaving rows behind that
-- nobody meant to keep is how a "temporary" table becomes a record.
delete from net._http_response;
