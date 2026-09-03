# The Book

The Book is a two-sided mobile marketplace for independent service providers
(barbers, stylists, lash and nail techs, and similar) and the clients who book
them. One account can act as both a client and a provider: "provider" is a
capability a user owns, not a separate app or a mode toggle. Providers publish a
storefront (services, availability, portfolio, reels), clients discover and book
them, the two message and complete an appointment, and both sides leave reviews.

This repository is the **Expo / React Native mobile app** plus its Supabase
backend definitions. It is being prepared for handoff to professional engineers;
please read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/README.md](docs/README.md)
before making changes.

> ### Schema: reconciled and migration-driven
> The committed Supabase migrations **are** the schema of record. The canonical
> baseline was reconciled against the live database and **verified to reproduce**
> on a fresh non-production project (Batches F3–F5 / 6AB); the earlier
> "reconstructed from code analysis" caveat is **resolved** and is retained only as
> history in [docs/README.md](docs/README.md#open-items--pending-investigations).
> Every schema change goes through a new timestamped migration — never the Supabase
> dashboard.
>
> **The repo is ahead of production.** "Reconciled" refers to the canonical baseline
> (`20260829000000`), which was derived from and verified against production. The
> migrations added since — messaging and reviews — are recorded as applied to the
> **non-production** project only; the last recorded production state is **8 migrations**
> (Batches 6AB / 6D). Do not assume a repo migration exists in production.
> [docs/operations/MIGRATION_LEDGER.md](docs/operations/MIGRATION_LEDGER.md) tracks what is
> applied where and is **explicitly non-production only**.

## Stack

- **Expo SDK ~54** / **React Native 0.81** / **React 19** (`newArchEnabled`)
- **Expo Router ~6** (file-based navigation under `app/`)
- **TypeScript ~5.9**, `strict` mode
- **Supabase** (Postgres, Auth, Storage, Edge Functions) via `@supabase/supabase-js`
- **Zustand** for in-memory flow state (no persistence middleware)
- **Sentry** (`@sentry/react-native`) for error monitoring
- `expo-av` (video/reels), `react-native-webview` (contract PDF viewer),
  `expo-secure-store` / AsyncStorage (auth session)

There is **no separate web app in this repository.** Some Next.js template files
remain at the repo root; they are unverified suspected leftovers and are recorded
as dead-code cleanup candidates in [docs/README.md](docs/README.md#open-items--pending-investigations)
(not to be removed until a dedicated investigation proves they are unused).

## Prerequisites

- **Node 20** and npm (CI uses Node 20)
- **Expo Go** on a physical device, or an iOS Simulator / Android emulator
- No global Expo CLI needed; commands below use `npx`

## Install and run

```bash
npm install --legacy-peer-deps      # peer-dep resolution requires the flag (CI uses `npm ci --legacy-peer-deps`)
npx expo start                      # start Metro; scan the QR with Expo Go, or press i / a
```

Useful scripts (see `package.json`):

| Script | What it does |
|---|---|
| `npm start` / `npx expo start` | Start the Metro dev server (add `-c` to clear cache) |
| `npm run ios` / `android` / `web` | Start targeting a platform |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`--max-warnings 0`) |
| `npm run check` | `typecheck` + `lint` - run this before every commit |

## Environment configuration

Supabase connection is **environment-driven** — nothing is hardcoded. `lib/supabase.ts`
reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` and **throws at
module load** if either is missing; there is deliberately **no fallback to a default
project**, so a misconfigured build cannot silently talk to the wrong backend. Copy
[`.env.example`](.env.example) to `.env` to run locally.

The anon key is public client configuration (Row Level Security is the real access
boundary). The **service-role key must never** appear here or in any `EXPO_PUBLIC_*`
variable — it is server-side only (the `rate-limit` Edge Function). Private tooling
credentials live in `.env.tooling.local` (gitignored; see
[`.env.tooling.example`](.env.tooling.example)) and target a **non-production** project
only — the DB/security harness refuses the production project ref outright.

## Repository structure

```
app/            Expo Router routes (screens). Groups: (tabs), auth, onboarding,
                book, bookings, contracts, community, care, providers, messages,
                notifications, post-booking, settings, me, admin, preview, etc.
                (tabs)/business/  is the live provider dashboard (nested in the shell).
                dashboard/        is legacy redirect-only shims (superseded by (tabs)/business).
components/     Shared UI (ProviderProfile, editors, review section, etc.)
context/        React context: AuthContext (session/role), PanelContext
hooks/          Data hooks (useProviders, useMessaging, useNotifications)
lib/            Data layer + domain logic (supabase client, resolveUserRole,
                bookingStatus, reviews, contracts, analytics, storage, rateLimit, ...)
store/          Zustand stores for onboarding/booking flow state
supabase/       migrations/ (canonical baseline + later migrations),
                functions/rate-limit (Edge Function), tests/ (B5B DB-security harness)
assets/         Fonts, images, video
docs/           Project documentation (see docs/README.md for the index)
```

## Documentation

Start at **[docs/README.md](docs/README.md)** - it is the documentation index and
labels every document as authoritative, historical, planned, or awaiting
verification. Key entries:

- **Navigation (authoritative):** [docs/architecture/NAVIGATION.md](docs/architecture/NAVIGATION.md)
- **Current state (start here):** [docs/product/CURRENT_STATE.md](docs/product/CURRENT_STATE.md)
- **Migration ledger, non-production (authoritative):** [docs/operations/MIGRATION_LEDGER.md](docs/operations/MIGRATION_LEDGER.md)
- **Supabase entry point (authoritative):** [supabase/README.md](supabase/README.md) -
  active migration chain, canonical baseline, and what must never be applied.
- **Rate-limit function (authoritative):** [supabase/functions/README.md](supabase/functions/README.md)
- **Historical audits (not current-state):** [docs/history/](docs/history/)
- **How to contribute safely:** [CONTRIBUTING.md](CONTRIBUTING.md)
