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

> ### Important: the schema is not yet reconciled with production
> The committed Supabase migrations were **reconstructed from code analysis**,
> not from real migration history, so **running them is not guaranteed to
> reproduce the live production database.** Live-database truth / schema
> reconciliation is the next foundation phase (Batch F2) and is tracked as a P0
> in [docs/README.md](docs/README.md#open-items--pending-investigations). Do not
> treat the migrations as authoritative until that work lands.

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

## Environment configuration (current caveat)

There is **no `.env` setup today.** The Supabase project URL and anon key are
**hardcoded** in [`lib/supabase.ts`](lib/supabase.ts) and the app points at a
**single Supabase project** with no dev / staging / prod separation. The anon key
is a public client key (Row Level Security is the real access boundary), and the
service-role key is correctly kept server-side (only in the `rate-limit` Edge
Function). Introducing environment-based configuration and separate projects is
planned foundation work, not yet done.

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
supabase/       migrations/ (reconstructed baseline + later migrations),
                functions/rate-limit (Edge Function), README (schema notes)
assets/         Fonts, images, video
docs/           Project documentation (see docs/README.md for the index)
```

## Documentation

Start at **[docs/README.md](docs/README.md)** - it is the documentation index and
labels every document as authoritative, historical, planned, or awaiting
verification. Key entries:

- **Navigation (authoritative):** [docs/architecture/NAVIGATION.md](docs/architecture/NAVIGATION.md)
- **Schema notes (authoritative, with caveats):** [supabase/README.md](supabase/README.md)
- **Rate-limit function (authoritative):** [supabase/functions/README.md](supabase/functions/README.md)
- **Historical audits (not current-state):** [docs/history/](docs/history/)
- **How to contribute safely:** [CONTRIBUTING.md](CONTRIBUTING.md)
