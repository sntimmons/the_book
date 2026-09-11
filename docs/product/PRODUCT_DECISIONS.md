# Product Decisions — locked

**Status:** Authoritative. Owner: Founder (Stephen). Maintained by the Project State Steward.
**Last edited by:** **Session 8C** (safety hardening), which implemented PD-088 and PD-089 and
recorded **PD-090** — the ruling that closes OQ-076: The Book builds no block-status oracle, and
inference by a determined user comparing otherwise-authorized data is an **accepted closed-beta
limitation** rather than a blocker. The broad booking/thread/review/contract read policies are
deliberately NOT narrowed to defeat it.

Before it, the **Session 8** branch (safety, trust and operator handling) recorded
**PD-082 … PD-089**. The last three are **Founder rulings on the finished branch**, closing the
three questions Session 8 filed rather than answered: **PD-087** (a block is never announced, but
need not be undiscoverable — no code change), **PD-088** (report intake gets a bounded abuse
control before broad beta — **not implemented**), and **PD-089** (a blocked person disappears from
ordinary discovery and community surfaces — **not implemented**, and explicitly not Session 8B).
The same rulings amended **PD-068** to **PARTIALLY SATISFIED**, because the queue's backend existed
and its operator SURFACE did not — and a backend with no surface does not satisfy that decision.
**Session 8B then built the surface** (`c4afee5`, 2026-09-10) and PD-068 is now **SATISFIED**; the
earlier status is kept in the entry because the reason it was withheld is the useful part.

Session 8's own five were **PD-082 … PD-086** — user blocking and its live-transaction exception, one reporting path that
opens an operator case, provider eligibility gating writes but never cleanup, the operator Review
Queue and its narrow authority, and the de-approved provider's real appeal route. **PD-086 closes
the Session 8 appeal route PD-081 recorded as owed**, and PD-085 closes the queue PD-068 and PD-072
were waiting on — with the limit stated plainly in both: *the data model, the intake and the
operator RPCs exist; there is no operator UI, the RPCs are `service_role`-only, and there is still
no SLA.*

Before it, **PR #74** (Pre-Session-8 Correction 3) recorded **PD-071 … PD-081** —
the booking-request lifecycle and its 72-hour server expiry, the deliverer's review request
(closing OQ-071), the beta discovery lanes and their content-neutrality rule, the "Houston Beta
Provider" trust signal (closing the claims half of OQ-035), provider-owned no-show policy and
de-approval wording, provider media deletion and the required onboarding review page, the client's
72-hour expectation, telling a de-approved provider, no placebo preference data, and the barter
happy-path shape as a future requirement. **PD-080 is the only one of the eleven not implemented, and deliberately so.** Before it, the post-Session-7 state reconciliation changed **no decision** — only
this preamble's indexing — and before that, the derived-agreement-presentation branch (**PR #70**,
`f5fd197`) recorded **PD-070** and removed the last live barter dollar-value UX under PD-069, and
before that the manual-adjudication branch (**PR #68**, `5c24e8f`) recorded **PD-064** through
**PD-069**. Each carries its own
implementation notes in with its code, as PR #64 did for PD-062 / PD-063 and PR #62 did for
PD-057 / PD-059. Earlier known-numbered edits: PR #65 (the reconciliation that corrected PR #64's
citations), the unnumbered reconciliation that followed PR #66, and **PR #69** (`c04e5bd`) —
which added [FUTURE_PRODUCT_IDEAS.md](FUTURE_PRODUCT_IDEAS.md) and the marketing message bank and
**decided nothing**, so it appears in no entry below.

**Nothing here was decided, superseded or reopened by PR #66** (`0f2b93c`), the
behaviour-preserving pre-adjudication cleanup: it added no migration and no database object, and
**PD-062 and PD-063 remain Locked and implemented exactly as PR #64 merged them**. One
implementation detail inside PD-063's *Consequences* was renamed by that PR and is corrected below;
the decision itself is untouched.

**PD-064 … PD-067 record manual adjudication and the three terminal OBLIGATION outcomes.** They
do **not** create an agreement-level outcome — ~~that roll-up is deferred~~ **and PD-070 has
since ruled that it never will be persisted at all** — and they do **not** resolve how a plain
Needs Attention might enter Under Review, which remains open.

**The question those four decisions raised is now ANSWERED by PD-068.** It read: the
adjudication path exists, but **no shipped surface calls it**, so no obligation can actually
reach a terminal outcome in the running product — who performs a review, through what surface,
and within what expectation? The Founder answered on 2026-09-08: **an authorized operator and
never a participant**; **a minimal internal Review Queue, required before live beta and
deliberately not built in the adjudication slice**; and **no public resolution SLA at all** —
participants are told only "This trade is under review." The gap PD-064 left is therefore still
a gap in the running product, but it is now a **named pre-beta requirement** rather than an open
question. **PD-069** settles the adjacent one the pressure test raised: the platform does not
appraise the trade, and adjudication concerns **performance, not value**.

**PD-070 closes the persist-vs-derive question** that PD-065 deferred and the paragraph above
recorded as open: agreement-level resolution is **derived** from the immutable obligation,
adjudication and cancellation facts, never stored, and no roll-up label may overstate what was
found. **No open question was ever minted for it, and none should be.**

**Still genuinely open after PD-068 … PD-070:** how a plain Needs Attention might enter Under
Review. That is the last undecided question in the barter lifecycle engine.

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
- **Evidence:** Founder ruling, 2026-09-04. Closes OQ-004. Stated in `BARTER_BETA_CONTRACT.md` § 7. PR #50 later implemented the official agreement row, PR #54 the two directed obligation rows, and PR #56 (`46c0bef`) the **delivery mark and the receiver's one-time answer** — `mark_barter_obligation_delivered`, `confirm_barter_obligation_received` and `report_barter_obligation_not_received` in `supabase/migrations/20261004000000_barter_obligation_delivery.sql`. Those are **events, not verdicts**: `received` is deliberately not `fulfilled` and `not_received` is deliberately not `unfulfilled`, `disputed` or `needs_attention` (same file, lines 8–20).

  **§ 7.2 is now implemented.** PR #58 (`5b1a7a9`) adds `barter_agreement_cancellations` and `cancel_barter_agreement(uuid, text)` in `supabase/migrations/20261005000000_barter_pre_delivery_cancellation.sql`, hardened by `20261006000000` and carrying the counterparty signal through `20261007000000`, `20261008000000`, `20261009000000` and `20261010000000` (the live definition of the RPC **until PR #64**, whose `20261015000000_under_review_precedes_cancellation.sql` is now the live body — see PD-063). What the code does matches this decision on each clause: either participant may cancel before **any** delivery without the other's permission; the actor, timing and optional reason are recorded; **Mutually Cancelled is derived from two explicit acts** and **Cancelled by Participant** from one, with neither stored (`20261005000000:11-15`, `:263-284`); once anything is delivered the ordinary exit is refused permanently (`:252-260`); and no review, reputation or ranking effect is produced anywhere. One nuance the code records rather than this entry deciding: the classification is derived from a **row count**, so two participants cancelling concurrently also reach `mutually_cancelled` — the Founder ruling behind `20261010000000` kept that classification and changed only the thread wording, to "Both providers cancelled…", because two acts prove each cancelled and not that either assented (`20261010000000:11-35`).

  **§ 7.3–7.5 are now PARTLY implemented, and this sentence is the one to read carefully.** **Needs Attention** exists as of PR #62 (PD-057/PD-059), and **no-show reporting** and **Under Review** exist as of PR #64 — the Founder rulings of 2026-09-07, now recorded as **PD-062** and **PD-063** and implemented across the **seven** migrations `20261012000000` … `20261018000000`. All three are DERIVED read states with no status value, no column and no persisted transition, so none of them is an outcome. **§ 7.5 is now PARTLY implemented too, and this clause is newer than the rest of the paragraph:** manual **operator adjudication** and the three **terminal OBLIGATION outcomes** (Fulfilled / Unfulfilled / Closed without resolution) exist as of PD-064 … PD-067. Unlike Needs Attention and Under Review, a terminal outcome IS persisted — it is a decision somebody made, not a state derived from timestamps — and it lives in its own immutable record rather than on the obligation. What remains **not implemented**: no 7-day timeout TRANSITION, no automatic fulfilment or completion, no automatic agreement finalization, and **no terminal AGREEMENT outcome** (no Completed / Partially Fulfilled / Not Completed) — ~~that roll-up is deferred, and PD-065 asserts its absence rather than assuming it~~ **CORRECTED 2026-09-08: the roll-up is not deferred, it is REFUSED PERMANENTLY by PD-070.** Agreement-level resolution is DERIVED from the immutable obligation, adjudication and cancellation facts and is never stored, and where a single label would overstate what was found the product states the two obligation truths instead. PD-065 still asserts the absence rather than assuming it, and that assertion is now a standing rule rather than a placeholder. *(This is a factual correction to an implementation note, not a change to the decision above it.)* Two further absences are **deliberate and recorded rather than merely pending**: how a plain Needs Attention might later enter Under Review is **UNRESOLVED** — no second timer, no automatic escalation, no participant escalation action and no operator auto-escalation exists — and a **no-show in-thread conversation notice is DEFERRED** to the adjudication / review workflow.

  **A citation correction, recorded rather than quietly fixed.** This entry previously cited `supabase/tests/cancellation.test.sql:700-713` as proof of that absence. That assertion named a function `report_barter_no_show`, which has never existed under that spelling — so it passed vacuously and would not have noticed the real `report_barter_obligation_no_show` when it shipped. The assertion is now a PATTERN sweep (`supabase/tests/cancellation.test.sql:707-722`) with an explicit five-name exemption, matching `receiver_window.test.sql`, and the absence of adjudication and terminal outcomes was asserted there and in `supabase/tests/no_show_under_review.test.sql`. **Those sweeps were amended when adjudication shipped** (PD-064 … PD-067): the three objects `20261019000000` adds are exempted BY NAME in each, a fourth adjudication-shaped function still fails, and the agreement-level roll-up vocabulary remains banned outright. Note the migrations are the *implementation*, not the approval. **The ledger gap this paragraph used to record is now closed:** it read "no PD yet records the 2026-09-07 no-show / Under Review ruling; one should be assigned by the Founder rather than minted here." The Founder assigned two — **PD-062** and **PD-063** below, both `Locked; implemented` — so that sentence is **superseded**.
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
- **Evidence:** Founder ruling, 2026-09-05. Implemented by `supabase/migrations/20260927000000_barter_agreement_finalization.sql` and forward-corrected by `20260928000000` (a field-reference bug in the post-agreement guard, caught by B5B on first run after apply), `20260929000000` (fail-closed unresolved guard dispatch and agreement-facing grant/owner hardening), and `20260930000000` (`PT409` for confirmed-trade terminal refusals). Asserted in `supabase/tests/agreement.test.sql` — zero/one/old-version acceptances refused, stranger refused, participant may finalize, idempotent, one per negotiation/post, accepted-version reference immutable, post closes atomically and cannot reopen, counter/new-acceptance/release refused after agreement, released negotiation cannot finalize, every new object's grants/RLS/definer posture pinned — and, for the races B5B cannot stage, `scripts/negotiation-concurrency.mjs` (finalize × finalize, finalize vs counter, finalize vs release, each with overlap proven). Client states in `lib/negotiationState.ts` (`agreed` = "Ready to confirm trade", `confirmed` = "Trade confirmed"), `lib/tradeActivity.ts` (a Confirmed trades section — **renamed "Trades" by PR #58**, because a cancelled trade stays in that group as durable history and the heading is read before the rows beneath it, `lib/tradeActivity.ts:115-124`), and `lib/barterErrors.ts` (confirmed-trade copy keyed by `PT409`), tested.
- **Status:** Locked

---

### PD-056 — Proposal timing must remain future-valid until agreement finalization
- **Decided:** 2026-09-05
- **Decision:** A barter proposal version's timing must be valid when the version is authored,
  when a participant accepts that version, and when the official agreement is finalized. For
  both directed terms, `due_at` must be greater than server current time and `scheduled_at` must
  be null or greater than server current time. Timing belongs to the immutable proposal version:
  if either side's timing expires, that version is no longer acceptable or finalizable, and the
  participants must author a **new proposal version** with updated timing. The expired
  historical version must not be mutated, automatically extended, or silently accepted. The user
  outcome is a truthful stale/terminal-for-this-version message: "These trade terms have
  expired. Update the timing before continuing."
- **Rationale:** A version authored with future timing can become stale before the other
  participant accepts or before either participant finalizes. Letting that version finalize would
  create an official agreement that begins already overdue, and the obligation slice will derive
  directly from the accepted version.
- **Evidence:** Founder amendment, 2026-09-05. Implemented by PR #52:
  `supabase/migrations/20261001000000_proposal_term_timing.sql` adds required `due_at` and
  optional `scheduled_at` to proposal terms and validates them at author time;
  `20261002000000_proposal_timing_expiry_guards.sql` adds additive acceptance/finalization
  triggers that raise SQLSTATE `PT410` when timing has expired. Asserted in
  `supabase/tests/negotiation.test.sql`, `supabase/tests/agreement.test.sql`,
  `__tests__/lib/barterWriteFailure.test.ts` and `__tests__/lib/negotiationState.test.ts`.
- **Status:** Locked

---

### PD-057 — The receiver-confirmation deadline is anchored on the later of delivery and the agreed time, and its expiry never means fulfilment

- **Decided:** 2026-09-05
- **Decision:** When the receiver-response window is built, its anchor is
  **`confirmation_anchor` = the later of `delivered_at` and (`scheduled_at` when it exists,
  otherwise `due_at`)** — conceptually `max(delivered_at, scheduled_at ?? due_at)`. The
  receiver-response deadline is **`confirmation_anchor` + 7 days**. Expiry of that window
  **must not** automatically mean **Fulfilled** or **Completed**; an unresolved expiry routes
  to **Needs Attention**, and possibly onward to **Under Review**. This is a **future rule**:
  no timeout implementation exists on `main`.
- **Rationale:** Recorded as issued. The ruling states the anchor and its one prohibition —
  elapsed time must not manufacture an outcome — and no fuller rationale was supplied, so none
  has been invented here. The prohibition matches what `BARTER_BETA_CONTRACT.md` § 6 already
  requires (line 146: "There is no timeout completion… Silence is not consent, and elapsed time
  earns no credit").
- **Evidence:** Founder ruling via PM, 2026-09-05, supplied to this reconciliation and recorded
  in the Decision above. **Not implemented on `main` at `46c0bef`:**
  `supabase/migrations/20261004000000_barter_obligation_delivery.sql` adds only `status`,
  `delivered_at` and `receipt_responded_at`, nothing that expires, and its own header records
  the 7-day timeout transition as deliberately absent (lines 22–26). One divergence is flagged
  rather than resolved here: that comment (lines 25–26) describes the future window as derived
  from `delivered_at` **alone**, which is narrower than the anchor this entry records. The
  migration is outside the Steward's writable scope; reconciling the comment needs a code owner.
  The two facts the wider anchor needs — `due_at` and `scheduled_at` — are already immutable
  columns on `barter_obligations` (`20261003000000_barter_obligations_foundation.sql`), so no
  schema consequence follows from either reading today.
- **Implemented 2026-09-07 by PR #62**, and the comment divergence flagged above is **reconciled**:
  `supabase/migrations/20261011000000_barter_receiver_window_needs_attention.sql` spells the
  anchor once, in `public.barter_confirmation_anchor` —
  `max(delivered_at, coalesce(scheduled_at, due_at))`, NULL before delivery — with
  `public.barter_confirmation_deadline` the **only** place the 7-day interval is written. The
  applied `20261004000000` was **not edited** (forward-only); its narrower comment is superseded
  by the new migration's header and by
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md). The **anchor is the later of the
  two** precisely so a deliverer who marks delivered early cannot shorten the receiver's window.
  Expiry creates **no outcome**: an unanswered elapsed window is the derived state
  `needs_attention` and the row stays `delivered`; the four-value `status` vocabulary is
  unchanged and Needs Attention is deliberately **not** a status value. **Derived, not
  persisted** — no column, trigger, job or scheduler exists to flip a row at a deadline. The
  boundary is **inclusive** (`server_now >= confirmation_deadline`, Founder ruling 2026-09-06),
  and the deadline pins its timezone so both participants compute the same instant. Asserted by
  113 assertions in `supabase/tests/receiver_window.test.sql`, including the three anchor cases,
  all three boundary edges, and DST determinism.
