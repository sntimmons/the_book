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

## 3. What is posted

- The post model is **need + offer**: what a provider is seeking, and what they are offering.
- A provider may hold **at most 3 active posts**.

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

## 7. When a trade does not go cleanly

- An obligation that is not confirmed surfaces as **Needs Attention**, and escalates to
  **Under Review**.
- Adjudication in the beta is **manual**.
- Outcomes must be **truthful**: a trade where one leg was delivered and the other was not is
  **Partially Fulfilled**, never Completed. A false success is worse than an ugly truth.
- **History is retained.** A participant cannot destructively erase the counterparty's record
  of an interaction — **PD-043**. Legitimate account erasure is a separate path and outranks
  retention.
- **Cancellation rules apply, and their specifics are NOT settled here.** What is locked is
  the surrounding frame: no timeout completion (§ 6), truthful outcomes and history retention
  (this section). Whether a two-party trade may be **mutually cancelled before delivery**, and
  how cancellation differs from a no-show on each leg, remain open — **OQ-004**. Do not infer
  a cancellation model from this document.

## 8. Reviews and reputation

- **No barter reviews in the first Houston closed beta.**
- **Barter has no effect on public reputation or ranking** in the first beta.
- Later "Verified Trade" reputation work is **deferred**, not rejected — § 10.

## 9. Safety

- **Blocking and reporting must exist before real beta transactions run.** They are a platform
  capability, not a barter feature, and barter must not be the reason they are skipped.

## 10. Beta limits

| Limit | Value | Enforced today? |
|---|---|---|
| Active posts per provider | 3 | Not server-enforced |
| New offers per provider per day | 5 (intended **server-side** limit) | **Not server-enforced** — client-side only, and that check fails open |
| New interests per provider per rolling 24h | 15 | **Yes**, server-authoritative — **PD-045** |
| Public interest count | Not shown | n/a |

Interest counts are **not public**. A provider does not see how many others responded to an
offer.

## 11. Deferred, and open

**Deferred — decided to postpone, not decided against:**

- **Multi-party trades.** Deferred, **not rejected** — PD-032 holds the beta to two parties.
- **Verified Trade reputation.** The model by which trades could later contribute to
  reputation is future work.

**Open — genuinely undecided, and not to be resolved by implementation:**

- **OQ-004** — cancellation and no-show for trades (see § 7).
- **OQ-006** — collusion and reciprocal-rating gaming. Two-party scope does not close this.
- **OQ-008** — whether an offer's terms may still be edited once providers have responded.

## 12. Where the product does not yet match this contract

Recorded so the gap is visible rather than assumed closed:

- The **eligibility conjunct** (§ 2) is not implemented. `caller_provider_id()` provides the
  seam without the `is_approved` condition.
- The **Open to Trades** opt-in control (§ 2) is not built.
- **Agreements and obligations** (§§ 4, 6, 7) do not exist as schema. Nothing in `barter_offers`
  or `barter_interests` implements them. Slice 3 is where they land.
- The **3-post** and **5-offer/day** limits (§ 10) are not server-enforced.
- **Blocking and reporting** (§ 9) do not exist.
