# The Book — User Journeys (canonical acceptance intent)

**Status: Authoritative for QA acceptance intent**, with clearly marked current
implementation status and open decisions. When this doc and the code disagree about
*what exists*, the code wins; this doc is authoritative for *what should exist*. The
QA / Journey Reviewer reports mismatches rather than resolving them.

Status labels per journey: **IMPLEMENTED**, **PARTIAL**, **PARTIAL / PRODUCT
IMPLEMENTATION REQUIRED**, **PRODUCT DECISION REQUIRED**. Intentional placeholders are
listed explicitly so they are not mistaken for defects (cross-check
[BETA_SCOPE.md](BETA_SCOPE.md)).

---

## J0 — Browse without verification
- **Actor:** any user (verified or not).
- **Entry:** Discover.
- **Steps:** browse providers, profiles, services, reels, community.
- **Expected end state:** full browsing without identity verification.
- **Status:** IMPLEMENTED and **approved** — browsing is intentionally open; verification
  gates *transactions*, not browsing.

## J1 — New client auth/signup → Discover
- **Actor:** new user (no account).
- **Entry:** landing → sign up (email/phone OTP).
- **Steps:** enter contact → receive/verify OTP → role resolves → land on Discover.
- **Expected end state:** authenticated session; user on Discover (everyone lands on Discover per NAVIGATION.md).
- **Status:** IMPLEMENTED.
- **Intentional placeholders:** OTP delivery requires real email/SMS; a `__DEV__`-only bypass exists (non-prod).
- **Open decisions:** none.

## J2 — Discover → Provider profile → Service → Date/Time → (Message) → (Policy) → (Contract) → Booking request → Confirmation
- **Actor:** client.
- **Entry:** Discover feed provider card.
- **Steps:** provider profile → "Book Now" → select service → pick date/time (from provider availability) → optional message/photos → review policy (checkbox) → **contract gate** (shown only if the provider has a contract; a genuine "no contract" skips, a technical load error blocks with retry) → payment **request** screen (no charge) → submit → confirmation.
- **Expected end state:** one `bookings` row, `status='pending'`, `payment_status='unpaid'`; user on a confirmation screen truthfully stating no payment was taken.
- **Status:** IMPLEMENTED (as a *request* flow).
- **Intentional placeholders:** no payment/charge (BETA_SCOPE Payments); contract signature is a placeholder with `signature_url=null` (BETA_SCOPE Contracts).
- **Open decisions:** whether a real signature is required; whether confirmation should link forward to the created booking; atomicity of booking-vs-signature writes (**PRODUCT DECISION / ENGINEERING REQUIRED**).

## J3 — Client booking lifecycle
- **Actor:** client.
- **Entry:** Bookings tab → booking detail.
- **Steps:** view status; cancel where allowed; message provider; see status transitions reflected.
- **Expected end state:** status accurately reflects reality; client can cancel only where permitted (server-enforced, SB3b).
- **Status:** PARTIAL.
- **Intentional placeholders:** payment/deposit states are display-only.
- **Open decisions:** strict lifecycle ordering; server-authoritative `payment_amount`.

## J4 — Provider booking lifecycle
- **Actor:** provider (business owner).
- **Entry:** Business → Bookings (or Bookings tab → My Business) → booking detail.
- **Steps:** accept / decline; complete; mark no-show; message client. Server enforces which fields/status a provider may set (SB3b).
- **Expected end state:** status transitions valid per role; completion drives review eligibility.
- **Status:** PARTIAL (write-integrity enforced; product semantics partly open).
- **Open decisions:** strict lifecycle ordering.

## J5 — Booking → Message counterpart
- **Actor:** client or provider.
- **Entry:** booking detail → message.
- **Steps:** open/create the conversation attached to the booking → send/read messages.
- **Expected end state:** one conversation per booking context; single inbox (NAVIGATION.md).
- **Status:** IMPLEMENTED.

