# Product Decisions — locked

**Status:** Authoritative. Owner: Founder (Stephen). Maintained by the Project State Steward.

This ledger holds **only decisions that are locked**. If something is a working idea, a
proposal, a recommendation, or "we're leaning towards it", it belongs in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) instead. Code that happens to behave a certain way
is **not** a decision.

A decision is superseded, never deleted — the record of how the product got here is worth
keeping.

## Entry schema and conventions

Every entry carries all five fields: **Decided · Decision · Rationale · Evidence · Status.**

- **Decided** — a date only where the repository can prove one (the merge date, in **UTC**,
  of the PR that first recorded the decision). Where a directive demonstrably pre-dates its
  implementation, the field states that the date is the **earliest repository-provable date**
  rather than the decision date. Otherwise **"Pre-ledger / exact date not recorded"**:
  the decision predates this ledger, which was created 2026-09-03, and no in-repo artifact
  fixes the date. That phrase is used literally and consistently; a plausible-looking date is
  never invented.
- **Rationale** — the reasoning as actually stated. Where it was not recorded, the entry says
  **"Preserved from approved product direction; fuller historical rationale was not recorded
  in-repo."** rather than a reconstruction, because an invented rationale is indistinguishable
  from a real one once written down.
- **Evidence** — an approval source, a document, or a SHA/PR. Where the only corroboration is
  the implementing artifact, that is stated as such: an implementation records a decision, it
  is not the approval of one.

---

## Identity & trust

### PD-001 — Browsing is free and ungated
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** Anyone may browse providers, profiles and work without an account or verification.
- **Rationale:** Discovery is the top of the funnel; gating it kills marketplace liquidity.
- **Evidence:** Founder directive, Session 3 brief; corroborated by `BETA_SCOPE.md` and journey J0.
- **Status:** Locked

### PD-002 — Real transactions eventually require identity verification, on both sides
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** A real transaction will require identity verification, of **both** the provider and the client.
- **Rationale:** Two-sided trust. Verifying only providers protects clients while leaving providers exposed — providers frequently work alone, and in some categories in a home.
- **Evidence:** Founder directive, Session 3 brief; corroborated by `BETA_SCOPE.md` verification section.
- **Status:** Locked (enforcement point deferred — see PD-004)

### PD-003 — Publication verification and transaction verification are distinct
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** The bar to publish a profile is not the same as the bar to transact.
- **Rationale:** Providers can build presence early; the stricter check applies where money and physical safety are involved.
- **Evidence:** Founder directive, Session 3 brief (no independent repository corroboration — recorded as stated).
- **Status:** Locked

### PD-004 — Beta verification messaging is educational, not a hard transaction block
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** During the Houston beta, verification is communicated and encouraged but does not hard-block a transaction.
- **Rationale:** The beta is proving need and trust mechanics; a hard block before the verification vendor exists would stop the loop it is meant to measure.
- **Evidence:** Founder directive, Session 3 brief (no independent repository corroboration — recorded as stated).
- **Status:** Locked (beta-scoped; revisit before payments)

### PD-005 — Government-ID verification is handled by a specialist third party
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** A specialist vendor performs government-ID verification. The Book avoids storing raw ID documents wherever possible.
- **Rationale:** Document handling is a specialist liability and compliance surface. Holding raw IDs creates breach exposure with no product upside.
- **Evidence:** Founder directive, Session 3 brief (no independent repository corroboration — recorded as stated).
- **Status:** Locked (vendor not selected — see OQ-035)

---

## Navigation

### PD-010 — No client/provider global modes
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** There is no global `currentMode`. One account, one navigation system. Role follows the domain relationship and capability, not a UI toggle.
- **Rationale:** One person is often both client and provider. A global mode forces a false either/or and duplicates every surface.
- **Evidence:** [`docs/architecture/NAVIGATION.md`](../architecture/NAVIGATION.md) — authoritative.
- **Status:** Locked

### PD-011 — Five shared tabs
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** Discover, Reels, Bookings, Messages, Me.
- **Rationale:** Preserved from approved product direction; fuller historical rationale was not recorded in-repo.
- **Evidence:** `NAVIGATION.md`; `app/(tabs)/`.
- **Status:** Locked

### PD-012 — Provider tools live under Business
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** Provider-side tooling sits under Business, not as a parallel tab set.
- **Rationale:** Business is a set of tools, not a second navigation system; a persistent Business control on every screen would compete with the shared tabs (recorded in `NAVIGATION.md`).
- **Evidence:** `NAVIGATION.md`; `app/(tabs)/business/`.
- **Status:** Locked

