# Batch 5 — Testing Readiness Investigation

**Mode:** read-only investigation + test strategy. No tests added, no packages installed,
no app/CI/migration/production changes. Base: `main` @ `7369ee08`.

**Bottom line.** The Expo app (`the-book-app`) has **zero** automated test tooling today, a
CI that only truly enforces install + typecheck (lint is decorative via `|| true`, no test
step), and **no environment separation** — the Supabase client is hardcoded to production.
The highest-leverage foundation is: (A) a small Jest + RN Testing Library unit/business-rule
suite we can build **immediately**, (B) a Supabase security-regression harness that is
**blocked until a dedicated non-prod Supabase project exists** (Batch 6), and (C) 1–3 Maestro
E2E smoke journeys, also environment-blocked. Make typecheck + unit tests blocking in CI now;
promote lint from decorative to baseline-managed.

---

## 1. Current testing inventory

**In `the-book-app` (the product under test): none.** No test files (`*.test.*`, `*.spec.*`,
`__tests__`, `__mocks__` — zero matches). No jest/vitest/RN-Testing-Library/Detox/Maestro/
Cypress/Playwright in `package.json`. No `jest.config`, `vitest.config`, `playwright.config`,
`.detoxrc`, `.maestro`. `devDependencies` is just `@types/react` + `typescript`. The only
"quality" scripts are `typecheck` (`tsc --noEmit`), `lint` (`eslint . --ext .ts,.tsx
--max-warnings 0`), and `check` (both).

| Category | Status |
|---|---|
| Unit test runner (Jest/Vitest) | **MISSING** |
| React Native Testing Library | **MISSING** |
| Component/snapshot testing | **MISSING** |
| Supabase integration/SQL/RLS tests | **MISSING** |
| pgTAP | **MISSING** |
| E2E (Detox/Maestro/Cypress) | **MISSING** |
| Expo test tooling (`jest-expo`) | **MISSING** |
| Mocks/fixtures | **MISSING** |
| CI test step | **NOT PRESENT** (see §2) |

**The reported Playwright config — verdict: vestigial to this project; it belongs to a
different app.** Playwright lives in the *other* repo `~/the-book` (a Next.js app: `name:
"the-book"`, `playwright.config.ts`, `tests/`, `test:e2e` scripts, `@playwright/test`). It is
**not present anywhere in `~/the-book-app`**. The two apps merely share a product name. For
Batch 5 purposes Playwright is **not** a usable asset — it targets a Next.js web app, whereas
this is an Expo/React Native app with native modules and OTP auth (see §7). Do not adopt it
just because files exist elsewhere.

- **Actually used:** nothing.
- **Configured but dead:** nothing in this repo.
- **For another app/template:** Playwright in `~/the-book` (separate repo).
- **Incomplete:** n/a.
- **Missing:** the entire stack.

---

## 2. Current CI truth

File: `.github/workflows/ci.yml` — one job, `check`, on `ubuntu-latest`.

**Triggers:** `push` to `main`; `pull_request` targeting `main`. (No other branches; no
nightly/schedule.) **Node:** `20` via `actions/setup-node@v4`, `cache: npm`. **Install:**
`npm ci --legacy-peer-deps`.

Steps and enforcement:

| Step | Command | Classification | Notes |
|---|---|---|---|
| checkout | `actions/checkout@v4` | — | |
| setup-node | node 20, npm cache | — | caching enabled (npm) |
| install | `npm ci --legacy-peer-deps` | **BLOCKING** | fails job on dependency error |
| typecheck | `npm run typecheck` (`tsc --noEmit`) | **BLOCKING** | real gate; strict TS (`"strict": true`) |
| lint | `npm run lint \|\| true` | **NONBLOCKING** | exit code **ignored** — decorative |
| tests | — | **NOT PRESENT** | no unit/integration/E2E step |

**Confirmed known issue:** the lint step is literally `npm run lint || true`, named "Lint (warn
only for now)". `npm run lint` itself is `eslint . --ext .ts,.tsx --max-warnings 0`, so it
**would fail** — the repo currently has **210 ESLint problems (0 errors, 210 warnings)**
(≈146 `no-console`, 17 `react/no-unescaped-entities`, 17 `@typescript-eslint/array-type`,
25 unused-vars, 4 `react-hooks/exhaustive-deps`, 1 `no-redeclare`). `|| true` swallows all of
it, so lint provides **no protection** today.

**Classification summary:** BLOCKING = install, typecheck. NONBLOCKING = lint. NOT PRESENT =
all tests, security/RLS checks, E2E.