- **Founder ruling, 2026-09-07 — the contract-integrity principle extends to the AGREEMENT.**
  The same rule that freezes the obligation's contract fields (§ 3b of `20261011000000`) applies
  to core `barter_agreements` identity: after official agreement formation, ordinary
  `service_role` maintenance must not silently rewrite the participants, the offer identity, the
  interest identity, the proposal identity, `accepted_version_id`, or equivalent authoritative
  source/participant references. Any future operational correction must be explicit, separately
  approved and auditable. **This is a principle, not a claim about today's code:**
  `enforce_barter_agreement_immutable` currently refuses ordinary callers absolutely but gives
  `service_role` and the no-JWT path an unconditional early return, so it does **not** yet
  enforce this. PR #62 deliberately did **not** broaden into agreement hardening — the slice does
  not touch that trigger — and the bounded follow-up is recorded with live-catalog evidence in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md).
- **Status:** Locked; **implemented** (the implementation records this decision, it is not the
  approval of one)

---

### PD-058 — `not_received` is an immutable receiver statement, not the obligation's final verdict

- **Decided:** 2026-09-05
- **Decision:** `not_received` **stays immutable**. It is a historical **receiver statement /
  event**, not the final adjudicated obligation verdict. There is **no flipping in either
  direction** — not `not_received → received`, and not `received → not_received`. A later
  resolution workflow **may record a subsequent resolution or outcome separately**, while
  **preserving the original receiver event**.
- **Rationale:** As issued: the receiver's answer records what that participant said at a point
  in time. An outcome that overwrote it would destroy the only record of the statement a later
  resolution is meant to act on.
- **Evidence:** Founder ruling via PM, 2026-09-05. Already enforced on `main` at `46c0bef` by
  `supabase/migrations/20261004000000_barter_obligation_delivery.sql`: the transition guard
  permits only `pending → delivered` and `delivered → received | not_received` and refuses
  everything else, `received ↔ not_received` explicitly (lines 128–135); a second, differing
  answer raises SQLSTATE `PT412` (line 347); `receipt_responded_at` and `delivered_at` are
  write-once (lines 137–147); and four CHECK constraints bind each status to its stamp (lines
  36–64). Client copy states the receiver's answer as theirs and adds "Nothing has been
  decided." (`lib/obligationState.ts:145-156` for the deliverer's view, `:177-184` for the
  receiver's — line numbers as of `main` @ `26fb7fd`, PR #62 having grown that file). Asserted in
  `supabase/tests/obligation.test.sql`. **Still true after PR #62**, and load-bearing there:
  because an explicit answer moves the obligation off `delivered`, the PD-057 window returns
  `none` for an answered obligation however long ago its deadline passed, so elapsed time can
  never drag a receiver's recorded statement into Needs Attention
  (`supabase/migrations/20261011000000_barter_receiver_window_needs_attention.sql:63-66`,
  asserted in `supabase/tests/receiver_window.test.sql` § 5). The implementation **records** this
  decision; it is not the approval of one.
- **Status:** Locked

---

### PD-059 — No receiver push notifications in this pass; Trade Activity must surface an unanswered delivery before beta

- **Decided:** 2026-09-05
- **Decision:** **No push-notification work was done, and none is planned for this pass.**
  Before beta, **Trade Activity must eventually surface an unanswered delivered obligation as
  requiring receiver attention.** That belongs to the **subsequent Session 7 attention / timeout
  UX** and is **not built**.
- **Rationale:** As issued. Recorded so the absence of any receiver signal reads as a known,
  scheduled gap rather than an oversight.
- **Evidence:** Founder ruling via PM, 2026-09-05. Current state at `46c0bef`: nothing notifies
  the receiver that a delivery happened —
  `supabase/migrations/20261004000000_barter_obligation_delivery.sql` creates no notification
  path, and `lib/tradeActivity.ts` contains no obligation awareness at all (no occurrence of
  "obligation" in the file). The lifecycle is visible only on the negotiation screen,
  `app/community/negotiation/[id].tsx`, which reloads on focus (`useFocusEffect`).

  **Still true after PR #58, and worth stating precisely so the two are not confused.** PR #58
  added a durable **in-thread system message** on cancellation, written best-effort into the
  provider pair's existing canonical conversation by `public.pair_conversation_notice`
  (`supabase/migrations/20261009000000_pair_conversation_notice.sql`, whose own header records
  "NOT A NOTIFICATION SYSTEM. No push, no device notice, no email", lines 32–33). **No push,
  device or email notification exists anywhere in the product**, and **a delivery still produces
  no signal at all** — the notice is written only by `cancel_barter_agreement`. The Trade Activity
  attention UX this entry requires before beta remains **not built**.
- **Implemented 2026-09-07 by PR #62 — the Trade Activity half only.** An unanswered delivered
  obligation is now surfaced as needing attention: `my_trade_activity` gained role-relative
  `my_response_state` / `their_response_state` (each participant receives exactly one obligation
  and delivers exactly one, so both are scalar reads, not roll-ups), and `lib/tradeActivity.ts`
  turns them into one truthful row label — **Action needed** for the receiver inside the window,
  **Waiting for confirmation** for the deliverer, **Needs attention** for either once it elapses,
  with cancellation still dominant. **The push half of this entry is unchanged and remains
  deliberately unbuilt:** no push, device or email notification exists anywhere in the product,
  and PR #62 added none.
- **Founder rulings, 2026-09-07, issued on PR #62 and implemented in it:**
  - **AGREEMENT-LEVEL vs OBLIGATION-LEVEL are different scopes, and the higher one does not
    silence the lower.** When one obligation is already Needs Attention while this viewer still
    has an unanswered delivered obligation whose OWN deadline has not passed, the agreement-level
    headline **may remain Needs Attention** — it is the higher-severity trade-level state — but
    it **must not suppress the viewer's own live obligation-level action**. The confirmed trade
    detail continues to show, for the viewer's own unanswered obligation: **Action needed**, the
    **response deadline**, and both **Confirm received** / **Didn't receive**. Conceptually:
    *Agreement: Needs Attention · Current user's obligation: Action needed — respond by
    [deadline]*. **An actionable deadline is never hidden merely because the other obligation
    escalated.** Trade Activity previously did hide it, and no longer does.
  - **SURFACE SCOPE for this slice is Trade Activity + the confirmed trade detail.** PD-059 is
    satisfied by Trade Activity. The general barter feed card and the offer-responses screen are
    **deferred** to Session 7 closeout / cross-app audit: both render "Trade confirmed. The
    agreed terms can no longer change.", which is **incomplete but not false** — the trade is
    confirmed and its terms are frozen — so neither becomes actively false under the new state,
    which was the test for pulling them in.
- **Status:** Locked. **Trade Activity attention: implemented.** **Trade detail obligation-level
  action: implemented.** Feed card / offer-responses: **deferred, recorded**. Push notifications:
  still **not built**, and still not planned for this pass (the cancellation in-thread notice is
  not a notification either)

---

### PD-060 — Cancellation communication and reason visibility

- **Decided:** 2026-09-06
- **Decision:** When one participant cancels an official barter agreement before delivery, the
  counterparty **may receive a durable best-effort in-thread system notice**. The optional
  cancellation reason is **visible to both agreement participants** — it is **not** private and
  **not** admin-only. The reason is **contextual only**: it does not itself establish fault, a
  no-show, a reliability impact, an adjudication, or any terminal outcome, none of which exist.
- **Rationale:** As issued. PD-046 asked for "an optional reason" and stopped there, which left
  two questions the implementation had to answer anyway: who reads it, and what it means. Both
  were answered in code without a decision to point at. Sharing it is the honest default — a
  provider whose counterparty walked away from a commitment is owed the stated reason, and a
  reason held back from the person it concerns is a note about them rather than to them.
  Bounding it to *context* is the other half: a free-text sentence typed at the moment of
  abandoning a trade is evidence of nothing, and the moment the product treats it as a finding
  it has built adjudication by accident.
  **Best-effort** is a property of the notice, not a hedge: the notice must never be able to
  veto the cancellation it announces, so a thread that cannot take a message loses the notice
  and keeps the cancellation. That is why no copy at the moment of an irreversible act promises
  the other provider will be told.
- **Evidence:** Founder ruling via PM, recorded 2026-09-06; the rulings themselves were issued
  during PR #58 and are already implemented on `main` at `d735b72`.
  - The notice: `public.pair_conversation_notice`
    (`supabase/migrations/20261009000000_pair_conversation_notice.sql`) writes one durable
    platform message into the provider pair's existing canonical conversation, skips a thread
    that cannot take it, and wraps the write so it cannot roll back the act. Called by
    `cancel_barter_agreement` — whose live definition was `20261010000000_cancellation_notice_
    neutral_copy.sql` when this entry was written and is
    **`20261015000000_under_review_precedes_cancellation.sql` as of PR #64**; the notice and its
    copy are carried forward unchanged there. **Not a notification** — no push, no
    device notice, no email (PD-059). **PR #64 added no notice of its own:** a no-show report
    writes nothing into the thread, deliberately (deferred by Founder ruling, 2026-09-07).
  - Participant-visible reason: `my_barter_proposals` exposes `my_cancel_reason` **and**
    `their_cancel_reason` to each participant; `NegotiationRow` carries both
    (`lib/negotiation.ts:35-50`), `cancellationReasons` attributes each to whoever said it
    (`lib/tradeCancellation.ts`), and `app/community/negotiation/[id].tsx` renders both reasons
    for both viewers.
  - Reason is context, not verdict: the composer says so before submission —
    `CANCEL_REASON_NOTE` is "Optional reason — shared with the other provider."
    (`lib/tradeCancellation.ts:208`) — and the reason is deliberately **absent from the durable
    notice**. No fault, no-show, reliability, adjudication or terminal-outcome model exists to
    attach it to. There is no reason taxonomy, for the same reason.
  - Asserted in `__tests__/lib/tradeCancellation.test.ts` and
    `supabase/tests/cancellation.test.sql`.
- **Status:** Locked; **implemented** (the implementation records this decision, it is not the
  approval of one)

---

### PD-061 — Neutral mutual-cancellation notice wording

- **Decided:** 2026-09-06
- **Decision:** When both agreement participants have **independently recorded cancellation
  actions**, the agreement **may be classified `Mutually Cancelled`** — but the durable
  system-message copy must state **only the proven fact that both providers cancelled**. It must
  **not** claim they "agreed" unless the UX context specifically represents one participant
  explicitly assenting to the other participant's prior cancellation. The canonical durable
  notice is the neutral factual form:

  > Both providers cancelled the trade for "X" for "Y".

  Quoted byte-exactly, including the double quotes: `barter_terms_label` wraps each side of the
  post in `"` (`20260914000000_trade_activity_corrections.sql`), so `v_label` is itself
  `"X" for "Y"` and the doubled "for" is correct rather than a typo. The exact string matters
  because this entry's own rationale is that copying an earlier function body forward restores
  the untrue wording — so this is the string a future contributor re-derives from.

  The classification is unchanged: two explicit acts is still what the product calls Mutually
  Cancelled. **"Agree to cancel" remains correct as the UI action** offered to a counterparty
  responding to a cancellation they can see — there, that participant *is* assenting, and the
  word is accurate about what they are doing.
- **Rationale:** As issued. The classification is derived from a **row count**, and two
  different sequences reach two acts: one where B reads A's cancellation and answers it, and one
  where A and B quit concurrently, neither having seen the other, each for their own reasons.
  "Both providers agreed to cancel" is true of the first and false of the second, and the notice
  cannot tell them apart. Writing a meeting of minds into a **durable thread message** — the
  record either provider may later be asked to stand behind — is an assertion about their intent
  that the server has no evidence for. The neutral form states what the two acts do prove and is
  true of both sequences, which is the right sentence for a fact derived from counting rather
  than from anyone's assent. Assent is a property of a **specific UX moment**, not of the
  aggregate state, so it may be said only where that moment is what happened.
- **Evidence:** Founder ruling via PM, recorded 2026-09-06; issued during PR #58 and already
  implemented on `main` at `d735b72`.
  `supabase/migrations/20261010000000_cancellation_notice_neutral_copy.sql` is a **copy-only**
  replacement of `cancel_barter_agreement` that changes exactly one string literal: line 128 now
  emits `'Both providers cancelled the trade for ' || v_label || '.'` where `20261009000000`
  line 202 emitted `'Both providers agreed to cancel the trade for '`. Its header records the
  defect and the reasoning (lines 10–35). The classification still returns `mutually_cancelled`
  on `v_acts >= 2`, and `AGREE_TO_CANCEL_COPY` (`lib/tradeCancellation.ts:182-189`) keeps
  "Agree to cancel" for the counterparty-response control. See
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) — `cancel_barter_agreement` is the
  most-redefined function in the repo, and copying any earlier body forward restores the untrue
  wording.
- **Status:** Locked; **implemented** (the implementation records this decision, it is not the
  approval of one)

---

### PD-062 — No-show reporting and the review transition
- **Decided:** 2026-09-07
- **Decision:** A no-show may be reported **only by the RECEIVER** of an obligation whose
  `scheduled_at` is **non-null**, at or after that scheduled time, using **server-authoritative
  time**. A valid no-show report is an **immutable participant-reported event** — not a finding
  of fault and not a terminal outcome. It places the affected obligation, and its agreement, into
  **Under Review**. A no-show does **not** automatically mean Unfulfilled, Failed, Needs
  Attention, a reliability impact or a reputation impact.
- **Why:** The receiver is the participant who expected the scheduled service, so they are the
  only one who can report it did not happen; the deliverer reporting themselves is not a thing
  the product needs. Anchoring on `scheduled_at` rather than `due_at` matters: a receiver must
  not have to wait out the delivery window to say a booking was missed. Server time is the
  boundary because a device clock could otherwise bring an appointment forward.
