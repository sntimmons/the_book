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

### PD-043 — A barter offer cannot be hard-deleted once another provider has interacted with it
- **Decided:** 2026-09-04
- **Decision:** Once another provider has interacted with a barter offer — **including a declined response** — the offer owner **must not** hard-delete it. The owner **may** close or archive it, which removes it from the board non-destructively. Legitimate account erasure is a **separate system path and outranks this retention rule**.
- **Rationale:** One participant must not be able to destructively erase the other's interaction and history. Retention protects the counterparty's record, not the offer.
- **Evidence:** Founder ruling, 2026-09-04. Enforced on `main` by `supabase/migrations/20260906000000_barter_integrity_slice1.sql` (delete guard, with escapes so account erasure is not blocked). The rule was approved before that migration; this entry is the durable record, not a decision derived from the code.
- **Status:** Locked

### PD-044 — `providers.is_approved` is the barter eligibility gate for the first Houston beta
- **Decided:** 2026-09-04
- **Decision:** For the first Houston closed beta, `providers.is_approved = true` is the **server-owned marketplace eligibility gate** for barter. It means **marketplace-live and not suspended** for the purposes of the beta. It **must not** be described as identity verification, and it does **not** authorise inventing a mandatory manual business-approval workflow. Future identity-verification requirements may make transaction eligibility stricter.
- **Rationale:** The beta needs one server-owned, non-forgeable eligibility signal. Reusing the existing flag avoids both an unbuilt admission step and a false claim that participants have been identity-verified.
- **Evidence:** Founder ruling, 2026-09-04 (recorded as E-3 during Session 5). The eligibility conjunct is **not yet implemented**: `caller_provider_id()` in `20260906000000_barter_integrity_slice1.sql` deliberately provides the seam without the `is_approved` condition.
- **Status:** Locked

### PD-045 — Barter interest submissions are capped at 15 per provider per rolling 24 hours
- **Decided:** 2026-09-04
- **Decision:** For the Houston beta, a provider may submit a maximum of **15 new barter-interest submissions in a rolling 24-hour window**. The limit **must remain server-authoritative**. When a negotiation model is built, **counters inside an existing negotiation do not count as new interest**.
- **Rationale:** An unbounded interest write is the cheapest way to spam the provider network. The cap is a beta working limit, not a permanent product constant.
- **Evidence:** Founder ruling, 2026-09-04. Enforced on `main` by `enforce_barter_interest_rate_limit` in `20260906000000_barter_integrity_slice1.sql`, counting `rate_limit_log` rather than deletable content rows. The **offer-side** limit named in `BARTER_BETA_CONTRACT.md` is **not** yet enforced server-side.
- **Status:** Locked

### PD-046 — Cancellation and no-show for trades
- **Decided:** 2026-09-04
- **Decision:** Three regimes, by the counterparty's exposure. **Before an official agreement** (both providers accepting the same current agreement version): withdrawal, decline and walking away are permitted, are **not** cancellations, and carry no penalty, review or reliability judgment. **After agreement, before any delivery:** either participant may cancel **unilaterally** — the other party's permission is **not** required — recording `cancelled_at`, the cancelling participant and an optional reason; both agreeing is **Mutually Cancelled**, one exiting is **Cancelled by Participant**. **After any obligation is marked delivered:** ordinary cancellation is unavailable and disagreement routes Needs Attention → Under Review → manual adjudication. **No-show is not cancellation** — it is failing to perform at the agreed time without having recorded a cancellation first; it routes to Needs Attention, and if established the obligation is **Unfulfilled**. For the first Houston beta none of these produce a normal review, an automatic reputation penalty, or a ranking effect; actor and timing are retained for a future reliability model. Terminal overall states: Completed, Partially Fulfilled, Cancelled, Not Completed, Under Review, and **Closed Without Resolution** (terminal, with **no** reliability judgment assigned). **Individual obligation truth survives independently of the overall agreement state.**
- **Rationale:** Nobody should be held inside a service commitment by a counterparty who will not release them, but the cost of leaving must rise once the other side has actually given something up. Keeping obligation truth separate from the rolled-up verdict preserves the only record of who did their part.
- **Evidence:** Founder ruling, 2026-09-04. Closes OQ-004. Stated in `BARTER_BETA_CONTRACT.md` § 7. **Not yet implemented** — no agreement or obligation schema exists.
- **Status:** Locked

