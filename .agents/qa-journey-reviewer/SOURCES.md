# QA / Journey Reviewer — Sources & Context Loading

Deterministic loading. **Never dump the whole repo into a review.** Load the fixed
always-set, then only the files the scope maps to.

## Always load (small, fixed)
- `AGENTS.md` — authority hierarchy, "source code wins", info classes, vocabulary.
- `docs/README.md` — documentation index + status legend.
- `docs/product/BETA_SCOPE.md` — what is REAL / PARTIAL / PLACEHOLDER / DEFERRED / UNDECIDED.
- `docs/product/USER_JOURNEYS.md` — canonical journeys + expected end states.
- `docs/architecture/NAVIGATION.md` — governing navigation/exit rules.
- `lib/bookingStatus.ts` and `lib/resolveUserRole.ts` — canonical status + role vocabulary.

## Journey → source map (load by scope)

| Journey | Primary sources |
|---|---|
| J1 auth → Discover | `app/auth/*`, `context/AuthContext.tsx`, `lib/resolveUserRole.ts`, `lib/ensureClientRow.ts`, `app/(tabs)/index.tsx`, `app/_layout.tsx` |
| J2 booking-creation | `app/(tabs)/index.tsx`, `app/providers/[id].tsx`, `components/ProviderProfile.tsx`, `app/book/{service,datetime,message,policy,contract,payment,confirmed}.tsx`, `store/bookingStore.ts`, `lib/contracts.ts` |
| J3 client booking lifecycle | `app/(tabs)/bookings.tsx`, `app/bookings/[id].tsx`, `lib/bookingStatus.ts` |
| J4 provider booking lifecycle | `app/(tabs)/business/index.tsx`, `app/bookings/[id].tsx`, `lib/bookingStatus.ts` |
| J5 booking → message | `app/bookings/[id].tsx`, `hooks/useMessaging`, `app/messages/[id].tsx`, `app/(tabs)/messages.tsx` |
| J6 review | `app/post-booking/{review,provider-review,submitted}.tsx`, `lib/reviews.ts`, `components/ProviderReviewsSection.tsx` |
| J7 provider onboarding → go-live | `app/onboarding/provider/*`, `store/providerStore.ts`, `lib/policy.ts`, `lib/storage.ts` |
| J8 rebook | J2 sources + `app/bookings/[id].tsx` |
| J0 browse without verification | `app/(tabs)/index.tsx`, `app/providers/[id].tsx` — confirm browsing is ungated |
| J9 client verification | `components/ProviderProfile.tsx` (badges), providers/clients schema, `BETA_SCOPE.md` verification section — mostly PRODUCT DECISION |
| J10 provider verification | `components/ProviderProfile.tsx:180-285` (badges), `app/onboarding/provider/golive.tsx` (`identity_verified:false`), providers schema, `BETA_SCOPE.md` verification section |
| J11 verification gate on transaction attempt | `app/book/*` (where a gate would sit), `BETA_SCOPE.md` Identity verification + 14-day copy — mostly PRODUCT DECISION |
| J12 verified client → home/mobile booking | `app/book/*`, provider delivery-model fields, `BETA_SCOPE.md` home/house-call safety — RESEARCH/DESIGN |
| J13 pre-booking message request → accept | `app/(tabs)/messages.tsx`, `app/messages/[id].tsx`, `hooks/useMessaging`, `BETA_SCOPE.md` Messaging — PRODUCT DIRECTION |
| J14 provider policy/contract choice | `app/onboarding/provider/policy.tsx`, `app/(tabs)/business/contract.tsx`, `lib/policy.ts`, `BETA_SCOPE.md` Cancellation policies + Provider contracts |

Security/data contracts (interim, load only when a finding is data-adjacent):
`supabase/migrations/20260829000000_canonical_live_baseline.sql` + the latest
`docs/audits/SECURITY_BATCH_3B_*` and `BATCH_4A_*` finals.

## PR mode
1. Read the diff / changed-file list first.
2. Map changed files → journeys (table above).
3. Load only the always-set + those journeys' sources. Do not load unrelated journeys.

## Historical (reference only, never authoritative)
`docs/history/SCREEN_STATUS_MAP.md`, `docs/history/PASS1_BUTTON_INVENTORY.md` — stale;
never cite as expected behavior.
