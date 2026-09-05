# Barter — first Houston closed beta contract

**Status:** Authoritative for the **first Houston closed beta**. Owner: Founder (Stephen).
**Reconciled against:** `main` @ `0e11cde33a9df39102fba734de99697d2f4072d0` (2026-09-04)
**Last edited by:** PR #41

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

## 5. What may be traded

- **Service for service only.**
- **No required dollar equivalence.** The parties decide what is fair; the platform does not
  price the trade or demand matched values.
- **No cash hybrid** in the first beta: no part-cash, part-service arrangements.
- **No vague "exposure"** as consideration. Exposure, promotion, referrals and audience are
  not tradeable consideration.
- What is offered is either an **existing service** the provider already lists, or a **custom
  barter package** defined for that trade.

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
(Founder-operated in the beta).

### 7.4 No-show

**A no-show is not a cancellation.** It is failing to perform at the agreed time *without
having recorded a cancellation beforehand* — the difference is whether the other party was
told.

For the first beta: route to **Needs Attention** and manual adjudication. If established, the
affected obligation is **Unfulfilled**. A failed obligation produces **no normal
service-quality review**. The event is retained for a future conduct/reliability model, with
**no automatic ranking or reputation effect** in the first beta.

### 7.5 Terminal truth

Overall agreement state:

| State | Meaning |
|---|---|
| **Completed** | All required obligations Fulfilled |
| **Partially Fulfilled** | At least one Fulfilled **and** at least one Unfulfilled |
| **Cancelled** | Ended before any delivery, through the cancellation path |
| **Not Completed** | No required obligation fulfilled, and performance failed |
| **Under Review** | Active investigation / adjudication |
| **Closed Without Resolution** | The platform could not establish what happened. **Terminal**, and **no reliability judgment is assigned** from the unresolved obligation |

**Individual obligation truth survives independently of the overall agreement state.** An
obligation that was genuinely fulfilled stays Fulfilled even if the agreement as a whole ends
Partially Fulfilled or Closed Without Resolution. Rolling the legs up into one verdict would
destroy the only record of who actually did their part.

Two rules carry over unchanged: outcomes must be **truthful** — a false success is worse than
an ugly truth — and **history is retained**; a participant cannot destructively erase the
counterparty's record of an interaction (**PD-043**), with legitimate account erasure a
separate path that outranks retention.

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
- **Agreements and obligations** (§§ 4, 6, 7) do not exist as schema. Nothing in `barter_offers`
  or `barter_interests` implements them. Slice 3 is where they land.
- The **3-post** and **5-offer/day** limits (§ 10) are not server-enforced.
- **Blocking and reporting** (§ 9) do not exist.
