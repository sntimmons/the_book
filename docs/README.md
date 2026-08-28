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
| [architecture/NAVIGATION.md](architecture/NAVIGATION.md) | Architecture | **Authoritative** - the governing navigation model (one account, no modes, five shared tabs, RLS is the enforcement boundary). |
| [../supabase/README.md](../supabase/README.md) | Architecture / Data | **Authoritative, with caveats** - schema baseline notes and known gaps. The baseline is reconstructed from code, not production history (see open items P0). |
| [../supabase/functions/README.md](../supabase/functions/README.md) | Operations / Security | **Authoritative** - the `rate-limit` Edge Function: limits, deploy, secrets. |
| [../README.md](../README.md) | Entry point | **Authoritative** - repo overview, stack, install/run, env caveat. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Process | **Authoritative** - how to make changes safely. |
| [history/SCREEN_STATUS_MAP.md](history/SCREEN_STATUS_MAP.md) | Historical | **Historical (~2026-06)** - pre-dates Community, Contracts, Reviews, and the `(tabs)/business` move. Stale; do not trust over code. |
| [history/PASS1_BUTTON_INVENTORY.md](history/PASS1_BUTTON_INVENTORY.md) | Historical | **Historical (~2026-05)** - button/route punch list from a ~51-screen era. |

## Planned documents (approved structure, not yet written)

These directories exist for upcoming foundation work. They are intentionally
empty for now (no placeholder files). **Authoritative product and data/security
docs are deliberately deferred until after schema reconciliation (Batch F2),
because writing them against an unverified schema would bake in errors.**

- `product/` - `PRODUCT.md`, `BETA_SCOPE.md`, `USER_JOURNEYS.md`
- `architecture/` - `ARCHITECTURE.md`, `DATA_MODEL.md` (after F2)
- `security/` - `SECURITY_MODEL.md`, `SECURITY_BACKLOG.md` (after F2)
- `testing/` - `TESTING.md`
- `operations/` - `RELEASE_PROCESS.md`, `ENVIRONMENTS.md`
- `decisions/` - Architecture Decision Records (ADR-0001+)
- `design/` - design/UX references

## Open items & pending investigations

Carried forward from the handoff audit. These are recorded here so they are not
lost during foundation work. **None are fixed in this documentation batch.**

### P0 - Live database truth / schema reconciliation (next: Batch F2)
The committed migrations were reconstructed from code analysis and live REST
probes, not from real migration history, and the RLS section was never dumped
from production. Only `providers`, `bookings`, and `clients` have their full
confirmed column lists; everything else is inferred. **Running the migrations is
not guaranteed to reproduce production.** Batch F2 will reconcile the live
database (service-role schema dump + `pg_policies` dump) before any authoritative
`DATA_MODEL.md` or `SECURITY_MODEL.md` is written. See
[../supabase/README.md](../supabase/README.md) "Known gaps" and "For the engineer
taking this over."

### P0 - Booking write-integrity not enforced server-side
The `bookings` UPDATE policy scopes to participants but does not restrict which
columns/values a participant may set, so a client can in principle set
`status='completed'` / `no_show_flag` / `payment_*` directly. The UI hides those
actions from clients, but UI is not security. Enforcement (per-role column grants
or a trigger) is owed. Documented in [../supabase/README.md](../supabase/README.md)
gap #4. Fix is out of scope for foundation docs; it belongs in the security
backlog once F2 lands.

### P1 - OPEN / NOT FIXED: Contracts save failure
The contracts save path is failing on device and is **not fixed**.

- The **live** `contracts` table reportedly has `provider_id`, `user_id`, and
  `body` as `NOT NULL`, where the repo migration differs.
- Working theory: the save may execute with a **null `provider_id`**, which the
  live NOT NULL constraint rejects.
- The current contract screen reportedly **swallows the underlying database
  error**, surfacing a generic or misleading message instead of the real cause.
- **Status: OPEN.** Do not consider this resolved. It should be re-investigated
  after schema reconciliation (F2), since the true column shape is part of the
  same schema-drift problem. Prior investigation notes live in the session
  history; capture them in the security/data backlog when those docs are written.

### P2 - Lint warning baseline (maintainability)
`npm run lint` reports 207 warnings (0 errors) against the app code under
`--max-warnings 0`, so `npm run check` is red at the lint step even though
`tsc --noEmit` passes. The warnings are pre-existing (verified identical on
pristine `main`) and are mostly `no-console` and `@typescript-eslint/array-type`.
CI's lint step is non-blocking (`|| true`), so CI stays green. Clearing this
baseline (or adjusting the rule set) is a dedicated maintainability batch; do not
fix it inline inside unrelated work.

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
- `app/index.tsx` contains a `__DEV__`-gated hardcoded-credential quick-switch
  marked "DO NOT SHIP" in-code. Not shippable; flagged for the security backlog.
- Two source comments still reference the old `NAVIGATION_ARCHITECTURE.md` path
  (`app/auth/verify.tsx`, `app/(tabs)/me.tsx`). Not updated in this batch to
  avoid touching application code; update in a later comment-only pass.

## Directory map

```
docs/
  README.md          this index
  product/           product docs (planned)
  architecture/      NAVIGATION.md (authoritative); ARCHITECTURE/DATA_MODEL planned
  decisions/         ADRs (planned)
  design/            design/UX references (planned)
  security/          security model + backlog (planned, after F2)
  testing/           testing docs (planned)
  operations/        release + environments (planned)
  history/           dated, non-authoritative snapshots
```
