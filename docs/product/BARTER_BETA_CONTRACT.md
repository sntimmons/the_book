# Barter — first Houston closed beta contract

**Status:** Authoritative for the **first Houston closed beta**. Owner: Founder (Stephen).
**Reconciled against:** `main` @ `c04e5bd` (2026-09-08, after PR #69), **plus the unmerged
adjudication branch** whose clauses are marked where they appear.
**Last edited by:** the manual-adjudication branch (PD-064 … PD-069). Previously PR #41, whose
provenance line survived four months of edits and was corrected here — including edits dated
2026-09-08, which the stale header dated 2026-09-04.

> **⚠️ READ THE PROVENANCE.** Sections describing **manual adjudication and the three terminal
> OBLIGATION outcomes** (§ 7.5, and the PD-068 / PD-069 clauses in §§ 4, 5.1, 7.5, 12) describe
> the **unmerged** adjudication branch, not `main`. Until it merges,
> [CURRENT_STATE.md](CURRENT_STATE.md) is the authority for what `main` actually contains, and it
> correctly still says no adjudication exists there. Reconciling it is a **merge-time
> obligation** for the Project State Steward.

> **Purpose.** This document makes already-approved barter decisions **durable**. It is not a
> design session and introduces nothing new: every clause below was approved by the Founder,
> and until now existed only outside the repository. Where a clause has a locked ledger entry
> it cites the `PD-NNN`; the rest are recorded here as the authoritative statement.
>
> **This is a product contract, not an implementation spec.** It says what is true of the
> product, not how to build it. Where the code does not yet match, the gap is stated as a gap
> — this document never describes unbuilt behaviour as if it ships today.

## 1. Scope

The first Houston closed beta only. Anything this document does not lock is **not** decided
by omission — see § 11 for what remains open, and
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) for the ledger.

## 2. Who can trade

- The barter board is **provider-only**. Clients do not see it and do not participate.
- Eligibility is **approved / marketplace-live providers**: `providers.is_approved = true`,
  meaning live and not suspended. It is **not** identity verification — **PD-044**.
- Participation is additionally opt-in at the **provider level**: a provider turns on
  **Open to Trades**. Eligibility and opt-in are separate — being eligible does not enrol you.

## 3. What is posted, and what is authoritative

- The post model is **need + offer**: what a provider is seeking, and what they are offering.
- A provider may hold **at most 3 active posts**.

### 3.1 The board post stays editable; the deal does not

Locked 2026-09-04 — **PD-047**. The **public barter post remains editable while active.** It is
not frozen by the first response.

But **every proposal snapshots the barter-post terms as they were when that proposal was
created.** Editing the public post therefore:

- **affects future responders**, and
- **must not** rewrite an existing proposal, an in-flight negotiation, or an accepted agreement.

The authoritative progression is one direction only:

> mutable board post → **immutable proposal snapshot** → versioned negotiated proposal/counter
> terms → **accepted agreement version**

**The final agreement is authoritative, and must not depend on reading the current mutable
board post.** Material changes to negotiated terms create a **new** proposal/agreement version
and invalidate acceptance of the prior version (§ 4).

Once an agreement is finalised for a post, the sourcing post is **auto-closed**; it and its
history are **preserved**, never destructively deleted.

The consequence for implementation is explicit: transaction truth is modelled **independently
of `barter_offers`**. The mutable post is a sourcing surface, not the record of the deal.

### 3.2 One active negotiation per post

Locked 2026-09-04 — **PD-049**. A post may receive many interests; **only one may be accepted
(selected for negotiation) at a time**.

> post → many pending interests → **ONE accepted interest** → **ONE active negotiation**

If the negotiation ends **before** an official agreement, the interest moves to **`released`**:
history preserved, slot freed, and the owner may accept another pending interest **while the
post is still active**. A released interest is never deleted and never re-pended, and the
released responder may not open a second interest on that post in the first beta.

**"Still active" is load-bearing, and is not the same as "still in the feed."** Locked
2026-09-04 — **PD-050**:

