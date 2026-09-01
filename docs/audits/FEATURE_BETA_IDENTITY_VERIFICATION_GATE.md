# Feature — Beta Identity Verification Gate Foundation

**Result: PASS (pending QA sign-off).** The first product feature after the
foundation phase: a centralized, education-only identity-verification **gate** at the
start of the client booking journey. It is **not** a real verification integration —
no vendor, no ID collection, no document storage, no state mutation. Unverified beta
clients see a warm trust notice and continue booking normally.

## Product purpose
The Book is trust-first: browse freely, but real transactions will eventually require
both parties to be identity-verified (government-ID match via an approved provider).
Real verification is **not ready for beta**, so this feature introduces the *gate seam*
and a trust-education screen now — placed early in the journey so future real
verification won't surprise users after they've picked a service/date — while letting
beta bookings proceed.

## Current vs future verification behavior
- **Current (beta, `beta-notice` mode):** verified → proceed; unverified → show the
  trust notice → Continue Booking → proceed. Changes no verification state.
- **Future (`required` mode, not built):** unverified → `unverified_hard_block`;
  transaction requires **client AND provider** verified. The enum/helper already models
  this so the booking journey needn't be reshaped later.

## Exact gate placement
`Provider Profile → Book Now → verification gate → Service Selection`
(`app/providers/[id].tsx` `handleBookNow`, line ~275). The gate runs **after**
`setProvider(...)` (so provider booking context is preserved) and **before**
`/book/service`.

## Centralized gate architecture (`lib/verificationGate.ts`)
One source of truth — no scattered `if (!identity_verified)`:
- `VerificationEnforcementMode = 'beta-notice' | 'required'`; `VERIFICATION_ENFORCEMENT_MODE = 'beta-notice'`.
- `VerificationGateState = 'verified' | 'unverified_beta_bypass' | 'unverified_hard_block'`.
- `resolveVerificationGate(verified, mode)` — strictly boolean; unknown/missing state is **never** `verified`.
- `canProceedWithTransaction(state)` — verified + beta-bypass proceed; hard-block does not.
- `requiresVerificationNotice(state)` — only `unverified_beta_bypass` shows the notice.
- `isClientIdentityVerified()` — returns `false` (see identity source); single line to change when client state exists.

## Identity state source (investigated)
- **Providers:** `providers.identity_verified` (owner-immutable; admin/service-role only).
- **Clients:** **no verification column exists** — the `clients` table is `id, name, notes, created_at, avatar_url, neighborhood`. Client verification state is **not modeled**.
- **Decision (per spec §7):** do **not** add a speculative migration for a beta notice. The client gate treats missing client state as **`UNVERIFIED_BETA_BYPASS`** — the truthful current behavior. `isClientIdentityVerified()` returns `false` accordingly (unknown never resolves to verified).

## Beta bypass behavior
`beta-notice` mode + no client verification state ⇒ every client resolves to
`unverified_beta_bypass` ⇒ the notice shows (once per attempt) ⇒ Continue Booking →
`/book/service`. Explicit, not silent: the bypass is a named enum state, and the notice
is shown rather than skipped. No verification state is set.

## Acknowledgement / reset (do not nag) — per booking attempt
`bookingStore.verificationNoticeAcknowledged` (default `false`), set `true` by Continue
Booking. It is **reset at the start of each booking attempt** — `setProvider` (called on
Book Now) resets it to `false` while preserving provider context — and is also cleared by
`reset()` on a completed booking. `handleBookNow` reads the acknowledgement **fresh**
(`useBookingStore.getState()`) after `setProvider`, avoiding a stale render snapshot.

Result: a new Book Now (even after abandoning a prior attempt) re-shows the notice;
in-attempt state changes (service/date/time/message) do **not** clear it; no long-term
"never show again" persistence and no cross-session persistence. This is the **per-active-
booking-attempt** lifecycle (correcting the earlier once-per-session-until-completion
behavior — see QA-UX-001 below).

## Copy (approved, on `app/book/verification.tsx`)
- Status badge: **"Identity verification coming soon"**
- Headline: **"Built on real people."**
- Body: "The Book is being built around trust." / "Before real transactions go live, both clients and providers will verify their identity so everyone knows they're connecting with a real person." / "For beta, identity verification is still being finalized, so you can continue booking for now." / "Thanks for helping us build a safer community from day one."
- Primary CTA: **"Continue Booking"** · Secondary: **"Not now"** (back)
No "Verify now", no fake form/upload/scan, no "Verified" success, no claim that ID was checked or that the user is protected/guaranteed. Warm, non-accusatory, safety-first.