---

## Reviews

Full rules are authoritative in [REVIEWS_MODEL.md](REVIEWS_MODEL.md). Recorded here only
as locked decisions.

### PD-020 — One verified transaction → one review opportunity per direction
- **Decided:** 2026-09-02 (first recorded by PR #24, merge `b0c6f92`)
- **Decision:** Reviews come only from completed Book transactions. Each booking yields at most one review per direction. Repeat bookings are independently reviewable by `booking_id`.
- **Rationale:** Ties reputation to real, verifiable exchange — no random, friend, or competitor reviews.
- **Evidence:** `REVIEWS_MODEL.md`; migration `20260902000000`.
- **Status:** Locked

### PD-021 — 7-day submission window
- **Decided:** 2026-09-02 (first recorded by PR #24, merge `b0c6f92`)
- **Decision:** 7 days from the server-authoritative `completed_at`. Late submissions are blocked.
- **Rationale:** Preserved from approved product direction; fuller historical rationale was not recorded in-repo.
- **Evidence:** `REVIEWS_MODEL.md`; `review_window_closed()`.
- **Status:** Locked

### PD-022 — Blind two-sided reveal; no one-sided early reveal
- **Decided:** 2026-09-02 (first recorded by PR #24, merge `b0c6f92` — commit `ae17459` reconciled `BETA_SCOPE.md`; PR #26, merge `a82b50e`, completed the correction across `USER_JOURNEYS.md` and the QA agent spec)
- **Decision:** Reviews stay blind until both sides submit (reveal immediately) or the 7-day window closes. **There is no ~1-hour one-sided fallback** — that concept was reconsidered and rejected.
- **Rationale:** A one-sided early reveal lets the not-yet-revealed party read and retaliate, defeating blind review.
- **Evidence:** `REVIEWS_MODEL.md`; `BETA_SCOPE.md`. Superseded an earlier ~1-hour intent that briefly survived in `USER_JOURNEYS.md` and the QA agent spec.
- **Status:** Locked

### PD-023 — A rating alone is a valid review
- **Decided:** 2026-09-02 (PR #26, merge `a82b50e`)
- **Decision:** A 1–5 star rating is sufficient to submit, in both directions. Text and tags are optional. No structured signal is required.
- **Rationale:** The client form previously required >10 characters of text *or* a tag, so a client who only tapped stars could not submit at all. `canPost = parsedRating != null` now mirrors the provider's `canSubmit = rating > 0` (recorded in `REVIEWS_MODEL.md`).
- **Evidence:** `REVIEWS_MODEL.md`; PR #26.
- **Status:** Locked

### PD-024 — A negative experience uses the same normal review path
- **Decided:** 2026-09-02 (PR #26, merge `a82b50e`)
- **Decision:** Every 1–5 rating flows through the same review journey carrying its rating. No control asks a client to affirm a positive experience, and ordinary dissatisfaction is never routed into incident reporting.
- **Rationale:** Making low ratings harder to submit than high ones biases the reputation signal the whole model depends on.
- **Evidence:** `REVIEWS_MODEL.md`; PR #26.
- **Status:** Locked

### PD-025 — Ordinary negative feedback is not a strike; serious safety reporting is separate
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** A poor rating is not a safety event. Severe incidents (threats, violence, fraud, stalking) run through a separate reporting process.
- **Rationale:** Preserved from approved product direction; fuller historical rationale was not recorded in-repo.
- **Evidence:** `BETA_SCOPE.md`; `app/post-booking/issue.tsx` writes `reports`, never a review.
- **Status:** Locked

### PD-026 — `completed` and `no_show` are alternative terminal outcomes
- **Decided:** 2026-09-02 (PR #26, merge `a82b50e`) — earliest repository-provable date, not the decision date: `git log --diff-filter=A` shows migration `20260904000000` first added in commit `06bff77`, which PR #26 merged. The Evidence below records the directive as pre-dating implementation, so the true decision date is earlier and is not repo-provable.
- **Decision:** A completed booking cannot later become a no-show. Enforced at the DB write boundary — precisely: rejected for **authenticated writers going forward**; it is a `BEFORE` trigger on new writes, `service_role` bypasses it, and pre-existing rows are not remediated. `REVIEWS_MODEL.md` holds the exact wording; do not flatten it to "impossible".
- **Rationale:** Without it, a provider could flip a completed booking to `no_show` to suppress an earned review.
- **Evidence:** Founder directive (Session 2, locked before implementation); migration `20260904000000` implements it; B5B asserts "completed -> no_show is rejected at the write boundary". Note the migration is the *implementation*, not the approval.
- **Status:** Locked

### PD-027 — `no_show` creates no service-quality review eligibility
- **Decided:** 2026-09-02 (PR #26, merge `a82b50e`)
- **Decision:** A no-show produces no 1–5 star service review in either direction. The event is preserved on the booking. It belongs to a **future** conduct/reliability reputation layer, which is not built.
- **Rationale:** A no-show is a real booking event but not a completed service experience — there is nothing to rate.
- **Evidence:** `REVIEWS_MODEL.md`; PR #26.
- **Status:** Locked

### PD-028 — Mixed structured signals are allowed later
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** Structured positive/negative/mixed review signals are permitted as a **later phase**. Not started.
- **Rationale:** Preserved from approved product direction; fuller historical rationale was not recorded in-repo.
- **Evidence:** `REVIEWS_MODEL.md` Phase 2 section.
- **Status:** Locked as direction; design open

---

## Barter philosophy

### PD-030 — Barter is a community philosophy, not a payments workaround
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** Barter is a long-term part of what The Book is, not a temporary stand-in until payments ship.
- **Rationale:** Service trade is already how much of this community operates. Treating it as scaffolding would mean discarding a real differentiator the moment payments land.
- **Evidence:** Founder directive, Session 3 brief (no independent repository corroboration — recorded as stated).
- **Status:** Locked

### PD-031 — A trade must create mutual value
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** A trade creates value for both sides. Barter must never become a mechanism for pressuring providers into discounting or devaluing their work. **"Free service for exposure" is not acceptable barter.**
- **Rationale:** Unequal bargaining power is the standard failure mode of informal trade; the platform should resist it rather than industrialise it.
- **Evidence:** Founder directive, Session 3 brief (no independent repository corroboration — recorded as stated).
- **Status:** Locked

### PD-032 — Do not overbuild the barter economy for beta
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** No trade credits, wallets, multiparty swaps, or valuation engines for beta.
- **Rationale:** Each is a large surface with its own abuse and accounting problems, none of which the beta needs to answer.
- **Evidence:** Founder directive, Session 3 brief (no independent repository corroboration — recorded as stated).
- **Status:** Locked

### PD-033 — Audit the existing barter implementation before redesigning
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** Barter is **already partially implemented** in the repository. The next major task is a **read-only audit** of what exists, before any redesign.
- **Rationale:** Designing from scratch over working code wastes it and risks reintroducing solved problems.
- **Evidence:** the *existence* clause is verified in-repo (`lib/barter.ts`; `app/community/barter-compose.tsx`, `barter-interests.tsx`; `barter_offers` / `barter_interests` tables with RLS in `20260829000000_canonical_live_baseline.sql`). The *sequencing* clause ("audit first") is a Founder directive from the Session 3 brief, not derivable from the repository.
- **Status:** Locked (audit is Session 4)

---

## Houston beta

### PD-040 — Houston-first closed beta
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** The first beta is a closed, Houston-only cohort.
- **Rationale:** Marketplace liquidity is local. A dense single city gives real matches; a scattered national signup gives none.
- **Evidence:** Founder directive, Session 3 brief; corroborated by `BETA_SCOPE.md`.
- **Status:** Locked

### PD-041 — Target window approximately 21–30 days
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** The beta runs roughly 21–30 days.
- **Rationale:** Preserved from approved product direction; fuller historical rationale was not recorded in-repo.
- **Evidence:** Founder directive, Session 3 brief (no independent repository corroboration — recorded as stated).
- **Status:** Locked (estimate, not a commitment)

### PD-042 — Prove the loop before payments
- **Decided:** Pre-ledger / exact date not recorded
- **Decision:** The beta proves need, trust, discovery, booking, community and barter **before** payments go live. Payments' absence should read as intentional, with paying in-app becoming the obvious next missing piece.
- **Rationale:** Payments carry the largest compliance, fraud and support burden in the product. Building them before the loop is proven risks doing that work for a loop that does not hold.
- **Evidence:** Founder directive, Session 3 brief; corroborated by `BETA_SCOPE.md` (payments PLACEHOLDER/FUTURE).
- **Status:** Locked

---

## Not decisions

Recorded so they are not mistaken for locked state:

- **Paid / Trade / Hybrid** as a booking-type architecture — a working idea, **not approved**. See OQ-001.
- Any specific barter transaction model (reciprocal bookings vs a parent trade agreement) — open. See OQ-002.
- The exact first provider-category mix for the beta cohort — open. See OQ-030.
