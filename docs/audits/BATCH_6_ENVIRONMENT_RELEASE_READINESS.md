# Batch 6 — Environment + Release Readiness Investigation

**Mode:** read-only investigation + design. No app/CI/Supabase/EAS/Sentry/migration/
production changes; report uncommitted. Base: `main` @ `4bb6dd1`.

**Bottom line.** The app has **no environment separation** — `lib/supabase.ts` hardcodes
the **production** project, so every local dev session and any future integration test
points at prod by default (the single biggest risk here). **No real secret is committed
anywhere** (the two committed keys — Supabase *anon* JWT and Sentry DSN — are public by
design; the Sentry auth token is a placeholder; no service-role key exists in tree or
history). The only real-credential item is a hardcoded **dev-account password + the
maintainer's personal email**, which are live logins on the production project and can
survive in a shipped bundle. EAS is partial, Sentry is enabled-but-unverified with no
source maps, and there is no release process. The smallest unlock is **B6A** (env-configure
the client) + a **minimal B6B** (one non-prod Supabase project) — after which B5B and B5C can
run safely and product work can resume.

---

## 1. Environment-sensitive inventory

| Value | Location | Classification |
|---|---|---|
| Supabase project URL/ref `kxregomuawwcqvisuhtr` | `lib/supabase.ts:4` | PRODUCTION-SPECIFIC + PUBLIC CLIENT CONFIG |
| Supabase **anon** JWT (`eyJ…`, role=`anon`) | `lib/supabase.ts:6` | PUBLIC CLIENT CONFIG |
| Auth storage adapter = AsyncStorage | `lib/supabase.ts:2,10` | SHARED |
| Sentry DSN | `app/_layout.tsx:19` | PUBLIC CLIENT CONFIG |
| Sentry `enabled: !__DEV__`, `environment: __DEV__?'development':'production'` | `app/_layout.tsx:20-21` | SHARED (env-derived) |
| `sentry.properties` (`org=the-book`, `project=react-native`, `auth.token=SENTRY_AUTH_TOKEN_PLACEHOLDER`) | `sentry.properties` | PLACEHOLDER (auth token injected at build) |
| `DEV_PASSWORD` (13 chars, real seed-account password) | `app/index.tsx:80` | DEV-ONLY + real credential |
| Personal Gmail dev account | `app/index.tsx:88` | DEV-ONLY (PII, real login) |
| Seed emails `@thebook.dev` / `@thebook.internal` | `app/index.tsx:83-87` | DEV-ONLY |
| `DEV_MODE = __DEV__ && false` | `app/_layout.tsx:28` | DEV-ONLY |
| `EXPO_OS` platform checks | `app/auth/{email,phone,verify}.tsx` | SHARED (platform, not env) |
| Edge-fn `SUPABASE_SERVICE_ROLE_KEY` via `Deno.env.get` | `supabase/functions/rate-limit/index.ts` | SECRET (correctly env-only, not in app bundle) |
| Bundle ids `com.thebook.app`, slug `the-book-app`, scheme `thebook` | `app.json` | SHARED |
| **No `.env*`, no `process.env` Supabase wiring, no `app.config.*`, no `extra`** | — | (env layer absent) |

There is **no** `EXPO_PUBLIC_*` usage for configuration anywhere; the only env reference is
`process.env.EXPO_OS` (platform detection).

---

## 2. Supabase client truth (`lib/supabase.ts`)
- **URL:** hardcoded `https://kxregomuawwcqvisuhtr.supabase.co` (production).
- **Anon key source:** hardcoded string literal (no env). Decoded JWT payload =
  `{"iss":"supabase","ref":"kxregomuawwcqvisuhtr","role":"anon",…}` → **role `anon`**.
- **Storage adapter:** `AsyncStorage` (`@react-native-async-storage/async-storage`).
- **auth persistence:** `persistSession: true`.
- **autoRefreshToken:** `true`.
- **detectSessionInUrl:** `false`.
- **Platform-specific behavior:** none in this file.