---

## 3. Critical user journeys (value / current coverage / recommended layer)

Coverage is **0% automated** everywhere today; "recommended layer" is the target.

| # | Journey | Criticality | Recommended layer |
|---|---|---|---|
| **Account / identity** | | | |
| 1 | Session bootstrap (`getSession`/`onAuthStateChange`) | P1 | Unit (`resolveUserRole`) + 1 E2E login |
| 2 | Provider-vs-client identity + provider-precedence + error-vs-null | P1 | **Unit** (`resolveUserRole`, mocked client) |
| 3 | Orphan client-row backfill (`ensureClientRow`, no junk rows) | P2 | Unit + Supabase integration |
| **Provider** | | | |
| 4 | Provider creation / go-live (9-stage write) | P1 | E2E smoke + Supabase integration (writes land) |
| 5 | Profile editing | P2 | Component + Supabase integration |
| 6 | Provider booking management (dashboard load) | P2 | Component (mocked) + unit (metric derivation) |
| **Client booking** | | | |
| 7 | Discover provider/service | P2 | E2E smoke |
| 8 | Create booking (`handleConfirm`) | P1 | **E2E** + unit (`buildAppointmentTime`) |
| 9 | Contract gate (no-contract vs fetch-failure) | P1 | **Unit** (`fetchProviderContract` w/ mock) + component |
| 10 | Payment placeholder step (no charge) | P1 | Unit (copy/logic) + E2E asserts "not charged" |
| 11 | Booking confirmation | P2 | E2E smoke |
| 12 | Client cancellation | P1 | **Supabase integration** (RLS/trigger) + E2E |
| **Provider booking actions** | | | |
| 13 | Accept | P1 | Supabase integration (SB3b) + E2E |
| 14 | Cancel | P1 | Supabase integration (SB3b) |
| 15 | Complete | P1 | Supabase integration (SB3b) + E2E |
| 16 | No-show | P1 | Supabase integration (SB3b) |
| **Contracts** | | | |
| 17 | No-contract path (genuine null → skip) | P1 | **Unit** |
| 18 | Fetch-failure path (throw → no skip) | P1 | **Unit** |
| 19 | Signature insert success | P1 | Component/integration |
| 20 | Signature insert failure/retry (no dup booking) | P1 | **Component** (mock insert error) + E2E |
| **Reviews** | | | |
| 21 | Provider review reveal (DB-gated) | P2 | Supabase integration + unit (`isRevealed`) |
| 22 | Client review reveal + dimensions | P2 | Unit (`aggregateClientDimensions`, `isRevealed`) |
| 23 | Verified-booking relationship (self-review blocked) | P1 | Supabase integration (baseline triggers) |
| **Messaging** | | | |
| 24 | Conversation creation (no self-conversation) | P2 | Supabase integration (trigger) |
| 25 | Send/read messages | P2 | E2E smoke (optional) |
| **Security regression** | | | |
| 26 | Provider field integrity (SB3a) | P1 | **Supabase security** |
| 27 | Booking write integrity (SB3b) | P1 | **Supabase security** |
| 28 | Storage authorization (SB2a/2b) | P1 | **Supabase security** |
| 29 | Client-privacy views (`clients_public`/`clients_provider`) | P1 | **Supabase security** |

---

## 4. Test-layer design

- **A. UNIT** — pure business rules with no I/O: status bucketing, analytics math, policy
  normalization, review reveal/aggregation, date/time assembly, formatting. **Highest ROI,
  buildable today.** (See §5.)
- **B. COMPONENT** (RN Testing Library, `@lib/supabase` + `useAuth` mocked) — a *few*
  high-value screens where logic is entangled with render: contract gate
  (`book/contract.tsx`), signature-failure retry (`book/payment.tsx`), booking-detail action
  buttons (`bookings/[id].tsx`). Keep the count small; these are slower and more brittle.
- **C. SUPABASE INTEGRATION / SECURITY** — RLS, column grants, triggers, storage policies,
  SECURITY DEFINER helpers, migration behavior. The **automated home for the SB1–SB3b
  proofs** (§6). Environment-blocked (§9).
- **D. E2E / DEVICE** — a *small* number of end-to-end journeys on a simulator (§7).
  Environment-blocked.
- **E. MANUAL QA** — anything needing real OTP delivery, real payment rails (none yet),
  push notifications, camera/photo picker, calendar integration, and visual/UX polish.

Deliberately **not** E2E: pure rules (→ A), single-screen logic (→ B), security invariants
(→ C). E2E is reserved for 1–3 irreplaceable cross-screen journeys.