- A post that is **active but has aged out** of the discovery feed's newest-50 window is fully
  answerable. Accept and decline are reachable from Trade Activity for exactly this case: the
  feed is discovery, and falling out of it is not a product event.
- A post the owner **manually closed** is finished, and finished is **terminal**. Closing is
  one-way (**PD-051**): a closed post cannot be reopened by any authenticated write, so a
  provider who wants to offer again creates a new post. Its pending responses become history
  and may be **neither accepted nor declined** (**PD-052**) — they stay `pending`. Accepting
  would silently return a post to the board the owner took off it; declining would silently
  rewrite what the responder is told, from "the post was closed" to "you were not selected".
  Enforced in the database by `barter_offers_zy_active_one_way` and
  `barter_interests_zy_answer_open_offer`, not by hiding a button. **Ending** an accepted
  negotiation stays permitted on a closed post: a negotiation outlives its post.
- Both parties are told which case they are in. The owner's closed-post rows say the post was
  closed; the responder's say so too, rather than reading as an open wait forever.

The reason is **derived from who ended it** — `responder_withdrew` or
`owner_ended_negotiation` — so neither party can characterise the other's exit. This is a
pre-agreement path only: once an agreement is formed the post is consumed and closes.

> **Reachable as of Slice 3a-0c.** Either participant can end a negotiation from **Trade
> Activity** (`/community/trade-activity`), which is durable: it does not depend on the post
> still being on the board or inside the discovery feed's window. The counterparty is told by a
> server-authored notice in the pair's canonical conversation, which names the post's terms; the
> actor is not notified of their own action.

## 4. What makes a trade real

- Trades in this beta are **two-party** only.
- Negotiation is **structured**: proposal, counter, accept, decline. It is not free text
  standing in for terms.
- An **official agreement is required before a trade is real**. Conversation alone — however
  clear — does not create a trade.
- **Acceptance defines the bargain (PD-069).** Once both providers knowingly accept the same
  current version, **the agreed exchange IS the deal**. The platform does not second-guess it,
  and later regret about pricing or value is not a dispute the platform entertains.

**Direct barter remains the beta model, and this is a decision rather than a stage.** Provider A
↔ Provider B, two parties, no third leg. **No credits, no barter points, no tokens, no
stored-value currency, no cash hybrid, no multi-party or three-way transaction** exists or may
be added in beta (**PD-069**, and PD-032 for the two-party limit). Reciprocal matching, a
provider Wants list, matching suggestions and three-way matching are **future exploration only**
— see [FUTURE_PRODUCT_IDEAS.md](FUTURE_PRODUCT_IDEAS.md) — and the matching problem must be
proven with real user data before any currency is invented to solve it.


> **Built as of Slice 3a — the proposal machinery, not the agreement.** Inside an accepted
> interest either provider may propose terms. Each version is **exactly two directed terms** —
> what the offer owner gives, what the responder gives — with **no value field** and with each
> side's participant **derived by the server** from the accepted interest, never sent by the
> client. Terms are **versioned**: a counter creates a
> new version, no version is ever edited, and advancing to a new one withdraws any acceptance of
> the previous one. Both providers must explicitly accept the **same current version** —
> authoring is not acceptance and countering is not acceptance (**PD-053**). Each version
> snapshots the public post as it stood when authored, so editing the post cannot rewrite what
> was proposed.
>
> **Both accepting makes a trade READY to confirm, not official (PD-054).** Either participant
> may then **confirm**, which creates one official agreement referencing the accepted version
> and closes the sourcing post in the same transaction (**PD-055**). After that the terms are
> frozen and pre-agreement release is unavailable. Still no obligation, delivery, confirmation
> window or adjudication model: the app says "Trade confirmed", never booked, complete,
> fulfilled, delivered or guaranteed.

## 5. What may be traded

- **Service for service only.**
- **No required dollar equivalence.** The parties decide what is fair; the platform does not
  price the trade or demand matched values.
- **No cash hybrid** in the first beta: no part-cash, part-service arrangements.
- **No vague "exposure"** as consideration. Exposure, promotion, referrals and audience are
  not tradeable consideration.
