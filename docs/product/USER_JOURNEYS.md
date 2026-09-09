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

## J1b — New client onboarding (profile → preferences → photo → preview → Discover)  ·  **IMPLEMENTED**
- **Actor:** a newly authenticated user who chose the client path.
- **Entry:** `app/path-selection.tsx` → "I'm here to book" → `app/onboarding/client/`.
- **Steps (current, four screens):**
  1. **Who you are** (`index.tsx`) — first name, last name, neighborhood (via `NeighborhoodPicker`), short bio. Held in `useClientStore`; nothing is written yet.
  2. **Your area** (`preferences.tsx`) — the neighborhood picker, and nothing else. It carried an interests grid and a "show mobile providers" switch until PD-079 removed both as data nothing read.
  3. **Photo** (`uploads.tsx`) — optional avatar; skippable.
  4. **Preview** (`preview.tsx`) — shows the profile as assembled, then **one write on continue**: the avatar is uploaded (when one was picked) and a single `clients` upsert on `id` persists `name`, `notes`, `neighborhood` and `avatar_url`. The session role is then re-resolved so it settles as `client`, and the user lands on Discover.
- **Expected end state:** exactly one `clients` row for the user; the session resolves as a client; the user is on Discover (per NAVIGATION.md, everyone lands on Discover).
- **Nothing is persisted before the last step**, so abandoning onboarding leaves no partial profile — and re-entering starts clean rather than resuming a half-written row.
- **Intentional placeholders:** none in the write path.
- **Changed by Correction 3 (item A) and the PR #74 PM pass (PD-079):** `preferences.tsx` no longer collects anything nothing reads. The **notification preferences section was removed** (three switches collected and then discarded, for a delivery channel that does not exist), and so were the **interests grid** and the **"Show mobile providers"** switch — the grid sat under the promise *"We'll surface the best providers for the things you care about most"* while being written to no store and no column, and read by nothing. The step now collects only the **neighborhood**, which is genuinely persisted and genuinely consumed: it is what the Near You lane reads. No recommendation engine is to be built to justify the removed field.
- **Open decisions:** whether interests should influence Discover ordering (they do not today — see the discovery lanes in J2a); whether a client profile should ever be publicly visible beyond `clients_public` (name + avatar).

## J2 — Discover → Provider profile → Service → Date/Time → (Message) → (Policy) → **Draft request** → (Contract) → Submit → Confirmation
- **Actor:** client.
- **Entry:** Discover feed provider card (or a lane card — see J2a).
- **Steps:** provider profile → "Book Now" → select service → pick date/time (from provider availability) → optional message/photos → review policy (checkbox) → **the booking row is created as a DRAFT** → **contract gate** (shown only if the provider has a contract; a genuine "no contract" skips, a technical load error blocks with retry) → confirm screen → **Send Booking Request** → confirmation.
- **Expected end state:** ONE `bookings` row with `submitted_at` set (server-stamped) and `expires_at` derived from it; `status='pending'`, `payment_status='unpaid'`; the client on a confirmation screen truthfully stating no payment was taken, whose PRIMARY action is **View Request**.
- **Status:** IMPLEMENTED (as a *request* flow).

**RESHAPED BY PRE-SESSION-8 CORRECTION 3 (items B, D, H, I, J, K, N).** What changed and why:

- **The booking row now exists BEFORE the contract step (item J).** It is inserted as a DRAFT — `submitted_at IS NULL` — by `lib/bookingDraft.ts` when the client reaches the contract screen. A draft is **invisible to the provider**: the provider SELECT policy requires `submitted_at IS NOT NULL`, so an abandoned flow leaves a private row, not a request anyone must answer.
- **Contract access is scoped to that booking (item J).** `contract_for_booking(p_booking_id)` replaces `provider_contract_for_booking(p_provider_id)`, which has been **dropped**. The old function returned any approved provider's contract text to any authenticated caller; the new one returns it only to the client holding that booking with that provider. There is no standing read path into other people's contract terms.
- **One intent = one request (item K).** A partial unique index (`bookings_one_draft_per_pair`) allows at most one draft per (client, provider), and the client resumes it by lookup rather than inserting again. A dropped network, a failed signature, a back-out or a double tap all continue the SAME request. The signature is written **before** submission, so a request the provider can see is never one whose signature failed to save.
- **The contract must be OPENED before it can be signed (item I).** For a PDF that means tapping through to the document; for an inline agreement it means scrolling to the end. The screen states plainly that The Book records that the agreement was opened and agreed to, and **does not verify that every word was read** — the ticked box is the client's own statement, not something the app proved.
- **Requests expire at 72 hours, server-side (item B).** `expires_at = LEAST(submitted_at + 72 hours, appointment_time)`, never earlier than `submitted_at`. Computed by the write-integrity trigger and never client-supplied. Past it, the provider can no longer ACCEPT (`PT425`); declining stays available, and the row is **not deleted and not hidden** — it stays in both sides' history. `booking_request_urgency()` derives `draft | none | nudge (24h) | urgent (48h) | expired` per read; nothing flips a row when the deadline passes. **It is a read state, not a message: no push, device or email channel exists, so no surface built on it may claim a reminder was delivered.**
- **A de-approved provider takes no NEW bookings (item H).** The insert is refused with `PT426`; the client is told "Not currently available for new bookings", which is availability and not a judgement. **The PROVIDER is told too (PD-078)**, on their own dashboard: *"Your business is not currently available for new bookings. Your existing bookings, messages, and history are still available."* — not dismissable, no reason given, and never equating marketplace approval with identity verification. All existing bookings, messages and history with that provider are untouched and still reachable.
- **Payment copy is the approved wording (item D):** "In-app payments aren't available during beta. Payment is handled directly with your provider for now."
- **The confirmation's primary action is View Request (item N),** replacing "Back to Home" as the only exit. It opens the CLIENT's own booking detail (`/bookings/[id]`) — not `/bookings/request/[id]`, which is the provider's request screen and tells a client "This view is only available to the provider".
- **A DRAFT IS NEVER PRESENTED AS A SENT REQUEST.** It is excluded from the client's Bookings tab, the Care list, their profile booking count and the derived notifications; it cannot open a conversation, cannot reverse a provider's decline, and does not disclose the client's identity to a provider who cannot see it. A cancelled draft frees the one-draft slot rather than locking the client out of that provider. `__tests__/guards/bookingLifecycleReads.test.ts` fails on a client booking read that forgets this.

- **Intentional placeholders:** no payment/charge (BETA_SCOPE Payments); contract signature is still a placeholder with `signature_url=null` (BETA_SCOPE Contracts).
- **Open decisions:** whether a real signature is required. **Resolved by Correction 3:** the confirmation now links forward to the created booking (item N), and booking-vs-signature ordering is settled — the signature is written against the draft before the request is sent, so the two can no longer disagree.
- **The client IS told the window (PD-077):** *"Your provider has up to 72 hours to respond. You can check this request anytime."* — on the confirmation screen and again on the request itself. It says where to look rather than promising a notification, because no push, email or SMS channel exists.
- **PM RULING on the NULL `appointment_time` case (2026-09-09):** the rule is unchanged. Where an authoritative timestamp exists the clamp uses it; where there is genuinely none, 72 hours stands. `requested_date` is a bare DATE and `requested_time` a display string, so deriving a deadline from them would mean inventing a time-of-day and a timezone — refused. Recorded as **OQ-072**, not resolved in code. The gap is narrow: the date/time step will not advance without both, so a normal request carries an `appointment_time`.