---

## 5. Pure-function test candidates

All are deterministic and (mostly) I/O-free. **P1 = test first.**

| File | Function(s) | Why it deserves coverage | Example cases | Priority |
|---|---|---|---|---|
| `lib/bookingStatus.ts` | `bookingTab`, `bookingStatusLabel`, `bookingStatusTone` | The reason it exists is 4 screens disagreeing; a regression re-hides `checked_in`/`declined`/`rescheduled`. | `rescheduled`→`upcoming`/"Confirmed"; `no_show`→`past`; `declined`→`cancelled`; unknown→`cancelled` (never vanishes). | **P1** |
| `app/(tabs)/business/analytics-utils.ts` | `isCompletedEarning`, `isBookedForUtilization`, `sumCompleted`, `inMonth`, `parseHour`, `getTimeBlock`, `getDayOfWeek`, `money`, `pct`, `daysSince`, month ranges | Batch 4A revenue/utilization split lives here; a wrong status set silently mis-states revenue. Pure + high blast radius. | `isCompletedEarning('accepted')===false`; `isBookedForUtilization('pending')===true`; `parseHour('12:00 AM')===0`, `'12:00 PM'===12`, `'1:30 PM'===13`; `sumCompleted` ignores non-completed. | **P1** |
| `lib/policy.ts` | `policyToPoliciesRow`, `policyToBookingPrefs`, `rowsToPolicy`, `policyToDisplay` | Label↔number round-trip between editor, go-live write, and client display; drift = wrong fees shown/charged. Clamping + null-default logic. | percent clamp (>100→100, <0→0); `'No free radius'`→0; `'No limit'`→null; `rowsToPolicy(null,null)`===default slices; round-trip `policyToPoliciesRow`∘`rowsToPolicy`. | **P1** |
| `lib/reviews.ts` | `isRevealed`* (export it), `aggregateClientDimensions`, `aggregateFromRevealed`, `sortAndFilter`, `formatReviewDate`, `initialsOf` | Reveal timing (7-day / counterpart) is a privacy rule; aggregation drives public rating. `isRevealed` currently private. | counterpart present→revealed; `completed_at` 8d ago→revealed, 6d→hidden; `aggregateClientDimensions` counts only answered; `sortAndFilter('5star')`. | **P1** (`isRevealed`, aggregates) / P2 (format) |
| `lib/resolveUserRole.ts` | `resolveUserRole` (mock `supabase`) | Provider-precedence + the error-vs-null distinction prevents phantom client rows on a network blip. | both rows→provider; only client→client; neither, no error→null; neither, one error→`'error'`. | **P1** |
| `lib/contracts.ts` | `fetchProviderContract` (mock), `storagePathFromUrl`, `base64ToArrayBuffer` | Fetch fail-open is the Batch 4A fix (throw vs null). Path parsing + base64 are pure and easy. | error→throws; `{data:null,error:null}`→null; `storagePathFromUrl` extracts after bucket, strips query; base64 decode round-trip. | **P1** (fetch) / P2 (path/base64) |
| `lib/rateLimit.ts` | `checkRateLimit` (mock `functions.invoke`) | Fail-open semantics: only a 429 blocks; everything else allows. A regression could block real users. | 429→`{allowed:false}`; 500→allowed; network throw→allowed; `{allowed:false}` body→blocked. | **P2** |
| `app/book/payment.tsx` | `buildAppointmentTime`, `toIsoDate`, `money` *(unexported)* | Numeric appointment-time assembly with null-safety; wrong parse corrupts the booking row. Needs a minimal export seam. | valid parts→ISO; unparseable→null (no crash); `toIsoDate` round-trip. | **P1** (needs export) |
| `app/bookings/[id].tsx` | `statusBucket`, `getStatusStyle`, `money` *(unexported)* | Action-state bucket incl. the Batch 4A `rescheduled`→active fix; drives which action buttons show. | `rescheduled`→`accepted`; terminal→`cancelled`; overlaps `bookingStatus.ts`. | **P1** (needs export) |
| `app/onboarding/provider/golive.tsx` | `parseDurationMinutes`, username generator *(unexported)* | Duration parsing + username slug feed the go-live write. | `'1h 30m'`→90; empty→fallback; slug strips/normalizes. | **P2** (needs export) |

\* Minimal seam = add an `export` to the named helper (a one-line change), **not** a refactor.
Deferred to B5A, not done in this batch.

---

## 6. Database / security regression harness