- What is offered is either an **existing service** the provider already lists, or a **custom
  barter package** defined for that trade.

### 5.1 Value belongs to the providers

Locked 2026-09-08 — **PD-069**. **The Book does not appraise the trade. It makes the trade
clear, mutual, and accountable.**

- The platform does **not** appraise, equalize or compare the economic value of a trade.
  Providers decide for themselves whether an exchange is worth accepting.
- **Retail price does not determine subjective value.** A photographer who normally charges
  $200 may genuinely value a $40 haircut more than the session they are giving up. That trade
  is **valid**, and the product must **never** warn that a trade "appears unequal".
- **Quantity and description define the commitment, not parity.** *1 headshot session with 10
  edited photos*, *4 haircuts*, *6 training sessions*, *1 logo package*. The system may need
  quantity for obligation clarity; it must not use quantity to decide economic equality. The
  question is **"what did you promise?"**, never **"is it worth the same?"**.
- **NOT BUILT and not to be built in beta:** forced dollar valuation, negotiation-time market
  valuation, automated valuation, equivalency math, fairness warnings, a platform-recommended
  exchange ratio, Book Credits, barter points, internal tokens, stored-value currency. A
  **proposal version** carries **exactly two directed terms and no value field** (§ 4) — the
  negotiation itself is where the enforcement bites, and `20260925000000` removed
  `estimated_value` from the proposal for exactly this reason.
- **RESOLVED 2026-09-08 — the estimated-value field is GONE from the live product.** A barter
  post used to carry an optional provider-declared `offering_value`: an *"ESTIMATED VALUE
  (OPTIONAL)"* dollar field in the composer and a `~$N value` badge on every board card. The
  Founder ruled it out. **No new offer records a value** — the server nulls it on insert and
  refuses to introduce or change it on update — **and no live surface renders one.**
- **The column is DEPRECATED, not dropped, and that is deliberate.** `barter_offers.offering_value`
  remains so that historical rows, and the **immutable proposal-version post snapshots** that
  copied the figure at the time, are not destroyed. Stopping collection is a product change;
  deleting a record somebody entered is not, and is a separate decision. Legacy rows stay
  **editable** — a provider can still fix their wording without the write being rejected for
  carrying a value it inherited — and the value can be cleared but never re-introduced.

## 6. Delivery and confirmation

- An agreement creates **directed obligations** — each obligation has a deliverer and a
  receiver, and is tracked in its own right.
- **The receiver confirms.** Delivery is not complete because the deliverer says so.
- `delivered_at` is **server-stamped**. It is not client-supplied and not editable.
- The receiver has a **7-day confirmation window**.
- **There is no timeout completion.** An unconfirmed obligation never becomes Completed by
  the clock running out. Silence is not consent, and elapsed time earns no credit.

## 7. Exiting, cancelling, and not showing up

Locked 2026-09-04 — **PD-046**. The governing distinction is **before agreement**, **after
agreement but before delivery**, and **after any delivery** — the cost of leaving rises as the
other party's exposure rises.

### 7.1 Before an official agreement

Until both providers have explicitly accepted the **same current agreement version**, either
party may withdraw a proposal, decline, or simply walk away.

This is **not a cancellation.** No penalty, no review, no reliability judgment, and nothing
that reads as a broken commitment. Negotiating and deciding not to proceed is ordinary.

### 7.2 After agreement, before any delivery

**Either participant may cancel, unilaterally.** The other party's permission is **not**
required — nobody is held inside a service commitment by the counterparty's refusal to release
them.

Recorded: `cancelled_at`, the cancelling participant, and an optional reason.

- Both agree → **Mutually Cancelled**
- One participant exits → **Cancelled by Participant**

For the first Houston closed beta: **no normal review, no automatic reputation penalty, no
ranking impact.** Actor and timing are retained for a future reliability model — retained, not
scored.

### 7.3 After delivery starts

Once **any** obligation is marked delivered, ordinary cancellation is **unavailable**. The
other party has already given something up, and a unilateral exit would erase that.