**Is the anon key safe to expose?** **Yes — by design.** A Supabase anon key is a public
client key; access is governed by RLS (which SB1–SB3b now enforce). It is not a secret.

**Service-role key:** **NOT in the app.** Confirmed by both the code read and the history
scan — no `service_role` JWT exists in the tree or in 292 commits of history. The service-role
key is read only from `Deno.env` inside the `rate-limit` edge function. ✅

---

## 3. Recommended environment model

**Recommend Model B — dev / test / production** (smallest that satisfies all needs), where
**dev and test share one non-prod Supabase backend** and production is isolated. A separate
"staging" (Model C) is not justified pre-launch; a fourth tier (Model D) is overkill.

| Environment | Intended use | Supabase backend |
|---|---|---|
| **dev** | Local development (Expo dev client / simulator) | non-prod project |
| **test** | CI: B5B DB/security regression + B5C Maestro E2E | non-prod project (+ ephemeral CI Postgres for pure-SQL, see §4) |
| **production** | Real users, store builds | production project |

"test" is a **CI/runtime context, not a separate Supabase project** (it reuses the non-prod
one) and **not an EAS build profile** (see §9). Beta/preview builds point at the **non-prod**
project pre-launch, switching to production at launch.

---

## 4. Supabase project strategy

**Primary recommendation: ONE dedicated non-prod Supabase project** shared by dev + test +
E2E, **plus ephemeral CI Postgres for the pure-SQL security suite** (hybrid, anchored on the
non-prod project).

- **One non-prod project** (not separate dev/test projects): lowest cost/setup, one schema to
  keep in sync via the same `supabase/migrations/*`, one set of seed data + auth test accounts
  + storage buckets. Required for anything needing real Supabase **Auth** (Maestro login) or
  **Storage** (SB2a/2b policy tests) — those can't run on a bare Postgres.
- **Ephemeral CI Postgres** (`supabase db start` on the Linux CI runner, or a `postgres:17`
  service) for the **SB1–SB3b SQL/RLS/trigger/migration** regression: gives per-run isolation
  (no cross-run state drift), fast, and reliable in CI. Storage-policy + Maestro tests fall
  back to the shared non-prod project.