We must automate the SB1–SB3b proofs (full table in the appendix reference the investigation
produced). Recommended approach, given the macOS-Monterey/Docker constraint:

**Primary (CI-hosted): apply migrations to an ephemeral Postgres in CI + role-simulated
assertions.** The suite spins up a throwaway database (a GitHub Actions `postgres:17` service
container, or `supabase db start` inside the Linux CI runner where Docker is reliable), applies
`supabase/migrations/*` in order, seeds fixtures as `service_role`, then runs each assertion as
the target role using the same rolled-back-transaction simulation already proven manually:
`set local role authenticated` + `set_config('request.jwt.claims', …)`, attempt the write,
capture ALLOW/BLOCK, and `raise` to roll back so nothing persists. This reproduces the exact
harness used to validate SB1–SB3b, now runbable unattended.

**Why not local:** modern Postgres 17 / Docker tooling was problematic on the user's macOS
Monterey. **CI can host the disposable test database far more reliably than local dev** — so the
security harness should be authored to run in CI first, with local execution optional.

**Tooling evaluation:**
- **pgTAP** — idiomatic in-database assertions (`policy_cmd_is`, `throws_ok`, `results_eq`).
  Great for expressing "policy X exists / blocks role Y." Con: another dependency to install
  into the test DB; less natural for the JWT-claims role simulation. **Good, optional.**
- **SQL scripts against a CI Postgres** — lowest-dependency; the rolled-back role-sim pattern we
  already use. **Recommended core.**
- **Supabase CLI test DB (`supabase db start`/`db reset` in CI)** — closest to production
  (applies our real migrations + storage schema). **Recommended for the migration-apply step**,
  run on the Linux CI runner (not local mac).
- **Custom Node integration tests** — a Node script using `pg` (service-role connection) to
  run the SQL assertions and a supabase-js **anon** client for storage-policy checks
  (upload/read as user A vs B). **Recommended as the runner/orchestrator**, because storage
  RLS is best exercised through the storage API, not raw SQL.
- **Manual Management-API SQL endpoint** — what we used ad hoc; keep for spot checks, not the
  automated suite.

**Recommended shape:** Supabase CLI applies migrations to a CI Postgres → a Node harness runs
(a) SQL role-simulation assertions for table RLS/grants/triggers/functions and (b) supabase-js
anon-client checks for the four storage buckets. Coverage maps 1:1 to the batches:

| Batch | What to assert (ALLOW / BLOCK tuples) |
|---|---|
| **SB1** | `categories` SELECT allowed (anon+auth), writes blocked; `shifts`/`shift_clients` fully blocked to app roles; `service_role` bypass. |
| **SB2a** | `provider-media`: owner-folder INSERT/UPDATE/DELETE allowed; other-folder blocked; public SELECT still allowed. |
| **SB2R** | `contracts`/`contract_signatures` SELECT for owner+signer; unrelated→0 rows; **no `42P17` recursion**. |
| **SB2b** | `contract-pdfs`/`contract-signatures` SELECT only for owner/signer; unrelated + anon blocked; write-once (no UPDATE/DELETE on signatures). |
| **SB2b-revoke** | `can_read_contract_*` EXECUTE denied to `anon`, allowed to `authenticated`/`service_role`. |
| **SB3a** | provider can update `display_name`/`bio`/…; **cannot** write `is_featured`/`is_approved`/`rating`/`stripe_*`/`business_verified` (privilege) or `verification_status`/`identity_verified` (trigger); INSERT clamps verification to `unverified`; other-owner blocked. |
| **SB3b** | client INSERT coerced to `pending`/`unpaid`/flags-false; client UPDATE only `cancelled_by_client` from pending/accepted; provider UPDATE only `{accepted,cancelled_by_provider,completed,no_show}` with per-action field rules; financial/identity fields immutable; `service_role` bypass. |

---

## 7. E2E strategy

Options for an Expo Router + React Native app targeting iOS/Android:

| Option | Fit | Verdict |
|---|---|---|
| **Maestro** | YAML flows, drives real simulator/emulator, minimal setup, Expo-friendly, CI-runnable (Maestro Cloud or macOS runner). | **RECOMMENDED (primary).** |
| Detox | Powerful gray-box, but heavy native build config, flakier, higher maintenance. | Overkill for beta. |
| Playwright (web) | The app targets native; **native-only modules** (`@react-native-community/datetimepicker`, `expo-image-picker`, `expo-secure-store`, `react-native-webview`, `expo-av`, `expo-file-system`) mean expo-web can't render core flows (esp. `book/datetime.tsx`). Web output is unconfigured (favicon only). | **Rejected** for this app (and not to be inherited from `~/the-book`). |
| Expo web E2E | Same native-module wall. | Rejected. |