- **Consequences:** `public.barter_obligation_no_show_reports` is append-only with one row per
  obligation; the report cannot be edited, withdrawn or re-stamped, and a repeat call returns the
  original timestamp. Under Review is **DERIVED** —
  `(a report exists) OR (status = 'not_received')`, minus cancelled — with no status value, no
  column and no case table, so there is no second place for the answer to disagree. `not_received`
  qualifies on its own, so nobody files a second complaint to be heard. The obligation `status`
  vocabulary is unchanged at four values. Cancelled agreements never enter Under Review.
  **The reason is participant-visible context:** both participants may read it, non-participants
  and anon may not, and the UI attributes it as the reporting participant's STATEMENT — never as
  a platform finding, proof of fault, an adjudication, a reliability judgment or a reputation
  effect. The composer discloses the sharing **above** the input, before the writer commits, as
  PD-060/PD-062's cancellation-reason precedent requires.
- **Evidence:** Founder ruling, 2026-09-07. Implemented by
  `supabase/migrations/20261012000000_barter_no_show_under_review.sql`,
  `20261013000000_no_show_eligibility_single_source.sql`,
  `20261014000000_no_show_lock_order.sql`,
  `20261016000000_no_show_reason_read_model.sql` and
  `20261018000000_no_show_created_at_server_stamped.sql`. Asserted in
  `supabase/tests/no_show_under_review.test.sql` and `__tests__/lib/underReview.test.ts`.
  Supersedes the `no-show → Needs Attention → adjudication → Unfulfilled` route in
  [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 7.4, which is marked superseded there.
- **Status:** Locked; **implemented**

---

### PD-063 — Under Review takes precedence over ordinary cancellation
- **Decided:** 2026-09-07
- **Decision:** Once a valid no-show report has been recorded, the agreement is **Under Review**
  and **ordinary pre-delivery cancellation is no longer available**. If a cancellation commits
  first, a later no-show report is **refused**. If a no-show report commits first, a later
  ordinary cancellation is **refused**. A cancellation/no-show race must resolve to **exactly one
  authoritative state**, and **cancellation may never erase an existing review-worthy event**.
- **Why:** Without this, the provider a report is ABOUT could cancel the trade and make the
  report stop counting — the only accountability signal the slice creates, cleared unilaterally
  by its subject. PD-046 makes the pre-delivery exit unilateral by design, which is right while
  nothing has been reported and wrong the moment something has.
- **Consequences:** `cancel_barter_agreement` refuses with **`PT423`** once any no-show report
  exists on the agreement, and `enforce_barter_cancellation_consistent` carries the same rule as
  defence in depth. `PT423` is deliberately a NEW SQLSTATE rather than reuse of
  `object_not_in_prerequisite_state`, which already means "something has already been delivered" —
  a trade under review has not necessarily been delivered, and saying so would be false. The
  client stops offering the control so no button is drawn that could only be refused. **Since
  PR #66 that conjunct is named `noShowReported` and asks the same question `PT423` asks** — does a
  `barter_obligation_no_show_reports` row exist — instead of reading the server's broader
  `under_review` column (`report OR not_received`), which is a WIDER predicate that happened to
  give the same answer only because `not_received` implies `delivered_at is not null` and
  `anyDelivered` had therefore already closed the exit. That was a coincidence between two guards
  two migrations apart, not a derivation; the decision is unchanged and the client now enforces it
  directly (`lib/tradeCancellation.ts:157-177`, applied at `:193` and `:200`; derived at
  `app/community/negotiation/[id].tsx:237`). **This is not a finding of fault:** refusing cancellation
  removes one exit and decides nothing. **Race safety is structural, not hopeful:** both writers
  take the `barter_agreements` row lock FIRST (`20261014000000` put the no-show RPC on that
  order), so the second to arrive blocks and then sees the first's committed state.
- **Evidence:** Founder ruling, 2026-09-07. Implemented in TWO halves:
  `supabase/migrations/20261015000000_under_review_precedes_cancellation.sql` (the RPC — and the
  live definition of `cancel_barter_agreement`) and
  `20261017000000_restore_cancellation_actor_binding.sql` (**the live definition of the
  `enforce_barter_cancellation_consistent` trigger**; `20261015000000`'s copy of that trigger is
  SUPERSEDED — it was written from the wrong source and reverted the actor binding, which B5B
  caught). Read the functions table in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) before redefining either. The race is
  proven
  by `scripts/negotiation-concurrency.mjs`, which asserts exactly one act succeeds and that
  neither deadlocks — an assertion that **caught a real `40P01`** before `20261014000000` fixed
  the lock order.
- **Status:** Locked; **implemented**

---

### PD-064 — Only an operator can resolve an obligation, and only one that is Under Review
- **Decided:** 2026-09-07
- **Decision:** An obligation reaches a terminal outcome in exactly one way: a **manual decision
  by an operator**. **Participants may not adjudicate their own trade**, and **no
  participant-facing adjudication path exists** — not a button, not an RPC, not a policy that
  could be reached with a crafted request. An obligation is **eligible only while it is Under
  Review**, which remains the two acts PD-062 named: an explicit **no-show report**, or an
  explicit **`not_received`** answer. **None of these makes an obligation eligible:** a passed
  confirmation deadline, **Needs Attention**, a deliverer having marked it delivered, a passed
  `due_at`, a passed `scheduled_at`. A **cancelled** agreement cannot be adjudicated at all.
- **Why:** A terminal outcome is the strongest statement this product makes about a trade, and
  the two people with an interest in what it says are the two who cannot be allowed to write it.
  Restricting eligibility to Under Review keeps that statement tied to somebody having actually
  reported that something went wrong, rather than to a clock — a deadline passing is silence,
  and silence is not a finding.
- **Consequences:** `public.adjudicate_barter_obligation(uuid, text, uuid, text)` holds
  `EXECUTE` **granted to `service_role` alone** — revoked from `public`, `anon` and
  `authenticated`. Three independent refusals enforce the boundary: the grant; a
  privileged-caller check inside the RPC; and a **the adjudicator may not be a participant**
  check made in the RPC and **re-made in the BEFORE INSERT trigger**, so it holds even for a
  privileged caller and a compromised operator process cannot record a provider as the
  adjudicator of their own trade.

  **A PRECISION CORRECTION, recorded rather than quietly fixed, because a future editor deciding
  which guard is safe to change would rely on it.** This sentence read *"each sufficient on its
  own."* That is true of the first two and **not** of the third, because they constrain different
  things: the grant and the in-RPC predicate constrain **who may CALL**, while the
  participant check constrains **who may be RECORDED as adjudicator**. With both outer layers
  removed, a participant could adjudicate their own trade by naming an unrelated user as the
  adjudicator, and both copies of the third check would pass. The redundancy that IS real is the
  third layer's own — RPC and trigger, each proven independently by disabling the other inside
  the harness transaction — which is what stops a compromised privileged process, not what stops
  a participant. Nothing is exploitable: all three layers are present and asserted. The decision
  is unchanged; only the claim about its structure is corrected. Ineligibility is refused with
  `object_not_in_prerequisite_state`; a cancelled agreement with **`PT409`**.
  **NO OPERATOR UI IS BUILT, and that is a decision rather than an omission.** `app/admin` is
  `__DEV__`-only and gated merely on "is a provider" (`app/admin/_layout.tsx`), so it is **not a
  trusted operator surface**; building the first real one is a larger question than this slice.
  Per the Founder ruling, the secure server path lands first and the screen is deferred rather
  than authorization being weakened to make a screen easy to build.
  **How a plain Needs Attention might enter Under Review is still UNRESOLVED** — this decision
  does not resolve it, and no automatic escalation, second timer, participant escalation action
  or operator auto-escalation was created.
- **Evidence:** Founder ruling, 2026-09-07.
  `supabase/migrations/20261019000000_barter_obligation_adjudication.sql`, hardened by
  `20261023000000_adjudication_hardening.sql` — **which is where the RPC's half of the
  participant check actually landed.** `20261019000000` asserted the two-layer design in five
  places and implemented only the trigger's layer; nothing was exploitable, but the redundancy
  this entry describes did not exist until `20261023000000`. It also narrowed the RPC's
  privileged predicate, which admitted a no-`sub` `anon` request in the very scenario its comment
  claimed to cover. Proven by `supabase/tests/adjudication.test.sql`: participants, unrelated
  users and `anon` are each refused (`42501`); merely delivered and Needs-Attention-only
  obligations are refused (`55000`); a cancelled agreement is refused (`PT409`); the grant posture
  is asserted directly (`service_role` yes, `authenticated` / `anon` / `PUBLIC` no); and **each
  participant-refusal layer is proven independently**, by disabling the trigger inside the
  harness transaction and asserting the RPC still refuses.
- **Status:** Locked; **implemented**

---

### PD-065 — Three terminal OBLIGATION outcomes, resolved one obligation at a time
- **Decided:** 2026-09-07
- **Decision:** Exactly three terminal outcomes exist, and they are **obligation-level**:
  **Fulfilled**, **Unfulfilled**, and **Closed without resolution**. *Closed without resolution*
  records that the available information did not support either finding — it is **not** a softer
  *Unfulfilled*, **not** a finding of fault, and carries **no reputation effect**. Each of a
  trade's two obligations is resolved **independently**: one side may be Fulfilled while the
  other is still Under Review, Unfulfilled, or closed. **No agreement-level outcome exists and
  none was created** — there is no *Completed*, no *Partially Fulfilled*, no *Not Completed*, and
  adjudicating both obligations triggers no roll-up.
- **Why:** The two obligations are separate promises and the evidence for them is separate.
  Forcing both to resolve together would make an operator decide a side they may know nothing
  about in order to close the side they do. And the product needs an honest third answer, or an
  operator is pushed into inventing a verdict to close a case.
- **Consequences:** The agreement-level roll-up is **DEFERRED, not half-built**: no column, no
  view field and no vocabulary for it exists anywhere. A trade whose two obligations are resolved
  differently simply reports each. Where one side is terminal and the other is not, the
  **agreement headline may legitimately still read Under review** — the trade does have work
  outstanding — while the resolved side is stated rather than hidden. Presentation carries **no
  blame language**: the subject of every sentence is the obligation, never the other provider.
- **Evidence:** Founder ruling, 2026-09-07. `20261019000000` (the three-value CHECK),
  `20261020000000` (the `terminal_outcome` column on `my_barter_obligations`), `20261021000000`
  (the two per-side columns on `my_trade_activity`), `lib/obligationState.ts`
  (`TERMINAL_OUTCOME_LABEL` / `TERMINAL_OUTCOME_NOTE`, both total `Record`s so a fourth outcome is
  a compile error), `lib/tradeActivity.ts`. Asserted by `supabase/tests/adjudication.test.sql`
  (both sides may hold different outcomes at once; **no agreement-level terminal column exists**;
  Trade Activity exposes only the two per-side columns) and
  `__tests__/lib/terminalOutcome.test.ts`.
- **Status:** Locked; **implemented**

---

### PD-066 — An adjudication is immutable, and it does not rewrite history
- **Decided:** 2026-09-07
- **Decision:** An obligation receives **at most one** final adjudication. There is **no edit, no
  deletion through any ordinary path, and no outcome flip**. Re-submitting the **same** outcome
  is safe and changes nothing; a **different** outcome is refused. An adjudication **does not
  rewrite what happened**: `delivered_at`, `status`, `receipt_responded_at`, a no-show report and
  its reason, `scheduled_at`, `due_at` and cancellation history all stand exactly as the
  participants left them. **A receiver's "Didn't receive" and a later Fulfilled outcome coexist
  permanently, and that is correct.**
- **Why:** One is what a participant reported; the other is what an operator concluded. Editing
  the first to agree with the second would destroy the evidence the second was reached from. And
  a terminal decision a trusted caller can quietly amend is not terminal.
- **Consequences:** A `UNIQUE (obligation_id)` constraint makes one-outcome-per-obligation a
  **database fact** rather than a check the RPC has to win a race to enforce. **UPDATE is refused
  for every caller, the privileged one included**; DELETE stays privileged-only because account
  and agreement erasure cascade through it. A second, different outcome is refused with
  **`PT412`**. Once an outcome exists the obligation is **resolved for participants too**:
  `mark_barter_obligation_delivered`, `record_barter_obligation_receipt` and
  `report_barter_obligation_no_show` each refuse with **`PT424`**, a refusal placed after the row
  lock and before the idempotent branch. **`PT424` is a NEW SQLSTATE, and the reason is PD-063's
  reason repeated:** every neighbouring code would say something false. `PT412` on those same
  functions already means *"your answer is recorded"* — a resolved obligation's receiver may never
  have answered at all; `PT409` means cancelled, which it is not; `PT423` means under review,
  which it no longer is, because the review ENDED. **This is recorded because it shipped wrong
  once inside this slice:** `20261020000000` reused `PT412`, so a receiver who had answered
  nothing would have been told *"You already answered this. Your answer was recorded and cannot be
  changed."*, and `mark_barter_obligation_delivered` — which has no `PT412` mapping at all — would
  have fallen through to *"Please try again."* on a permanently impossible action.
  `20261022000000` corrects it forward; `20261020000000` is applied history and was not edited.
  `adjudicate_barter_obligation`'s own `PT412` is unchanged and correct: there the caller is an
  operator and the obligation genuinely has already been resolved. A correction workflow, if the product ever needs one,
  must be its own explicitly approved and audited mechanism — **it is not in scope here.**
  **"Never withdrawn" survives the OPERATOR, too, and that took two more migrations.**
  `adjudicator_user_id` was originally `ON DELETE CASCADE`, copied from the no-show reports table
  — where the actor IS a participant and the cascade is coherent. Here the adjudicator is by
  construction *not* a participant, so erasing an operator's account deleted their decisions about
  other people's trades; and because every derived state keys on whether an adjudication exists,
  those obligations silently reverted to Under Review with the unique row gone, so a different
  outcome could then be recorded. It is now `ON DELETE SET NULL` (`20261023000000`), with the
  append-only trigger permitting **exactly that one update** — privileged caller,
  `adjudicator_user_id` the only column that may differ, non-null to null only
  (`20261024000000`). The decision survives; only who made it is forgotten, which is what an
  erasure is for and costs the participants nothing, since PD-067 already withholds the
  adjudicator from them. **TRUNCATE is also revoked from every role including `service_role`**
  (`20261025000000`): the append-only trigger is row-level and TRUNCATE fires no row triggers, so
  it was the one path that could discard every terminal outcome without a trigger seeing it.
- **Evidence:** Founder ruling, 2026-09-07. `20261019000000` (constraint and append-only
  trigger), `20261020000000` (the three participant refusals), `20261022000000` (their SQLSTATE),
  `20261023000000` / `20261024000000` (the erasure path) and `20261025000000` (TRUNCATE). Client copy in `lib/barterErrors.ts`, pinned by
  `__tests__/lib/barterWriteFailure.test.ts` — which asserts, specifically, that a resolved
  refusal never tells a participant they already answered. Proven by
  `supabase/tests/adjudication.test.sql` (the receiver's `not_received` survives a contradicting
  Fulfilled; the no-show reason and the timings survive; a repeat is safe and creates nothing; a
  flip is refused; direct INSERT/UPDATE/DELETE are refused, and privileged UPDATE with them) and
  by `scripts/negotiation-concurrency.mjs`, which races two operators to **different** outcomes
  and asserts exactly one commits with the loser refused `PT412`. The erasure half is proven in
  B5B: an operator's `auth.users` row is deleted and the outcome, both participants' view of it,
  and the refusal of a second decision all survive — while the outcome, rationale and timestamp
  are still unchangeable by the same privileged caller.
- **Status:** Locked; **implemented**

---