### PD-047 — The barter post stays editable; the proposal snapshots it
- **Decided:** 2026-09-04
- **Decision:** The public barter post **remains editable while active** and is **not** frozen by the first response. Every proposal **must snapshot the relevant barter-post terms as they were when that proposal was created**. An edit to the public post affects **future responders only** and **must not** rewrite an existing proposal, an in-flight negotiation, or an accepted agreement. Authoritative progression: mutable board post → immutable proposal snapshot → versioned negotiated proposal/counter terms → accepted agreement version. **The final agreement is authoritative and must not depend on reading the current mutable post.** Material changes to negotiated terms create a new proposal/agreement version and invalidate acceptance of the prior one. Once an agreement is finalised for a post the sourcing post is auto-closed, and it and its history are preserved — never destructively deleted.
- **Rationale:** Freezing the whole board post after one response would punish ordinary editing (typos, availability) for the life of the post. Snapshotting moves immutability to where consent actually attaches — the proposal — so the deal cannot be rewritten under either party.
- **Evidence:** Founder ruling, 2026-09-04. Closes OQ-008. Stated in `BARTER_BETA_CONTRACT.md` § 3.1. Directs Slice 3 to model transaction truth **independently of `barter_offers`**.
- **Status:** Locked

### PD-048 — A provider who declined a request may still initiate contact later
- **Decided:** 2026-09-04
- **Decision:** A provider who previously declined another provider's request **may later initiate legitimate contact** with them. This **must not** be implemented by silently re-opening the declined request; conceptually it is a **new reverse-direction contact episode on the same canonical provider-pair conversation**. Recorded as an approved messaging follow-up — Slice 3 must **not** be expanded to redesign messaging unless the agreement flow requires it, and the current truthful dead-end copy may remain in the interim.
- **Rationale:** A decline records that someone said no at a point in time; silently flipping it back would rewrite their record. A fresh contact episode is honest about what happened without trapping either party.
- **Evidence:** Founder ruling, 2026-09-04, resolving the journey dead end raised by the Slice 2B security re-review (SEC-DATA-006). One canonical thread per provider pair is already enforced by `20260908000000_canonical_provider_pair.sql`. **Not yet implemented.**
- **Status:** Locked

### PD-049 — Exactly one active barter negotiation per post, and a dead one releases the slot
- **Decided:** 2026-09-04
- **Decision:** A barter post may receive many interests, but **only one may be in `accepted` / selected-for-negotiation state at a time**: post → many pending interests → ONE accepted interest → ONE active negotiation. Concurrent negotiations on a post are **not** supported in the first beta, and the one-accepted-per-offer invariant is **not** removed. If that negotiation ends **before** an official agreement exists, the interest moves `accepted → released`: it keeps its history, stops consuming the negotiation slot, and the owner may then accept another pending interest. A released interest is **never deleted and never re-pended**, and the released responder **may not** open a second interest on that post in the first beta — the original remains durable history and re-engagement is deferred. Once an official agreement is formed the sourcing post is consumed and closes permanently. Release reasons are **derived from the acting participant**, never supplied: `responder_withdrew` (responder) and `owner_ended_negotiation` (owner). `mutual_end` is reserved and unreachable, because no current flow can establish mutuality and a two-click mutual protocol was explicitly out of scope.
- **Rationale:** Slice 1 made `accepted` terminal with one accepted interest per offer. Correct for integrity, wrong for the product: a negotiation ending before any agreement — which PD-046 § 7.1 calls ordinary, with no penalty — permanently consumed the post's only slot, and PD-043 forbids deleting the post, so the only exit was close-and-repost, discarding every responder. That is a penalty applied to the party PD-046 protects. Deriving the reason from the actor means neither party can characterise the other's exit.
- **Evidence:** Founder ruling, 2026-09-04. Implemented by `supabase/migrations/20260909000000_barter_interest_release.sql` (`release_barter_interest`). **Reachable as of Slice 3a-0c**: either participant can end a negotiation from Trade Activity (`app/community/trade-activity.tsx`), and the responder can also end one from the barter feed. `releaseInterest` in `lib/barter.ts` is the client seam, and `lib/barterErrors.ts` carries the `release` operation the RPC's two SQLSTATEs need.
- **Status:** Locked

