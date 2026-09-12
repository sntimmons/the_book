# Supabase Edge Functions — The Book

> **TWO functions live here.** This document was written for `rate-limit` and
> still describes only it. The second is **`account-deletion-worker`** — see
> below before deploying anything, because it holds `service_role` and the
> `supabase link` command in STEP 2 names the **production** project ref.

## account-deletion-worker (PD-108)

The scheduled half of account erasure. `pg_cron` calls
`public.invoke_account_deletion_worker()`, which POSTs here through `pg_net`; this
function runs the canonical sequence in `_shared/accountDeletionRun.mjs` — the
same file `scripts/account-deletion-worker.mjs` runs, so the manual fallback and
the scheduled path cannot drift.

**It holds `service_role`, so being callable is itself a privilege.** Two gates:

1. The platform gateway verifies a project JWT. `verify_jwt` is deliberately left
   at its **default (true)** — no `config.toml` override — but this proves little
   on its own, because the anon key is public and ships in the app bundle.
2. **`x-worker-secret`**, compared in constant time against
   `ACCOUNT_DELETION_WORKER_SECRET`, and **failing closed when unset**. This is
   the real boundary. It is deliberately a *separate* secret from the service-role
   key: if it leaks, the worst it buys is making the engine do work it was already
   going to do, idempotently, with no read of anything.

### Secrets it needs

| Where | Name | What |
|---|---|---|
| Function secret | `ACCOUNT_DELETION_WORKER_SECRET` | the shared secret above |
| Function env | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | auto-provisioned by Supabase |
| `vault.secrets` | `account_deletion_worker_url` | this function's endpoint |
| `vault.secrets` | `account_deletion_worker_secret` | must equal the function secret |
| `vault.secrets` | `account_deletion_worker_anon_key` | for the gateway check only |

**If the two copies of the worker secret drift, every nightly run 401s and cron
reports SUCCESS.** That is what `public.account_deletion_worker_health()` is for;
see `docs/operations/ACCOUNT_ERASURE_OPERATIONS.md` § 10.

### Deploying it is an environment action

```bash
supabase functions deploy account-deletion-worker --project-ref <NON-PROD REF>
supabase secrets set ACCOUNT_DELETION_WORKER_SECRET=<secret> --project-ref <NON-PROD REF>
```

**Name the ref explicitly.** STEP 2 below links the CLI to
`kxregomuawwcqvisuhtr`, which `scripts/prodRef.mjs` and `lib/supabaseTarget.ts`
both name as **PRODUCTION**. Deploying this function, or setting its secret,
against production is a production action and falls under the authorization policy
in `docs/operations/MIGRATION_LEDGER.md`.

### Do not add `net` or `cron` to the exposed schemas

`pg_net` grants PUBLIC `EXECUTE` on `net.http_post` and ALL on
`net._http_response`, and those grants cannot be revoked from this repository —
`supabase_admin` made them. They are unreachable only because PostgREST exposes
`public` and `graphql_public`. See `20261132000000`.

---

## rate-limit


## `rate-limit`

Server-side, cannot-be-bypassed rate limiter. The app calls it (via
`lib/rateLimit.ts` → `checkRateLimit`) **before** high-risk writes. Enforcement
is server-side; the client only asks "may I proceed?" and shows a friendly
message on a `429`.

### Enforced limits (action → limit)

| Action | Limit | Wired into |
|---|---|---|
| `booking_create` | 3 / hour / client | `app/book/payment.tsx` |
| `community_post` | 10 / hour / **user** | `app/community/compose.tsx` |
| `community_reply` | 30 / hour / **user** | `app/community/[id].tsx` |

**`community_post` is per USER, not per provider**, and always was — the bucket
key is the caller's JWT subject. The table said "per provider" because Community
was provider-only until `20261088000000`; it now admits clients, so the same
limit applies to every account. The number has NOT been retuned for the wider
audience: 10 posts an hour was sized for a provider posting updates, and whether
it is the right ceiling for a client asking questions is an open sizing
question, not a decided one.
| `barter_offer` | 5 / day / provider | `app/community/barter-compose.tsx` |
| `message_send` | 30 / min / user | *not wired yet* (deferred — generous enough pre-launch) |

The client passes the limit numbers from `RATE_LIMITS` in `lib/rateLimit.ts`, so
they live in one place. The function trusts the **JWT** for the user id, not the
request body, so a client cannot dodge its own limit by rotating ids.

---

## STEP 1 — Create the backing table (run once in the SQL Editor)

```sql
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

-- Fast lookups for the "count in window" query.
CREATE INDEX IF NOT EXISTS rate_limit_log_lookup
  ON public.rate_limit_log(user_id, action, created_at DESC);

-- RLS: the edge function uses the service role (bypasses RLS), so the client
-- never touches this table directly. Enable RLS with a minimal own-insert policy
-- as defense-in-depth in case the anon key is ever pointed at it.
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limit_insert_own" ON public.rate_limit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Optional but recommended: a scheduled cleanup so the table never grows
-- unbounded (the function also self-cleans each caller's expired rows).
-- With pg_cron enabled:
--   select cron.schedule('rate-limit-cleanup', '0 * * * *',
--     $$ delete from public.rate_limit_log where created_at < now() - interval '1 hour' $$);
```

## STEP 2 — Deploy the function

```bash
npm install -g supabase          # if not already installed
supabase login
supabase link --project-ref kxregomuawwcqvisuhtr
supabase functions deploy rate-limit
```

## STEP 3 — Set the function secrets

In the Supabase dashboard → **Edge Functions → Secrets** (or via CLI), ensure:

- `SUPABASE_URL` — your project URL
- `SUPABASE_SERVICE_ROLE_KEY` — the service role key (server-only; the function
  needs it to write the log for any user and to verify the caller's JWT)

> On most Supabase projects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
> auto-injected into functions. Set them explicitly if the function returns
> `500 "Server not configured"`.

## STEP 4 — Verify

The app **fails open**: until this function is deployed, `checkRateLimit` returns
`allowed: true` and nothing is blocked (so shipping the client code before
deploying the function is safe). Once deployed, exceed a limit (e.g. send 4
booking requests in an hour) and confirm the 4th shows
"You have too many pending requests…" and no row is inserted.

---

## Notes / design

- **Fail-open by design.** A limiter that is down must never block real users;
  it only ever *adds* friction on an explicit `429`. See `lib/rateLimit.ts`.
- **JWT is authoritative.** `body.userId` is part of the documented contract but
  the function uses the verified JWT user id when present.
- **Runtime is Deno**, so `rate-limit/index.ts` is excluded from the app's
  `tsconfig.json` and is not type-checked by the project's `tsc`.
- **Not a hard transactional limit.** Under heavy concurrency a user could
  slip 1–2 extra through the count→insert gap. That is fine for abuse
  prevention; if you need exactness, move to an atomic upsert/counter.
