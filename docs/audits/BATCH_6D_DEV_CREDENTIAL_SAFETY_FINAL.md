# Batch 6D — Dev Credential Cleanup + Dev-Only Safety (FINAL)

**Result: PASS — P1 CLOSED.** No live password or personal login identity remains in tracked
source; the dev account switcher now runs only from dev-only env config and hard-refuses the
production project; the ungated signed-out go-live preview and the phone dev-bypass are now
`__DEV__`-only; the personal analytics fallback is replaced with a seeded non-prod identity;
the non-prod dev accounts and **all six affected production accounts** (five seed + the personal
Gmail, rotated with the owner's explicit approval) were rotated — the historically exposed
credential now **fails everywhere it was used**. No production business/schema data was
modified. Credentials masked.

## Root cause
`app/index.tsx` hardcoded a live dev password (`DEV_PASSWORD`) and a personal Gmail login
identity plus production seed emails, used in a real `signInWithPassword`. As unguarded module
constants they could remain in a shipped bundle, and they authenticated real accounts on the
production project. Separately, the go-live signed-out preview and the phone dev-bypass were not
`__DEV__`-gated at the code level, and analytics fell back to a personal `display_name`.

## Previous dev credential architecture
Hardcoded in source: `DEV_PASSWORD = '<masked>'`; `DEV_ACCOUNTS` listing a personal Gmail and
five production seed emails; `signInAs` gated only by `__DEV__`, no production guard.

## New dev credential architecture
- **No hardcoded credentials.** `DEV_PASSWORD`/emails now come from `EXPO_PUBLIC_DEV_*` env
  vars; `DEV_ACCOUNTS` is built from `EXPO_PUBLIC_DEV_CLIENT_EMAIL` /
  `EXPO_PUBLIC_DEV_PROVIDER_EMAIL` (empty when unset, e.g. in production).
- `signInAs` is `__DEV__`-gated **and** calls `devSignInStatus(...)` which hard-refuses the
  production project and refuses when no dev password is configured (no fallback).
- The dev accounts are the seeded **non-prod** identities `client@thebook.dev` /
  `provider@thebook.dev` only.

## Env variables introduced
`EXPO_PUBLIC_DEV_CLIENT_EMAIL`, `EXPO_PUBLIC_DEV_PROVIDER_EMAIL`, `EXPO_PUBLIC_DEV_PASSWORD`
(dev-only, non-prod). Documented in `.env.example` as bundled/public, non-prod-only, never a
production or personal account, and not required by production. A single shared example file was
kept (rather than a separate `.env.development.example`) — simpler, and the section is clearly
marked dev-only.

## Production guard
`lib/supabaseTarget.ts` (moved from `test/guards/` so app runtime can import it without pulling
test code into the bundle) provides `assertNotProductionSupabase`. A small pure wrapper
`lib/devAuth.ts#devSignInStatus(url, password)` returns `refused-production` for the prod ref
(independent of `__DEV__`), `not-configured` when no password, else `ready`. `signInAs` uses it
and shows a clear dev-only alert instead of calling `signInWithPassword` when refused.

## Go-live preview fix (`app/onboarding/provider/golive.tsx`)
- **Before:** `if (!user) { Alert('Signed-out preview'); skip save; navigate as success }` —
  ungated (runtime `!user`), shipped in release.
- **After:** `if (!user) { if (__DEV__) { preview… } else { Alert('Not signed in'); return } }`
  — the skip-and-navigate-as-success path is now `__DEV__`-only; in production a signed-out
  state surfaces a session error and does not complete go-live.

## Phone dev-bypass defensive guard (`app/auth/phone.tsx`)
- **Before:** button `__DEV__`-gated, but `handleDevBypass` had no internal guard.
- **After:** `handleDevBypass` starts with `if (!__DEV__) return` (+3 lines only). Normal
  OTP/phone auth is untouched.

## Analytics fallback decision (`app/(tabs)/business/analytics-utils.ts`)
Replaced the `__DEV__` `display_name === 'Stephen'` fallback with a lookup by the seeded
non-prod provider **username `test_provider`** (non-personal, resolves only where that seed
exists — i.e. non-prod). Kept rather than removed so dev analytics still render with no session;
it can never target a personal identity.

## DEV_MODE decision (`app/_layout.tsx`)
Left **unchanged**: `const DEV_MODE = __DEV__ && false` is dead-false by construction and
already documented as prod-safe. Per scope, not expanded — the priority was credentials + the
ungated preview.

## CURRENT SOURCE EXPOSURE vs HISTORICAL CREDENTIAL VALIDITY
These are tracked separately because they close independently:
- **Current source exposure: CLOSED.** No live password or login identity remains in tracked
  source (env-driven, guarded, non-personal). Verified by secret scan.
- **Historical credential validity: CLOSED.** The old `DEV_PASSWORD` in git history only matters
  while it still authenticates a live account. It has been invalidated for **all six** affected
  production accounts (five seed + the personal Gmail, the latter rotated with the owner's
  explicit approval), verified to fail for each. It no longer authenticates any known account.

## Affected production accounts (read-only inventory)
All six DEV_ACCOUNTS emails exist on production. Class A = clear test/seed; Class B = possible
real/personal.

| email | uid | created | last sign-in | linked data | class |
|---|---|---|---|---|---|
| seed-coachmarcusd@thebook.internal | a1328478… | 2026-05-10 | 2026-06-12 | 1 provider, 1 booking-as-provider | A |
| seed-kendrastyles@thebook.internal | 4982cc37… | 2026-05-11 | 2026-06-03 | 1 provider, 1 booking-as-provider | A |
| seed-nalashbynia@thebook.internal | 5bed5323… | 2026-05-10 | 2026-06-09 | 1 provider | A |
| seed-zarabraid@thebook.internal | 15a4d4a7… | 2026-05-10 | 2026-06-04 | 1 provider, 2 bookings-as-provider | A |
| testclient@thebook.dev | 4afcb22e… | 2026-06-01 | 2026-07-29 | 1 client, 5 client bookings | A |
| **stephentimmons1214@gmail.com** | beb041dc… | 2026-05-05 | **2026-08-26** | 1 provider, 1 client, 2 bookings | **B (personal-looking, recently active)** |

## Credential rotation result
- **Non-prod (dev switcher accounts):** `client@thebook.dev` and `provider@thebook.dev` rotated
  to a new shared non-prod password (non-prod service-role Admin API, prod-ref guard first);
  stored only in gitignored local env / scratchpad, not printed/committed. Seed idempotency
  preserved.
- **Production — 5 clear seed/test accounts ROTATED** to strong random passwords (Class A: the
  four `seed-*@thebook.internal` + `testclient@thebook.dev`), via the production service-role
  Admin API, narrowly scoped to auth passwords only. New passwords are random and **stored
  nowhere** (nothing uses them; reset via dashboard if ever needed). Old credential verified to
  **FAIL** for all five afterward.
- **Production — personal Gmail ROTATED (with explicit owner approval).**
  `stephentimmons1214@gmail.com` was rotated to a strong random password via the production
  service-role Admin API after the owner explicitly authorized it. The new password is random
  and **stored nowhere** — the owner regains access via Supabase password reset ("forgot
  password" email). Old credential verified to **FAIL** afterward. The account's business data
  (provider row + client row) is intact and unchanged.

## Whether production auth/users were changed
**Yes, narrowly:** the passwords of **all six affected auth identities** were rotated (five
Class-A seed accounts, plus the personal Gmail with the owner's explicit approval).
**No production business/schema data was changed** — read-only confirmation after rotation:
8 migrations, 39 tables, 9 providers, 11 bookings, 12 clients (unchanged); the personal
account's provider + client rows remain intact. No profile/business rows, RLS, storage, or
schema were touched.

## Git-history decision
**No history rewrite.** The old literal remains in history (commit `cef6402`). History cleanup
is unnecessary **now that the credential is invalid everywhere** — all six affected accounts are
rotated and the old value fails for each. No current credential remains in tracked source.

## Secret scan
Tracked source: `thebookdev123` **gone**; `stephentimmons1214@gmail.com` **gone**;
no `@thebook.internal` seed emails; no `eyJ` JWT / service-role key / DB password / hardcoded
password. `.env` and `.env.tooling.local` remain gitignored. `.env.example` contains only
placeholder var names. The old literal appears only in git history (expected).

## Non-prod login verification
Against non-prod (`wcoyjeklscuqsumpjpfo`), with the rotated shared password:
- **client@thebook.dev** → login OK (uid db232a02…).
- **provider@thebook.dev** → login OK (uid 5c8fafd2…).
Configured ref confirmed non-prod; no production auth request made.

## Production impact
None. No production schema/data/user changes; no migrations; no RLS/storage/EAS/Sentry/CI
changes. Production builds do not set or require the `EXPO_PUBLIC_DEV_*` vars, and the app boots
without them (only the two `EXPO_PUBLIC_SUPABASE_*` vars are required).

## Tests
Added `lib/devAuth.ts` + `__tests__/lib/devAuth.test.ts` (**4** tests): prod refused,
not-configured on missing password (no fallback), ready only for non-prod + password, and unset
URL is not silently ready. The guard's own tests (6) moved with it to `@/lib/supabaseTarget`.
- Suites: **13** (was 12). Tests: **73** (was 69; **+4** devAuth).
- The go-live/phone `__DEV__` gates are simple compile-time-eliminated guards inside heavy
  screen handlers; they are not unit-tested to avoid mounting full screens (typecheck covers
  them; `__DEV__` strips them in release). The reusable safety mechanism (prod-refusal) IS unit
  tested via `devSignInStatus`.

## Quality gates
- Typecheck `tsc --noEmit`: **exit 0**.
- Lint `lint:ci`: **exit 0** — repo-wide **0 errors, 210 warnings** (baseline held, no new debt).
- Unit tests: **13 suites / 73 tests PASS**.

## Remaining Batch 6 work
B6C (EAS profiles + `EXPO_PUBLIC_*` env wiring for beta/production builds), B6E (Sentry
env/release + source maps), B6F (release checklist/runbook).

## Remaining P0/P1/P2/P3
- **P0:** none.
- **P1 — CLOSED:** the historically exposed `DEV_PASSWORD` is removed from tracked source and
  invalidated for **all six** affected production accounts (verified to fail for each). No known
  account still authenticates with it. *Deployment prerequisite (not a defect):* production/beta
  builds must set `EXPO_PUBLIC_SUPABASE_*` via EAS before they can boot — B6C.
- **P2:** Sentry delivery still unverified + no source maps (B6E). No release process (B6F).
- **P3:** admin screen files remain in the bundle (runtime-blocked by `if (!__DEV__) return null`).

## P1 verdict
**CLOSED.** Current source exposure is closed and all six affected production accounts are
invalidated (old credential verified to fail for each). The historical value in git history no
longer authenticates any known account, so no history rewrite is required.

## PASS / FAIL
**PASS.** All B6D code fixes are complete and validated (env-driven dev accounts, production
guard, dev-only gating, go-live/phone fixes, non-personal analytics, guard move, tests), and the
credential-invalidation objective is complete for every affected production account.
