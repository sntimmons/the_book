# The Book — Beta Scope (product-truth ledger)

**Status: Authoritative (current-state), with clearly marked product direction and open
decisions.** Purpose: tell humans and AI agents what each surface actually is today, and
separate three different things so a placeholder is never mistaken for a regression and a
future direction is never mistaken for a beta requirement. When this doc and the code
disagree about *what exists*, **the code wins** ([AGENTS.md](../../AGENTS.md)); update this
doc when behavior changes.

## Read every claim on three axes

- **CURRENT IMPLEMENTATION** — what the code does today (the only evidence of behavior).
- **BETA REQUIREMENT** — what must be true for beta (an approved obligation).
- **PRODUCT DIRECTION** — where we intend to go (approved intent, not yet a requirement).

## Status vocabulary (per surface)

- **REAL** — implemented and behaving as intended.
- **PARTIAL** — some of the capability exists; the full intended process is not built.
- **PLACEHOLDER** — a stand-in UI/state exists; the real mechanism is not implemented.
- **DEFERRED** — intentionally not built yet.
- **UNDECIDED** — product intent for beta is not yet approved (a decision, not a defect).

These are product-scope labels, distinct from the QA severity labels.

## The trust loop (guiding concept)

> REAL IDENTITY → VERIFIED TRANSACTION → PLATFORM RECORD → TWO-SIDED REVIEW → REPUTATION → SAFER FUTURE TRANSACTIONS

The Book is a two-sided **trust** marketplace, not primarily a social-popularity app.
Social/reels/discovery help people *find* providers; verified transactions and reputation
create *trust*.

## Surface ledger

| Surface | Status | Current truth |
|---|---|---|
| Authentication (email/phone OTP) | **REAL** | OTP sign-in/verify; session + role resolution. |
| Discover / browse | **REAL** | Landing feed for everyone; **browsing is allowed without identity verification** (verification gates transactions, not browsing). |
| Provider profiles | **REAL** | Profile, services, portfolio, reels, follower count. Trust badges → see Identity verification. |
| Services | **REAL** | Client selects one to book. Deposit fields exist but nothing is charged. |
| Availability | **REAL** | Availability + blocked dates drive the client picker. |
| Booking request creation | **REAL** | Inserts `bookings` with `status='pending'`, `payment_status='unpaid'`. A request, not a confirmed/paid booking. |
| Booking lifecycle | **PARTIAL** | pending → accepted → completed + cancel/no-show/rescheduled. Server write-integrity enforced (SB3b). Strict ordering + server-authoritative `payment_amount` UNDECIDED. |
| Messaging | **REAL (beta)** | One inbox. Booking conversations are open. **Pre-booking contact is now a message REQUEST**: a client sends one initial message; the provider Accepts (→ normal two-way conversation) or Declines (soft-closed). Enforced server-side (migration `20260901000000`). |
| Reviews | **REAL (Phases 0 + 1)** | Only from completed Book transactions; blind; two-sided; 7-day submission/reveal window; DB/server-authoritative eligibility and reveal (Phase 0) with the UX consuming that contract (Phase 1) — star-only reviews, truthful terminal states, persistent provider entry. Structured signals remain **Phase 2, not started**. See Reviews. |
| Contracts (provider create/load) | **PARTIAL** | Provider can create/load; client load errors block rather than silently skip (4A). Provider-side save symptom still to verify. |
| Contract signature capture | **PLACEHOLDER** | "Sign" sets local state, honestly labeled "requires development build"; persisted `signature_url=null`. No artifact captured. |
| Payments (card / Stripe) | **PLACEHOLDER / FUTURE** | No real authorization or charge anywhere. Copy truthfully says no payment is taken. |
| Deposits | **PLACEHOLDER** | Fields exist; nothing is charged or held. |
| Identity verification (client & provider) | **PARTIAL — CORE SAFETY REQUIREMENT** | State exists; production verification process not built. See section. |
| Provider onboarding / go-live | **REAL** | Onboarding writes provider+services+availability+policy+media; provider goes live immediately (no manual approval step planned for beta). |
| Business tools | **REAL** | Per NAVIGATION.md. Payouts depend on Payments (future). |
| Analytics | **REAL (dev-data caveat)** | Client-side metrics; revenue = completed only (4A). |
| Reels / content | **REAL** | Content feed + posts/reels. |
| Follows | **REAL** | `provider_follows` / `saved_providers`. |
| Community / barter | **REAL (beta)** | Posts, replies, bookmarks, barter offers/interests, proposal/version negotiation, PR #50 agreement finalization, PR #54's two directed obligations per agreement, and PR #56's delivery mark and one-time receiver answer. Those answers are **events, not verdicts**: no fulfilment outcome, timeout, cancellation-after-agreement, no-show or adjudication model exists yet. See Community / barter. |
| Care / reminders | **REAL (beta)** | Care reminders. |
| Payments revenue / platform fee | **UNDECIDED — BUSINESS MODEL RESEARCH** | See Revenue model. |
| Discovery ranking | **UNDECIDED — RESEARCH** | Fair-opportunity direction; weights undefined. |
| Home/house-call safety controls | **RESEARCH / PRODUCT DESIGN REQUIRED** | No mechanism chosen. |
| Safety incident escalation | **UNDECIDED — RESEARCH** | No operational model built. |