Unresolved disagreement routes **Needs Attention → Under Review → manual adjudication**
(Founder-operated in the beta). **Partly superseded, 2026-09-07:** an explicit **no-show** or
**`not_received`** now enters **Under Review DIRECTLY**, without passing through Needs Attention
(§ 7.4, PD-062). Whether a plain unanswered Needs Attention ever escalates into Under Review is
still **undecided**. **Manual adjudication IS now built** (PD-064 … PD-067): an operator — and
only an operator — can resolve an obligation that is Under Review. No operator SCREEN exists yet,
and who performs a review through what surface is an open Founder question.

### 7.4 No-show

> **⚠️ SUPERSEDED IN PART, 2026-09-07 (Founder ruling; PD-062, PD-063).** The paragraph below in
> ~~strikethrough~~ described a route that was never built and is **no longer the intended one**.
> It is kept rather than deleted so a reader who has seen it elsewhere can find out what replaced
> it. **The current behaviour is stated immediately after it.**

**A no-show is not a cancellation.** It is failing to perform at the agreed time *without
having recorded a cancellation beforehand* — the difference is whether the other party was
told. **(This distinction still stands.)**

~~For the first beta: route to **Needs Attention** and manual adjudication. If established, the
affected obligation is **Unfulfilled**.~~ A failed obligation produces **no normal
service-quality review**. The event is retained for a future conduct/reliability model, with
**no automatic ranking or reputation effect** in the first beta.

**CURRENT BEHAVIOUR (PD-062, PD-063), implemented in `20261012000000`–`20261018000000`:**

A no-show is a **participant-reported event**, reported only by the RECEIVER of an obligation
whose `scheduled_at` is non-null, at or after that time, judged by **server-authoritative time**.
A valid report is **immutable** and routes the obligation and its agreement to **Under Review**
— meaning a human must look, and nothing more.

The route is therefore **no-show → Under Review**. It is **NOT** no-show → Needs Attention →
adjudication → Unfulfilled. Specifically, a no-show produces **no** automatic Needs Attention,
**no** Unfulfilled, **no** finding of fault, **no** reliability or reputation impact and **no**
terminal outcome. **Amended 2026-09-07 (PD-064):** a terminal outcome can now FOLLOW, but only
because a person decided it — never automatically, and never as a consequence of the report
itself. Reporting a no-show still decides nothing.

Once a report exists, **ordinary pre-delivery cancellation is no longer available** (PD-063):
a trade cannot be cancelled out of review, and a cancellation can never erase or hide a recorded
report.

**Needs Attention is a separate route and is unchanged**: an unanswered receiver window still
expires to Needs Attention only, with no second timer and no escalation. **How a plain Needs
Attention might later enter Under Review is deliberately UNDECIDED** and will be settled with the
adjudication / review workflow — see § 7.5 and OPEN_QUESTIONS.

### 7.5 Terminal truth

> **⚠️ SUPERSEDED IN PART, 2026-09-08 (PD-070).** The **OBLIGATION** half is implemented and
> unchanged: an operator resolves one obligation as **Fulfilled**, **Unfulfilled** or **Closed
> without resolution**, one at a time, and the record is immutable (PD-064 … PD-067).
>
> **The AGREEMENT table below is NO LONGER A TARGET. It is superseded.** It was written before
> the three obligation outcomes existed and does not compose with them, and **PD-070 rules that
> agreement-level resolution is DERIVED and never stored** — there is no `Completed`, no
> `Partially Fulfilled` and no `Not Completed` column, status or verdict, and none is coming.
> `supabase/tests/adjudication.test.sql` asserts that absence permanently rather than pending a
> future slice. The table is kept, struck through, so a reader who has seen this vocabulary
> elsewhere can find out what replaced it.

~~Overall agreement state:~~

| ~~State~~ | ~~Meaning~~ |
|---|---|
| ~~**Completed**~~ | ~~All required obligations Fulfilled~~ |
| ~~**Partially Fulfilled**~~ | ~~At least one Fulfilled **and** at least one Unfulfilled~~ |
| ~~**Cancelled**~~ | ~~Ended before any delivery, through the cancellation path~~ |
| ~~**Not Completed**~~ | ~~No required obligation fulfilled, and performance failed~~ |
| ~~**Under Review**~~ | ~~Active investigation / adjudication~~ |
| ~~**Closed Without Resolution**~~ | ~~The platform could not establish what happened~~ |