### PD-067 — What a participant may see of an adjudication
- **Decided:** 2026-09-07
- **Decision:** **Both participants may read the final outcome** and when it was decided.
  **The operator's rationale is INTERNAL and is not participant-visible.** **Which operator
  decided is likewise not participant-visible.** Nobody outside the trade may read any of it.
- **Why:** The outcome is the answer the two people are owed. The reasoning behind it is written
  for the operator's own record, often summarises what one participant said about the other, and
  becomes a different artefact the moment it is addressed to them. No documented rule defined
  this split before this decision, so it is recorded here rather than left to whichever query
  someone writes next.
- **Consequences:** Enforced by **column-level grants**, because an RLS policy cannot hide a
  column and a table-wide `select` would expose the rationale through PostgREST:
  `grant select (id, obligation_id, agreement_id, outcome, adjudicated_at) to authenticated`, and
  nothing more. `rationale` and `adjudicator_user_id` carry **no participant privilege at all** —
  selecting either raises `42501` for a participant, not merely an empty result, and so does
  *filtering or ordering by* either, so there is no blind-filter oracle. Because the adjudicator
  is withheld from participants anyway, forgetting it on operator-account erasure (PD-066) costs
  them nothing. Neither column
  appears in `my_barter_obligations` or `my_trade_activity`. `anon` holds nothing on the table,
  and it is in **no realtime publication**. **No reason-code taxonomy was invented:** the record
  carries one required free-text rationale (1–500 chars), and since it is not participant-visible
  there is nothing here for a participant-facing code to describe. If a participant-visible
  reason is ever wanted, it is a new decision and a new, deliberately designed field.
- **Evidence:** `20261019000000` § 4 (the grant block). Asserted directly by
  `supabase/tests/adjudication.test.sql`: both participants read the outcome; an unrelated user
  sees neither the obligation nor the adjudication row; each participant is refused `42501` on
  `rationale` and on `adjudicator_user_id` while the outcome columns remain readable.
- **Status:** Locked; **implemented**

---

### PD-068 — During beta only an operator adjudicates, a Review Queue is required before live beta, and no resolution SLA is promised
- **Decided:** 2026-09-08
- **Decision:** Three things are settled together, because they are the same question asked at
  three depths. **(1) Authority.** During beta, **only an authorized internal The Book
  operator/admin may adjudicate an Under Review barter obligation.** Participants may **never**
  adjudicate their own trade — no participant adjudication RPC, no participant-reachable path,
  no broadening of privileged write authority, and no broad `service_role` bypass beyond the
  narrow trusted server/operator path that already exists. The contract fields stay immutable.
  This restates PD-064's boundary as a **standing beta rule**, so that a future slice needing a
  screen cannot reach it by loosening authorization. **(2) Operator surface.** The secure
  adjudication backend **may ship without an operator UI** — PR #68 does not need one and must
  not build one. But **before live barter beta, a minimal internal Review Queue MUST exist.**
  Minimal means an authorized operator can, on one surface: view the agreement; view the
  obligation; view the historical participant facts, evidence and context already recorded;
  choose **exactly one** terminal obligation outcome (Fulfilled / Unfulfilled / Closed Without
  Resolution); enter the required internal rationale; and submit through the **already-secured**
  adjudication path — not a new one. **(3) Timing.** **No public resolution SLA is promised.**
  Participant-facing language may say **"This trade is under review."** and nothing more. Not 24
  hours, not 48 hours, not "X business days", not a guaranteed resolution.
- **Why:** The adjudication path exists and no shipped surface calls it, so no obligation can
  reach a terminal outcome in the running product while a provider who reports a no-show is told
  a review will happen. That gap is real, and the honest answer is not to weaken authorization
  until a screen becomes easy to build — it is to name the operator surface as a **pre-beta
  requirement** with a defined minimum, and to keep the boundary that produced the security
  posture in the first place. On timing: an SLA is a promise about staffing the product does not
  yet have. Promising one and missing it damages trust more than saying nothing, and "under
  review" is already the truthful statement.
- **Consequences:** This is the **answer** to the question PD-064 … PD-067 raised and deferred —
  *who performs a review, through what surface, and within what expectation.* Who: an authorized
  operator, never a participant. Through what surface: a minimal internal Review Queue, required
  before live beta and deliberately not built in the adjudication slice. Within what expectation:
  none stated publicly. **What is still NOT resolved by this entry:** how a plain Needs Attention
  might enter Under Review remains open, and the Review Queue does not change eligibility — an
  obligation is still adjudicable only while Under Review (PD-064). The queue is a surface over
  the existing RPC; building it must add no new privileged path, no new grant, and no
  participant-reachable adjudication. `app/admin` remains `__DEV__`-only and gated on "is a
  provider", so it is **not** that surface and must not be mistaken for it.
- **Evidence:** Founder ruling, 2026-09-08. The authority half is already implemented and proven —
  `public.adjudicate_barter_obligation` is granted to `service_role` alone, with the
  privileged-caller check and the not-a-participant check made in both the RPC and the BEFORE
  INSERT trigger (`supabase/migrations/20261019000000_barter_obligation_adjudication.sql`,
  `20261023000000_adjudication_hardening.sql`), and `supabase/tests/adjudication.test.sql`
  refuses participants, unrelated users and `anon` at each layer independently. The Review Queue
  and the SLA silence are **requirements recorded here, not code**: nothing in this repository
  implements either, and this entry is the reason the first is not an omission.
- **Status:** Locked; **SATISFIED.** Session 8B merged to `main` as `c4afee5` on 2026-09-10,
  after a focused security review of the authority change and a full validation pass. The surface exists: an allow-listed operator can see the queue, filter it, open a
  case, read the immutable facts behind it, write an internal note, take the supported
  resolution action, and see a durable history — without a `psql` session. The **SLA remains
  deliberately absent** and nothing in the surface implies one; the queue is ordered oldest-open
  first and that order is not configurable, because with no SLA the order is the only fairness
  guarantee a waiting person has.
  - **What Session 8B required, and it is not a footnote.** `is_operator()` admitted only
    `service_role` and a no-claims session, so an operator opening a screen — `authenticated`,
    with a real `auth.uid()` — was admitted by neither arm. A third arm was unavoidable, and it
    widens an authority `20261023000000` deliberately narrowed. What keeps it narrow: the
    allow-list has **no client privilege of any kind**, including SELECT, so an operator can
    neither promote anyone nor enumerate who the operators are; case tables are readable by
    operators and writable by nobody, so every change still goes through the audited RPCs.
  - **The history below is kept as written.** Until 2026-09-09 this read PARTIALLY SATISFIED,
    and the reason is worth preserving: **a backend queue with no surface does not satisfy a
    decision whose requirement was that an authorized operator can actually work a case.**

- **Previous status (Session 8, 2026-09-09):** Locked; **PARTIALLY SATISFIED — do not mark
  complete.**
  - **Authority: implemented.** `is_operator()`, the `service_role`-only adjudication and case
    RPCs, and the four independent refusal layers all exist and are asserted.
  - **The queue's BACKEND: implemented** (Session 8, PD-085) — `operator_cases`,
    `operator_case_events`, intake triggers for all three sources, and the operator RPCs.
  - **The operator SURFACE: NOT BUILT.** There is no usable operator UI, and the RPCs are
    reachable only as `service_role`. **A backend queue with no surface does not satisfy this
    decision**, because the requirement was that an authorized operator can actually work a case
    — which today requires a psql session. This entry stays PARTIALLY SATISFIED until an
    authorized operator surface exists (**Session 8B**).
  - **SLA: deliberately absent**, and unaffected by any of the above.

---

### PD-069 — Barter value is participant-defined; The Book adjudicates performance, not value
- **Decided:** 2026-09-08
- **Decision:** **The Book does not appraise, equalize, or compare the economic value of a
  barter trade.** Two grown providers decide for themselves whether an exchange is worth
  accepting, and **once both knowingly accept the same current trade terms, the agreed exchange
  IS the bargain.** Quantity and description exist **only to define what was promised** — *1
  headshot session with 10 edited photos*, *4 haircuts*, *6 training sessions*, *1 logo package*
  — and the system must **never** use them to decide economic equality. The question the product
  asks is **"what did you promise?"**, never **"is it worth the same?"**. Beta stays **direct
  two-provider barter**. **NOT BUILT, and not to be built in beta:** forced dollar valuation,
  optional negotiation-time market valuation, automated valuation, equivalency math, fairness or
  "this trade appears unequal" warnings, a platform-recommended exchange ratio, Book Credits,
  barter points, internal barter tokens, stored-value currency, cash hybrid, multi-party or
  three-way transactions. **Adjudication concerns performance, not value.** These are **not**
  performance disputes: *"my normal rate is higher"*, *"their service is worth less"*, *"I could
  have charged more"*, *"I changed my mind about the value"*, *"their retail price is $40 and
  mine is $200"*. These are: a promised service not delivered, a no-show, a receiver reporting
  non-receipt, an agreed quantity not performed, an agreed commitment materially not delivered.
- **Why:** The Book is a community marketplace between professionals, and retail price does not
  determine subjective value. A photographer who normally charges $200 may genuinely value a
  $40 haircut more than the session they are giving up — that trade is **valid**, and a platform
  warning that it "appears unequal" would be the platform substituting its arithmetic for the
  provider's own judgment about their own work. Every valuation mechanism, including a merely
  optional one, quietly teaches that parity is the standard and makes the unequal-looking trade
  feel like a mistake. And a value-regret channel into adjudication would turn an operator into
  an appraiser of two businesses they do not run — a job the product cannot do correctly and
  should not claim to.
- **Consequences:** The two durable principles this locks are: **"The Book does not appraise the
  trade. It makes the trade clear, mutual, and accountable."** and **"The Book adjudicates
  performance, not value."** Later regret about pricing is **not** a dispute the platform
  entertains — it is not a valid Under Review entry and not a valid adjudication input. This
  **narrows** what an operator may consider without narrowing the three terminal outcomes
  (PD-065): *Closed without resolution* remains the honest answer where performance genuinely
  cannot be established, and is not a place to file a value complaint. This entry does **not**
  reopen or expand PD-065's outcome vocabulary, and it does **not** authorize a quality-dispute
  engine — quality is a different question from delivery and is not decided here.
  Reciprocal matching, a provider Wants list, matching suggestions and three-way matching are
  **future exploration only**, recorded in
  [FUTURE_PRODUCT_IDEAS.md](FUTURE_PRODUCT_IDEAS.md) and **not** current scope; credits are
  intentionally not a beta answer, and the matching/liquidity problem must be proven with real
  user data before any currency is invented.
- **Evidence:** Founder ruling, 2026-09-08, following the barter pressure test. Most of the
  absence is already true in code and asserted rather than merely intended: a **proposal version**
  carries **exactly two directed terms and no value field** (`lib/negotiationState.ts:33-46`;
  `20260925000000_negotiation_directed_terms.sql:5` REMOVED `estimated_value` from the proposal
  for exactly this reason), § 5 has required no dollar equivalence and banned cash hybrid since
  2026-09-04, PD-032 holds the beta to two parties, and no equivalency, fairness-warning, credit,
  point or token object exists anywhere in `supabase/migrations/`, `lib/` or `app/`. The scope-pin
  sweeps in `supabase/tests/obligation.test.sql`, `cancellation.test.sql`,
  `no_show_under_review.test.sql` and `receiver_window.test.sql` fail on an unexempted
  adjudication-shaped or completion-shaped function, which is the mechanism by which a future
  valuation slice would have to be deliberate rather than accidental.

  **ONE EXCEPTION EXISTED, AND IT IS NOW CLOSED — the history is kept because it is instructive.**
  A first draft of this entry claimed no valuation object existed anywhere. **That was false**,
  and the false version is why this paragraph was written. `barter_offers.offering_value` WAS
  live: providers typed a dollar figure into **"ESTIMATED VALUE (OPTIONAL)"** in the post
  composer, every browsing provider saw a **`~$N value` badge** on the board card, and the figure
  was copied into each proposal version's immutable post snapshot
  (`20260917000000_barter_proposal_versions.sql:384`). It predated this ruling and was
  **poster-declared rather than platform-computed**, so it was never an appraisal by The Book —
  but it was a monetary figure rendered beside a barter offer, in tension with this decision's
  *Why*, and it was deliberately left in place by the adjudication slice because removing a live,
  user-visible field is a product decision rather than an implementation detail.

  **RESOLVED 2026-09-08 by Founder ruling: it is REMOVED from the live product.** The composer
  input and the board badge are gone, and `offering_value` is no longer selected, mapped or typed
  on the client. **The COLUMN is deprecated, not dropped** — dropping it would destroy historical
  rows and leave the immutable proposal-version snapshot builder referencing a column that no
  longer exists; stopping collection is a product change, erasing a record somebody entered is a
  separate decision with its own retention question. `enforce_barter_offer_write` now nulls the
  value on INSERT (silently, so a not-yet-updated mobile client keeps posting) and makes it
  one-directional on UPDATE: keepable, so a legacy offer stays editable, and clearable, but never
  introduced or changed. **`service_role` remains exempt**, as it is from every guard on that
  trigger. Proven by `supabase/tests/barter.test.sql`, which covers all four write cases plus a
  schema-wide sweep for any replacement valuation, equivalency, credit, point or token field.
- **Status:** Locked; **implemented.** The prohibitions are implemented as an absence — there is
  nothing to build, and the entry exists so that building any of it is a decision to reverse this
  one. The one pre-existing exception, the provider-declared estimated value on a barter post,
  was **removed on 2026-09-08** (`20261028000000`); the column survives as deprecated legacy data
  that no live surface reads.

---

### PD-070 — Agreement-level barter resolution is DERIVED, and no roll-up may overstate what was found
- **Decided:** 2026-09-08
- **Decision:** **Agreement-level barter resolution is derived from the immutable underlying
  facts — the two obligation states, their adjudication outcomes, cancellation acts and the
  derived Under Review state — and is NEVER persisted as a second terminal state.** No
  `completed`, `partially_fulfilled` or `not_completed` column, status value or stored verdict is
  added to `barter_agreements`, now or as part of this decision's implementation. **And where a
  single roll-up label would overstate the underlying findings, The Book presents the two
  obligation truths instead of inventing a broader verdict.** Two combinations make that concrete
  and are ruled on directly: **`Fulfilled + Closed without resolution` must NOT become *Partially
  Fulfilled***, because that label asserts the other side was found **Unfulfilled** and *closed
  without resolution* is the opposite of a finding; and **`Closed + Closed` must NOT become *Not
  Completed***, because that asserts performance failed and nothing was found to have failed.
- **Why:** The usual reason to persist a roll-up is that derivation is unstable — and here it is
  not. **The inputs cannot change:** an adjudication is append-only and immutable (PD-066) and a
  cancellation is append-only, so a value derived from them is stable and cannot drift.
  Persisting one would therefore buy nothing and create a second source of truth that could
  disagree with the first — which is precisely the failure `20261020000000` was written against:
  *"the read model saying 'Under Review' while the record says 'unfulfilled'."* Two further
  reasons carried weight. **Concurrency:** a stored roll-up makes `barter_agreements` a write
  target on every adjudication, adding a write-write hotspot and a fresh lock-order obligation to
  a graph that has already produced one reproduced deadlock. **The vocabulary is not ready:** the
  six-value agreement table in `BARTER_BETA_CONTRACT` § 7.5 predates the three obligation
  outcomes and does not compose with them, and persisting a verdict would freeze a vocabulary
  the product has zero operational experience with. Deriving lets the mapping change later with
  no backfill and no migration of stored values.
