# Batch 4A — App-Only Contract & Product-Truth Fixes (FINAL)

**Result: PASS.** Five app-only correctness defects from the Batch 4 reconciliation
are fixed. No migration, RLS, trigger, storage, schema, or production change; no
payment/contract/lifecycle redesign.

## Source findings (from Batch 4)
1. `fetchProviderContract` collapses read error → `null`, letting the client
   booking flow **skip contract signing** on a technical failure (P1).
2. Contract signature INSERT error swallowed → "signed" booking with no signature
   row, no user feedback (P2).
3. `app/post-booking/accepted.tsx` claims **"deposit has been charged"** when
   payments are not built (P1 product-truth).
4. `app/bookings/[id].tsx` has a duplicate local `statusBucket()` that omits
   `rescheduled` → a valid rescheduled booking becomes action-dead/terminal (P2).
5. Analytics `isEarning()` counts non-completed bookings as revenue → overstated
   "COMPLETED SERVICE VALUE"/revenue (P2).

## Files changed (13, app only)
- `lib/contracts.ts`
- `app/book/contract.tsx`
- `app/(tabs)/business/contracts-list.tsx`
- `app/(tabs)/business/contract.tsx`
- `app/book/payment.tsx`
- `app/post-booking/accepted.tsx`
- `app/bookings/[id].tsx`
- `app/(tabs)/business/analytics-utils.ts`
- `app/(tabs)/business/goal-detail.tsx` *(helper rename)*
- `app/(tabs)/business/revenue-detail.tsx` *(helper rename)*
- `app/(tabs)/business/client-intelligence.tsx` *(helper rename)*
- `app/(tabs)/business/service-performance.tsx` *(helper rename)*
- `app/(tabs)/business/schedule-detail.tsx` *(revenue vs utilization split)*

## 1. Contract fetch fail-open fix
`lib/contracts.ts` `fetchProviderContract`: now **throws** on a real Supabase error
and returns `null` **only** for a genuine no-row (`maybeSingle` data null, error
null). "No contract exists" and "lookup failed" are no longer conflated.

Caller behavior after the fix:
- `app/book/contract.tsx` (**the P1 gate**): wraps the call in try/catch. A genuine
  `null` still skips the step to `/book/payment` (unchanged). A caught error now
  sets a `loadError` state and renders a "Could not load the agreement" view with
  **Try again / Go back** — it **no longer routes to payment**, so a technical
  failure cannot let a client book without signing. Errors are reported to Sentry.
- `app/(tabs)/business/contracts-list.tsx` (provider list): `Promise.all` wrapped in
  try/catch/finally — an error logs and leaves the list empty rather than crashing.
- `app/(tabs)/business/contract.tsx` (provider editor): `load()` wrapped in
  try/catch/finally — an error logs and does not crash; `setLoading(false)` in
  `finally`.
- `lib/contracts.ts` `fetchProviderSignatures` (internal): the inner
  `fetchProviderContract` call is wrapped; on error it returns `[]` (provider's own
  list view, not a gate).

## 2. Signature insert error handling (tightened in review revision)
`app/book/payment.tsx`: a failed `contract_signatures` insert **no longer advances
to `/book/confirmed`**. `handleConfirm` was restructured:
- On `sigError`: `console.log` + `Sentry.captureException` (preserved), then
  `setPendingBookingId(bookingId)`, an inline `processError` ("…we could not save
  your contract signature. Tap Retry Signature to record it now, or go back."),
  `setIsProcessing(false)`, and **`return` without routing** — the user stays on
  the recoverable payment screen.
- The submit handler now branches on `pendingBookingId`: a fresh submit creates the
  booking then inserts the signature; a **retry skips booking creation** and
  re-attempts only the signature against the existing booking id — so a failed
  signature followed by a retry cannot create a duplicate booking. The CTA label
  switches to **"Retry Signature"** while a signature is pending; the top-bar back
  button remains available.
- On success the pending state is cleared and the flow routes to `/book/confirmed`
  as before.

Rationale: the booking row is created before the signature and client RLS has no
delete policy, so a server-side rollback is impossible from the client. Keeping the
booking id and retrying only the signature is the recoverable, non-duplicating,
in-scope fix. `signature_url: null` remains the intentional placeholder until the
capture canvas ships (documented, unchanged). **FAILED SIGNATURE INSERT no longer
equals a successful signing flow.**

## 3. Payment-truth copy fix (`app/post-booking/accepted.tsx`)
| location | old | new |
|---|---|---|
| subtext | `Your {money} deposit has been charged.` | `Your {money} deposit is not charged yet.` |
| deposit row | `{money} deposit charged` (green `check-circle`) | `{money} deposit — not charged yet` (neutral `clock` icon) |
| calendar note | `' Deposit charged: ' + money + '.'` | `' Deposit due: ' + money + '.'` |
No text now states or implies charged/authorized/captured/refunded. Screen remains
fully usable.

## 4. Booking status bucketer fix (`app/bookings/[id].tsx`)
Added `case 'rescheduled': return 'accepted'` to the local action-level
`statusBucket()` (before the terminal `default → 'cancelled'`). A `rescheduled`
booking is now treated as active (provider actions available), mirroring
`bookingTab()`'s rescheduled→upcoming mapping. The local helper is **kept** (not
replaced by `lib/bookingStatus.ts`) because it is a finer-grained *action-state*
bucket — `bookingTab()` only produces coarse tab buckets (pending/upcoming/past/
cancelled) and cannot drive the per-status ActionButtons logic. cancelled/confirmed
remain UI aliases; pending/accepted/completed/no_show/cancellations behave as
before.