Rejected: separate dev+test projects (double the drift/cost for no benefit at this scale);
ephemeral-only (can't host Auth/Storage for E2E); pointing tests at production (unsafe).

---

## 5. Expo environment wiring (Expo 54)

**Public, client-safe values via `EXPO_PUBLIC_*`:**
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Both are safe to bundle: the URL and anon key are public by design (RLS-gated). Expo inlines
any `EXPO_PUBLIC_`-prefixed var into the client bundle at build time.

**Pattern:**
- Local: `.env` / `.env.local` files (already gitignored — `.gitignore` excludes `.env*`).
- Commit a **`.env.example`** documenting the two vars (with the **non-prod** placeholder
  values or blanks + comments) — safe because they're public.
- Per-build values: EAS **environment variables** (or `eas.json` `env` blocks per profile) map
  each profile to its backend — development/preview → non-prod, production → prod.
- `app.config.ts` is optional; reading `process.env.EXPO_PUBLIC_*` directly in `lib/supabase.ts`
  is sufficient and simplest. (If a typed `extra` is preferred, an `app.config.ts` can surface
  them, but that's not required.)

**MUST NOT be `EXPO_PUBLIC_` (never in the bundle):** the Supabase **service-role key**, any
private API secret, admin credentials, the Sentry **auth token**. These live only in CI secrets
/ EAS build secrets / edge-function env / seed-script env.

---

## 6. Proposed `lib/supabase.ts` design (smallest safe change; not implemented)

```
const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anon) {
  throw new Error(
    'Supabase config missing: set EXPO_PUBLIC_SUPABASE_URL and ' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example). No production fallback.'
  )
}
export const supabase = createClient(url, anon, { auth: { storage: AsyncStorage,
  autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
```

Requirements met: **no hardcoded prod URL/key**, requires configured public env values,
**fails loudly at module load if missing** (no silent default, **no fallback to production**),
preserves the AsyncStorage adapter and all existing auth options. Behavior when config is
missing: **throw immediately** so a misconfigured build/test cannot silently run — the same
loud-failure principle already used in the B5A test guard. (SecureStore is used elsewhere via
the `expo-secure-store` plugin but not as the Supabase auth store; leave that unchanged.)

---

## 7. Production-target guards

Principle: **hard-block test/dev/seed contexts that point at the production ref; never block a
legitimate production build.** Layered:

| Layer | Guard | Blocks |
|---|---|---|
| **Test bootstrap** (B5B) | assert `SUPABASE_URL`/ref ≠ `kxregomuawwcqvisuhtr`; throw if equal (mirrors B5A's createClient guard) | integration tests hitting prod |
| **Seed script** | refuse to run unless target ref is the known non-prod ref; abort on prod ref | seeding prod |
| **Migration/test-script runner** | the *test* migration runner refuses the prod ref (normal prod `db push` stays a separate, deliberate path) | test migrations on prod |
| **CI** | integration/E2E jobs receive **only** non-prod secrets; a pre-flight step asserts the configured ref ≠ prod ref | CI accidentally using prod |
| **App runtime** | **no hard block** (a prod build must reach prod). Optionally, a **dev-build-only** visible warning if pointed at the prod ref | (advisory only) |

Hard blocks belong in **test bootstrap, seed scripts, the test-migration runner, and CI
pre-flight** — never in the app's production runtime.

---

## 8. EAS current truth (`eas.json`, `app.json`, `package.json`)

| Aspect | State |
|---|---|
| Build profiles: `development` (`developmentClient:true`, `distribution:internal`), `preview` (`distribution:internal`), `production` (`{}`) | **CONFIGURED** (minimal) |
| `cli.version` `>= 5.0.0` | CONFIGURED |
| `submit.production` | **PARTIAL** (empty `{}` — no credentials/store config) |
| `projectId` (`extra.eas.projectId`) | **MISSING** |
| `owner` | MISSING |
| Bundle ids `com.thebook.app` (iOS+Android), slug `the-book-app`, scheme `thebook` | CONFIGURED |
| `updates` / EAS Update / `expo-updates` dep | **MISSING** (no OTA capability) |
| `runtimeVersion` | MISSING |
| Per-profile `env` blocks | MISSING |
| `channel` per profile | MISSING |
| `buildNumber` / `versionCode` | MISSING (app `version` static `1.0.0`) |
| `developmentClient` | CONFIGURED (development profile) |
| `distribution` | internal (dev+preview); production unset |

Net: EAS is **PARTIAL** — real build profiles exist but lack projectId, env wiring, channels,
runtimeVersion, OTA, and submit config.

---

## 9. Recommended EAS profiles (minimal)

| Profile | distribution | environment | Supabase target | channel / update | dev client? |
|---|---|---|---|---|---|
| **development** | internal | development | non-prod | none (local) | **yes** |
| **preview** (beta) | internal | preview | **non-prod** (pre-launch) | `preview` | no |
| **production** | store | production | **production** | `production` | no |

Each profile sets its `env` (`EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY`) to the matching backend.
Add `projectId`/`owner`, a `runtimeVersion` policy, and (when OTA is wanted) `expo-updates` +
channels. **"test" should NOT be an EAS profile** — testing is a CI/runtime context that reuses
the non-prod backend; a build tier for it would add config with no artifact anyone ships.

---

## 10. Sentry current truth

| Aspect | Finding |
|---|---|
| Initialization | `Sentry.init` in `app/_layout.tsx:18-24`; `Sentry.wrap(RootLayout)` export | 
| DSN source | hardcoded (public-by-design) `app/_layout.tsx:19` |
| enabled | `!__DEV__` → **only production builds send events** |
| environment | `__DEV__ ? 'development' : 'production'` |
| release / dist | **NOT set** (no explicit release or build id) |
| source maps | **NOT configured** — no `@sentry/react-native/expo` config plugin in `app.json`; `sentry.properties` has a **placeholder** auth token → prod stack traces would be **minified** |
| Expo/EAS integration | none (no Sentry Expo plugin, no upload step) |
| error boundary | `Sentry.ErrorBoundary` wraps the tree (`_layout.tsx`) |
| user context | none set (no `setUser`) — low PII by default |
| sensitive-data handling | defaults (no explicit scrubbing config); no PII currently attached |

**Classification: PARTIAL** (init present + error boundary + breadcrumbs, but no release/dist,
no source-map upload).

**Are errors reaching Sentry in production?** **Likely, but UNVERIFIED.** The init is enabled
in production (`!__DEV__`) with a well-formed DSN, so events probably send — but code presence
is **not proof**; verification requires a test event or checking the Sentry project's inbound
events. And any events that do arrive would be **un-symbolicated** (no source maps). Do not
assume delivery is working.

---

## 11. Sentry target design (minimal, beta-ready)

- **environment:** drive from the app env — `development` / `preview` / `production` (so beta
  crashes are separable from prod). Keep `enabled: !__DEV__` (optionally enable in `preview`).
- **release naming:** explicit `release` = `the-book-app@<version>+<build>` and `dist` =
  build number, set at init from app config, so issues group per build.
- **source-map upload:** add the `@sentry/react-native/expo` config plugin; supply the real
  `SENTRY_AUTH_TOKEN` from a **CI/EAS secret** at build time (keep `sentry.properties`
  placeholder in the tree). This symbolicates production stack traces.
- **preview vs production separation:** distinct Sentry `environment` values + release names.
- **PII/privacy:** keep `sendDefaultPii` off; do not attach email/user PII (currently none);
  if user context is ever added, use an opaque id, not email.
- **alerting minimum:** one alert rule — notify on a new unresolved issue in the `production`
  environment. Nothing more for beta.

Do not add a broader observability/tracing stack now (current `tracesSampleRate: 0.2` is fine).

---

## 12. Dev backdoors / dev-only behavior (classification)

Honoring the standing rule *not to strip dev bypass flows until the real backend flow is wired*
([[feedback_dev_bypasses]]): the recommendation is to **make the dev tooling safe (get real
credentials out of the shipped bundle, gate the one ungated path)**, not to delete the dev
conveniences.

| # | Item | Location | Gate | Classification |
|---|---|---|---|---|
| 1a | `DEV_PASSWORD` + personal Gmail as **unguarded module constants** (real seed-account logins on prod; may remain in shipped bundle) | `app/index.tsx:80,88` | none | **REPLACE WITH SAFE DEV TOOLING** (move creds to non-prod-only dev env; rotate password) — **security fix, keeps the feature** |
| 1b | `signInAs` real `signInWithPassword`, secret 5-tap, dev/site-map modals | `app/index.tsx:279,341,451,570` | `__DEV__` (stripped in release) | KEEP FOR DEVELOPMENT (once creds come from 1a's safe source) |
| 1c | Admin nav rows | `app/index.tsx:186,232` | `__DEV__` | HARMLESS DEV-ONLY |
| 2 | `DEV_MODE` auth-redirect bypass + `DevBadge` | `app/_layout.tsx:28,122,198` | `__DEV__ && false` (folds to false) | HARMLESS DEV-ONLY |
| 3 | `handleDevBypass` OTP-skip; **button** `__DEV__`-gated but **function itself ungated** | `app/auth/phone.tsx:69,162` | button `__DEV__`; fn none | KEEP FOR DEVELOPMENT; **add a defensive `__DEV__` guard inside the fn** (P3) |
| 4 | `'Stephen'` provider data fallback | `app/(tabs)/business/analytics-utils.ts:19-27` | `__DEV__` | HARMLESS DEV-ONLY (stripped) |
| 5 | Signed-out go-live preview that **skips the DB write** — **runtime `!user`, NOT `__DEV__`**, ships in release; reachable only if the layout auth guard opens | `app/onboarding/provider/golive.tsx:85-100` | runtime `!user` | **REPLACE / gate behind `__DEV__`** before beta (P2) |
| 6 | Admin section blocked by `if (!__DEV__) return null` (screen files remain in bundle, runtime-blocked) | `app/admin/_layout.tsx:12` | runtime `__DEV__` | HARMLESS DEV-ONLY (acceptable for beta) |

Note: `__DEV__`-gated **branches** are dead-code-eliminated in release, but `__DEV__`-gated code
does not strip **unguarded module-level string constants** (1a) — hence the credential literals
must be moved out of source regardless of the code paths being stripped.

---

## 13. Secret inventory

| Item | Location | Masked | Classification |
|---|---|---|---|
| Supabase URL/ref | `lib/supabase.ts:4` | `https://kxregomua…supabase.co` | PUBLIC CLIENT KEY |
| Supabase **anon** JWT (role=anon) | `lib/supabase.ts:6` | `eyJhbGciOiJI…` (len 208) | PUBLIC CLIENT KEY |
| Sentry DSN | `app/_layout.tsx:19` | `https://65ff1fe1…@o4511946923048960.ingest.sentry.io/…` | PUBLIC CLIENT KEY |
| `sentry.properties` auth.token | `sentry.properties` | `SENTRY_AUTH_TOKEN_PLACEHOLDER` | FALSE POSITIVE (placeholder) |
| `DEV_PASSWORD` | `app/index.tsx:80` | `theb…` (len 13) | **TEST CREDENTIAL** (live seed-account password on prod) |
| Personal Gmail | `app/index.tsx:88` | `steph…@gmail.com` | **TEST CREDENTIAL / PII** |
| Seed emails | `app/index.tsx:83-87` | `testclient@thebook.dev`, `seed-*@thebook.internal` | TEST CREDENTIAL |
| Edge-fn service-role read | `supabase/functions/rate-limit/index.ts` | `Deno.env.get(...)` (no literal) | FALSE POSITIVE (correct) |

**No REAL SECRET (service-role key, private API secret, real auth token) exists in the tree.**
Severity/remediation for the one real-credential cluster (DEV_PASSWORD + emails): **P1** —
rotate the shared dev password and move the credentials to a non-prod-only dev config (B6D). Not
a committed *secret* in the classic sense, but a working credential pair for prod seed accounts.

---

## 14. Git-history exposure

Scanned all branches, 292 commits.
- **Supabase anon key** — committed in `f5ba54d`; **public-by-design → no history rewrite, no
  rotation.**
- **Service-role key** — **never committed** (0 hits across history); nothing to clean.
- **`.env` file** — **never committed** (correctly gitignored).
- **Sentry auth token** — only the `SENTRY_AUTH_TOKEN_PLACEHOLDER` string ever committed
  (`8cd65a1`); **no real token in history.**
- **Sentry DSN** — committed in `fa25d80`; public → no rewrite.
- **`DEV_PASSWORD` + emails** — committed in `cef6402`; a working dev-account credential. **The
  password should be rotated** (it currently authenticates prod seed accounts); **history
  rewrite is low-value** (grants access only to disposable seed accounts) and **not required**.

**Conclusion: history cleanup is NOT necessary.** The only action with real weight is *rotating*
the dev-account password (a live-credential action, done in B6D — not a history operation).

---

## 15. Release-readiness truth

| Item | State |
|---|---|
| Release checklist / runbook | **MISSING** (no release/ops docs) |
| Versioning automation | **MISSING** (app `version` static `1.0.0`; no `buildNumber`/`versionCode`; no version scripts) |
| Changelog | **MISSING** |
| Rollback strategy | **MISSING** |
| Smoke tests (release) | **MISSING** (Maestro not built yet — B5C) |
| Beta distribution (TestFlight / Play Internal) | **MISSING** (no submit creds; `submit.production` empty) |
| Expo Updates / OTA | **MISSING** (`expo-updates` absent; no channels/runtimeVersion) |
| Migration sequencing in release | **MISSING** (no documented step) |
| Production DB backup/checkpoint | **MISSING** (no documented process; Supabase provides PITR/backups but no runbook references it) |

Release process is effectively **absent**; only bare EAS build profiles exist.

---

## 16. Minimal beta release process (design)

```
PR merged to main
 → CI green (typecheck + lint baseline + 61 unit tests)         [automated, exists]
 → EAS `preview` build (points at non-prod)                      [manual trigger]
 → Maestro smoke on the preview build (B5C: book→contract→pay-placeholder→confirm; accept→complete)
 → DB migration check: apply any pending supabase/migrations to NON-PROD, run B5B security suite
 → (if the release depends on new migrations) apply them to PRODUCTION via a deliberate,
     reviewed `db push` — a gated manual step, with a Supabase PITR/backup checkpoint noted first
 → EAS `production` build (points at prod)
 → submit to TestFlight / Play Internal Testing
 → monitor Sentry (production environment) for new issues
 → rollback: resubmit the previous build (and, once expo-updates is added, revert the OTA channel)
```

- **Migrations** fit **before** the production build for forward-compatible changes (apply to
  non-prod → test with B5B → apply to prod). Backward-incompatible changes need the app+DB
  released together.
- **Maestro** runs on the **preview** build, pre-promotion.
- **For beta, these may be manual:** triggering builds, running Maestro, applying migrations,
  submitting to stores, watching Sentry. Automate later.

---

## 17. Batch 6 implementation split

| Batch | Scope | Files changed | External setup | Secrets | Migration impact | App-behavior risk | Deps |
|---|---|---|---|---|---|---|---|
| **B6A** | Env-configure `lib/supabase.ts` (throw if missing) + `.env.example` + test/CI/seed **guards** | `lib/supabase.ts`, `.env.example`, `jest.setup.js` (guard), maybe `app.config.ts` | none (code) | none new | none | **High**: app won't boot without env → must set local `.env` + EAS env | — |
| **B6B** | Create non-prod Supabase project; apply `supabase/migrations/*`; seed script (+ guard) & auth test accounts/buckets | `supabase/seed*` (new), CI config | **create project**, capture URL/anon + service-role (secret) | applies existing migrations to new project | none to prod | low | pairs with B6A |
| **B6C** | EAS profiles: `projectId`/`owner`, per-profile `env`, channels, `runtimeVersion`; (optional) `expo-updates` | `eas.json`, `app.json` | EAS project/owner, store creds | store/submit secrets | none | low | B6A (env values) |
| **B6D** | Dev-backdoor safety: move `DEV_PASSWORD`/emails to non-prod dev config, **rotate** the dev password, gate the ungated go-live preview (`golive.tsx:85`) & `handleDevBypass` fn | `app/index.tsx`, `app/onboarding/provider/golive.tsx`, `app/auth/phone.tsx` | rotate seed password in Supabase | none | none | low–med (keeps dev flows, changes cred source) | B6A/B6B (non-prod backend for dev creds) |
| **B6E** | Sentry env/release: add Sentry Expo config plugin + `release`/`dist`; source-map upload via build secret; verify delivery | `app/_layout.tsx`, `app.json`, CI/EAS secret | Sentry auth token as secret | `SENTRY_AUTH_TOKEN` | none | low | B6C (build) |
| **B6F** | Release checklist/runbook + versioning + rollback + DB-checkpoint doc | `docs/…` (new) | none | none | doc only | none | B6C |

If a cleaner split helps: **B6A and B6B should land together** (B6A makes the client require
env; B6B provides the backend to point at) — treat them as one unlock step.

---

## 18. Interaction with B5B / B5C

- **B6A + B6B together unlock B5B** (DB/security regression harness): B5B needs an env-configured
  client/runner **and** a seeded non-prod project (or ephemeral CI Postgres) with a service-role
  secret available to CI.
- **B6A + B6B together unlock B5C** (Maestro E2E): B5C needs a seeded **password** test account
  on the non-prod project **and** a preview build pointed at non-prod (B6C helps but a dev-client
  build against non-prod is enough to start).

**Exact resume point:** once **B6A (env client + guards)** and **B6B (non-prod project created,
migrations applied, seed + test accounts, service-role in CI secrets)** are done, B5B and B5C
can be authored and run safely. Nothing else in B6 blocks them.

---

## 19. Minimum work before product-building resumes

| Tier | Work | Rationale |
|---|---|---|
| **MUST COMPLETE BEFORE PRODUCT-BUILDING** | **B6A** + a **minimal B6B** (non-prod project created, migrations applied, dev/local + CI pointed at it) | Stops dev/test defaulting to production — the core safety unlock. Small and self-contained. |
| **SHOULD COMPLETE BEFORE BETA** | **B6D** (rotate dev password, get creds out of bundle, gate go-live preview), **B6C** (beta EAS profile), **B6E** (Sentry env/release + source maps), **B6F** (release checklist) | Needed for a safe, debuggable beta, but not to resume feature work. |
| **CAN RUN IN PARALLEL WITH PRODUCT WORK** | B6B seed-data expansion, **B5B**/**B5C** authoring (after B6A/B6B), B6C production-submit config, B6E alerting, B6F runbook refinement | Independent of feature development. |

So: **B6A + minimal B6B is the only hard prerequisite** to returning to product development;
everything else can proceed before beta or alongside product work.

---

## 20. Risk classification

- **P0:** none. (No real secret committed; B5A tests are mock-only so no automated test hits
  prod today.)
- **P1:**
  - **All development defaults to PRODUCTION** — `lib/supabase.ts` hardcodes prod, so every local
    dev session (and any future non-mocked test) reads/writes the live project. Fixed by B6A/B6B.
  - **Hardcoded dev-account password + personal email** (`app/index.tsx:80,88`) — live logins on
    prod seed accounts, and unguarded module constants that can remain in a shipped bundle.
    Rotate + relocate (B6D).
- **P2:**
  - **Ungated signed-out go-live preview** (`golive.tsx:85-100`) ships in release (runtime `!user`,
    not `__DEV__`); reachable if the layout auth guard is ever opened. Gate it (B6D).
  - **Sentry unverified + no source maps** — prod error delivery unproven and traces would be
    minified (B6E).
  - **No release process / rollback / DB-checkpoint** (B6F).
- **P3:**
  - `handleDevBypass` function ungated internally (button stripped) — add defensive guard.
  - Admin screen files remain in the bundle (runtime-blocked by `if (!__DEV__) return null`).
  - No versioning/build-number automation.

**Production-target risk:** P1 (dev defaults to prod). **Committed real secrets:** none (P0-clear).
**Dev bypasses:** P1 (credential literals) / P2 (ungated go-live). **Missing release safeguards:**
P2. **Sentry uncertainty:** P2.

---

## Confirmations
- **App code unchanged** — read-only; no `app/**`, `lib/**`, `lib/supabase.ts` edits.
- **CI unchanged** — no `.github/**` edits.
- **Production unchanged** — no DB writes, `db push`, or Management-API mutations.
- **Migrations unchanged** — no `supabase/**` edits.
- Only new file: this report (uncommitted).
