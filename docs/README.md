# The Book - Documentation Index

This directory is the home for project documentation. Start here.

## How to read these docs

Every document falls into one of four categories. Always check a document's
category before trusting it, and remember the golden rule:

> **When any document conflicts with the current source code, the source code
> wins.** Documents may describe intended future state; the code is the only
> evidence of what is actually implemented today.

Distinguish three things whenever you read or write docs:

- **CURRENT IMPLEMENTATION** - what the code does right now (verifiable in `app/`,
  `lib/`, `supabase/`).
- **TARGET / PROPOSED ARCHITECTURE** - where we intend to go. Not yet built.
- **HISTORICAL AUDITS** - point-in-time snapshots kept for reference. Often stale.

## Status legend

- **Authoritative** - trusted current-state or governing document.
- **Awaiting verification** - believed accurate but not yet reconciled against a
  source of truth (for schema, that means the live database).
- **Planned** - approved to be written, not yet created.
- **Historical** - a dated snapshot, not current-state documentation.

## Index

| Document | Category | Status |
|---|---|---|
| [product/CURRENT_STATE.md](product/CURRENT_STATE.md) | Product / PM | **Authoritative (current-state)** - what is actually true on `main` today. Start here. Links out rather than duplicating. |
| [product/PRODUCT_DECISIONS.md](product/PRODUCT_DECISIONS.md) | Product / PM | **Authoritative** - the ledger of **locked** decisions (PD-NNN). Unresolved ideas do not belong here. |
| [product/OPEN_QUESTIONS.md](product/OPEN_QUESTIONS.md) | Product / PM | **Authoritative** - what is **undecided** (OQ-NNN), by area. Closed only by a cited decision. |
| [product/ROADMAP.md](product/ROADMAP.md) | Product / PM | **Authoritative (sequencing)** - session-based ordering. An estimate from current pace, **not** a deadline commitment. |
| [product/HOUSTON_BETA_STRATEGY.md](product/HOUSTON_BETA_STRATEGY.md) | Product | **Authoritative** - beta thesis, what it must prove, success criteria, cohort strategy, barter principle, payments positioning. |
| [product/BETA_SCOPE.md](product/BETA_SCOPE.md) | Product | **Authoritative (current-state)** - the product-truth ledger: what each surface is (REAL / PARTIAL / PLACEHOLDER / DEFERRED / UNDECIDED). |
| [product/USER_JOURNEYS.md](product/USER_JOURNEYS.md) | Product | **Authoritative (acceptance intent)** - canonical journeys, expected end states, and current status. |
| [product/REVIEWS_MODEL.md](product/REVIEWS_MODEL.md) | Product | **Authoritative** - the review model: eligibility, the 7-day window, blind reveal, `no_show`, and what is deferred to Phase 2. |
| [architecture/NAVIGATION.md](architecture/NAVIGATION.md) | Architecture | **Authoritative** - the governing navigation model (one account, no modes, five shared tabs, RLS is the enforcement boundary). |
| [../.agents/](../.agents/) | Agents | **Authoritative** - agent definitions. Agents 1-3 are read-only; the **Project State Steward** (`project-state-steward/`) is the only agent with writes, limited to the five PM documents above. |
| [../supabase/tests/README.md](../supabase/tests/README.md) | Testing / Security | **Authoritative** - the B5B executable DB/security harness: scope, execution modes, production guard, CI wiring. |
| [operations/MIGRATION_LEDGER.md](operations/MIGRATION_LEDGER.md) | Operations | **Authoritative** - non-prod migration-ledger reconciliation: the classification rule, verification method, and the dated record. |
| [../supabase/README.md](../supabase/README.md) | Architecture / Data | **Authoritative (entry point)** - routes to the active migration chain, the canonical baseline, and the migration ledger; explicitly withdraws the superseded pre-canonical install instructions and RLS caveats. Rewritten in PR #29. |
| [../supabase/functions/README.md](../supabase/functions/README.md) | Operations / Security | **Authoritative** - the `rate-limit` Edge Function: limits, deploy, secrets. |
| [../README.md](../README.md) | Entry point | **Authoritative** - repo overview, stack, install/run, environment configuration. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Process | **Authoritative** - how to make changes safely. |
| [audits/](audits/) | Historical | **Historical** - dated audit/reconciliation snapshots (F-series, security batches). Point-in-time; never cite as current state. |
| [history/SCREEN_STATUS_MAP.md](history/SCREEN_STATUS_MAP.md) | Historical | **Historical (~2026-06)** - pre-dates Community, Contracts, Reviews, and the `(tabs)/business` move. Stale; do not trust over code. |
| [history/PASS1_BUTTON_INVENTORY.md](history/PASS1_BUTTON_INVENTORY.md) | Historical | **Historical (~2026-05)** - button/route punch list from a ~51-screen era. |

## Planned documents (approved structure, not yet written)

Directories that still hold only planned documents. Product docs are **no longer**
deferred — schema reconciliation (F2–F5) is complete and the product/PM set above is
written and authoritative.

- `product/` - `CURRENT_STATE.md`, `PRODUCT_DECISIONS.md`, `OPEN_QUESTIONS.md`,
  `ROADMAP.md`, `HOUSTON_BETA_STRATEGY.md`, `BETA_SCOPE.md`, `REVIEWS_MODEL.md` and
  `USER_JOURNEYS.md` are **written and authoritative**; `PRODUCT.md` remains planned.