**Other duplicate status-bucket helpers found:** `lib/bookingStatus.ts`
`bookingTab()` (canonical tab bucket, used by both list screens) and this local
action-state `statusBucket()`. They serve different purposes and are not truly
redundant; no other duplicate bucketer exists. `app/(tabs)/business/analytics.tsx`
`statusStyle()` is a label/tone map, not a bucketer (left as-is; raw-label P3
deferred).

## 5. Analytics revenue fix + helper split (revised in review)
The original Batch 4A change narrowed the single shared helper `isEarning()` to
completed-only. That corrected revenue **but silently changed schedule
utilization**, which used the same helper. Fixed by **splitting one ambiguous
helper into two clearly-named ones** so a single function no longer carries two
business meanings (`app/(tabs)/business/analytics-utils.ts`):

- `isCompletedEarning(status)` → `['completed']`. **Realized revenue / earnings /
  client spend = completed only.**
- `isBookedForUtilization(status)` → `['completed','accepted','pending',
  'checked_in','arriving']`. **Schedule utilization / booked capacity**, preserving
  the exact pre-Batch-4A set — any booking occupying a slot consumes capacity, so
  this is intentionally broader than revenue and is a different concept.

`isEarning`/`DEV_EARNING_STATUSES` removed. Consumer re-audit and reassignment:

| Consumer | Computes | Concept | Now uses |
|---|---|---|---|
| `goal-detail.tsx:101` | monthly revenue vs goal | revenue | `isCompletedEarning` |
| `revenue-detail.tsx:103` | total revenue | revenue | `isCompletedEarning` |
| `client-intelligence.tsx:131` | client total spend | revenue | `isCompletedEarning` |
| `service-performance.tsx:106,112` | revenue per service | revenue | `isCompletedEarning` |
| `schedule-detail.tsx:185` | per-day revenue | revenue | `isCompletedEarning` |
| `schedule-detail.tsx:196` | booked hours / utilization | utilization | `isBookedForUtilization` |

Revenue is completed-only; utilization behavior is **unchanged** from before
Batch 4A. Stale `TODO: revert to completed only` markers adjacent to the changed
revenue lines were removed (that revert is now done); the utilization block's
misleading "revert to completed only" TODO was replaced with a note that its
breadth is intentional. No payment accounting added.

## Compatibility results
- **Contracts:** no-contract case still skips signing (genuine null); a real
  fetch failure now surfaces an error and does **not** skip signing; a failed
  signature insert now **cannot advance as signing success** (stays on a
  recoverable screen with retry/back); a successful signature insert follows the
  normal flow to `/book/confirmed`; provider list/editor no longer crash on a
  fetch error. WILL CONTINUE WORKING.
- **Payment copy:** accepted screen usable; no text falsely states a charge.
- **Booking status:** `rescheduled` now active; pending/accepted/completed/no_show/
  cancellations unchanged.
- **Analytics:** revenue/earnings/spend now reflect **completed only**;
  **schedule utilization/booked-hours behavior is unchanged** from before
  Batch 4A (broader booked set), now via a separate `isBookedForUtilization`
  helper. The two concepts no longer share one definition, so a future change to
  one cannot silently move the other.

## Validation
- `npx tsc --noEmit` → **exit 0**.
- ESLint (13 changed files): **0 errors, 0 new warnings**. All 16 warnings are
  pre-existing categories: `no-console` (used throughout the app), two
  pre-existing `no-unused-vars` (`tot`, `allServicesRevenue`), and three
  `react/no-unescaped-entities` on pre-existing copy lines ("You'll"/"won't") not
  added by this batch. The new error-view/CTA/error copy avoids unescaped entities.
- No `supabase/` (migration/RLS/trigger/schema) files changed.

## Test gaps
There are **no automated tests** in the repo for these paths (no test runner
configured for unit/component tests; Playwright config is for a different Next.js
app, not this Expo app). Verification was **static/behavioral**: type-checking,
lint, and code-path tracing of every changed function and caller. Not exercised at
runtime: the contract fail-open error view rendering, the signature-failure Alert,
and the analytics recomputation on-device. These should be manually smoke-tested in
Expo before release. No fake test coverage was added.

Specific paths to smoke-test manually: (a) force a `contract_signatures` insert
failure and confirm the flow stays on payment with a "Retry Signature" CTA, that
retry does **not** create a second booking row, and that a successful retry reaches
`/book/confirmed`; (b) confirm the analytics utilization/booked-hours figure is
unchanged versus pre-Batch-4A while revenue now counts completed only.

## Remaining Batch 4 findings (out of scope for 4A)
- **B4B:** add `feature_interest_count` as a migration (if social-proof wanted);
  optional `deposit_type` vocab unification.
- **B4C (product decisions):** payments (Stripe), signature-capture canvas +
  decline flow, whether contracts are mandatory to sign, verification admin flow,
  strict booking lifecycle ordering.
- **B4D (cleanup):** dormant/empty tables, dead select columns/branches.
  (The stale per-caller `TODO: revert to completed only` comments were removed in
  this revision. The F5C post-closeout ops — disposable project deletion,
  temporary GitHub secret removal, temporary PAT revocation — are **already
  complete** and are no longer carried as open items.)

## PASS / FAIL
**PASS** — all five approved targets fixed, app-only, typecheck clean, no new lint
errors, no DB/production change.