## Navigation behavior
- Header chevron-left → `router.back()` (to provider profile) — visible exit (NAVIGATION.md).
- "Continue Booking" → `router.replace('/book/service')` (replace so backing out of service doesn't re-enter the notice).
- "Not now" → `router.back()`.
- Route auto-registers under `app/book/_layout.tsx` (Stack, no explicit screen list); `/book/service` guards on `providerId` (set before navigation).

## Routes / files changed
- **New:** `lib/verificationGate.ts`, `app/book/verification.tsx`,
  `__tests__/lib/verificationGate.test.ts`, `__tests__/store/bookingStore.test.ts`,
  this report.
- **Modified:** `store/bookingStore.ts` (ack state + reset), `app/providers/[id].tsx`
  (`handleBookNow` gate), `docs/product/BETA_SCOPE.md`, `docs/product/USER_JOURNEYS.md` (J11).

## Confirmation: no verification state mutated
Continue Booking calls only `setVerificationNoticeAcknowledged(true)` +
`router.replace('/book/service')`. It does **not** set `identity_verified`, write any
row, or show a "Verified" state. No Supabase write anywhere in the feature.

## Discovered bypass / deep-link paths
- **`app/reviews/all/[id].tsx:87-90`** — a second "Book Now" (see-all-reviews page)
  does `setProvider(...)` → `router.push('/book/service')` directly, **bypassing the
  gate**. Reported, **not patched** (per §12: Book Now on the provider profile is the
  scoped gate entry for this batch; the centralized helper makes gating this a trivial
  follow-up — reuse the same three lines). **Recommended owner: Implementation Engineer
  (follow-up).**
- `app/index.tsx:160,241` — DEV sitemap links to `/book/service` (`__DEV__`-only; not a
  real user path).
- Direct deep-link to `/book/service` bypasses the gate by design (no global route guard
  added; §12 said not to rewrite navigation). The centralized helper is the seam to add a
  transaction-entry guard later.

## Tests
- `__tests__/lib/verificationGate.test.ts` (6): verified→proceed/no-notice;
  unverified+beta→bypass+notice; unverified+required→hard-block/no-proceed;
  unknown state never verified; default mode = beta-notice; `isClientIdentityVerified()` false.
- `__tests__/store/bookingStore.test.ts` (3): ack defaults off; can be set; `reset()` clears it.
- No network/Supabase tests added.
- **Suite:** 15 suites / 82 tests (was 13/73; +2 suites, +9 tests). Typecheck exit 0;
  `lint:ci` exit 0 (210, no new debt).

## Future real-verification integration seam
When a verification vendor is chosen (separate research batch): (1) add client
verification state (schema + `isClientIdentityVerified()` reads it), (2) implement the
real verification flow behind `unverified_hard_block`/`required`, (3) flip
`VERIFICATION_ENFORCEMENT_MODE` to `required` and compose `clientVerified &&
providerVerified`. The booking journey shape and gate placement stay the same. No UI is
coupled to any vendor.

## Limitations
- Client verification is not modeled, so a "verified client skips notice" path cannot be
  exercised at runtime yet (helper-level only). Documented, not faked.
- The gate covers the provider-profile Book Now only; the reviews-page Book Now and
  direct deep-links are not yet gated (reported above).

## QA Agent 1 review
Agent 1 (QA / Journey Reviewer) was run **read-only** against this feature (QA feature
acceptance + QA review journey J11). **Verdict: PASS WITH FINDINGS.** It confirmed:
browsing stays ungated; the beta bypass self-identifies as not-yet-live; Continue Booking
mutates **no** verification state and writes nothing; provider context is preserved;
visible exits (no trap); notice suppressed on re-entry within an attempt; no "14-day"
copy; no material BETA_SCOPE/USER_JOURNEYS mismatch. Findings are **advisory and NOT
fixed in this batch** (per the QA-agent governance — it never fixes its own findings):

- **QA-JOURNEY-001 · MEDIUM · CONFIRMED** — the gate is enforced only in provider-profile
  `handleBookNow`, not at the transaction boundary. Two rebook entries push straight to
  `/book/service`, bypassing the gate: reviews-list Rebook (`app/reviews/all/[id].tsx:89-90`)
  and post-booking Rebook (`app/post-booking/review.tsx:325`, which doesn't even call
  `setProvider`). Beta impact: a rebooking client skips the notice (low harm — bypass is
  allowed anyway); structural risk: these paths would be **real holes** under future
  `required` mode. Owner: Implementation Engineer (follow-up). *(Matches the bypass this
  report already discovered; intentionally out of this batch's scope per §12.)*
- **QA-TRUTH-001 · LOW · CONFIRMED** — the present-tense headline "Built on real people."
  could, read alone, imply identities are already verified; mitigated by future-tense body
  copy. This is the **approved beta copy** (spec §4), so it is left as-is and surfaced for a
  product/copy decision rather than changed unilaterally. Owner: Product Decision.
- **QA-UX-001 · LOW · CONFIRMED → RESOLVED BEFORE COMMIT** — original finding:
  `verificationNoticeAcknowledged` cleared only via `reset()` (on a completed booking), so an
  acknowledged-then-abandoned attempt would not re-show the notice on a new attempt
  (once-per-session-until-completion, not strictly once-per-attempt). **Correction applied:**
  `setProvider` (called at the start of every Book Now attempt) now resets the acknowledgement
  to `false` while preserving provider context, and `handleBookNow` reads the flag fresh via
  `useBookingStore.getState()`. A new booking attempt is now eligible to re-show the notice;
  in-attempt state changes do not clear it; completed-booking `reset()` still clears it.
  Covered by new store tests. This preserves the intended workflow: **Agent 1 found the
  issue → the product/architecture review accepted it → the implementation corrected it →
  revalidated** (Agent 1's historical review output is unchanged and still records the
  finding as originally reported).

Full QA output is returned separately to the reviewer.

## PASS / FAIL
**PASS** — centralized gate, truthful beta bypass, no verification state mutated, warm
non-overpromising copy, visible exit, tests green, no migration/RLS/storage/CI/EAS/Sentry
changes. Pending QA sign-off + product decision on the reviews-page bypass.