---

## Community / barter — the pre-agreement negotiation lifecycle

Bounded update, 2026-09-04, bringing this section level with what has shipped. Authoritative
detail lives in [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) and PD-043 … PD-054 in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md); this records only the scope classification.

**What is REAL (beta):**

- **Trade Activity** (`/community/trade-activity`) is durable, two-sided access to a provider's
  barter negotiations and history. It is the supported surface for **both** participants, and it
  does not depend on the post still being on the discovery board or inside the feed's window.
- **`released`** is a terminal state of an accepted interest: a negotiation that ended **before**
  any agreement. It is never deleted and never re-pended. The reason is derived from who ended
  it, so neither party can characterise the other's exit.
- **Releasing frees the slot.** A post supports one active negotiation at a time; when a
  negotiation is released the owner may accept another pending response **while the post is
  still active**.
- **An active negotiation survives its post leaving the board.** Closing a post does not end a
  negotiation already accepted on it, and either participant may still end that negotiation.
- **A manually closed post is terminal.** It cannot be reopened by any normal user, and its
  pending responses become **historical and non-actionable** — they can be neither accepted nor
  declined, and they stay `pending`. Both parties are told which case they are in.
- **`/community/barter-interests` is owner response management** — a post owner reviewing and
  answering responses to their own post. It is not a responder surface; a responder manages
  their negotiations in Trade Activity.