**Recommendation: Maestro, one simulator target (iOS) for beta**, expanding to Android later.
**Login without OTP:** auth is `signInWithOtp`/`verifyOtp` (email/phone) — impractical for E2E
because it needs a delivered code. The landing screen already has a **password sign-in path**
(`app/index.tsx:281`, `signInWithPassword`) behind a dev gesture with seeded accounts. E2E
should log in a **seeded test account via password against the test Supabase project**, sidestepping
OTP entirely. This is why E2E is environment-blocked (§9): it needs the non-prod project + a way
to point the app at it.

---

## 8. Test-data strategy

**Entities to seed (in the non-prod project):** a test client (`clients.id = auth uid`), a test
provider (`providers.user_id = uid`, approved/active), ≥1 `provider_services` row, one active
`contracts` row (text type), bookings across the lifecycle (`pending`/`accepted`/`completed`/
`no_show`/`cancelled_by_*`), a `contract_signatures` row, `provider_reviews` + `client_reviews`
(one revealed, one hidden — to exercise the 7-day/counterpart rule), and a `conversation` +
`messages` pair. Seed as `service_role` (bypasses the write-integrity triggers so lifecycle
states can be placed directly).

**Where tests run:**
- Unit/component (layers A/B): **mocked DB** (`@/lib/supabase` module mock) — no project needed.
- Supabase integration/security (C): a **dedicated test Supabase project** (or CI ephemeral
  `supabase db start`), seeded per-run, torn down/reset. **Not** local Postgres (Monterey/Docker).
- E2E (D): the **dedicated test project** with a seeded password account.

**Hard production safeguards (make targeting prod impossible/obvious):**
1. **Env-configure the client.** Replace the hardcoded literals in `lib/supabase.ts` with
   `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` (Batch 6). Until then, no
   automated test may import the real `lib/supabase` unmocked.
2. **Production-ref guard.** Test bootstrap asserts the configured project ref **is not**
   `kxregomuawwcqvisuhtr` (production) and throws immediately if it is. A single constant
   `PROD_REF` checked in a global test setup file.
3. **Service-role key never in the app bundle / never in unit-test env.** The integration
   harness reads it only from a CI secret scoped to the test project.
4. **CI wiring:** integration/E2E jobs receive only the **test** project's URL/keys as secrets;
   the production secrets are not exposed to those jobs.
5. **Fixture namespacing:** seeded emails use a reserved domain (`@thebook.dev`) so any stray
   row is identifiable.

---

## 9. Environment dependency — what can start now vs what is blocked

Root cause: `lib/supabase.ts:4` hardcodes the **production** URL + anon key; there are **no**
`.env*` files and **no** `process.env`/`app.config` Supabase wiring. So anything that talks to a
real Supabase currently talks to **production**.

**CAN IMPLEMENT BEFORE ENVIRONMENT WORK (mock-only):**
- All §5 pure-function unit tests (layer A).
- Component tests (layer B) with `@/lib/supabase` and `useAuth` **mocked** — contract gate,
  signature-retry, booking-detail actions.
- The `resolveUserRole`/`ensureClientRow`/`checkRateLimit`/`fetchProviderContract` tests with a
  mocked client.
- CI: making typecheck blocking (already), adding the **unit** job as blocking, and tightening
  lint (§10). No project needed.

**BLOCKED UNTIL A TEST/DEV SUPABASE PROJECT + ENV CONFIG EXISTS (Batch 6):**
- All Supabase integration/security regression tests (layer C, §6).
- All E2E (layer D, §7) — needs the seeded password account on a non-prod project.
- Any test that exercises real RLS/triggers/storage.

**Implication for sequencing:** **B5A (unit) and the CI-enforcement half of B5D can and should
proceed now, in parallel with / ahead of Batch 6.** B5B (security harness) and B5C (E2E) should
be scheduled **after** the Batch 6 environment split, because building them first would either
target production or sit unrunnable.

---

## 10. CI target state (minimal, beta-ready)

Proposed pipeline (evaluated against the example):