---

### PD-050 — A closed barter post cannot select a new response; an aged-out active one can
- **Decided:** 2026-09-04
- **Decision:** PD-049's "the owner may accept another pending interest" is qualified by the post's own state, and the two cases that look similar in the UI are decided **opposite** ways. A post that is **still active but has fallen out of the discovery feed's newest-50 window** remains fully answerable: accept and decline are reachable from **Trade Activity** for exactly this case. A post the owner has **manually closed** is finished: its pending responses become non-actionable history and **no further response may be accepted on it**. Both parties are told which case applies — the owner's closed-post rows say the post was closed, and the responder's say so too rather than reading as an indefinite wait. Reopening a closed post is **not** in scope; there is no reopen control, and accepting is not permitted to act as one.
- **Rationale:** Trade Activity exists to make a negotiation findable after the feed loses it, and that reachability was about to answer a question nobody had asked: whether reaching a pending response also means being able to accept it. Ageing out of a feed window is not a product event and must not silently retire a live post — that is the stranding PD-049 was written to end. Closing IS a product event: it is the owner's statement that they are done, so accepting afterwards would return a post to the board that the owner deliberately took off it, and would match a responder to something no longer offered. The distinction is enforced in the **database** (`barter_interests_zy_answer_open_offer`, SQLSTATE `55000`), not by hiding a control, so a stale screen is refused rather than acted on. It is a distinct SQLSTATE because the general refusal code maps, for accept, to "already answered" — which would blame the responder for something the owner did.
- **Evidence:** Founder ruling, 2026-09-04. Implemented by `supabase/migrations/20260914000000_trade_activity_corrections.sql` § 3, **superseded by `20260915000000` § 2** (which widened the rule to decline per PD-052 and renamed the trigger); client truth in `lib/tradeActivity.ts` (`tradeRowState`), asserted in `__tests__/lib/tradeActivity.test.ts` and `supabase/tests/barter.test.sql` (both the allow-path on a 400-day-old active post and the refusal on a closed one).
- **Status:** Locked

---

### PD-051 — Closing a barter post is one-way
- **Decided:** 2026-09-04 — the ruling date, matching every other entry in this file and the
  implementing migration's own header. (An earlier draft read 2026-09-05, which was the **UTC**
  timestamp of the merge; the merge commit is `2026-09-04T23:02-05:00` local, so the two dates
  were the same moment in different zones, not a discrepancy.) The ruling was given
  **2026-09-04**: the implementing migration's own header says so
  (`supabase/migrations/20260915000000_barter_closed_post_terminal.sql:1`, "Founder rulings,
  2026-09-04"), which is what the Evidence line below records. `2026-09-05` is the date
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) records `20260915000000` being
  applied to non-production; whether it is *also* the UTC merge date of PR #47 was **not
  verifiable** by the reconciliation that annotated this entry, which had no shell. The two
  dates are not in conflict — per the conventions above, this field carries the provable date
  and the Evidence carries the approval.
- **Decision:** `barter_offers.is_active` is a **one-way** transition for the first Houston beta: `active → closed` is permitted, `closed → active` is not. Once an owner manually closes a barter post it cannot be reopened by any authenticated write. A provider who wants to offer the same trade again creates a **new post**.

  The guard exempts exactly two callers, and **both are operational recovery paths only**:
  - **`service_role`** — the trusted server key, not reachable from the app;
  - **trusted no-JWT administrative / maintenance sessions** — psql, the SQL console, and migrations, where `auth.role()` is NULL because there is no request JWT at all.

  These exemptions are **not** end-user capabilities, **not** app-accessible reopen flows, and **not** marketplace behaviour. **No authenticated normal user may reopen a closed post by any route** — direct `UPDATE`, upsert, or delete-and-recreate — and no such route exists in the app. An operator using a recovery path is performing maintenance on the marketplace, not participating in it. The same pair of escapes is what the sibling guard `enforce_barter_offer_delete` already carries.