- **Proposed terms (Slice 3a, PR #49).** Inside an accepted interest either provider may
  propose terms; each version is exactly **two directed terms** — what the offer owner gives,
  what the responder gives — with participant identity **derived by the server**, never sent by
  the client. Terms are **versioned** and never edited; a counter creates a new version and
  withdraws any acceptance of the previous one. Both providers must explicitly accept the
  **same current version** (**PD-053**). No value field: barter requires no dollar equivalence.

**Agreement finalization (PR #50) is built:** once both providers accept the same current
version, a participant can finalize the trade, creating an immutable `barter_agreements` row
and permanently closing the sourcing post.

**Obligations (PR #54) and their delivery record (PR #56) are built:** each official agreement
carries exactly two immutable, server-derived directed obligations, and each obligation now has
a lifecycle — its **deliverer** may mark that obligation delivered (`delivered_at` is
server-stamped and immutable; a duplicate mark is a safe no-op), and its **receiver** may then
answer **exactly once**, *Confirm received* or *Didn't receive*. Neither answer can flip to the
other.

**Those answers are events, not verdicts.** `received` is deliberately not *Fulfilled* and
`not_received` is deliberately not *Unfulfilled* or *disputed* (**PD-058**), and the agreement
itself still reads "Trade confirmed" with no terminal outcome.

**What is NOT built:** the 7-day receiver-window timeout (its future anchor is **PD-057**),
automatic fulfilment, automatic completion, cancellation-after-agreement, mutual cancellation,
no-show, Needs Attention, Under Review, adjudication, terminal obligation outcomes
(Fulfilled / Unfulfilled / Closed Without Resolution), terminal agreement outcomes, barter
reviews and reputation. Nothing yet signals a receiver that a delivery happened (**PD-059**).
See [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 12 for the authoritative gap list.

---

## Identity verification — core trust-and-safety requirement

**Client and provider identity verification: PARTIAL — CORE SAFETY REQUIREMENT.**

**Approved direction (current product decision):**
- Users may **browse The Book freely without identity verification.**
- **Identity verification is required BEFORE a transaction can take place** (for both clients and providers). Conceptual flow: browse freely → attempt to transact/book → verification gate if not verified → verify → continue.
- For now, **"identity verified" means: the person's identity has been matched to a real government-issued identity document through an approved identity-verification process/provider.** Keep it simple. Do **not** yet expand into background checks, professional licenses, business verification, criminal-history checks, or other trust credentials (those may become separate indicators later).
- Core goal: providers know the client is a real verified person; clients know the provider is a real verified person; fake/throwaway identities are materially prevented from **transacting**.

**Current implementation:** `providers.identity_verified` state exists (owner-immutable; admin/service-role only). **The `clients` table has no verification column — client identity-verification state is not modeled yet.** A complete ID-verification integration is **not built** and no real verification flow (no vendor, no ID collection) exists. As of the beta gate feature, the client booking journey now shows a **beta identity-verification trust/education notice** at the start (Book Now → verification notice → service selection); an **unverified client continues booking** — an intentional **beta bypass** that changes no verification state. Transactions are therefore **still not gated** on verification (education only). Current UX remains **PARTIAL** — do not imply a complete automated ID-verification process exists today. Future production enforcement (`required` mode) will block transactions until **both** the client and the provider are verified.

**Future implementation preference:** use a specialist identity-verification provider rather than The Book storing/processing sensitive government-ID infrastructure itself; **avoid unnecessary storage of raw ID documents** (prefer a verification state/reference/result).

**Rules for UI copy & reviewers:**
- Lack of a self-service verification flow alone is **not** a confirmed defect; an admin/approved-process-managed state may be legitimate.
- An admin-set flag is **neither** automatically invalid **nor** automatically sufficient evidence of identity verification.
- UI claims must never imply a stronger verification process than has actually occurred.
- If the process behind a "Verified" claim is undocumented/unclear → **QUESTION → UNKNOWN — PRODUCT DECISION / TRUST-SAFETY DEFINITION REQUIRED.**

### The "14-day to verify" copy — UNDECIDED / PLACEHOLDER
The app currently shows placeholder copy implying a user has 14 days to verify. This is **not an approved product policy.** Do not encode a 14-day grace period as expected behavior. QA should **flag any UI presenting the 14-day requirement as established policy** while this remains undecided.

---

## Provider go-live — immediate (beta)
After completing the required onboarding, a provider may **go live immediately**. There is **no planned mandatory manual business-profile approval** step before publishing for beta (may change post-beta based on safety/quality/feedback). Identity-verification transaction rules are **separate** from provider-profile publishing rules. Do not invent a manual approval requirement.

## Two-sided reputation
The Book is a two-sided trust marketplace: providers **and** clients both have reputation. Approved model: **one account, one verified person, two distinct reputation contexts.** Client reputation and provider reputation stay logically distinguishable even for the same identity.

## Reviews
- **Approved core rule:** reviews may **only** come from **completed transactions that occurred through The Book.** No random public/friend/competitor reviews; no open Google/Yelp-style model.
- **Eligibility and reveal are SEPARATE, approved concepts** (Phase 0 makes both DB/server-authoritative):
  - **Eligibility:** a completed Book transaction makes both parties eligible to review each other (provider ↔ client). Reviews are **blind during submission.** Delayed-deliverable services (photography, videography, creative work) are a **later-phase** eligibility concern — a delivery milestone may gate review eligibility separately from appointment completion — and are **not** a reason to shorten the reveal window.
  - **APPROVED PRODUCT MODEL — 7-day window, blind reveal:** the review submission/reveal **window is 7 DAYS** from the server-authoritative completion. Reviews stay blind until **(A)** both sides submit → **reveal immediately**, **or (B)** the 7-day window closes → reveal whichever review(s) exist, after which the missing side can **no longer submit** (late reviews blocked). The blind design exists to reduce **retaliation**.
  - **NO ~1-hour one-sided fallback.** *(Historical note: an earlier ~1-hour reveal concept was reconsidered and **rejected** — a one-sided early reveal would let the not-yet-revealed party see and retaliate, undermining blind-review protection. The 7-day window is the current approved model; ~1 hour is not.)*
  - **CURRENT IMPLEMENTATION / PHASE 0 CONTRACT:** the above is enforced in the **database** (`supabase/migrations/20260902000000_reviews_phase0_foundation.sql`) — a single `<=` 7-day boundary; `review_eligible` / `review_window_closed`; `provider_review_revealed` / `client_review_revealed`; `under_review` blocks submission and holds reveal; the public aggregate derives from **revealed rows only**; `completed_at` is server-stamped and immutable. Reviews are DB/server-authoritative after Phase 0. Full model: `docs/product/REVIEWS_MODEL.md`.

## Review input safety — APPROVED DIRECTION (final signal schema is Phase 2)
Approved direction — **structured experience signals become the primary reusable reputation data** (the final signal vocabulary/schema is **Phase 2**, not defined here):
- **1–5 stars are retained**, alongside **structured signals** that may be **positive, negative, or mixed** (a rating may order which signals surface first but must **not** block selecting a truthful signal that is inconsistent with the stars).
- **Short optional free text is retained** for context structured signals can't capture; QA should **not** flag existing free-text.
- Reputation is **pattern-based, not strike-based**: one negative signal is **not** an automatic strike, suspension, or ranking penalty.
- **Serious safety incidents** (harassment, threats, fraud, violence, etc.) go to a **separate safety/reporting process** — never reduced to a review tag.
Structured input reduces harassment, retaliation, discriminatory attacks, and moderation burden. Provider and client reputation stay separate contexts; provider→client private notes remain private.

## Client accountability — escalating model (not "three strikes")
The product intends an **escalating accountability model** for verified conduct incidents, policy violations, repeated serious transaction problems, or other confirmed misconduct. **Do NOT document "three bad reviews = automatic suspension"** — not approved. Ordinary negative ratings affect reputation but should **not** automatically equal a safety strike. Violence, threats, severe harassment, fraud, or serious safety incidents must **not** wait for any strike threshold — they go through a separate higher-severity safety process. Detailed enforcement: **UNDECIDED / RESEARCH REQUIRED.**

## Payments — long-term full-service; not real yet
- **Direction:** full in-app payments; provider flexibility over whether a deposit is required, deposit amount/type, and whether remaining/full payment is collected before or after service (subject to future platform rules). Convenience may include saved card, Apple Pay, and other supported methods **where technically/commercially feasible.** Cash App or similar may be shown as a **direct integrated** option **only if an actual supported integration exists.** Do not promise specific payment-provider integrations before research confirms feasibility.
- **Current implementation:** no real payment processing; no charge during booking creation. **PARTIAL / FUTURE.** "No charge" is intentional, not a defect.

## Revenue model — UNDECIDED (business-model research)
Intent: The Book earns revenue from transactions, likely a **percentage-based protection/service/usability fee**. Exact percentage, payer, fee naming/structure, and whether there is a subscription or hybrid model are **NOT decided.** Do **not** encode a subscription model or "transaction-fee-only" as final.

## Off-platform payments / leakage — discourage, enforcement UNDECIDED
Goal: discourage transactions moving off-platform (core value = verified transactions, payment protection, reputation, reviews, safety, transaction history), **without** becoming hostile/unusable to trap users. Strategy: make staying on-platform easier, safer, more convenient, and reasonably priced. Exact anti-leakage enforcement is **UNDECIDED** — do **not** invent message scanning, bans, keyword blocking, or punitive rules.

## Cancellation policies — provider choice within future guardrails
Providers may (A) use/upload/write their own contract/policy, **or** (B) select from standardized The Book policy templates/tiers (Founder envisions ~three levels), **or** (C) fall back to a standard platform policy if they provide none. Exact tier language/rules: **UNDECIDED / LEGAL + PRODUCT REVIEW REQUIRED.** Do not claim lawyers have approved standardized policies unless evidence exists.

## Provider contracts — safety/protection tool
Primarily a safety/protection tool. Providers may provide their own; The Book may provide standard agreements/templates. Different categories may eventually need different contract requirements. Whether contracts become **mandatory** for specific categories is **UNDECIDED.** Signature system remains PLACEHOLDER/PARTIAL.

## Messaging — pre-booking message requests (IMPLEMENTED, beta)
Clients can **initiate contact before booking**, as a **message request**:
- A client sends **one initial message** to a provider. While pending, the client cannot send more messages and the provider cannot message back — the provider sees an **Accept / Decline**.
- **Accept** → the same conversation becomes a normal two-way chat and appears in the main inbox (no duplicate thread; the request status flips on the one conversation row).
- **Decline** → the request is soft-closed; the client sees "This provider isn't available to chat right now." (no "rejected/denied/blocked" language, no reason required). The client **may send another request later** (no cooldown in beta); a **duplicate active pending request** to the same provider is prevented (one conversation per pair). An already-**accepted** conversation opens directly rather than creating a new request.
- **Booking conversations are unaffected** and remain open. **A booking supersedes any prior request:** if the client and provider later have a real booking, the same conversation is opened for normal two-way messaging even if it was previously `pending` or `declined` — the booking attaches to the existing thread (no duplicate), and an existing booking_id is never overwritten.
- Enforced **server-side** (not just UI): migration `20260901000000` adds `conversation.request_status`/`request_opened_at` and triggers that (a) force a client's non-booking contact to a `pending` request — a client can neither create a null-status open chat nor buy one with a fabricated `booking_id` (booking_id is validated against the pair's real bookings on both insert and attach, so it can't become a privilege-escalation vector); (b) allow only the one initial client message while pending — enforced with **server-stamped timestamps** (`request_opened_at` and `messages.created_at` are set server-side, so a client cannot backdate a message or future-date the request window to bypass the limit; a re-request opens a fresh server-timed cycle); (c) block the provider from messaging while pending; (d) block messages after decline; (e) restrict accept/decline to the provider (client cannot accept/decline; client can re-open a declined request). Provider/business/community-initiated contact (caller ≠ client) is deliberately **not** forced into the request model — that remains a separate open product question. The `clients_public`/participant RLS is unchanged. Structured notifications/moderation are **not** built.
- **Open (future):** provider/business-initiated (cold) contact policy; multi-booking-per-conversation semantics beyond "reuse the one thread and keep the first booking_id"; conversation-merge nuances; no cooldown/anti-spam timing is decided.

## Launch market — Houston-first, concentrated
Initial launch: **Houston, Texas (HTX)**, ~**top 15** relevant independent-service provider categories; begin concentrated rather than every category nationally. The exact first-15 category list is **PRODUCT DECISION REQUIRED** (unless another approved source contains it). Houston-first/concentration is **strategy**, not a code defect.

## Location / service-delivery models
Support all four: (1) storefront/location-based, (2) provider travels to client/mobile, (3) home-based provider, (4) virtual service. Location/privacy behavior may differ by model.

## Home-based / house-call safety — RESEARCH / DESIGN REQUIRED
**Approved principle:** unverified clients must **not** be able to transact/book a home-based or house-call provider (verification is required before transactions anyway). Strong safety protection is wanted for both sides. Potential future mechanisms needing research: delayed/approximate address disclosure, exact address after acceptance/verification, timed address reveal, masked communication, check-in/check-out, trusted/safety contact, incident reporting, location sharing where legally/technically appropriate. **Do not choose one yet — RESEARCH / PRODUCT DESIGN REQUIRED.** A liability waiver is **not** sufficient safety protection; do not claim "The Book is not responsible" eliminates platform obligations or risk — actual safety controls are still required.

## Safety incident escalation — UNDECIDED / RESEARCH
A real safety/escalation process is required (potential concepts: report user, block user, urgent safety contact/support, dedicated trust-and-safety support, incident case handling, evidence preservation, account restriction/suspension, potentially staffed hotline as scale grows). Operational model **UNDECIDED.** Severe threats/violence/fraud/stalking/serious incidents are treated differently from ordinary review dissatisfaction. Not designed in this batch.

## Discovery / ranking — fair opportunity; weights UNDECIDED
Direction: discovery should provide **fair opportunity**, not only surface the biggest providers, intentionally balancing signals such as new / popular / highly-rated / relevant / active providers (across Discover **and** Reels/content). Consistent, meaningful use of The Book should improve a provider's opportunity to be discovered. Do **not** encode "most app usage always ranks highest"; ranking must account for quality, relevance, fairness, safety, spam/gaming prevention, and marketplace health. Exact algorithm/weights: **UNDECIDED / RESEARCH REQUIRED.**

---

## Open product decisions (UNDECIDED — do not convert to requirements)
Signature-required-for-beta; beta payment model + deposit rules; strict booking-lifecycle ordering; server-authoritative `payment_amount`; the identity-verification provider/process and which trust claims each level may display; the final structured review-signal schema/vocabulary (direction approved, schema deferred to Phase 2); the escalating-accountability + safety-escalation policies; the platform revenue/fee model; anti-leakage enforcement; standardized policy tiers + legal review; mandatory-contract-by-category; message-request cooldown/anti-spam + conversation-merge-on-booking + request notifications/moderation (the request/accept model itself is now IMPLEMENTED); the Houston first-15 category list; home/house-call safety mechanisms; discovery ranking weights. Reviewers mark these **PRODUCT DECISION REQUIRED**, never invent answers.