| Stage | Blocking? | When | Notes |
|---|---|---|---|
| 1. install (`npm ci --legacy-peer-deps`) | **Block PR** | every PR/push | unchanged |
| 2. typecheck (`tsc --noEmit`) | **Block PR** | every PR/push | already blocking; keep |
| 3. lint | **Block PR (baseline-managed)** | every PR/push | drop `\|\| true`; adopt a **warning baseline** (or ratchet `--max-warnings` down from 210) so new violations fail but the existing 210 don't block day one |
| 4. unit tests | **Block PR** | every PR/push | fast (<1–2 min); the core safety net |
| 5. DB/security integration | **Block PR** (once it exists) | every PR/push touching `supabase/**` or lib; nightly otherwise | needs test project/CI Postgres (Batch 6); runtime ~2–5 min |
| 6. E2E smoke | **Nightly + manual** (not PR-blocking for beta) | nightly / pre-release | simulator boot is slow/flaky; keep off the PR critical path initially |

**Fail-fast order:** install → typecheck → lint → unit (cheap, catch most regressions early),
then the heavier integration/E2E. **Must block PRs:** install, typecheck, lint (baseline), unit,
and — once available — the DB/security suite for changes that touch DB or security-relevant lib
code. **May remain nightly/manual:** E2E smoke. **Expected PR runtime target:** ≤ 5 minutes for
stages 1–4; integration adds a few minutes; E2E stays off the PR path. Lint must not remain
decorative — even if adopted as a frozen baseline first, new code should fail on new warnings.

---

## 11. Initial test suite recommendation (the FIRST batch only)

High-leverage, ~15 unit/business-rule tests + the highest-risk security assertions + 1–2 E2E.
(Security/E2E are authored in B5B/B5C after Batch 6; listed here to show the target first-cut.)

**Unit / business-rule (build now, ~15):**
| # | Behavior | Layer | Why it matters |
|---|---|---|---|
| 1 | `bookingTab` maps `rescheduled`→upcoming, `no_show`→past, `declined`→cancelled, unknown→cancelled | Unit | prevents the original "status vanishes / wrong tab" class of bug |
| 2 | `bookingStatusLabel`/`Tone` agree with `bookingTab` for every known status | Unit | cross-screen consistency |
| 3 | `isCompletedEarning` true only for `completed` | Unit | Batch 4A revenue truth |
| 4 | `isBookedForUtilization` includes accepted/pending/checked_in/arriving/completed | Unit | Batch 4A utilization breadth |
| 5 | `sumCompleted` ignores non-completed rows | Unit | revenue calc |
| 6 | `parseHour` handles 12 AM/PM + midday | Unit | analytics time-block correctness |
| 7 | `policyToPoliciesRow` clamps percent 0–100; `'No limit'`→null; `'free'`→0 travel | Unit | fee/travel correctness |
| 8 | `rowsToPolicy(null,null)` returns defaults; round-trips with `policyToPoliciesRow` | Unit | editor↔DB↔display drift |
| 9 | `resolveUserRole`: both→provider; client-only→client; neither→null; error→`'error'` | Unit (mock) | phantom-row prevention |
| 10 | `fetchProviderContract`: error→throws; `{null,null}`→null | Unit (mock) | contract fail-open (Batch 4A) |
| 11 | `isRevealed`: counterpart→true; 8d→true; 6d→false | Unit | review privacy timing |
| 12 | `aggregateClientDimensions` counts only answered booleans | Unit | client reputation accuracy |
| 13 | `buildAppointmentTime`: valid→ISO; unparseable→null | Unit (needs export) | booking-row integrity |
| 14 | `statusBucket` (bookings/[id]): `rescheduled`→active | Unit (needs export) | Batch 4A action-state fix |
| 15 | `checkRateLimit`: 429→blocked; other errors→allowed | Unit (mock) | fail-open |

**Security regression (build in B5B, highest-risk first):** SB3b booking write-integrity
(client cannot seed completed/paid/no-show; provider cannot tamper financial/identity fields)
and SB3a provider field integrity (cannot self-set featured/approved/stripe/rating/verified).
See §6 + §12.

**E2E smoke (build in B5C, 1–3):** (a) client books a provider → contract gate → payment
placeholder ("not charged") → confirmation; (b) provider accepts then completes a booking;
(c) optional: provider go-live happy path.

---

## 12. Known-bug regression tests (from completed work)

These are the strongest first regression candidates — each maps to a shipped fix:

| Fixed behavior | Assertion | Layer |
|---|---|---|
| Provider cannot self-set `is_featured`/`is_approved`/`stripe_*`/`rating` (SB3a) | authenticated provider UPDATE of those columns is **blocked** (privilege) | Security |
| Provider cannot self-set verification (SB3a) | UPDATE `verification_status`/`identity_verified` **blocked** (trigger); INSERT clamps to `unverified` | Security |
| Provider malicious INSERT cannot seed sensitive state (SB3a) | INSERT with `is_featured`/`business_verified` **blocked**/clamped | Security |
| Client cannot seed completed/paid/no-show (SB3b) | client INSERT coerced to `pending`/`unpaid`/flags-false | Security |
| Provider cannot tamper booking financial/identity fields (SB3b) | provider UPDATE of `payment_amount`/`user_id`/`refund_status`… **blocked** | Security |
| Client cancellation works (SB3b) | client UPDATE `status='cancelled_by_client'` from pending/accepted **allowed**; from completed **blocked** | Security |
| Contract fetch failure cannot skip signing (Batch 4A) | `fetchProviderContract` **throws** on error; contract screen shows retry, does not route to payment | Unit + component |
| Failed signature save cannot advance as success (Batch 4A) | on insert error, no route to `/book/confirmed`; retry reuses booking id → **no duplicate booking** | Component |
| Rescheduled booking stays active (Batch 4A) | `statusBucket('rescheduled')` → active; `bookingTab` → upcoming | Unit |
| Revenue counts completed only (Batch 4A) | `isCompletedEarning` excludes accepted/pending | Unit |
| Utilization retains broader booked set (Batch 4A) | `isBookedForUtilization` includes accepted/pending/checked_in/arriving | Unit |

---

## 13. Testability issues (classify only; no refactor)

**P1 — blocks testing a critical flow:**
- `app/onboarding/provider/golive.tsx` — one ~340-line `handleGoLive` mixes uploads + 9 DB
  write stages + `retryRole` + navigation; a signed-out dev branch (`:85-100`) skips the write
  entirely and still navigates, so a naive test passes without exercising persistence. Needs a
  mocked `user` + mocked `@/lib/supabase` to test at all.
- `app/book/payment.tsx` `handleConfirm` (`:88`) — booking insert → signature insert →
  `router.push`, all in one function (the critical booking-creation + signature-retry path).
- `app/bookings/[id].tsx` `updateStatus` (`:196`) — status write + conditional
  `router.replace` to review; the whole booking lifecycle runs through it.
- Pure helpers on the critical path are **unexported** (`buildAppointmentTime`/`toIsoDate` in
  payment; `statusBucket`/`getStatusStyle` in bookings) — untestable without importing the
  whole screen. **Minimal seam: add `export`** (one line each).

**P2 — makes tests meaningfully harder:**
- Dev/global switches that change behavior under `__DEV__` (true in Jest): root `DEV_MODE`
  gate (`app/_layout.tsx:28`), phone dev-bypass (`app/auth/phone.tsx:69,162`), analytics
  hardcoded `display_name==='Stephen'` branch (`analytics-utils.ts:19-28`), landing dev
  account switcher with hardcoded creds (`app/index.tsx:70-90,279`). Tests must pass a
  `userId`/session or mock to avoid these branches.
- High-count inline-Supabase screens (reels, community/[id], providers/[id], business/index,
  business/services) — data logic can't be tested without mounting the component and mocking
  the client module.
- Zustand stores are module-scope **global singletons** (`store/*.ts`) — state leaks across
  tests; each test must call the store's `reset()` (all three expose one).

**P3 — maintainability only:**
- `__DEV__`-gated admin routes (`app/admin/_layout.tsx:12`, menu rows in `app/index.tsx`)
  make route-table snapshots differ between dev and prod bundles.

**Minimal seams recommended (defer to B5A, not this batch):** (1) `export` the ~5 unexported
pure helpers named above; (2) rely on the existing single seams — every screen imports
`supabase` from the one module `lib/supabase.ts`, and identity from the one `useAuth` context,
so **mocking those two unlocks most component tests** with no code change; (3) use store
`reset()` in test setup. No screen refactors required for the initial suite.

---

## 14. Recommended tooling

| Need | Recommendation | Why it fits |
|---|---|---|
| Unit tests | **Jest** with the **`jest-expo`** preset + **`@testing-library/react-native`** + `@testing-library/jest-native` | `jest-expo` is the supported RN/Expo transform (handles `react-native`, Expo modules, `__DEV__`); Jest is the RN default and needs no bundler. Vitest is not RN-native and would fight Metro/Expo transforms — avoid the overlap. |
| Component tests | Same stack (RN Testing Library) with **module mocks** for `@/lib/supabase` and the `useAuth` context | one mock seam covers every screen; no extra framework. |
| Supabase integration/security | **Node harness using `pg`** (service-role, SQL role-simulation) **+ supabase-js anon client** for storage; migrations applied via **Supabase CLI** (`supabase db start`) on the **Linux CI runner**; **pgTAP optional** for policy-existence assertions | reuses the proven rolled-back role-sim method; runs where Docker is reliable (CI), not on macOS Monterey. |
| E2E | **Maestro**, iOS simulator, seeded **password** login | simplest/most CI-friendly for Expo native; avoids OTP; low maintenance vs Detox. |
| CI | **GitHub Actions** (extend existing `ci.yml`) | already present; add unit job now, integration/E2E jobs after Batch 6. |