- **Rationale:** PD-050 defines a manually closed post as non-actionable history, and pending responders are shown exactly that. A statement the app makes to one party about another party's post has to be durable, or it is not a statement — and reopening was reachable without ever contradicting PD-050's letter, because PD-050 governs *accepting*, while a separate `is_active` write did the reopening. `barter_offers_owner_update`'s USING clause is `user_id = auth.uid()` and `enforce_barter_offer_write` pins only `id` and `created_at`, so nothing stopped an owner from flipping the column back, accepting, and closing again. Reopening also creates lifecycle ambiguity for no product gain: a reopened post's responses have an unclear relationship to the closure the responder was told about.
- **Evidence:** Founder ruling, 2026-09-04. Implemented by `supabase/migrations/20260915000000_barter_closed_post_terminal.sql` § 1 (`enforce_barter_offer_active_one_way`, trigger `barter_offers_zy_active_one_way`, SQLSTATE `55000`), added as a NEW trigger rather than a redefinition of `enforce_barter_offer_write`. **The function body currently on `main` is `20260916000000_barter_guard_admin_escape.sql`'s**, which widened the exemption from `service_role` alone to `service_role` **or** a null-`auth.uid()` (no-JWT) caller — the pair of escapes the sibling guard `enforce_barter_offer_delete` (`20260906000000:237`) already carries, and which this decision's own "matching the exemption every sibling trigger on these tables already grants" clause defers to. Asserted in `supabase/tests/barter.test.sql`: the owner may close, cannot reopen, the post is still closed after the refusal, an upsert cannot reopen it, and `service_role` retains the path.
- **Status:** Locked

---

### PD-052 — A closed post's responses cannot be answered at all
- **Decided:** 2026-09-04 — same provenance as PD-051 above, and resolved the same way. The
  ruling was given **2026-09-04**
  (`supabase/migrations/20260915000000_barter_closed_post_terminal.sql:1`).
- **Decision:** PD-050's "non-actionable history" includes **decline**, not only accept. Once the parent post is closed, a `pending` interest may transition to neither `accepted` nor `declined`; it remains **pending historical state**. The responder is told the post is closed; the owner is shown no Accept and no Decline. Enforced server-side so a direct API mutation cannot perform `pending → declined` on a closed post. **`released` is deliberately still permitted**: a negotiation outlives its post (PD-049), so either party may still end an accepted one after the post closes.
- **Rationale:** Declining on a closed post silently rewrote what the *responder* is told. Their row goes from "This post has been closed without your response being accepted" to "Your response was not selected" — collapsing precisely the distinction PD-050 requires both parties be shown, and doing it through an action the responder cannot see or contest. It was also the one question on which the two client surfaces had already drifted: Trade Activity offered nothing, the responses screen offered Decline, and the server permitted both, so nothing forced a resolution.
- **Evidence:** Founder ruling, 2026-09-04. Implemented by `supabase/migrations/20260915000000_barter_closed_post_terminal.sql` § 2 (`enforce_barter_answer_open_offer`, trigger `barter_interests_zy_answer_open_offer`, SQLSTATE `55000`), which **replaces** `enforce_barter_accept_open_offer` from `20260914000000` — renamed because a function whose name understates what it refuses is how the next author reasons wrongly about it. Both the old function and its trigger were **dropped** in that same migration, so nothing on `main` still carries the old name. **The function body currently on `main` is `20260916000000_barter_guard_admin_escape.sql`'s**, which added the null-`auth.uid()` escape alongside the `service_role` one; the refusal rule itself is unchanged. Client truth comes from `tradeRowState` in `lib/tradeActivity.ts`, which **both** barter surfaces now use. Asserted in `supabase/tests/barter.test.sql` (accept refused, decline refused, both responses survive as `pending`, release still permitted, active posts unaffected) and `__tests__/lib/tradeActivity.test.ts` (no row on a closed post yields an accept-capable action, in either role).
- **Status:** Locked

---