## J2a — Discover feed: beta discovery lanes  ·  **IMPLEMENTED (Correction 3, items S and T)**
- **Actor:** any user on Discover, unfiltered by category.
- **Lanes shown, each with its RULE printed beneath its name:** Near You (same neighborhood, else same city), Available Soon (the server says they published hours for today and today is not blocked), New to The Book (joined in the last 30 days), Popular Near You (ranked by completed bookings, then client reviews), Worth a Look (everyone the rows above did not show).
- **THE FAIRNESS RULE (item S), which outranks every lane:** a provider is **never** placed lower in MARKETPLACE discovery because they do not create social content. Not by posts, reels, followers, likes, views or engagement. Reels ranking and marketplace ranking are two different systems; `lib/discovery.ts` cannot see a content signal — its input type has no field for one — and `__tests__/lib/discovery.test.ts` asserts both the type and the behaviour.
- **No percentage quotas** (item T). Each lane is a filter and a sort a person can read and check against a provider's own row. Ties break on a hashed, stable pseudo-random rank so neither alphabetical order nor signup order confers a durable advantage.
- **The lanes never replace the feed.** They sit above the complete, paginated grid, so a provider who does not fit a capped row is not thereby hidden. `providersWithNoLane()` is the checkable form of that guarantee.
- **The lanes read their own unranked pool**, not the feed's first page: page one is ordered by feature flag and rating, so computing "New to The Book" from it excluded new providers systematically. Lane membership also does not shift as the grid pages.
- **Open decisions:** whether client interests (J1b) should influence lane membership — they do not today.

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
- **Reveal — APPROVED AND IMPLEMENTED (no mismatch):**
  - **APPROVED PRODUCT MODEL:** blind until **both sides submit** (reveal immediately), otherwise submitted reviews reveal when the **7-day window closes**, measured from the server-authoritative `completed_at`. Late submissions are blocked; `under_review` blocks submission and holds reveal.
  - **CURRENT IMPLEMENTATION:** matches — DB-authoritative (`review_eligible` / `provider_review_revealed` / `client_review_revealed`, migration `20260902000000`).
  - **No ~1-hour fallback.** *(Historical note: an earlier ~1-hour one-sided reveal concept was reconsidered and **rejected** — a one-sided early reveal lets the not-yet-revealed party see and retaliate, defeating blind review. See `BETA_SCOPE.md` and `REVIEWS_MODEL.md`. Do **not** report the 7-day timing as an implementation mismatch.)*
- **Approved core rule:** reviews may **only** come from **completed transactions through The Book** — no random/friend/competitor/open public reviews. Both client and provider reputation matter (two distinct reputation contexts on one verified identity).
- **`completed → no_show` is an ILLEGAL transition** (decided): `completed` and `no_show` are
  alternative outcomes, enforced at the DB write boundary (migration `20260904000000`). An
  administrative correction workflow is a later product/ops concern and is not built.
- **A rating-only review is valid** in both directions — stars alone submit; text and tags are optional.
- **`no_show` is NOT reviewable:** a no-show is a recorded booking event but not a completed service experience, so it produces **no service-quality (1–5 star) review flow** in either direction. The event is preserved on the booking; conduct/reliability reputation is a later phase (`REVIEWS_MODEL.md`).
- **Status:** IMPLEMENTED (transaction-gated, blind, two-sided, 7-day window).
- **Open decisions:** free-text vs structured review input (PRODUCT DIRECTION); whether reviews additionally require identity-verified parties (ties to J9/J10). *(Reveal timing is NOT open and NOT a mismatch — it is decided and implemented.)*

## J7 — Provider onboarding → **Review your business** → Go Live
- **Actor:** user becoming a provider.
- **Entry:** "Become a provider" funnel → onboarding steps.
- **Steps (current, seven):** profile → portfolio → reels → services → availability → policy → **review** → go live (writes provider + related rows). Signed-out preview is `__DEV__`-only; production requires a session.
- **Expected end state:** an active provider business reachable from the shared shell.
- **Status:** IMPLEMENTED.

