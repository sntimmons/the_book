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
| Messaging | **PARTIAL** | One inbox; conversations attached to a booking. Pre-booking message **requests** (§Messaging) are PRODUCT DIRECTION, not yet built as a request/accept flow. |
| Reviews | **REAL (reveal caveat)** | Only from completed Book transactions; blind; two-sided. Reveal timing → see Reviews. |
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
| Community / barter | **REAL (beta)** | Posts, replies, bookmarks, barter offers/interests. |
| Care / reminders | **REAL (beta)** | Care reminders. |
| Payments revenue / platform fee | **UNDECIDED — BUSINESS MODEL RESEARCH** | See Revenue model. |
| Discovery ranking | **UNDECIDED — RESEARCH** | Fair-opportunity direction; weights undefined. |
| Home/house-call safety controls | **RESEARCH / PRODUCT DESIGN REQUIRED** | No mechanism chosen. |
| Safety incident escalation | **UNDECIDED — RESEARCH** | No operational model built. |

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
- Eligibility: a completed Book transaction makes both parties eligible to review each other (Airbnb-inspired): provider reviews client, client reviews provider. Reviews are **blind during submission.**
- **Reveal — IMPLEMENTATION MISMATCH** (an approved decision the code does not yet meet):
  - **CURRENT IMPLEMENTATION:** revealed when the **counterpart review exists** OR the booking `completed_at` is **≥ 7 days** ago (`lib/reviews.ts` `SEVEN_DAYS_MS`; DB `provider_review_revealed` uses `interval '7 days'`). Aggregate derives from revealed rows only.
  - **APPROVED PRODUCT INTENT (what should exist):** reveal when the **counterpart submits**, otherwise a timed reveal of **approximately one hour** (not seven days). The Founder has **explicitly rejected** the 7-day timing as the intended behavior. Exact mechanics may still need final product/engineering design, but the target window is ~1 hour, not 7 days.
  - **This is NOT UNDECIDED** — the intent is decided; the code has not caught up. Do not classify the timing as an open product question merely because the code differs. QA reports the mismatch (see below); this docs/agent batch does **not** modify review code.

## Review input safety — PRODUCT DIRECTION / NEEDS FINAL DESIGN
Leaning toward **structured/pre-written** review feedback in early stages (to reduce harassment, retaliation, discriminatory comments, personal attacks, and moderation burden). This is **direction, not an implementation requirement** unless the code already supports it. QA should **not** flag existing free-text purely because this direction exists.

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

## Messaging — pre-booking allowed; request/accept is direction
Users should be able to **initiate messages with providers before booking.** Desired inbox behavior (**PRODUCT DIRECTION**): initial contact/request → provider receives a message **request** → provider may accept → the accepted conversation appears in the primary inbox (conceptually like other platforms' message-request systems). Messaging must support marketplace communication **without forcing booking first**; do not invent restrictions prohibiting pre-booking communication. (Current implementation: one inbox tied to bookings; the request/accept model is not yet built.)

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
Signature-required-for-beta; beta payment model + deposit rules; strict booking-lifecycle ordering; server-authoritative `payment_amount`; the identity-verification provider/process and which trust claims each level may display; review free-text vs structured input; the escalating-accountability + safety-escalation policies; the platform revenue/fee model; anti-leakage enforcement; standardized policy tiers + legal review; mandatory-contract-by-category; the message request/accept model; the Houston first-15 category list; home/house-call safety mechanisms; discovery ranking weights. Reviewers mark these **PRODUCT DECISION REQUIRED**, never invent answers.
