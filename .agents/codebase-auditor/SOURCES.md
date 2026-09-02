# Codebase Auditor — Sources & Context Loading

Deterministic loading. **Never dump the whole repo into one audit.** Load the fixed
always-set, then sweep by surface. Structure lives in the module graph (imports/exports,
hooks/services, stores, route files) and in how many places a rule is interpreted — grep for
call sites and repeated strings/shapes rather than reading whole trees.

## Always load (small, fixed)
- `AGENTS.md` — authority hierarchy, "source code wins", information classes, canonical vocabulary.
- `docs/architecture/NAVIGATION.md` — intended navigation/route structure (tabs, Business
  tools, **no** client/provider mode).
- `docs/product/BETA_SCOPE.md` — what is REAL / PARTIAL / DEFERRED / UNDECIDED (so "stale" vs
  "intentionally deferred" can be told apart).
- `docs/README.md` — documentation index + status legend (current vs historical).

## Surface → source map (sweep by scope)

| Surface | Primary sources |
|---|---|
| Messaging | `hooks/useMessaging.ts`, `lib/messageRequests.ts`, `app/messages/*`, `app/(tabs)/messages.tsx`, `app/providers/[id].tsx`, `app/book/datetime.tsx`, plus barter/business/community senders (`app/community/*`, `app/(tabs)/business/*`) |
| Booking | `store/bookingStore.ts`, `lib/bookingStatus.ts`, `app/book/*`, `app/bookings/[id].tsx`, `app/(tabs)/bookings.tsx`, `app/(tabs)/business/index.tsx` |
| Verification gate | `lib/verificationGate.ts` (or equivalent), `app/book/*`, `components/ProviderProfile.tsx` |
| Reviews | `lib/reviews.ts`, `app/post-booking/*`, `components/ProviderReviewsSection.tsx` |
| Provider/business/client relationship | `lib/resolveUserRole.ts`, `context/AuthContext.tsx`, `store/providerStore.ts`, `app/(tabs)/business/*` |
| Shared Supabase access | `lib/supabase.ts`, `lib/supabaseTarget.ts`, and every `supabase.from('…')` call site (grep) |
| Navigation/routing | `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, the `app/` route tree, `docs/architecture/NAVIGATION.md` |

## How to sweep (technique, not whole-tree reads)
- **Call-site census:** `Grep` for a symbol (e.g. `getOrCreateConversation`, `currentMode`,
  `request_status`, `SEVEN_DAYS`, a table name) across the repo to find every place a rule is
  interpreted or a helper is used — that's how duplication/dead-code/bypass is proven.
- **Repeated literals:** grep status strings, table names, route strings, magic intervals to
  find multiple sources of truth.
- **Module graph:** read imports/exports of a hook/store/service to judge coupling; only read a
  whole file when a specific finding needs its internals.
- **Dead-code proof:** a symbol is a candidate only after grepping all call sites **and** tests
  and finding none — report as CANDIDATE (LIKELY) unless the absence is airtight (CONFIRMED).

## Runtime evidence the agent CANNOT gather (must disclose)
The agent is read-only and does not run the app, a bundler, a type-checker, or tests. Reachability
of a route, a genuinely-unused export, or a circular-import effect at runtime is **LIKELY** unless
statically airtight; say which check (build/test/run) would confirm. The audit's "could not
verify" list names these.

## Historical (reference only, never authoritative)
`docs/history/*` and superseded audit sections describe past states; never cite them as the
intended current structure. Current architecture docs + code win.