**CHANGED BY PRE-SESSION-8 CORRECTION 3 (item Y):**
- **A final review page is now required before Go Live** (`app/onboarding/provider/review.tsx`): "Review your business" / "Make sure everything looks right before your profile goes live." It lists what has actually been set — profile, category, services, where they work, hours, public content, policy — each linking back to the step that owns it. Go Live is a PUBLISHING act, and the eight screens before it each forgot the last.
- **It checks; it does not gate.** The only hard preconditions remain one service and a profile photo. Anything missing is reported as a CONSEQUENCE in the provider's own words ("clients can't book you until you add hours"), not as an error.
- **The payout step was removed from the required path, and the screen was DELETED.** It was "Step 7 of 8", with a Continue button and no skip, for a capability that does not exist in beta — so every new provider had to walk past an apology. The Business dashboard's Payouts entry goes to `app/(tabs)/business/payouts.tsx`, which carries the same explanation; keeping a second copy in the onboarding tree would have left two files answering one product question. Onboarding does not require analytics, payouts, reels or advanced settings.
- **Minimum onboarding, stated:** basic profile, category, at least one service, location / service mode, basic availability, enough public content to be worth looking at, and the required policy/contract. Nothing else.

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
- **Current status:** `identity_verified` exists and is owner-immutable (admin/service-role only); **no provider-facing initiation flow, no approved process wired.** The profile **no longer renders any trust claim from the flag** — Pre-Beta Correction 1 (2026-09-08) removed the "ID Verified" badge and the verified check-mark, because a badge sourced from a flag no user can earn asserts a completed check that never happened. The flag stays plumbed (the column is real) and renders nothing. **No replacement label was invented**: whether an approved beta provider gets a visible trust label is a Founder decision, open under OQ-035.
- **QA rule:** lack of a self-service flow alone is **not** proof the badge is fraudulent; an admin/approved-process-managed state may be legitimate; an admin-set flag is **not automatically sufficient** evidence either. Undocumented process → **QUESTION / UNKNOWN — PRODUCT DECISION / TRUST-SAFETY DEFINITION REQUIRED**; flag any UI claim implying more than the actual process supports.
- **Open decisions:** same as J9.

## J11 — Attempt transaction while unverified → verification gate  ·  **PARTIAL (beta gate live; real verification not built)**
- **Actor:** client (provider-side gate deferred).
- **Entry:** **Book Now** on a provider profile (start of the booking journey).
- **Steps — CURRENT IMPLEMENTATION (beta):** Book Now → centralized verification gate (`lib/verificationGate.ts`) → because client verification state is not modeled, the gate resolves to **`unverified_beta_bypass`** → a **trust/education notice** (`app/book/verification.tsx`) is shown once per booking attempt → **Continue Booking** → `/book/service` (existing flow unchanged). The notice **changes no verification state** (no `identity_verified=true`, no fake row, no "Verified" success). It is acknowledged in `bookingStore.verificationNoticeAcknowledged`, which is **reset at the start of each booking attempt** (`setProvider`, on Book Now) and also cleared on `reset()` — so abandoning one attempt and starting a new one re-shows the notice (per-attempt, not per-session).
- **Steps — INTENDED (future `required` mode):** attempt transaction → if not verified, a **hard** verification gate → verify (J9/J10, both sides) → continue. `resolveVerificationGate(..., 'required')` already models `unverified_hard_block` without reshaping the journey.
- **Expected end state (intended):** transactions require an identity-verified **client AND provider**; unverified identities are materially prevented from transacting.
- **Current status:** the **beta education gate is live**; **real verification and hard enforcement are not built**; bookings can still be created without verification (intentional beta bypass). Provider-side gate is deferred.
- **Open decisions:** the verification vendor/process, per-side sequencing, and any grace period. The placeholder "**14-day to verify**" copy was **removed from the product** by Pre-Beta Correction 1 (2026-09-08) — it shipped in *provider go-live*, never in this gate. Whether a grace period should exist at all remains **UNDECIDED** (OQ-036); QA must flag any UI that reintroduces a verification timeframe, and `__tests__/guards/betaClaimsAbsent.test.ts` fails on one.