Avoid overlap: **one** unit runner (Jest, not Jest+Vitest), **one** E2E tool (Maestro, not
Maestro+Detox+Playwright), Playwright explicitly not adopted here.

---

## 15. Implementation batches

| Batch | Scope | Files/config likely touched | Deps | Env work required? | Complexity | Order |
|---|---|---|---|---|---|---|
| **B5A** | Minimal unit/business-rule harness (~15 tests, §11) + `export` the ~5 pure helpers | `package.json` (jest-expo, RN Testing Library, jest scripts), `jest.config.js`, `jest.setup.js`, `__tests__/*`, one-line `export`s in payment/bookings/golive | Jest, jest-expo, @testing-library/react-native | **No** (mock-only) | Low–Med | **1st** |
| **B5D-partial** | CI enforcement: add unit job as blocking; de-`\|\| true` lint with a warnings baseline | `.github/workflows/ci.yml`, optional lint baseline file | B5A exists | No | Low | **2nd (with/after B5A)** |
| **B5B** | DB/security regression harness (SB1–SB3b, §6) | `supabase`-CLI test config, `tests/security/*` (Node `pg` + supabase-js), CI job, test-project secrets | **Test Supabase project + env config (Batch 6)** | **Yes** | Med–High | **After Batch 6** |
| **B5C** | E2E smoke (1–3 Maestro flows, §7) | `.maestro/*.yaml`, seeded password account, CI (nightly) job | Maestro, test project, seed script | **Yes** | Med | **After Batch 6** |
| **B5D-full** | Promote DB/security to PR-blocking (touching DB/lib); keep E2E nightly | `ci.yml` | B5B/B5C | Yes | Low | **Last** |

**Better split than the given B5A–D:** keep B5A + the CI half of B5D **now** (unblocked), and
gate B5B/B5C behind Batch 6 rather than treating all four as sequential. This delivers real
regression protection immediately without waiting on environment work.

---

## 16. Recommended order

1. **B5A** — unit/business-rule suite + helper `export`s (now; mock-only).
2. **B5D (enforcement half)** — make unit blocking in CI; drop lint `|| true` with a warnings
   baseline (now).
3. **Batch 6** — environment separation (dedicated test/dev Supabase project; env-configure
   `lib/supabase.ts`; production-ref guard). *Prerequisite for the rest.*
4. **B5B** — DB/security regression harness (after Batch 6).
5. **B5C** — Maestro E2E smoke (after Batch 6).
6. **B5D (full)** — promote DB/security to PR-blocking; E2E stays nightly.

---

## 17. Exit criteria — "foundation complete enough to return to product building"

- **Typecheck blocking** in CI (already true — keep).
- **Lint no longer decorative:** `|| true` removed; either fully green or a frozen baseline so
  **new** violations fail PRs.
- **Core business-rule unit tests present and blocking:** the ~15 in §11 (status buckets,
  analytics revenue/utilization split, policy normalization, review reveal, `resolveUserRole`,
  contract fail-open, appointment-time assembly).
- **Security regression tests for the highest-risk DB contracts** (SB3a provider field
  integrity, SB3b booking write integrity, plus SB2a/2b storage authorization) automated and
  blocking for DB/security-touching changes.
- **2–3 critical-journey E2E smoke tests** runnable (client-books-with-contract, provider
  accept→complete), at least nightly.
- **Tests cannot target production:** client is env-configured and a production-ref guard aborts
  any test run pointed at `kxregomuawwcqvisuhtr`.

No coverage-percentage target. When the above hold, regressions in the security invariants and
the Batch 4A product-truth fixes are caught automatically, and product work can resume with
confidence.

---

## Confirmations
- **App code unchanged** — investigation only; no `app/**` or `lib/**` edits.
- **Production unchanged** — no DB writes, no `db push`, no Management-API mutations.
- **Migrations unchanged** — no `supabase/**` edits.
- Only new file: this report (uncommitted).