**CURRENT BEHAVIOUR (PD-070). A trade is READ, not labelled.** The agreement keeps one state for
its whole life — **Trade confirmed** — because renaming it *would be* the stored verdict PD-070
refuses to create. What a participant sees is derived from how far the two obligations have been
resolved:

| What is true | What the trade says |
|---|---|
| Neither obligation resolved | The terms are agreed; arrange the details in your conversation |
| **One** resolved, the other still live | That side has been reviewed, **and what is still outstanding is stated after it** |
| Both resolved, **both Fulfilled** | Both sides were reviewed and fulfilled; nothing further is needed |
| Both resolved, **any other combination** | Both sides have been reviewed — **each outcome is shown on its own obligation**, and no trade-level verdict is stated |
| Cancelled | Cancelled. This **outranks every resolution state** |

**The fourth row is the one that matters, and it is a ruling rather than an implementation
detail.** *Closed without resolution* records that the available information did not support
either finding. So **`Fulfilled + Closed` is NOT "Partially Fulfilled"** — that label asserts the
other side was found **Unfulfilled** — and **`Closed + Closed` is NOT "Not Completed"**, which
asserts performance failed. Where a single word would overstate what was found, the product
**states the two obligation truths and stops**. `Under Review` and `Cancelled` remain DERIVED
read states, not outcomes.

**Individual obligation truth survives independently of the overall agreement state.** An
obligation that was genuinely fulfilled stays Fulfilled even if the agreement as a whole ends
Partially Fulfilled or Closed Without Resolution. Rolling the legs up into one verdict would
destroy the only record of who actually did their part. **This is the clause the implemented half
follows literally** (PD-065): obligations are resolved independently, one may be Fulfilled while
the other is still Under Review, and neither participant's screen computes a trade-level verdict
from the pair.

Two rules carry over unchanged: outcomes must be **truthful** — a false success is worse than
an ugly truth — and **history is retained**; a participant cannot destructively erase the
counterparty's record of an interaction (**PD-043**), with legitimate account erasure a
separate path that outranks retention.

**What a review is about, and who runs it — PD-068 / PD-069.**

- **The Book adjudicates performance, not value.** Valid performance issues: a promised service
  not delivered, a no-show, a receiver reporting non-receipt, an agreed quantity not performed,
  an agreed commitment materially not delivered. **Not** performance issues, and not grounds
  for review: *"my normal rate is higher"*, *"their service is worth less"*, *"I could have
  charged more"*, *"I changed my mind about the value"*, *"their retail price is $40 and mine is
  $200"*. This narrows what an operator may consider; it does **not** narrow the three outcomes,
  and *Closed without resolution* stays the honest answer where performance cannot be
  established. It is also **not** a quality-dispute engine — quality is a different question
  from delivery and is not decided here.
- **Only an authorized internal operator adjudicates during beta.** Participants may never
  adjudicate their own trade, and no participant-facing adjudication path exists.
- **No operator surface is shipped, and a minimal internal Review Queue is REQUIRED before live
  barter beta.** It must let an authorized operator view the agreement, view the obligation,
  view the recorded participant facts and evidence, choose exactly one terminal outcome, enter
  the required internal rationale, and submit through the already-secured adjudication path.
  Until it exists, no obligation can actually reach a terminal outcome in the running product.
- **No resolution SLA is promised.** Participant-facing language says **"This trade is under
  review."** — not 24 hours, not 48 hours, not "X business days", and not a guaranteed
  resolution. Do not add one to copy.

## 8. Reviews and reputation

- **No barter reviews in the first Houston closed beta.**
- **Barter has no effect on public reputation or ranking** in the first beta.
- Later "Verified Trade" reputation work is **deferred**, not rejected — § 10.

## 9. Safety and contact