- `architecture/` - `ARCHITECTURE.md`, `DATA_MODEL.md` (after F2)
- `security/` - `SECURITY_MODEL.md`, `SECURITY_BACKLOG.md` (after F2)
- `testing/` - `TESTING.md` (planned). The executable DB/security harness (B5B) is documented at `supabase/tests/README.md`.
- `operations/` - `MIGRATION_LEDGER.md` is **authoritative** (indexed above); `RELEASE_PROCESS.md`, `ENVIRONMENTS.md` (planned)
- `decisions/` - Architecture Decision Records (ADR-0001+)
- `design/` - design/UX references

## Open items & pending investigations

Carried forward from the handoff audit. These are recorded here so they are not
lost during foundation work. Statuses below are current: items marked **RESOLVED** / **FIXED** are closed; the rest remain open.

### P0 - Live database truth / schema reconciliation — **RESOLVED (Batches F3–F5)**
> **Status update:** the schema has been reconciled against production and a
> canonical baseline migration was produced and **verified to reproduce** on a
> fresh non-production project (Batch 6AB). The active migration chain is the
> `supabase/migrations/*` files; see
> [operations/MIGRATION_LEDGER.md](operations/MIGRATION_LEDGER.md) for the count and what is
> applied where — it is the single numeric source of truth. `DATA_MODEL.md`/`SECURITY_MODEL.md` remain planned.
>
> _Original note (historical):_ The committed migrations were reconstructed from code
> analysis and live REST probes, not from real migration history, and the RLS section
> was never dumped from production. Only `providers`, `bookings`, and `clients` had full
> confirmed column lists; everything else was inferred. Running the migrations was not
> guaranteed to reproduce production.

### P0 - Booking write-integrity not enforced server-side — **RESOLVED (Security Batch 3B)**
> **Status update:** enforced. A `BEFORE INSERT/UPDATE` trigger
> (`enforce_booking_write_integrity`) plus per-actor status authorship now neutralize
> client-seeded `status`/`no_show_flag`/`payment_*` and restrict which fields each
> actor may change. See `supabase/migrations/20260830010000_*` and
> `docs/audits/SECURITY_BATCH_3B_BOOKING_WRITE_INTEGRITY_FINAL.md`.
>
> _Original note (historical):_ The `bookings` UPDATE policy scoped to participants but
> did not restrict which columns/values a participant could set, so a client could in
> principle set `status='completed'` / `no_show_flag` / `payment_*` directly.

### P1 - Contracts: client fetch/signature paths **FIXED (Batch 4A)**; provider-side save **still to verify**
> **Status update:** the client-side contract path was hardened in Batch 4A —
> `fetchProviderContract` now throws on a real error instead of silently skipping the
> signing gate, and a failed `contract_signatures` insert no longer advances as
> success (it surfaces an error and offers retry). Schema is reconciled (F3–F5), so the
> live column shape is now known. **Not yet re-verified:** the original provider-side
> *save* symptom (a possible null `provider_id` write). Track it as a QA/engineering
> item, not a foundation blocker.
>
> _Original note (historical):_ the contracts save path was failing on device; working
> theory was a save executing with a null `provider_id` rejected by a live NOT NULL
> constraint, with the screen swallowing the underlying database error.

### P2 - Lint warning baseline (maintainability) — **partially addressed (Batch 5D)**
> **Status update:** CI is no longer non-blocking here. `npm run lint:ci`
> (`--max-warnings 210`) is now a **blocking** CI gate: any ESLint error or any new
> warning beyond the frozen baseline of **210** fails CI, while the existing backlog
> does not. The baseline is meant to ratchet **down** over time. Clearing the backlog
> remains a dedicated maintainability batch; do not fix it inline in unrelated work.
>
> _Original note (historical):_ `npm run lint` reported 207 warnings (0 errors) under
> `--max-warnings 0`; CI's lint step was non-blocking (`|| true`).

### Verified dead-code cleanup candidates (do NOT remove yet)
Suspected leftovers from a Next.js/web template that do not appear to belong to
the Expo app. **These must not be deleted until a dedicated investigation proves
they are not imported, referenced by scripts, required by Expo, required by CI,
or used by build/deployment tooling.** Recorded here as candidates only:

- `next.config.ts`
- `eslint.config.mjs` (Next.js ESLint config; the Expo app uses `eslint.config.js`)
- `postcss.config.mjs`
- `public/` Next/Vercel template assets (`next.svg`, `vercel.svg`, `globe.svg`,
  `window.svg`, `file.svg`)
- root `App.tsx` (the app entry is `expo-router/entry` per `package.json`)

### Known stale in-code artifacts (informational)
- The `__DEV__` dev sitemap in `app/index.tsx` labels now-built Business screens
  as "Stub"; its status labels are not reliable.
- ~~`app/index.tsx` contains a `__DEV__`-gated hardcoded-credential quick-switch
  marked "DO NOT SHIP".~~ **RESOLVED (Batch 6D):** the hardcoded dev password and
  personal/seed login emails were removed; the dev switcher now reads
  `EXPO_PUBLIC_DEV_*` env vars (non-prod only) and hard-refuses the production
  project. The historically exposed credential was rotated out of every affected
  account.
- Two source comments still reference the old `NAVIGATION_ARCHITECTURE.md` path
  (`app/auth/verify.tsx`, `app/(tabs)/me.tsx`). Not updated in this batch to
  avoid touching application code; update in a later comment-only pass.

## Directory map

```
docs/
  README.md          this index
  product/           product + PM docs (authoritative; see index above)
  architecture/      NAVIGATION.md (authoritative); ARCHITECTURE/DATA_MODEL planned
  decisions/         ADRs (planned)
  design/            design/UX references (planned)
  security/          security model + backlog (planned, after F2)
  testing/           testing docs (planned)
  operations/        MIGRATION_LEDGER.md (authoritative); release + environments (planned)
  audits/            dated audit/reconciliation snapshots (historical)
  history/           dated, non-authoritative snapshots
```