### PD-053 — A barter agreement requires both providers to accept the same version of the terms
- **Decided:** 2026-09-05
- **Decision:** Negotiated barter terms are **versioned**. A proposal may only be opened on an **accepted** interest — there are no cold proposals — and there is **one proposal per accepted interest**, so the proposal row is the negotiation's durable identity. Each version holds **exactly two directed terms** — one for what the offer owner gives, one for what the responder gives — and complex packages live inside a side's own description; arbitrary term lists are not supported in the first beta, which is also the shape the later agreement model needs (exactly one required obligation per participant). **No `estimatedValue` or other monetary field is part of the authoritative terms**: barter requires no dollar equivalence, no value comparison is part of agreement, and an unused authoritative field would imply a product meaning it does not have. **Participant identity on a term is server-owned**: the client submits *content* for both sides and nothing about identity; the server assigns the fixed side label (`offer_owner` / `responder`) and derives each side's provider and user from the accepted interest, so a client cannot swap the sides, name a third provider, or bind one provider to both. Any material change creates a **new version**; no version is ever mutated, and advancing to a new version **invalidates prior acceptance of the older one**. Both participants must **explicitly accept the same current version**: authoring a proposal is not acceptance, and countering is not acceptance. A participant may not accept a superseded version. Submissions are capped at **20 versions per participant, per negotiation, per rolling 24 hours**, server-authoritatively. Each version **snapshots the public post's terms** at the moment it was authored; the post stays editable and no snapshot ever changes (PD-047). A **released** negotiation accepts nothing further — no create, no counter, no accept — and there is **no second exit primitive**: `release_barter_interest` remains the one way to end a negotiation (PD-049).
- **Rationale:** "We agreed" has to mean two deliberate acts on one identified set of terms, or it means nothing that can be relied on later. Every weaker rule collapses under an ordinary disagreement: implicit acceptance by the author would make a counter silently re-accept on the counterer's behalf; a mutable "current terms" record would let one party change what the other agreed to after the fact; and acceptance that survived a change would record agreement to terms nobody is offering. Versioning also makes the negotiation *readable* — both parties can see what changed and when, which is the thing a dispute actually turns on. The terms are stored as **typed rows**, not one opaque blob, so they can be constrained and queried; `post_snapshot` stays JSONB precisely because it is the opposite kind of thing — historical source context, never authority.
- **Evidence:** Founder ruling, 2026-09-05. Implemented by `supabase/migrations/20260917000000_barter_proposal_versions.sql` (four tables, append-only and immutability triggers, RLS, grants, three RPCs, the `my_barter_proposals` view), corrected by `20260918000000` (grants), `20260919000000` (`40001` for replaced terms), `20260920000000` (`54000` for the cap), `20260921000000`–`20260924000000` (the write boundary — see the ledger) and `20260925000000` (two directed terms, server-owned identity, `estimated_value` removed). Asserted in `supabase/tests/negotiation.test.sql` and, for the races B5B structurally cannot stage, by `scripts/negotiation-concurrency.mjs` (17/17). Client rules in `lib/negotiationState.ts`, tested in `__tests__/lib/negotiationState.test.ts`.
- **Status:** Locked

---

### PD-054 — Both accepting is a recorded fact, not a finalised agreement
- **Decided:** 2026-09-05
- **Decision:** This slice records that both participants accepted the same current version and exposes it as a **derived** flag (`my_barter_proposals.both_accepted`). It **finalises nothing**. No agreement, obligation, fulfilment, delivery, confirmation-window, cancellation or adjudication schema exists, no agreement row is written, and **the sourcing post is not closed**. Turning the recorded fact into an official agreement — and closing the post permanently per PD-049 — is a separate, later slice. No client copy may describe a trade as booked, owed, confirmed, complete or official.
- **Rationale:** The seam had to be somewhere, and the honest place is a fact that is derived rather than stored. A stored `status = 'agreed'` would be a second lifecycle to keep in sync, and — more importantly — it would look finished. Anything the app calls an agreement, users will treat as one; promising that while there is no obligation model behind it would be a claim the product cannot keep, on exactly the surface where being wrong costs a provider real work. Keeping the flag derived means this slice cannot quietly become the next one: there is no row to mistake for a finalisation.
- **Evidence:** Founder ruling, 2026-09-05. `both_accepted` is computed in the `my_barter_proposals` view from acceptance rows on the current version and stored nowhere. Asserted in `supabase/tests/negotiation.test.sql` (the fact is reported, and a later counter withdraws it) and in `__tests__/lib/negotiationState.test.ts`, which pins that ready-to-confirm copy does not call the trade booked, owed, complete, fulfilled, delivered or guaranteed. PR #50 / PD-055 later added a separate confirmed state backed by an agreement row.
- **Status:** Locked

---

