# Batch 6A/6B — Environment Separation + Non-Prod Supabase Foundation (FINAL)

**Result: PASS.** Development no longer defaults to production: the Supabase client is
env-driven and fails loudly when unconfigured, a dedicated non-production project exists with
the full canonical schema and a minimal seed, and all test/seed tooling carries a hard
production-target guard. Production was not modified. Secrets masked throughout.

## Projects
- **Production (unchanged):** ref `kxregomuawwcqvisuhtr`, region `us-east-1`. Read-only
  confirmation at end of batch: **8 migrations, 39 tables, 9 providers** — untouched.
- **Non-production (new):** name **`the-book-nonprod`**, ref **`wcoyjeklscuqsumpjpfo`**, region
  **`us-east-1`** (aligned with prod), org `kealtdgceynnqizzlenq`, status ACTIVE_HEALTHY.
  DB password + service-role key generated and stored **privately (scratchpad / local tooling
  env only)** — never committed.

## Environment model
dev / test / production, where **dev + test share the non-prod backend** and production is
isolated. Local dev and CI point at non-prod; production config is only ever supplied to a
production build.

## Supabase client — before / after (`lib/supabase.ts`)
- **Before:** hardcoded production URL `https://kxregomuawwcqvisuhtr.supabase.co` + hardcoded
  anon key. Any dev session or non-mocked test hit production.
- **After:** reads `process.env.EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`;
  **throws immediately** if either is missing, naming the missing var(s); **no production
  fallback, no default project**. Preserves the AsyncStorage adapter, `persistSession`,
  `autoRefreshToken`, `detectSessionInUrl`, and all client options.