## J6 — Completed booking → two-sided Review
- **Actor:** client and provider (each reviews the other).
- **Entry:** post-booking review flow after completion.
- **Steps:** submit rating/review (blind) → reveal applies.
- **Reveal — IMPLEMENTATION MISMATCH:**
  - **CURRENT IMPLEMENTATION:** revealed when the **counterpart review exists** OR the booking `completed_at` is **≥ 7 days** ago (`lib/reviews.ts`; DB `provider_review_revealed`).
  - **APPROVED PRODUCT INTENT:** reveal on **counterpart submission**, otherwise a timed reveal of **~1 hour** (the 7-day timing is explicitly rejected). Exact mechanics may need final design, but the target is ~1 hour. **Not UNDECIDED** — a decided intent the code has not met. (Do not change review code here.)
- **Approved core rule:** reviews may **only** come from **completed transactions through The Book** — no random/friend/competitor/open public reviews. Both client and provider reputation matter (two distinct reputation contexts on one verified identity).
- **Status:** IMPLEMENTED (transaction-gated, blind, two-sided) with a **reveal-timing mismatch** to be fixed by engineering (see QA classification in the implementation record).
- **Open decisions:** free-text vs structured review input (PRODUCT DIRECTION); whether reviews additionally require identity-verified parties (ties to J9/J10). *(Reveal timing is NOT open — it is a decided target with a pending implementation fix.)*

## J7 — Provider onboarding → Go Live
- **Actor:** user becoming a provider.
- **Entry:** "Become a provider" funnel → onboarding steps.
- **Steps:** profile → services → availability → policy → media → go live (writes provider + related rows). Signed-out preview is `__DEV__`-only; production requires a session.
- **Expected end state:** an active provider business reachable from the shared shell.
- **Status:** IMPLEMENTED.
- **Intentional placeholders:** `identity_verified` is inserted `false` (verification is a separate journey, J9/J10).

## J8 — Returning client → Rebook
- **Actor:** returning client.
- **Entry:** past booking / provider profile.
- **Steps:** re-enter J2 for the same provider/service.
- **Expected end state:** a new pending booking request.
- **Status:** IMPLEMENTED (via J2).

## J9 — Client Identity Verification  ·  **PARTIAL / PRODUCT IMPLEMENTATION REQUIRED**
- **Actor:** client.
- **Entry (intended):** verification initiation from account/Me, **or** triggered by the transaction gate (J11).
- **Steps (intended):** client → verification initiation → identity matched to a real government-issued ID via an approved provider/process → verification result → verified account.
- **Definition (approved, keep simple):** "identity verified" = the person's identity matched to a real government-issued identity document through an approved identity-verification process/provider. **Do not** yet expand into background checks, professional licenses, business verification, or criminal-history checks.
- **Current status:** `identity_verified`-style state exists; **no client-facing initiation flow, no approved process wired, transactions not yet gated on it.** Core safety requirement, not cosmetic. Future: prefer a specialist provider; avoid storing raw ID documents.
- **Open decisions:** the provider/process, stored evidence shape, and which trust claims the UI may show at each level — **PRODUCT DECISION / TRUST-SAFETY DEFINITION REQUIRED.**

## J10 — Provider Identity Verification  ·  **PARTIAL / PRODUCT IMPLEMENTATION REQUIRED**
- **Actor:** provider.
- **Entry (intended):** verification initiation from Business/onboarding, **or** the transaction gate (J11).
- **Steps / definition:** same government-ID-match definition as J9; result → verified provider.
- **Current status:** `identity_verified` exists and is owner-immutable (admin/service-role only); **no provider-facing initiation flow, no approved process wired.** The profile can render an "ID Verified" badge purely from the flag.
- **QA rule:** lack of a self-service flow alone is **not** proof the badge is fraudulent; an admin/approved-process-managed state may be legitimate; an admin-set flag is **not automatically sufficient** evidence either. Undocumented process → **QUESTION / UNKNOWN — PRODUCT DECISION / TRUST-SAFETY DEFINITION REQUIRED**; flag any UI claim implying more than the actual process supports.
- **Open decisions:** same as J9.