### PD-055 — An official barter agreement is one immutable row, created only by two explicit acceptances of the same current version, and it closes the sourcing post atomically
- **Decided:** 2026-09-05
- **Decision:** A barter agreement becomes **official** only when a proposal exists and is active, both participants have **explicitly accepted the same current version**, no newer version exists, the negotiation has not been released, and no agreement already exists for that negotiation or post. Authoring, proposing and countering are not acceptance. Finalization is **one server boundary** — `finalize_barter_agreement(p_proposal_id)` — that derives and re-verifies the caller, proposal, interest, offer, participants, current version, both acceptances and uniqueness under lock; it trusts no client-supplied version, participant, provider, offer, interest or acceptance state. It is **idempotent**: a repeat call returns the existing agreement. The agreement row stores **immutable references** — proposal, accepted version, sourcing offer and interest, both participants' provider and user ids, `officialized_at` — and duplicates no mutable proposal state; **the accepted version is authoritative for the agreed terms, and the public post is no longer authority.** Creating the agreement and **closing the sourcing post are atomic** (PD-049); the closure is permanent for normal users (PD-051). Once official, the negotiation is **closed to change** — no counter, no new acceptance — and **pre-agreement release is no longer available** (PD-049's exit ends before an agreement, not after one). Exactly **one agreement may ever exist per proposal, per accepted version, per sourcing post and per interest**. No obligation, delivery, confirmation-window, no-show, cancellation-after-agreement or adjudication model is created; the agreement preserves the accepted terms by reference for a later slice to derive obligations from.
- **Rationale:** "Both accepted the same current terms" is a fact that can be undone by a counter the next second; an agreement must be a durable act the parties can rely on, so it is a separate, explicit step with its own row. Making the accepted version — not the post, not a copy — the authority is what keeps the agreed terms exactly what two people accepted: the post stays editable (PD-047) and a copy could drift. Atomic post closure is the only honest reading of PD-049's "an agreement consumes the post": an agreement with the post still on the board invites a second negotiation on a consumed post, and a closed post with no agreement strands a negotiation both parties had finished. Withdrawing release after agreement follows from what release means — the pre-agreement exit; letting it erase a confirmed trade's basis while the agreement row stood would leave the record contradicting itself. The post-agreement guards are **additive triggers** rather than rewrites of `submit_barter_counter`, `accept_barter_version` and `release_barter_interest`, for the reason the ledger records twice: a `create or replace` from a stale copy deletes corrections silently, and a trigger binds the rule to the transition so every path inherits it.
- **Evidence:** Founder ruling, 2026-09-05. Implemented by `supabase/migrations/20260927000000_barter_agreement_finalization.sql` and forward-corrected by `20260928000000` (a field-reference bug in the post-agreement guard, caught by B5B on first run after apply), `20260929000000` (fail-closed unresolved guard dispatch and agreement-facing grant/owner hardening), and `20260930000000` (`PT409` for confirmed-trade terminal refusals). Asserted in `supabase/tests/agreement.test.sql` — zero/one/old-version acceptances refused, stranger refused, participant may finalize, idempotent, one per negotiation/post, accepted-version reference immutable, post closes atomically and cannot reopen, counter/new-acceptance/release refused after agreement, released negotiation cannot finalize, every new object's grants/RLS/definer posture pinned — and, for the races B5B cannot stage, `scripts/negotiation-concurrency.mjs` (finalize × finalize, finalize vs counter, finalize vs release, each with overlap proven). Client states in `lib/negotiationState.ts` (`agreed` = "Ready to confirm trade", `confirmed` = "Trade confirmed"), `lib/tradeActivity.ts` (a Confirmed trades section), and `lib/barterErrors.ts` (confirmed-trade copy keyed by `PT409`), tested.
- **Status:** Locked

---

## Not decisions

Recorded so they are not mistaken for locked state:

- **Paid / Trade / Hybrid** as a booking-type architecture — a working idea, **not approved**. (OQ-001 closed 2026-09-04 on the narrower question of where the trade flag lives; this architecture remains unapproved.)
- ~~Any specific barter transaction model (reciprocal bookings vs a parent trade agreement) — open. See OQ-002.~~ **Superseded 2026-09-04:** settled as a parent trade agreement with directed obligations. See `BARTER_BETA_CONTRACT.md` § 4 and § 6.
- The exact first provider-category mix for the beta cohort — open. See OQ-030.