- **Consequences:** The client derives a **coarse resolution state**, deliberately not a verdict:
  nothing resolved, one side resolved, both resolved **and both fulfilled**, or both resolved in
  any other combination. Only *both fulfilled* gets its own sentence, because it is the one
  combination a summary cannot distort; every other pair reports **that** both sides were
  reviewed and lets each obligation card state **what** was found — once, where the outcome
  already lives. **This resolves the persist-vs-derive question PD-065 deferred and PD-068's
  preamble recorded as open; no OQ was ever minted for it, and none should be.** The immediate
  user-visible consequence is that a confirmed trade whose obligations are resolved no longer
  tells both providers to *"Arrange the details in your conversation."* — an instruction that,
  on a trade an operator had just resolved `unfulfilled`, asked two people to go and arrange
  something that had been found not to have happened. **What this does NOT create:** no
  agreement-level outcome column, no fifth obligation status, no new participant control, no
  operator surface, no notification, and no change to who may adjudicate (PD-064, PD-068 stand).
  The agreement's headline stays **Trade confirmed** for the whole life of the trade, because
  renaming it *would be* the stored verdict this decision refuses to create.
- **Evidence:** Founder ruling, 2026-09-08. `lib/obligationState.ts` (`agreementResolution`, which
  owns the rule and the fail-closed short-list case), `lib/negotiationState.ts`
  (`AgreementResolution`, and `CONFIRMED_DETAIL`, total over it so a fifth value is a compile
  error). Proven by `__tests__/lib/negotiationState.test.ts`, which asserts **all nine outcome
  pairs** land where this entry says — the eight non-`allFulfilled` pairs on the neutral state —
  that no banner in any resolution state contains *completed*, *partially fulfilled* or *not
  completed*, that the resolved states contain no instruction to arrange anything, that a mixed
  or closed pair assigns no fault, and that cancellation still outranks every resolution state.
  `supabase/tests/adjudication.test.sql` continues to assert that **no agreement-level outcome
  column exists** — this decision is the reason that assertion is permanent rather than pending.
- **Status:** Locked; **implemented**

---

### PD-071 — A booking request has a lifecycle: a private draft, a submitted request, and a 72-hour server-authoritative expiry

- **Decision.** The `bookings` row is created as a **DRAFT** when the client reaches the contract
  step, carried unchanged through the contract, the signature and the send, and becomes a real
  request only when the client submits it. A draft has `submitted_at IS NULL` and **no provider
  can see it**. A submitted request expires at
  `LEAST(submitted_at + 72 hours, appointment_time)`, never earlier than `submitted_at`.
- **Context.** The row used to be inserted on the very last screen, after signing. That single
  ordering caused three separate problems. Contract access had to be granted on "any live
  provider" rather than on a transaction, because there was no transaction to point at. Every
  failure between the first screen and the last either lost the attempt or risked a second
  request for the same intent. And the only expiry anywhere was a **client-side** 24-hour cutoff
  that disabled the provider's Accept button while the database happily kept the row pending
  forever — a rule that existed on one side of the marketplace and not the other.
- **Consequences.**
  - **One intent = one request.** A partial unique index (`bookings_one_draft_per_pair`) permits
    at most one draft per (client, provider); the client RESUMES it rather than inserting again.
    A dropped network, a failed signature, a back-out or a double tap continue the same request.
    An abandoned flow leaves a private row, not something a provider must answer.
  - **The draft is editable and the request is not.** While `submitted_at` is null the client may
    revise the service, date, time and note — which is what makes moving backwards through the
    steps safe. On submission those fields freeze: a provider answers the request they were
    shown, and a client cannot rewrite the appointment underneath an acceptance.
  - **Expiry is a real boundary, and only for ACCEPTING.** Past the deadline the provider is
    refused with `PT425`; declining stays available forever, because letting a provider close out
    a stale request is not a thing to prevent. **Expired requests are not deleted and not
    hidden** — they stay in both sides' history with `status='pending'`.
  - **Nothing flips a row when the deadline passes.** `booking_request_urgency()` derives
    `draft | none | nudge (24h) | urgent (48h) | expired` per read, the same discipline as
    PD-057's receiver window, so there is no persisted transition that can disagree with the
    timestamps. **It is a read state, not a notification:** there is no push, device or email
    channel in this product, and no surface built on it may claim a reminder was delivered.
  - **The `appointment_time` clamp** is the answer to "what if the appointment is sooner than 72
    hours". It is one `least()` over a column the row already has, and it invents no scheduling
    system. **PM REVIEW:** when `appointment_time` is NULL the 72-hour deadline stands alone, so
    a request can outlive its own requested slot, bounded at 72 hours.
  **PM RULING, 2026-09-09 — the rule is UNCHANGED, deliberately.** Where an authoritative
  timestamp exists it is used, and the clamp already does that. Where there is genuinely none, the
  72-hour deadline stands. The tempting third case is the one that is refused: `requested_date` is
  a bare DATE and `requested_time` is a display string, so turning them into a deadline means
  assuming a time-of-day and a timezone — and **a rule invented from assumptions is worse than a
  bounded one that is honest about its limit.** The limitation is recorded as **OQ-072** rather
  than resolved in code. In practice the null case is narrow: the date/time step requires both a
  date and a time before it will advance, so a normal request carries an `appointment_time`; what
  remains is rows predating the column and flows that reached the send step without that step.
  - **Why a column and not a status:** `bookings.status` is constrained and `pending` already
    means "a real request the provider must answer". A draft *status* would have put every
    abandoned flow into the provider's queue — the opposite of what this decision is for.
- **Evidence.** Founder ruling, Pre-Session-8 Correction 3 (items B, J, K), 2026-09-09.
  `supabase/migrations/20261037000000_booking_request_lifecycle.sql` plus forward corrections
  `20261041000000` and `20261045000000`; `lib/bookingDraft.ts`; `lib/bookingStatus.ts`;
  `app/book/contract.tsx`; `app/book/payment.tsx`. Proven by
  `supabase/tests/booking_lifecycle.test.sql`, `__tests__/lib/bookingDraft.test.ts` and
  `__tests__/guards/bookingLifecycleReads.test.ts`.
- **A DRAFT IS NOT A RELATIONSHIP, and the first implementation of this decision did not make
  that true.** It taught the provider's SELECT policy about drafts and stopped, leaving three
  boundaries that tested only "a booking exists for this pair" — which let an unsent draft open
  an ungated conversation and reverse a provider's decline — and leaving every client-facing
  list showing an abandoned draft as "Pending, waiting for provider confirmation". A cancelled
  draft also held the one-draft slot forever, behind a "BOOKING REQUEST SENT" screen for a
  request that did not exist. `20261045000000` closes all of it. **The standing rule this
  decision now carries: anything that asks "does a booking exist for this pair?" must say
  whether it means a SUBMITTED one, and for every question except "may this client resume their
  draft?" the answer is yes.**
- **Status:** Locked; **implemented**

---

### PD-072 — The deliverer may ask The Book to review an unanswered obligation. Asking is not being answered.

- **Decision.** A provider who delivered and was never answered may explicitly **ask The Book to
  review** that obligation, once the PD-057 window has passed and it sits in Needs Attention.
  That request is the **third and last** route into Under Review.
- **Context.** This closes **OQ-071**, the one genuinely open question left in the barter
  lifecycle engine. PD-062 made Under Review the entry condition for adjudication but reachable
  only by two RECEIVER acts — a `not_received` answer or a no-show report — so a receiver who
  simply stopped opening the app left the deliverer with no move at all, permanently.
- **Consequences.**
  - **It is a participant act, not a timer.** OQ-071 forbade resolving itself by implementation:
    no second timer, no automatic escalation, no operator auto-escalation. None was created. A
    person presses a button, and a person then has to look.
  - **Asking produces no outcome.** It does not declare the obligation fulfilled, does not fault
    the receiver, does not contradict their silence and rewrites nothing — `delivered_at`, the
    receiver's answer, the no-show report and every cancellation stand exactly as their authors
    left them. The three terminal outcomes remain reachable only through
    `adjudicate_barter_obligation`, which no participant may execute (**PD-068 is unchanged**).
  - **The receiver keeps their controls.** Under Review has never frozen them (PD-062) and does
    not here: a receiver who returns can still confirm or say they did not receive.
  - **Idempotent, append-only, deliverer-only.** A repeat returns the original timestamp rather
    than erroring; the record cannot be withdrawn or re-attributed; the receiver is refused
    because they already have two routes and do not need a third.
  - **QUEUED, NOT PROCESSED — and no copy may pretend otherwise.** A requested review reaches
    Under Review and waits, exactly as a receiver-reported one does. **Session 8 (PD-085) delivered
    the queue half**: a trigger now opens a `barter_review` case, so the request lands somewhere a
    person can find rather than only in a timestamp. **It delivered no operator UI**, the operator
    RPCs are `service_role`-only, and there is still **no SLA** (PD-068). *Still owed:* triage
    between a requested review and a receiver-reported one, which are different evidence, and
    whatever response policy exists. Participant-facing language stays "This trade is under
    review." **A queue existing is not permission for any surface to start promising a response."