## J11 — Attempt transaction while unverified → verification gate  ·  **PARTIAL (beta gate live; real verification not built)**
- **Actor:** client (provider-side gate deferred).
- **Entry:** **Book Now** on a provider profile (start of the booking journey).
- **Steps — CURRENT IMPLEMENTATION (beta):** Book Now → centralized verification gate (`lib/verificationGate.ts`) → because client verification state is not modeled, the gate resolves to **`unverified_beta_bypass`** → a **trust/education notice** (`app/book/verification.tsx`) is shown once per booking attempt → **Continue Booking** → `/book/service` (existing flow unchanged). The notice **changes no verification state** (no `identity_verified=true`, no fake row, no "Verified" success). It is acknowledged in `bookingStore.verificationNoticeAcknowledged`, which is **reset at the start of each booking attempt** (`setProvider`, on Book Now) and also cleared on `reset()` — so abandoning one attempt and starting a new one re-shows the notice (per-attempt, not per-session).
- **Steps — INTENDED (future `required` mode):** attempt transaction → if not verified, a **hard** verification gate → verify (J9/J10, both sides) → continue. `resolveVerificationGate(..., 'required')` already models `unverified_hard_block` without reshaping the journey.
- **Expected end state (intended):** transactions require an identity-verified **client AND provider**; unverified identities are materially prevented from transacting.
- **Current status:** the **beta education gate is live**; **real verification and hard enforcement are not built**; bookings can still be created without verification (intentional beta bypass). Provider-side gate is deferred.
- **Open decisions:** the verification vendor/process, per-side sequencing, and any grace period. The placeholder "**14-day to verify**" copy is **UNDECIDED / PLACEHOLDER** and is **not** used by this gate — QA must flag any UI presenting it as established policy.

## J12 — Verified client → home-based / mobile (house-call) service booking  ·  **RESEARCH / PRODUCT DESIGN REQUIRED**
- **Actor:** verified client + home-based/mobile provider.
- **Entry:** J2 for a provider whose delivery model is home-based or mobile.
- **Approved principle:** unverified clients must **not** be able to transact/book a home-based/house-call provider.
- **Current status:** delivery-model-specific safety (address disclosure timing, masked contact, check-in/out, safety contact, incident reporting) is **not built**; no mechanism chosen. A liability waiver is **not** a substitute for real safety controls.
- **Open decisions:** the home/house-call safety mechanism set — **RESEARCH / PRODUCT DESIGN REQUIRED.**

## J13 — Pre-booking message request → provider acceptance → conversation  ·  **PRODUCT DIRECTION**
- **Actor:** client (or prospective client) and provider.
- **Entry (intended):** contact a provider before booking.
- **Steps (intended):** initial contact/request → provider receives a message **request** → provider may accept → accepted conversation appears in the primary inbox.
- **Current status:** pre-booking messaging is desired and must not be prohibited; the **request/accept** model itself is **not yet built** (current messaging is one inbox tied to bookings).
- **Open decisions:** exact request/accept implementation and inbox surfacing.

## J14 — Provider chooses policy / contract behavior  ·  **PARTIAL / UNDECIDED**
- **Actor:** provider.
- **Entry:** onboarding policy step / Business → Contracts.
- **Steps (intended):** provider (A) uploads/writes their own contract/policy, **or** (B) selects a standardized The Book policy tier (~3 envisioned), **or** (C) falls back to a standard platform policy if none is provided.
- **Current status:** provider policies + a provider-side contract exist (PARTIAL); standardized tiers and mandatory-by-category rules are **UNDECIDED / LEGAL + PRODUCT REVIEW REQUIRED**; signature capture is PLACEHOLDER.
- **Open decisions:** the standardized tiers, legal review, and whether contracts are mandatory for specific categories.