## J12 — Verified client → home-based / mobile (house-call) service booking  ·  **RESEARCH / PRODUCT DESIGN REQUIRED**
- **Actor:** verified client + home-based/mobile provider.
- **Entry:** J2 for a provider whose delivery model is home-based or mobile.
- **Approved principle:** unverified clients must **not** be able to transact/book a home-based/house-call provider.
- **Current status:** delivery-model-specific safety (address disclosure timing, masked contact, check-in/out, safety contact, incident reporting) is **not built**; no mechanism chosen. A liability waiver is **not** a substitute for real safety controls.
- **Open decisions:** the home/house-call safety mechanism set — **RESEARCH / PRODUCT DESIGN REQUIRED.**

## J13 — Pre-booking message request → provider acceptance → conversation  ·  **IMPLEMENTED (beta)**
- **Actor:** client → provider.
- **Entry:** ANY client-initiated pre-booking contact routes through the same centralized entry (`openMessageEntry` → `messageEntryAction`): the provider-profile **Message** button (`app/providers/[id].tsx`) **and** the booking **"Message them directly"** path when a provider has no availability (`app/book/datetime.tsx`). It opens an existing open/pending conversation, or composes a new request (`app/messages/new.tsx`) when none exists or the last one was declined — no entry point creates a free/ungated chat.
- **Steps (current):** client composes **one** initial message → **Send Message Request** (`sendPrebookingRequest`) creates a `pending` conversation + first message → the client sees a "Message request sent" thread with **no composer** → the provider sees it under the **Requests** filter in Messages and opens the thread to **Accept** or **Decline** (`setRequestStatus`).
  - **Accept** → `request_status='accepted'`; the same conversation becomes a normal two-way chat in the main inbox (no duplicate).
  - **Decline** → `request_status='declined'`; soft-closed; client sees "This provider isn't available to chat right now."; the client may **re-request** later (re-opens the same conversation), and duplicate active pending requests are prevented (one conversation per pair).
  - **Booking supersedes the request** → once a real booking exists for the pair, `getOrCreateConversation` attaches it to the **same** conversation and opens it for normal two-way messaging, regardless of a prior `pending`/`declined` state (no duplicate thread). An existing booking_id is never overwritten by a later booking; the thread is reused.
- **Server enforcement:** migration `20260901000000` (triggers + RLS): a client's non-booking contact is forced to a `pending` request server-side (a client can neither insert a null-status open chat nor buy one with a fake `booking_id` — booking_id is ownership-checked against the pair on both insert and attach); one initial client message while pending — with **server-stamped timestamps** (`request_opened_at` and `messages.created_at` are set server-side via `clock_timestamp()`, so a client cannot backdate a message or future-date the request window to bypass the one-message limit; a re-request opens a fresh server-timed cycle); no provider message while pending; no messages after decline; only the provider accepts/declines; only the client re-opens a declined request. Attaching a real booking (null→value, validated) opens the conversation. Booking conversations are unaffected. (DB role-simulation suite validated 14 authorization + 6 booking-supersession/insert-gate + 1 fake-booking-insert + 4 timestamp-hardening = 25 checks; see the feature audit.)
- **Expected end state:** an accepted request is a normal conversation; a declined one is closed with soft copy; a request that turns into a booking opens on the same thread; booking messaging still works.
- **Status:** IMPLEMENTED (beta). Composer state logic is centralized in `lib/messageRequests.ts`.
- **Open decisions:** conversation-merging when a chat later becomes a booking (only `booking_id` attach today); cooldown/anti-spam (none in beta); structured notifications/moderation (not built).

## J14 — Provider chooses policy / contract behavior  ·  **PARTIAL / UNDECIDED**
- **Actor:** provider.
- **Entry:** onboarding policy step / Business → Contracts.
- **Steps (intended):** provider (A) uploads/writes their own contract/policy, **or** (B) selects a standardized The Book policy tier (~3 envisioned), **or** (C) falls back to a standard platform policy if none is provided.
- **Current status:** provider policies + a provider-side contract exist (PARTIAL); standardized tiers and mandatory-by-category rules are **UNDECIDED / LEGAL + PRODUCT REVIEW REQUIRED**; signature capture is PLACEHOLDER.
- **Open decisions:** the standardized tiers, legal review, and whether contracts are mandatory for specific categories.