- **Evidence.** Founder ruling, Pre-Session-8 Correction 3 (item X), 2026-09-09.
  `supabase/migrations/20261039000000_barter_review_request.sql`, plus its forward correction
  `20261042000000_adjudication_consistency_review_request.sql` — eligibility is enforced in TWO
  places by design (the RPC and the adjudications table's consistency trigger), and updating only
  the first left a transition that read correctly and did nothing. `lib/obligationState.ts`
  (`canRequestReview`, `REQUEST_REVIEW_COPY`), `lib/negotiation.ts`
  (`requestObligationReview`). Proven by `supabase/tests/barter_review_request.test.sql` and
  `__tests__/lib/obligationState.test.ts`.
- **Status:** Locked; **implemented**

---

### PD-073 — Beta discovery is visible lanes with visible rules, and marketplace placement is content-neutral

- **Decision.** Discover shows named lanes — **Near You, Available Soon, New to The Book, Popular
  Near You, Worth a Look** — each printing the rule that put a provider in it. **No percentage
  quotas.** And the rule that outranks all of them: **a provider is never placed lower in
  MARKETPLACE discovery because they do not create social content.**
- **Context.** Reels is both provider discovery and social proof, which creates a standing
  temptation to let content performance decide marketplace placement. A service marketplace that
  quietly requires content production has changed what it charges providers without telling them,
  and someone's livelihood is on the other side of that.
- **Consequences.**
  - **Two systems, deliberately separate.** Reels ranking decides which video plays next.
    Marketplace ranking decides who a client sees when they are looking to book. Nothing in
    `lib/discovery.ts` consults posts, reels, followers, likes, views or engagement — its input
    type has no field for any of them, so a content signal cannot arrive without a type change a
    reviewer must approve.
  - **Every lane states its rule** beneath its name. "Why am I not in that row" is a fair question
    from someone whose income depends on the answer, and a lane whose rule is invisible cannot be
    argued with.
  - **Exposure guardrails.** `Worth a Look` is every provider the other lanes missed, so nobody is
    invisible; the lanes sit ABOVE the complete grid rather than replacing it, so a capped row
    never becomes a filter on who exists; and ties break on a stable hashed rank so neither
    alphabetical order nor signup order confers a durable, compounding advantage.
  - **Popular Near You is the only lane that ranks on performance,** and it ranks on **completed
    bookings and client reviews** — marketplace facts. A provider with no bookings is ABSENT from
    it rather than ranked last: having no track record is not a worse one.
- **Evidence.** Founder ruling, Pre-Session-8 Correction 3 (items S and T), 2026-09-09.
  `lib/discovery.ts`, `components/DiscoveryLanes.tsx`, `app/(tabs)/index.tsx`. Proven by
  `__tests__/lib/discovery.test.ts`, which asserts the fairness rule against both the type and
  the behaviour.
- **THE LANES NEED THEIR OWN DATA, and the first implementation did not give them any.** They
  were computed over the feed's first page, which is ordered `is_featured DESC, average_rating
  DESC NULLS LAST` — so a genuinely new provider, having no rating and no feature flag, sorted
  to the very end of the market and was the LEAST likely provider to appear. "New to The Book"
  systematically excluded exactly the providers it exists for, and the fairness intent was
  defeated by the fetch rather than by the rules. The lanes now read an unranked pool of their
  own (`fetchDiscoveryPool`), ordered only by id so the ordering contributes no bias, which also
  stops lane membership shifting as the grid pages more rows in beneath it.
- **Status:** Locked; **implemented**

---

### PD-074 — "Houston Beta Provider" is the beta's trust signal, and it is the only badge

- **Decision.** An approved provider carries **Houston Beta Provider**. Permitted alongside it:
  real profile and business information, portfolio and service info, location and service mode,
  reviews from completed bookings and their count, completed-booking information, and the
  provider's own policy and contract. **Not permitted:** "Verified", "ID Verified", trust scores,
  any badge implying government identity verification, and barter reputation.
- **Context.** This **closes OQ-035**'s second half — what a beta trust label may claim.
  Correction 1 removed the "ID Verified" badge and deliberately invented no replacement, leaving
  a "Verification coming soon" pill that made a roadmap promise instead of stating anything true
  about the provider a client was looking at.
- **Consequences.** The label is a **fact, not a claim**: this provider was approved into the
  Houston beta, which either happened or did not. It asserts no identity check, no background
  check and no government-ID verification, none of which exist. It is shown only while the
  provider is approved — a provider who is no longer taking new bookings does not carry a label
  saying they are a current beta provider, and **no replacement label is invented for them**
  (see PD-075's availability wording). The vendor half of OQ-035 stays open.
- **Evidence.** Founder ruling, Pre-Session-8 Correction 3 (item W), 2026-09-09.
  `components/ProviderProfile.tsx`. `__tests__/guards/betaClaimsAbsent.test.ts` continues to fail
  on any reintroduced verification claim.
- **Status:** Locked; **implemented**

---

### PD-075 — Providers own their own no-show policy, and a de-approved provider is described as unavailable, never as judged

- **Decision.** The Book authors **no default no-show fee**. And a provider who is no longer
  approved is shown as **"Not currently available for new bookings"** — availability, never a
  judgement — while all of their history stays reachable.
- **Context.** `DEFAULT_POLICY.noShowFeePercent` was `'100'`: The Book was authoring a
  100%-of-service no-show fee on behalf of every provider who never opened the policy editor, and
  then displaying it to clients as **that provider's** terms.
- **Consequences.** The default is `'0'` — the only value that says nothing on a provider's
  behalf. This is a default for the editor and the display fallback, **not a migration**: a
  provider who deliberately chose 100 keeps 100, because the stored row is preferred and the
  default is reached only when no policy row exists. For de-approval, the refusal is enforced at
  the database (`PT426` on insert) and stated in the client at the profile, so a client is never
  walked to the end of a booking flow to be told no. **Existing bookings, messages, reviews and
  history are untouched** — this is an INSERT-only refusal — and nothing about it is a
  verification claim.
- **Evidence.** Founder ruling, Pre-Session-8 Correction 3 (items C and H), 2026-09-09.
  `lib/policy.ts`, `supabase/migrations/20261037000000_booking_request_lifecycle.sql` § 5,
  `components/ProviderProfile.tsx`, `app/book/contract.tsx`.
- **Status:** Locked; **implemented**

---

### PD-076 — A provider can delete their own media, and provider onboarding stays minimal with a required final review

- **Decision.** Providers have a real, user-facing way to delete their own portfolio photos,
  posts and reels. And provider onboarding requires only: a basic profile, a category, at least
  one service, location / service mode, basic availability, enough public content, and the
  required policy or contract — plus a **required final review page** before Go Live: *"Review
  your business" / "Make sure everything looks right before your profile goes live."*
- **Context.** `public.posts` holds every piece of provider-authored media in the product and had
  **no DELETE policy at all** and no delete control on any screen. A provider who uploaded the
  wrong photo — or a photo of a client who later asked for it to come down — had no way to remove
  it. Separately, onboarding made every new provider walk past a **required** payout step for a
  capability that does not exist in beta, and then press "Go Live Now" without ever seeing their
  eight screens of answers together.
- **Consequences.** Deletion is a hard delete of the row plus its storage object, respecting the
  owner-scoped policies; the row is deleted first so a failure orphans a file rather than leaving
  a broken card on a public profile, and a zero-row delete is reported as a FAILURE rather than
  as success. The confirmation says it cannot be undone and does **not** promise that copies
  anyone already saved disappear. Onboarding does **not** require analytics, payouts, reels or
  advanced settings; the payout screen is unchanged and still reachable from the Business
  dashboard, just no longer in the way. The review page **checks, it does not gate**: the only
  hard preconditions remain one service and a profile photo, and anything missing is reported as
  a consequence in the provider's own words rather than as an error.
- **Evidence.** Founder ruling, Pre-Session-8 Correction 3 (items L and Y), 2026-09-09.
  `supabase/migrations/20261043000000_posts_owner_delete.sql`, `lib/providerMedia.ts`,
  `app/(tabs)/business/portfolio.tsx`, `app/(tabs)/business/posts.tsx`,
  `app/onboarding/provider/review.tsx`, `app/onboarding/provider/policy.tsx`.
- **Status:** Locked; **implemented**

---

### PD-077 — The client is told the provider has up to 72 hours, and told where to look

- **Decision.** After sending a request the client sees: *"Your provider has up to 72 hours to
  respond. You can check this request anytime."* The window is restated on the request itself,
  where they check.
- **Context.** PD-071 made expiry real and server-authoritative, and deliberately left "should the
  client be told?" open — the previous copy had promised *"has 24 hours to respond"*, a number
  matching no enforced rule, and it was removed rather than corrected. That left the client the
  only party uninformed about a deadline the provider is held to.
- **Consequences.** The number is the real one. The second sentence is what makes the first safe
  to say: **there is no push, email or SMS channel in this product**, so the client is told where
  to LOOK rather than promised that something will arrive. No copy built on this may say a
  reminder was sent, and `__tests__/guards/betaClaimsAbsent.test.ts` still fails on a
  notification claim.
- **Evidence.** PM decision on PR #74, 2026-09-09. `app/book/confirmed.tsx`, `app/bookings/[id].tsx`.
- **Status:** Locked; **implemented**

---

### PD-078 — A de-approved provider is told, in availability terms

- **Decision.** A provider who is not currently approved sees, on their own dashboard: *"Your
  business is not currently available for new bookings. Your existing bookings, messages, and
  history are still available."*
- **Context.** PD-075 built the CLIENT side of this and not the provider's. A de-approved provider
  simply stopped receiving requests, with nothing anywhere saying why and no route to ask.
- **Consequences.** Not dismissable, and deliberately unlike the availability nudge beside it:
  that is a task the provider can finish, this is a state they cannot change from that screen. It
  states the fact and what still works, and stops — no reason, nothing that reads as a judgement.
  **Marketplace approval is not identity verification** and this copy must never imply it is;
  PD-074 keeps the two apart in both directions.
- **Evidence.** PM decision on PR #74, 2026-09-09. `app/(tabs)/business/index.tsx`.
- **Status:** Locked; **implemented**

---

### PD-079 — No placebo preference data in onboarding

- **Decision.** A preference is collected only if something in the live product consumes it. The
  client onboarding **interests grid is removed**, and so is the adjacent **"Show mobile
  providers"** switch. The neighborhood picker stays.
- **Context.** Seven category cards, four pre-selected, under the promise *"We'll surface the best
  providers for the things you care about most."* Nothing consumed them: they were local React
  state, written to no store and no column. The `clients` upsert that ends onboarding writes name,
  notes, neighborhood and avatar; no query anywhere reads an interests field; and discovery orders
  by the lanes in `lib/discovery.ts`, which has no interest input. The screen asked a new client to
  describe their taste and discarded the answer under a sentence saying it would be used.
- **Consequences.** The same rule item A applied to the notification switches on this same screen.
  **No recommendation engine is to be built to justify the field** — the grid returns if and when
  something reads it. The neighborhood picker stays because it is genuinely persisted and genuinely
  consumed: it is what the Near You lane reads. **PM NOTE:** the ruling named interests; extending
  it to the mobile-providers switch is a reading of the principle it states, taken because leaving
  the last placebo control on a screen the ruling had just cleared would look like an oversight. A
  REAL mobile filter exists on Search (`providers.is_mobile`, item M) and is unaffected.
- **Evidence.** PM decision on PR #74, 2026-09-09. The controls lived in
  `app/onboarding/client/preferences.tsx`, **which no longer exists**: removing them left it
  asking the same question step 1 asks with the same component, so the Founder rulings on this PR
  removed the step itself (see PD-081). The neighborhood picker survives on step 1, which is the
  screen that persists it.
- **Status:** Locked; **implemented**

---

### PD-080 — The barter happy path is Find → Talk → Propose → Agree → Do it → Confirm (future design requirement)

- **Decision.** The barter surface should read as six plain steps — **Find → Talk → Propose →
  Agree → Do it → Confirm** — and a future UI/UX design pass owes that shape. It is **not** a
  PR #74 merge blocker and was deliberately not attempted in Correction 3.
- **Context.** The engine is finished and the surface is not. Correction 3's brief asked for the
  happy path to *feel* like that sequence; reshaping how a flow feels is a subjective design
  judgement, and the brief reserves those for the Founder. The implementation engine declined to
  invent one rather than ship a redesign nobody had approved.
- **Consequences.**
  - **The engine does not move.** Session 7 stands exactly as it is: the proposal/version model,
    the two directed obligations, the cancellation model, the adjudication model, PT424, derived
    agreement presentation and agreement immutability (PD-057 … PD-070, PD-072) are all locked and
    none is reopened by this.
  - **The vocabulary does not move either.** **Needs Attention** and **Under Review** are the
    approved participant-facing terms and stay; no internal engine terminology may surface
    (PD-062, PD-068).
  - **The mapping is the work, not the words.** A design pass owes a mapping from each of the six
    steps to states that ALREADY EXIST. If a step has no state behind it, the step is wrong — the
    engine is not to grow one to make the story tidier.
  - The one genuinely new participant act of Correction 3, the deliverer's *"Ask The Book to
    review"* (PD-072), belongs inside **Confirm** rather than as a seventh step.
  - **Recorded as a decision rather than as an idea**, because `FUTURE_PRODUCT_IDEAS.md` carries no
    authority by its own preamble and forbids anything in it being cited as a requirement. An
    approved requirement filed there would have been uncitable.
- **Evidence.** PM decision on PR #74, 2026-09-09.
- **Status:** Locked as a **requirement**; **not implemented**, and deliberately so.

---

### PD-081 — Client onboarding is two steps, and a de-approved provider's appeal route is Session 8 work

- **Decision.** Two clarifications from the Founder's final rulings on PR #74.
  1. **The client onboarding preferences step is removed.** The flow is `index → uploads →
     preview`, numbered *of 2*.
  2. **No "Contact Support" control is added to the de-approval notice.** The provider
     review/appeal action becomes a **Session 8 requirement**, alongside the operator Review
     Queue.
- **Context.**
  1. PD-079 removed the interests grid and the mobile switch from that step as data nothing read.
     What was left was a neighborhood picker — asking the SAME question step 1 asks, with the SAME
     component, on the screen that does NOT persist it. A step that re-asks what the previous step
     answered is not a step.
  2. PD-078 tells a de-approved provider the fact and gives no next step. A provider in a state
     they cannot change should have a route to ask about it. The only support entry that exists is
     `app/settings/index.tsx`'s `stub('Contact Support')` — an alert reading *"Coming soon"*.
- **Consequences.**
  - **No replacement question was invented to preserve the step count.** The count follows the
    content, not the other way round. `betaClaimsAbsent.test.ts` now asserts *of 2*, and asserts
    the removed screen has no surviving route — the payment step outlived its wiring as a
    deep-linkable route once already, and that is the failure being avoided.
  - The neighborhood is unaffected: step 1 collects it, writes it to the store, and `preview.tsx`
    persists it. It remains what the Near You lane reads (PD-073).
  - **A dead button is worse than honest silence**, and most so on the one screen where a provider
    needs a live one. The notice keeps its approved wording and gains nothing that cannot act.
  - **Session 8 delivered both, together (PD-085, PD-086):** the operator Review Queue that
    PD-068 makes a pre-beta requirement and that PD-072's review requests wait on, AND a real
    operator-backed route for a de-approved provider to ask for review. The control shipped with
    the path behind it, as this decision required. **What did NOT ship is a support inbox**: there
    is still no "Contact Support" button, because the only support entry in the product remains a
    "Coming soon" stub, and the new control asks about ONE thing — the eligibility state the card
    describes.
  - **Nothing about de-approval may imply an identity-verification failure**, because that is not
    the reason and there is no such check to fail (PD-074).
- **Evidence.** Founder rulings on PR #74, 2026-09-09. `app/onboarding/client/index.tsx`,
  `app/onboarding/client/uploads.tsx`, `app/(tabs)/business/index.tsx`,
  `__tests__/guards/betaClaimsAbsent.test.ts`.
- **Status:** Locked; **implemented in full.** The appeal route this decision recorded as owed
  shipped in Session 8 — see **PD-086**.

---

### PD-082 — Blocking stops new contact and never deletes history

- **Decision.** A person may block another. While the block exists neither may start a new
  conversation, booking or barter interaction with the other. **A block never deletes or hides
  anything**, and it never closes a conversation attached to a LIVE booking or barter agreement.
- **Context.** Session 8. No blocking existed at all before it.
- **Consequences.**
  - **Directional row, symmetric effect.** Only the blocker may create or remove it and only they
    can see it — the blocked party is never told, because announcing a block to the person it was
    taken against is itself a safety event. But the EFFECT runs both ways: a one-way block would
    stop only the person who asked for it.
  - **THE ACTIVE-TRANSACTION EXCEPTION.** A blocked pair with a submitted, non-terminal booking or
    a confirmed, uncancelled agreement holding an unresolved obligation keeps that conversation
    open until the transaction is terminal. Two providers in a confirmed trade owe each other
    delivery, confirmation and — when it goes wrong — a no-show report or a review request; a
    client with an accepted booking has someone coming to their address. Severing those threads
    would trap both people inside an obligation while removing the only means of completing,
    cancelling or resolving it. **The exception is what makes blocking safe to offer at all.**
  - It is bounded three ways: only a conversation that ALREADY exists (opening a new one is
    refused outright, with no exception), only while the transaction is live, and it grants
    nothing else. **A DRAFT booking is not a live transaction** — otherwise a blocked party could
    manufacture their own exception by opening a booking flow.
  - `PT427` is the block refusal and is deliberately distinct from `PT426` (de-approved provider).
    Similar copy, different facts; conflating them would tell a blocked user that a provider had
    been removed from the marketplace.
- **Evidence.** `20261046000000`, `20261047000000`, `20261051000000`; `lib/safety.ts`. Proven by
  `supabase/tests/safety_operator.test.sql` and three concurrency races.
- **Status:** Locked; **implemented**

---

### PD-083 — One report system, one operator queue, and operator notes are private

- **Decision.** Reporting writes to `public.reports`, which opens a case in the operator queue.
  The community feed's separate `community_reports` path is retired. **Operator notes are never
  readable by any ordinary user.**
- **Context.** Two report systems existed and neither reached an operator. Worse, `reports`'
  only SELECT policy is `auth.uid() = reporter_user_id` with no column restriction — so **a
  reporter could read the operator's private notes on their own report.**
- **Consequences.**
  - Categories are grounded in what the product does, and there is **no billing or payment
    category**: The Book processes no payment (PD-042), and Correction 3 removed exactly that
    option for the same reason. Nine entries including `other`, because a taxonomy a reporter must
    study is one that gets the wrong answer.
  - `admin_notes` and `resolved_by` are withheld by **column grant**, and `my_reports` is the
    supported read. A column-level REVOKE against a table-level grant does not work — see PD-084.
  - Fixing the grants also closed an unrelated hole: the baseline handed `authenticated`
    table-level UPDATE and DELETE on `reports` with **no policy constraining them**, unreachable
    only because RLS denies by default when no policy matches. One added policy away from a
    reporter editing or deleting a report an operator was working.
- **Evidence.** `20261050000000`, `20261052000000`; `lib/safety.ts`, `app/community/index.tsx`.
- **Status:** Locked; **implemented**

---

### PD-084 — A column-level REVOKE cannot narrow a table-level GRANT

- **Decision.** To withhold a column, revoke the TABLE-level privilege and re-grant the columns
  you intend to expose. A column-level `REVOKE` against a table-level grant is a **no-op**.
- **Context.** **This repo has now shipped that mistake twice.** Correction 3's `20261037000000`
  § 7 shipped `revoke update (expires_at) … from authenticated` believing it did something; the
  security review found it inert. Session 8's `20261050000000` § 5 then did the same thing to
  close the `admin_notes` leak, and B5B caught it within minutes.
- **Consequences.** Recorded as a decision rather than a comment because it has cost two
  migrations and will cost a third otherwise. The working pattern is Correction 2's
  `20261030000000`: no table-level SELECT, 28 named columns. **A migration that adds a
  column-level REVOKE without removing the table-level grant has not done what it says.**
- **Evidence.** `20261052000000` and its header; `20261030000000`.
- **Status:** Locked; **implemented**

---

### PD-085 — Operator authority is the service key, and every case action is auditable

- **Decision.** Operator power is `service_role` (or a no-claims/no-subject privileged session),
  exposed through RPCs granted to `service_role` alone. **There is no operator role table and no
  `is_admin` column.** Every case state change writes an append-only event.
- **Context.** PD-068 makes a minimal Review Queue a pre-beta requirement, and three things wait
  on it: PD-072's barter review requests, PD-081's provider appeals, and user reports.
- **Consequences.**
  - `is_operator()` is the single definition, extracted from the predicate
    `adjudicate_barter_obligation` already used — `20261023000000` narrowed that exact predicate
    because a looser form admitted a no-`sub` `anon` request, and **both conjuncts are
    load-bearing**.
  - **No role table, deliberately.** A row granting operator power is a client-reachable path to
    operator power. The authority here is "holds the service key", which is an infrastructure fact
    rather than a row a compromised session could flip.
  - `authenticated` holds **no grant at all** on `operator_cases` or `operator_case_events`, and
    RLS is on with no policy for that role — two independent refusals.
  - The actor id is a PARAMETER because a `service_role` session has no `auth.uid()`. It RECORDS
    who acted and is **never trusted as authority**; `is_operator()` decides that.
  - **One live case per subject**, so a duplicate appeal or duplicate barter review cannot fill
    the queue with the same question.
  - **Resolving a barter case does not adjudicate it.** Terminal outcomes remain reachable only
    through `adjudicate_barter_obligation` (PD-064, PD-068). No second adjudication path exists,
    and **no case field asks what a trade was worth** — asserted in B5B.
  - No SLA field, no priority, no assignment. PD-068 says there is no SLA; a field inviting one
    would be the first step to promising it.
- **Evidence.** `20261049000000`, `20261050000000`. Proven by `supabase/tests/safety_operator.test.sql`.
- **Status:** Locked; **implemented**

---

### PD-086 — A de-approved provider can ask for review, and eligibility gates writes only

- **Decision.** A provider whose business is not currently available for new bookings sees
  **Request Review**, which opens a real case in the operator queue. Eligibility gates what a
  provider may **start**; it never gates what they may finish, cancel, read or clean up.
- **Context.** PD-081 recorded this as owed and deliberately shipped no button, because the only
  support path was a stub reading "Coming soon". The queue exists now, so the control ships with
  the path behind it.
- **Consequences.**
  - **The lockout that was designed against.** `20260906000000` warned that gating
    `caller_provider_id()` on `is_approved` would also stop a de-approved provider closing their
    own live offers, and that gating the interest READ policy would be *actively wrong* — they
    would lose sight of responses already sent to them. So a **separate**
    `caller_eligible_provider_id()` gates the two INSERT policies and nothing else. B5B asserts
    both halves: they cannot post a new offer, and they CAN still close an existing one.
  - Idempotent per unresolved eligibility state — no duplicate appeals.
  - The provider sees **that** a review is under way and nothing more: never operator notes, never
    the event log, never a timeframe. `resolved` and `dismissed` read identically to them, because
    "dismissed" is a word chosen for an operator's filing system and what a provider needs to know
    — whether their business is available again — is shown by the availability state itself.
  - Appealing grants nothing: **no participant path can restore eligibility.**
- **Evidence.** `20261048000000`, `20261050000000`; `lib/safety.ts`, `app/(tabs)/business/index.tsx`.
- **Status:** Locked; **implemented**

---

### PD-087 — A block is never announced; it does not have to be undiscoverable
- **Decided:** 2026-09-09
- **Decision.** Blocking **must not be explicitly announced** to the blocked person. It does
  **not** need to be perfectly non-determinable. **Shadow-ban complexity must not be built merely
  to prevent inference**, and the existing live-transaction exceptions are preserved unchanged.
- **Why this needed deciding.** Session 8 closed the two routes that let a caller ask about a
  **stranger** — the `/rpc/`-callable predicates (`20261055000000`) and a conversation gate that
  read identity from `NEW` (`20261058000000`). What remained was narrower and structural: a person
  acting on their **own** relationship can still infer a block from a distinct SQLSTATE, because a
  blocked booking raises `PT427` where an unblocked one succeeds. Closing that gap does not mean
  writing better code — it means **accepting the write, showing success, and discarding it**,
  which `20261046000000` rejected in writing on the grounds that a product which lies to one user
  to protect another has chosen to lie to a user.
- **What this settles.** The first reading is correct: **PD-082 is a rule about SURFACES.** No
  screen, message, error string or absence of one may name a block or reveal who made it, and
  every refusal stays worded identically in both directions. Inference from an error code by
  someone deliberately probing the API is **out of scope and will not be engineered against**.
- **What it does NOT license.** It is not permission to relax any surface. It is not permission to
  narrow the live-transaction exception, which is what keeps a block from stranding two people
  inside an obligation neither can finish.
- **Evidence.** Founder ruling, Session 8 final PM rulings, 2026-09-09. Closes **OQ-073**.
- **Status:** Locked; **satisfied by current behaviour** — no code change required.

---

### PD-088 — Report intake is bounded, because a report now creates real operator work
- **Decided:** 2026-09-09
- **Decision.** Report creation gets **rate limiting and duplicate protection before broad beta**.
  The bound must be **an abuse control, never a barrier to legitimate safety reporting**, and its
  exact limits and rationale must be written down.
- **Why.** Before Session 8 a report was an inert row. Now every `reports` INSERT opens an
  `operator_cases` row through a trigger, so filing a report **creates work in the queue PD-068
  makes a pre-beta requirement**. Two bounds that exist elsewhere do not exist here: messaging is
  limited to 30/min, and appeals and barter reviews are idempotent per subject — reporting is
  neither, so N reports produce N live cases from one ordinary account.
- **The limits, recorded here so they are decided rather than discovered.** These are the proposed
  numbers; **none is implemented yet.**
  - **Duplicate protection (the primary control).** At most **one OPEN case per
    (reporter, target) pair**. A second report about the same person while the first is unresolved
    **appends to the existing case** rather than opening another. This is the control that
    actually protects the queue, and it costs a legitimate reporter nothing — reporting the same
    person twice is not a second problem, and their words are still recorded.
  - **Rate limit (the backstop).** **5 reports per hour** and **20 per day** per reporter, across
    all targets, enforced server-side through the existing `rate-limit` seam.
  - **Why these numbers.** A person in a genuinely bad situation reports one or two people, not
    six an hour. Twenty a day is far beyond any honest use and far below what makes flooding
    worthwhile. **The limits are deliberately loose**: the cost of refusing a real safety report
    is not comparable to the cost of an operator reading a few junk ones, so when in doubt the
    bound gives way.
  - **What is NOT added.** **No standing requirement.** A reporter need not have transacted with
    the person they report — a bystander who sees something in the community feed must be able to
    say so, and requiring a prior booking would silence exactly the reports with no other route in.
  - **What a refused report must do.** Say the limit was reached in plain words, keep the text the
    person wrote, and never discard it silently.
- **Evidence.** Founder ruling, Session 8 final PM rulings, 2026-09-09. Closes **OQ-074**.
- **Status:** Locked; **SATISFIED.** Session 8C merged to `main` as `0b1f563` on 2026-09-10. Duplicate protection appends to the live case; the 5/hour and 20/day backstop raises
  `PT428`, which all four report surfaces handle by naming the limit and KEEPING the text. No
  standing requirement was added, and that is asserted as a test rather than intended.

---

### PD-089 — A blocked person disappears from your ordinary surfaces
- **Decided:** 2026-09-09
- **Decision.** Blocked users **disappear from each other's normal discovery, content and
  community surfaces**. Their provider cards, posts and reels are **not** surfaced in ordinary
  feeds or search where the block relationship applies. **Only the narrow access required for
  existing booking or barter history, logistics, cancellation, completion or review is
  preserved.**
- **Why.** Session 8 stopped at CONTACT: a block prevented messages, booking requests and barter
  responses, but neither the feed nor the barter board filtered the blocked person's content. So a
  blocker kept seeing them, could still tap Respond, and got a refusal whose copy — necessarily
  saying nothing about a block — pointed them at their **own** eligibility, which for them was a
  false lead about themselves.
- **The line this draws.** It is the difference between *"you cannot reach me"* and *"you do not
  exist to me"*, and the ruling chooses the second **for ordinary surfaces only**. The exception
  is not a courtesy: two people inside a live obligation must still see each other's names, terms,
  appointment and controls, or a block would strand a trade — the same principle as the
  live-transaction messaging exception (PD-082), applied to visibility.
- **Consequences to design for, not to decide here.** Discovery results become viewer-dependent
  for the first time, which interacts with **PD-073**'s content-neutrality rule for the beta
  lanes; the filter is **symmetric**, so it must not become a channel that tells the blocked
  person anything; and it must not be implemented with a client-callable block predicate, which
  `20261055000000` established as an oracle.
- **Evidence.** Founder ruling, Session 8 final PM rulings, 2026-09-09. Closes **OQ-075**.
- **Status:** Locked; **SATISFIED.** Session 8C merged to `main` as `0b1f563` on 2026-09-10
  (`20261064000000` … `20261067000000`, including the forward correction that restored three base
  tables' own read predicates inside the views).
  - **Architecture: five `SECURITY DEFINER` views that return already-filtered content**, not a
    predicate a client can call. Founder ruling, 2026-09-10, rejecting the RLS-policy design
    because it would have required re-granting the per-target block predicate `20261055000000`
    removed. There is no question to ask — only "show me what I can see" — and an absent row is
    indistinguishable from one deleted, deactivated or filtered.
  - **It composes with the live-transaction exception because it does not touch it.** Hiding is a
    different mechanism from refusing, and only the ORDINARY surfaces moved: every booking,
    thread, review and contract read still uses the base tables, so a pair inside a live
    obligation still sees each other's name, terms and appointment. Asserted directly.

---

### PD-090 — No block-status oracle is built or exposed; inference through ordinary product behaviour is an accepted beta limitation
- **Decided:** 2026-09-10
- **Decision.** **The Book will not expose or build a dedicated block-status oracle.** A
  technically sophisticated user may nonetheless be able to INFER that a block exists, by comparing
  otherwise-authorized data or by observing ordinary product behaviour. **That is acceptable for
  the Houston closed beta.**
  - **Do NOT narrow broad booking, message-thread, review or contract read policies for the sole
    purpose of making block status mathematically non-determinable.**
  - **This is an accepted inference limitation, not a beta blocker.**
- **What closed the question.** PD-089 was implemented as `SECURITY DEFINER` views returning
  already-filtered content, and OQ-076 recorded that the views are DIFFABLE against their base
  tables: `providers?id=eq.X` and `providers_visible?id=eq.X` answer *"is there a block between me
  and X"* in two requests. The architecture had been chosen partly on the premise that *"there is
  no question to ask"*, which was not true as shipped. **The premise was wrong; the architecture
  is still right**, and the cost of making the premise true is the thing this decision refuses.
- **Why refusing that cost is the right answer.** Closing the inference gap means the base tables
  must stop being readable for the same rows — narrowing `providers_public_read` and routing
  bookings, threads, reviews and contracts through filtered views. That is a large, high-risk
  change to the authorization surface of the most transaction-sensitive paths in the product, in
  exchange for defeating a two-request diff performed by someone who already suspects the answer.
  **The person doing that has decided they were blocked before they ran the query.** Trading
  read-policy correctness on live bookings for that is a bad trade in a closed beta.
- **What this does NOT license.**
  - It does not weaken **PD-087**, which stands intact: a block is never explicitly ANNOUNCED, it
    need not be perfectly non-determinable, and **no shadow-ban complexity may be built** merely to
    prevent inference.
  - It does not reopen **PD-089**. Blocked users still disappear from each other's ordinary
    discovery, community and content surfaces.
  - It is not permission to ADD an oracle. Building or granting a per-target block predicate
    remains forbidden — that is what `20261055000000` removed and what the PD-089 ruling rejected.
    The distinction this decision draws is between **an answer the product gives** and **an
    inference a determined person constructs**; the first stays forbidden.
- **Revisit only if** safety evidence, abuse evidence, privacy requirements, legal review, or
  broader launch requirements show that stronger concealment is necessary. Closed beta is a
  small, known cohort; a public launch is a different risk surface and this decision does not
  travel to it by default.
- **Evidence.** Founder ruling, 2026-09-10, closing **OQ-076**. `20261064000000`,
  `20261066000000`, `20261067000000`; `supabase/tests/blocked_surfaces.test.sql`.
- **Status:** Locked; **satisfied by current behaviour** — no code change follows.

---

### PD-091 — Reputation counts client relationships, not receipts
- **Decided:** 2026-09-11
- **Decision.** A provider's public rating is the **mean of the LATEST revealed review from each
  DISTINCT client**. Every review is still stored, still displayed, and still counted in the
  review count. A third number — how many distinct clients the rating rests on — is published and
  **must be labelled** wherever the rating appears.
- **The problem.** Phase 0 correctly let every completed booking create its own review
  opportunity, because service quality changes and a client's fifth visit is real information.
  But the aggregate averaged every revealed review, so twenty reviews from one client counted as
  twenty independent customer relationships. Two people booking each other could manufacture a
  reputation; a genuinely loyal client could manufacture one by accident.
- **Why not the alternatives**, recorded so the analysis is not redone:
  - **Blocking repeat reviews** fixes the arithmetic by destroying the signal — a provider whose
    quality dropped last month would keep a rating built on a review from a year ago.
  - **A cap** ("at most N from one client") needs an arbitrary N and still permits N-fold
    inflation.
  - **Diminishing weight** is hard to explain to a provider asking why their rating moved, and
    hard to pin in a test without encoding the curve twice.
  - **Deleting repeat reviews** destroys legitimate feedback.
- **Why this one.** It is one sentence; it is deterministic with no constant to tune; it is kind
  to repeat clients, whose voice counts fully and whose **latest** opinion is the one that counts,
  so a loyal client who is disappointed today moves the rating today; and it is useless for
  farming, because twenty reviews from one pair contribute exactly one value.
- **The trade-off, stated because it is real.** A provider with three loyal clients and twenty
  reviews has a rating built on **three** values while displaying twenty reviews. That is
  intended — three relationships is what they have — but it makes the display obligation
  load-bearing. The two numbers mean different things and a surface showing one without the other
  is misleading in whichever direction it chose.
- **What this does NOT do.** No trust score, no decay, no social or content signal, no Reel or
  post influence, and **no barter influence** — barter remains entirely outside reviews and
  reputation for beta. Review edit and delete remain impossible for every client role, which is
  what stops a write-observe-rewrite loop.
- **Where the two numbers appear.** The obligation above is discharged, not merely stated:
  the provider profile reads `Rating · N clients`; the search card and the Top Rated rows and
  hero show `★ 4.8 · N clients` instead of a bare review total; and Top Rated **ranks ties on
  client count, not review count**. That last one is not cosmetic — leaving the tiebreak on
  receipts would have let one repeat client push a provider up the leaderboard even though the
  rating itself was protected, which moves the gaming one column over rather than closing it.
  Phrasing lives in `lib/reputationLabel.ts` so it is one decision in one place.
- **What decides "latest" is the server's.** `provider_reviews.created_at` was client-settable,
  which would have let one review be pinned as "latest" forever — uncorrectable, because reviews
  can never be edited or deleted. It is now server-stamped and immutable (`20261079000000`).
  This rule is only as trustworthy as its ordering key.
- **A dispute does NOT change a published review.** `20261079000000` made the stored rating drop
  the instant a booking was placed `under_review`, and this entry previously recorded that as
  correct. It was reversed by ruling before merge: see **PD-093**. Reveal now latches
  (`20261082000000`) — a review already public when a hold opens stays public and keeps counting;
  a review not yet revealed stays held.
- **Evidence.** `20261077000000`, `20261078000000`, `20261079000000`, `20261080000000`;
  `supabase/tests/reviews_phase2.test.sql`; `__tests__/lib/reputationLabel.test.ts`;
  `scripts/negotiation-concurrency.mjs` (`raceTwoReviewsOneProvider`);
  `docs/operations/REVIEWS_OPERATIONS.md`.
- **Known limit, not solved here.** The rule counts distinct client *accounts*. Many accounts
  each leaving one review is still unbounded — identity is what would bound it, and this session
  does not take on third-party identity. Recorded in `REVIEWS_OPERATIONS.md` under what the
  system does not promise.
- **Two nuances the implementation chose and Product had not ruled on** were filed rather than
  quietly settled, and both have since been ruled: **OQ-078** → **PD-092** ("latest" is the latest
  SERVICE, ordered on `bookings.completed_at`), **OQ-079** → **PD-094** (no manual or service_role
  rating pin; the stored rating must be reproducible from the review data).
- **Status:** Locked; **implemented and merged** (`a253c3f`, PR #81), as amended by PD-092, PD-093 and PD-094.

---

### PD-092 — "Latest" is the latest SERVICE, not the latest receipt
- **Decided:** 2026-09-11 (closes **OQ-078**)
- **Decision.** For a repeat client/provider pair, the reputation-contributing review is the
  revealed review tied to the **most recently completed eligible service**, ordered by the
  authoritative booking chronology `bookings.completed_at` — **not** by review submission time.
  All legitimate revealed reviews still display in history; this rule decides only which single
  review from a given client feeds the provider's aggregate rating.
- **The tie-breaker, which is reachable and therefore documented.** `completed_at` is stamped
  `now()` — the transaction timestamp — so a provider who marks two of the same client's bookings
  complete in ONE action gives both the identical instant. When services tie, the tie is broken by
  the review's server-stamped `created_at` (descending), then by review `id` (descending). The
  first is "among services that ended at the same moment, the client's later statement stands";
  the second exists because `distinct on` without a total order returns an implementation-defined
  row, and a rating that changes between two recomputes with identical inputs is worse than a
  rating that is merely debatable.
- **The problem.** PD-091 ordered on `provider_reviews.created_at` — the latest review *written*.
  A client who visits on the 1st and the 5th, reviews the 5th visit first and the 1st visit a week
  later, had their **older** visit decide the rating. PD-091's whole justification is that a
  rating reflects the most recent relationship; a late review of an old service silently replacing
  a newer one breaks that for no gain.
- **Why `completed_at`.** It is server-stamped, immutable (SEC-DATA-101), and already the anchor
  for eligibility, the 7-day blind window and reveal. Ordering on it means ONE authoritative
  chronology governs the whole review system rather than two that can disagree. It also removes
  submission timing from the answer **wherever the services differ**: two concurrent reviews on two
  differently-completed bookings now produce the same rating regardless of which commits first.
  Submission order still decides the tie above, and only that tie.
- **What this does NOT change.** One client still contributes exactly one value. `review_count` is
  still every revealed review. `rating_client_count` is still distinct contributing clients. The
  blind window, one-sided validity, one-review-per-reviewer-per-booking, no client UPDATE/DELETE,
  and barter's total exclusion from reviews and reputation are all untouched.
- **Evidence.** `20261083000000` (`provider_reputation_canonical()` — now the ONLY definition of
  the rule, delegated to by `recompute_provider_rating_for` and `provider_reputation`);
  `supabase/tests/reviews_phase2.test.sql` §§ 5b, 5b-ii, 6b; `scripts/negotiation-concurrency.mjs`
  (`raceTwoReviewsOneProvider`, now asserting a deterministic rating).
- **Status:** Locked; **implemented and merged** (`a253c3f`, PR #81).

---

### PD-093 — Filing a dispute is not a reputation lever
- **Decided:** 2026-09-11
- **Decision.** Opening a dispute must **not** suppress or change the public reputation effect of
  an **already revealed** review.
  - A review **not yet revealed** when a booking enters `under_review` **may remain held** while
    the dispute is pending.
  - A review **already revealed** when the dispute opens **remains visible and continues
    counting**.
  - Merely opening a dispute **never** changes the rating.
  - An operator **resolution** may later change a review's eligibility or invalidate it **only if
    an approved resolution rule says so**. No such rule exists, and none is created here.
- **The problem.** `20261079000000` recomputed the stored rating on the hold, so a provider's
  public rating fell the instant a dispute was filed. Filing is an act by a participant with no
  adjudication behind it, so that made the dispute button an unreviewed veto over the other
  side's public record — reachable by the provider who dislikes a 1-star and by the client who
  wants leverage, with the same click. **PD-068** is explicit that participants never
  self-adjudicate; this handed them an adjudication outcome for free.
- **How "already revealed" is known.** Not by storing a verdict. Reveal is partly time-based — the
  7-day window closing with no counterpart review reveals a review with no write anywhere — so a
  `revealed_at` stamp would be wrong whenever nobody happened to be writing. Following **PD-070**,
  it is **derived from immutable facts**: the counterpart review's server-stamped `created_at`,
  the booking's `completed_at`, and one new server-stamped instant, `bookings.under_review_at`.
  While a hold is open, reveal is the ordinary rule evaluated as of `under_review_at`.
- **`under_review_at` has no `service_role` carve-out**, deliberately and against the local
  convention for timestamp stamps. It decides which already-public reviews a dispute suppresses,
  and `under_review` is already a `service_role`-only field — a carve-out would hand the only role
  that can open a hold the ability to choose its retroactive effect. Holds that predate the column
  are anchored at `completed_at`, which makes the latch evaluate false for every one of them: this
  publishes nothing retroactively.
- **What a hold still does.** It still blocks a NEW review on that booking. That takes nothing
  away from anyone; it only stops a statement being added to a contested record.
- **Operational consequence, stated because it creates work.** A complaint about an
  already-visible review can no longer be handled by opening a hold. It has to be handled as a
  case, and today's outcome is that the review stays. Support must not imply removal is possible.
- **Evidence.** `20261082000000`, `20261085000000`; `supabase/tests/reviews_phase2.test.sql`
  §§ 5c, 5d; `scripts/negotiation-concurrency.mjs`; `docs/operations/REVIEWS_OPERATIONS.md` § 6b.
- **Status:** Locked; **implemented and merged** (`a253c3f`, PR #81).

---

### PD-094 — A public rating nobody can pin
- **Decided:** 2026-09-11 (closes **OQ-079**)
- **Decision.** A provider's public rating is **derived from canonical eligible review data**.
  There is **no** manual or `service_role` rating override, and **no** permanent rating pin. No
  operator rating-editing surface is to be built.
- **Two pins existed, and the one that was filed was the smaller one.**
  - **(a) The filed one.** `service_role` may supply a review's `created_at`, which under PD-091
    chose which of a repeat client's reviews was authoritative — permanently, since reviews can
    never be edited or deleted. **PD-092 mostly dissolves this**: the ordering key is now
    `bookings.completed_at`, and `created_at` only breaks ties between services completed in the
    same transaction. It was never reachable — no server-side review writer exists.
  - **(b) The one nobody filed, and the one that was live.** `public.providers.rating` — a second
    numeric column that **no recompute has ever written**, yet is SELECT-granted to `anon` and
    `authenticated`, published by both public provider views, and used by `hooks/useProviders.ts`
    as the **ranking and min-rating filter key for provider search**, while every display surface
    read `average_rating`. Every row held 0, so nothing looked wrong; the moment real reviews
    landed, search would have ranked everyone on a stale zero, and any value written there would
    have been a permanent, invisible, hand-set marketplace position. One UPDATE from existing.
- **The fix, enforced rather than documented.** `rating` becomes a derived mirror of
  `average_rating`, written only by the recompute; and an invariant refuses to STORE any provider
  reputation value that `provider_reputation_canonical()` does not produce — **including a write
  by `service_role`**, which is the role the ruling is about. It is an equality check against the
  canonical computation, not a permission check, because the ruling is about *what may be stored*,
  not *who is writing*: there is no role for which a fabricated rating is acceptable, so there is
  no carve-out to find. Derived data is reproducible by definition, so nothing is lost when a raw
  load is corrected by the next recompute.
- **What was deliberately NOT done.** No operator rating editing, and none should be built — an
  override surface would be the pin this forbids, wearing a UI. If a rating is wrong, the eligible
  review data is what is wrong, and that is an adjudication question (**PD-068**).
- **SCOPE, stated exactly, because the prose invites a wider reading than the implementation.** This
  decision governs **what may be STORED in the derived columns**. It does not constrain the review
  ROWS the canonical query reads: `service_role` retains full INSERT/UPDATE/DELETE on both review
  tables (there is no append-only guard on either), so a holder of the service key can still move a
  rating by fabricating or removing reviews — and the resulting aggregate passes the invariant,
  because it *is* canonical for the altered data. That is one layer further back than OQ-079 looked
  and it is **not decided here**; it is filed as **OQ-080**. Nothing reachable by any client role
  changes either way.
- **Evidence.** `20261084000000` (`reputation_is_derived()`, `providers.rating` mirror);
  `hooks/useProviders.ts` (search now ranks and filters on `average_rating`);
  `supabase/tests/reviews_phase2.test.sql` § 8; `docs/operations/REVIEWS_OPERATIONS.md` §§ 4, 7.
- **Status:** Locked; **implemented and merged** (`a253c3f`, PR #81).

---

### PD-095 — Community is a service community, for clients and providers
- **Decided:** 2026-09-11
- **Decision.** Community serves **both clients and providers**, and exists to help people find
  providers, ask service questions, recommend providers, let providers say something useful about
  their business, and let local demand meet local supply. It is **not** a generic status feed, not
  lifestyle posting, not an influencer competition, not a follower-count economy and not an
  engagement-ranking system. **Discover remains the primary marketplace entry; Community is a
  secondary route surfaced from it, and does not replace it.** No sixth bottom tab.
- **The blocker this removed.** `community_posts.provider_id` was `NOT NULL REFERENCES
  providers(id)`, and both the INSERT policy and the read view required the caller to be in
  `providers`. A client could not post, reply or read — not by policy choice but by **table
  shape**. Community was provider-only in the strongest possible sense.
- **The actor model.** `author_kind` is an **explicit** discriminator, not "provider_id is null".
  The two agree today and drift the first time someone who owns a business posts as a person —
  the ordinary case for a provider asking another provider for a recommendation. A provider post
  is rewritten server-side to the caller's own **approved** provider, so a client cannot speak as a
  business and a **deapproved or restricted provider cannot speak as one at all** (the eligibility
  gate barter writes have taken since `20261048000000`, which Community never took).
- **Intents, not a blank composer.** Clients post `looking_for`, `need_advice`, `who_does_this`,
  `shoutout`; providers post `open_today`, `update`, `announcement`. **Answering a client question
  is a REPLY**, not a fourth provider post type — an answer that is not attached to the question is
  how a service community becomes a feed. The vocabulary is CHECK-constrained in the database and
  paired with the actor, **not only typed in TypeScript**: the pre-existing `category` column is
  free text with no constraint and the app mapped anything unrecognised to "Other", so a typo wrote
  a value that rendered as Other forever with no error at any layer.
- **What is deliberately NOT built.** No generic client post type. No client media or gallery
  system — Reels is not reopened. No follow expansion. No trending, no ranking by engagement, no
  operator content take-down (`is_active` is documented as reserved and unused rather than left
  looking like a working mechanism).
- **Content ranking, stated as a hard rule.** Social content engagement **does not influence
  provider marketplace ranking**, and the community feed itself is ordered chronologically. A
  provider who never posts is not worse off for it — there is no hidden tax for not posting.
  `lib/discovery.ts` already enforced this with a type carrying no content field; this decision
  does not weaken it, and `__tests__/guards/communityShape.test.ts` plus
  `supabase/tests/community.test.sql` § 9 assert the separation from both sides.
- **Evidence.** `20261088000000`, `20261089000000`, `20261090000000`, `20261091000000`;
  `supabase/tests/community.test.sql`; `__tests__/guards/communityShape.test.ts`;
  `docs/operations/COMMUNITY_OPERATIONS.md`.
- **Status:** Locked; **implemented on `feat/community-reshape`**, pending merge.

---

### PD-096 — Open Today is a projection with a note on it, not a post
- **Decided:** 2026-09-11
- **Decision.** A provider's "Open Today" is **derived from published availability**, not asserted
  by a post. The provider attaches a short, time-bounded NOTE to a day they are already published
  as open; the write is **refused** (`PT430`) if `providers_open_today()` does not contain them,
  `expires_at` is stamped by the **server** to the end of that day in their own timezone, and the
  surfacing view requires **both** a live expiry **and** current membership of
  `providers_open_today()`.
- **Why not a post.** The availability tables are the truth about whether a provider is open.
  A stored "I'm open today" post would be a second source of truth that can contradict the first,
  and a permanent text post saying "open today" forever is exactly the failure this must not ship.
  **Do not invent availability truth.**
- **Three properties this buys.** It disappears from Open Today when the day ends; it disappears
  when the provider blocks the date, *before* it expires; and **neither requires deleting history**
  — the row stays, and the author can still see it in Business → Community marked as ended.
- **What it still does not claim.** "Open today" means published hours for today, **not a free
  slot**. Booked time is not subtracted anywhere in this product, and the badge says so. This is
  the same under-claim the "Open today" discovery filter already makes (`20261044000000`).
- **Evidence.** `20261088000000` (the CHECK making an expiry-less open_today unrepresentable, the
  trigger, the view), `supabase/tests/community.test.sql` § 3.
- **Status:** Locked; **implemented on `feat/community-reshape`**, pending merge.

---

### PD-097 — A shoutout is a recommendation, not a review
- **Decided:** 2026-09-11
- **Decision.** A client may **recommend** a provider in Community. A shoutout **must name a real,
  approved provider** (not the author's own business, and not across a block), and it **changes
  nothing in reviews or reputation**: no rating, no review count, no client count, no path into
  `provider_reputation_canonical()`. **Review = transaction reputation. Shoutout = social
  recommendation.** They appear in separate, separately-labelled sections of a provider's profile.
- **Booking linkage is OPTIONAL, and this is the trade-off being surfaced rather than hidden.**
  Requiring a completed booking would make shoutouts **dead on arrival in a 25-30 person beta** —
  almost nobody has a completed booking with the provider they want to recommend yet — and it
  would rebuild the review system's evidence bar on a surface that is explicitly not a review.
  So linkage is optional; when it IS offered the **server verifies it** (the author's own
  COMPLETED booking with that exact provider, `PT433` otherwise), and only then may a surface show
  "Worked together". **Whether beta should require it is filed as OQ-081, not decided here.**
- **What this does NOT do.** It does not create a second reputation system, it does not rank
  providers, and it does not let a shoutout move a star. A provider cannot buy, farm or trade their
  way up the marketplace with it, because the marketplace does not read it.
- **Evidence.** `20261088000000` (the CHECK requiring a named provider, the trigger's approval /
  self / block / booking checks); `supabase/tests/community.test.sql` § 2, which asserts the
  reputation numbers are unchanged AND that the rule cannot structurally see community at all;
  `components/ProviderShoutouts.tsx`.
- **Status:** Locked; **implemented on `feat/community-reshape`**, pending merge.

---

## Not decisions

Recorded so they are not mistaken for locked state:

- **Paid / Trade / Hybrid** as a booking-type architecture — a working idea, **not approved**. (OQ-001 closed 2026-09-04 on the narrower question of where the trade flag lives; this architecture remains unapproved.)
- ~~Any specific barter transaction model (reciprocal bookings vs a parent trade agreement) — open. See OQ-002.~~ **Superseded 2026-09-04:** settled as a parent trade agreement with directed obligations. See `BARTER_BETA_CONTRACT.md` § 4 and § 6.
- The exact first provider-category mix for the beta cohort — open. See OQ-030.