- **Blocking and reporting must exist before real beta transactions run.** They are a platform
  capability, not a barter feature, and barter must not be the reason they are skipped.

### 9.1 Contact after a decline

Locked 2026-09-04 — **PD-048**. A provider who previously **declined** another provider's
request **may later initiate legitimate contact** with them.

It **must not** be implemented by silently re-opening the other person's declined request —
that would rewrite their record of having said no. Conceptually it is a **new
reverse-direction contact episode on the same canonical provider-pair conversation**
(one thread per pair is already enforced; see `20260908000000_canonical_provider_pair.sql`).

This is an approved **messaging follow-up**, not Slice 3 scope: do not expand the agreement
slice to redesign messaging unless the agreement flow itself requires it. The current
truthful dead-end copy may remain in the interim.

## 10. Beta limits

| Limit | Value | Enforced today? |
|---|---|---|
| Active posts per provider | 3 | Not server-enforced |
| New offers per provider per day | 5 (intended **server-side** limit) | **Not server-enforced** — client-side only, and that check fails open |
| New interests per provider per rolling 24h | 15 | **Yes**, server-authoritative — **PD-045** |
| Public interest count | Not shown | n/a |

Interest counts are **not public**. Enforced by RLS on `barter_interests`, which returns only
the offer owner's rows and the caller's own; B5B asserts all three sides of it. Until Slice
3a-0c the discovery feed rendered a count to non-owners — what it actually showed was the
caller's own row count presented as a total, so it was both a contract violation and a false
number. Removed. A provider does not see how many others responded to an
offer.

## 11. Deferred, and open

**Deferred — decided to postpone, not decided against:**

- **Multi-party trades.** Deferred, **not rejected** — PD-032 holds the beta to two parties.
- **Verified Trade reputation.** The model by which trades could later contribute to
  reputation is future work.

**Open — genuinely undecided, and not to be resolved by implementation:**

- **OQ-006** — collusion and reciprocal-rating gaming. Two-party scope does not close this.

*(OQ-004 closed 2026-09-04 by § 7 / PD-046. OQ-008 closed 2026-09-04 by § 3.1 / PD-047.)*

## 12. Where the product does not yet match this contract

Recorded so the gap is visible rather than assumed closed:

- The **eligibility conjunct** (§ 2) is not implemented. `caller_provider_id()` provides the
  seam without the `is_approved` condition.
- The **Open to Trades** opt-in control (§ 2) is not built.
- ~~**Agreements and obligations** (§§ 4, 6, 7) do not exist as schema. Nothing in
  `barter_offers` or `barter_interests` implements them. Slice 3 is where they land.~~
  **CLOSED** — `barter_agreements` landed in `20260927000000_barter_agreement_finalization.sql`
  and `barter_obligations` in `20261003000000_barter_obligations_foundation.sql`, with a dozen
  further migrations on top through `20261025000000`. This line survived two months after the
  thing it describes shipped; struck through rather than deleted, as § 11 already does.
- The **3-post** and **5-offer/day** limits (§ 10) are not server-enforced.
- **Blocking and reporting** (§ 9) do not exist.
- The **internal Review Queue / operator surface** (§ 7.5, **PD-068**) does not exist. The
  secure adjudication path does; nothing calls it. Required **before live barter beta**.
- ~~The **terminal AGREEMENT-level outcome** (§ 7.5 table) does not exist, and whether it should
  be **persisted or derived** is undecided.~~ **RESOLVED by PD-070:** it is **derived** and will
  not be persisted. No stored agreement verdict exists, and none is coming. The § 7.5 table below
  is therefore a description of how a trade READS, not of a column.
- ~~The **optional estimated value on a barter POST** is unreconciled with PD-069.~~
  **RESOLVED 2026-09-08:** removed from the live product; the column is deprecated legacy data.
  See § 5.1.
- ~~The **negotiation detail banner** still reads *"Arrange the details in your conversation"* on
  a confirmed trade whose obligations have been terminally resolved.~~ **FIXED** by the derived
  presentation (PD-070): the banner follows how far the obligations are resolved, and instructs
  nobody once both are.