## Env vars
- **Public (client, `EXPO_PUBLIC_*`):** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **Private (tooling only, never `EXPO_PUBLIC_`, never bundled):** `TEST_SUPABASE_URL`,
  `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, `SEED_*`.

## `.env.example` (committed)
Placeholders only for the two public vars, with comments: both are public client config, the
anon key is RLS-gated, the service-role key must NOT go here, and local `.env` stays
uncommitted. A companion **`.env.tooling.example`** documents the private tooling vars
(service-role + seed creds) — placeholders only.

## Local env handling
- **`.env`** (gitignored) → app points at **non-prod** (`EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY`).
- **`.env.tooling.local`** (gitignored) → tooling secrets (service-role + seed passwords).
- Both verified gitignored via `git check-ignore` (`.env` matches `.gitignore:.env`;
  `.env.tooling.local` matches `.env*.local`). Neither appears in `git status`.

## Migration apply result
`supabase db push` applied the **8 active migrations** to non-prod (dry-run first; a hard
`target != kxregomuawwcqvisuhtr` assert ran before both link and push). Non-prod
`schema_migrations` = **8**. `supabase/migrations_history/pre_canonical/` was not used.

## Non-prod structural verification (read-only)
39 tables, 2 views, 17 functions, 24 triggers, **39/39 RLS-enabled tables**, 4 storage buckets
— matching the canonical baseline. Present: providers, bookings, contracts,
contract_signatures, clients, categories, shifts, shift_clients; views clients_public,
clients_provider; buckets contract-pdfs, contract-signatures, posts-media, provider-media;
SB3a `provider_insert_guard` fn+trigger and SB3b `enforce_booking_write_integrity` fn+trigger
all present. **No production business data** (0 providers/bookings/clients before seeding;
schema matches, data does not).

## Production guard implementation
`test/guards/supabaseTarget.ts` exports `PRODUCTION_SUPABASE_REF`, `projectRefFromUrl(url)`,
and `assertNotProductionSupabase(url)` (throws if the URL/ref resolves to prod). Reusable by
seed scripts, DB/security tests, E2E setup, and CI. **Not wired into the app's production
runtime** — a production build may target production. Covered by 6 unit tests.

## Jest guard state
Preserved: the `@supabase/supabase-js` `createClient` mock still throws in unit tests (real
client can't be constructed). Added: a `jest.setup.js` backstop that throws if
`EXPO_PUBLIC_SUPABASE_URL`/`TEST_SUPABASE_URL` ever resolve to the production ref. Also added
the official AsyncStorage jest mock so the new config test can load the real module. B5A tests
remain unit tests (not converted to integration).

## Seed strategy + result
`scripts/seed-nonprod.mjs` (committed, no secrets): idempotent, targets non-prod only, hard
prod-ref guard **before any connection**, service-role read from private tooling env. It
ensures two reserved auth identities and minimal rows. **Executed against non-prod** (twice —
idempotent, identical ids): `client@thebook.dev` + `provider@thebook.dev` auth users, a
`clients` row, a `providers` row (`test_provider`), and one `provider_services` row. Non-prod
now: 1 provider, 1 client, 1 service, 2 auth users. Seed passwords stored privately (scratchpad
/ `.env.tooling.local`), never committed; no personal email used.

## Service-role handling
Private var **`TEST_SUPABASE_SERVICE_ROLE_KEY`** (also `SUPABASE_SERVICE_ROLE_KEY` convention),
never `EXPO_PUBLIC_`, never in Expo config, never committed. Placeholder only in
`.env.tooling.example`.

## CI secret requirements (documented; no CI change this batch)
B5B/B5C will need, as CI **secrets scoped to the non-prod project** (production equivalents must
NOT be exposed to those jobs): `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`,
`TEST_SUPABASE_SERVICE_ROLE_KEY` (+ `SEED_*` for E2E). `.github/` is unchanged in this batch.

## Missing-env proof
The real `lib/supabase.ts` throws `Missing required public Supabase configuration:
EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY` when unset — proven by the committed
`__tests__/lib/supabaseConfig.test.ts` (loads the real module) and a runtime harness.

## Production-fallback proof
`lib/supabase.ts` contains no hardcoded prod URL, no `||` fallback, no default anon key, no
silent path. The production ref appears **only** in the guard (`test/guards/supabaseTarget.ts`),
the seed script, and the jest backstop (`jest.setup.js`) — all safety/tooling locations.

## App bootstrap verification
With `.env` loaded, the configured ref resolves to **non-prod** (`wcoyjeklscuqsumpjpfo`) and an
anon client initializes and reaches non-prod (public `categories` read OK). Limitation: a full
simulator/device launch was not run here; verification was a deterministic config + live-anon
connectivity check mirroring `lib/supabase.ts`, plus the committed config test on the real
module.

## Secret scan
No secret values in any committable file. `.env` and `.env.tooling.local` are gitignored (not
staged). `.env.example` / `.env.tooling.example` contain placeholders only. No `eyJ` JWT,
service-role key, DB password, or seed password appears in the tracked diff. Non-prod
service-role key, DB password, and seed passwords live only in scratchpad / gitignored local
tooling env.

## Test results
- Typecheck: `tsc --noEmit` **exit 0**.
- Lint: `lint:ci` **exit 0** — repo-wide **0 errors, 210 warnings** (baseline held; no new debt).
- Unit tests: **12 suites / 69 tests PASS**. Added **8** tests, all pure unit tests for the new
  env/guard code: 6 for the production-target guard (`__tests__/guards/supabaseTarget.test.ts`)
  and 2 for the fail-loud client config (`__tests__/lib/supabaseConfig.test.ts`). No DB/E2E
  tests added; B5A's 61 remain intact.

## DEV_PASSWORD (still open)
The Batch 6 P1 dev-credential risk (`DEV_PASSWORD` + personal email in `app/index.tsx`) was
**not** touched — it is owned by **B6D** (cleanup + rotation) and did not block environment
setup. **Still open.**

## Files changed
- `lib/supabase.ts` (env-driven, fail-loud) — modified.
- `jest.setup.js` (AsyncStorage mock + prod-ref backstop) — modified.
- `eslint.config.js` (extend test/tooling override to `scripts/**`, disable `no-require-imports`
  / `no-console` for tests/tooling) — modified.
- `.env.example`, `.env.tooling.example` — new (committed placeholders).
- `test/guards/supabaseTarget.ts` — new (guard util).
- `scripts/seed-nonprod.mjs` — new (guarded seed).
- `__tests__/guards/supabaseTarget.test.ts`, `__tests__/lib/supabaseConfig.test.ts` — new tests.
- Local `.env`, `.env.tooling.local` — created, **gitignored/uncommitted**.
- Local Supabase CLI link now points at non-prod (`supabase/.temp/`, gitignored).

## B5 unlock verdict
- **B5B: UNLOCKED.** Non-prod project exists with the full canonical schema (RLS/triggers/
  grants/storage), the production-target guard is in place, and the service-role tooling
  convention is defined. Remaining for B5B itself: author the regression harness and wire the
  `TEST_SUPABASE_*` CI secrets (its own scope).
- **B5C: UNLOCKED.** Non-prod backend + env-configured app + seeded login identities
  (`client@thebook.dev`, `provider@thebook.dev`) + a usable password login path exist.
  Remaining for B5C itself: author the Maestro flows and point a dev-client/preview build at
  non-prod (the local `.env` already does for dev).

## Remaining Batch 6 work
B6C (EAS profiles: projectId/owner/env/channels/runtimeVersion), **B6D (dev-credential cleanup +
rotate `DEV_PASSWORD`, gate the ungated go-live preview — P1 still open)**, B6E (Sentry
env/release + source maps), B6F (release checklist/runbook).

## PASS / FAIL
**PASS** — env-separated, fail-loud client; dedicated non-prod project with reproduced schema +
minimal seed; hard production guards; production unchanged; all gates green.
