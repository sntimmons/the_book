# Houston Beta Strategy

**Status:** Authoritative for beta intent and success definition. Owner: Founder.
Maintained by the Project State Steward.

## Thesis

> In 21–30 days, The Book should prove that small providers and supportive clients can use
> one platform to discover each other, build trust, connect, book real services,
> participate in community, and complete meaningful interactions — **without needing
> payments live yet.**

Houston-first, closed cohort (PD-040, PD-041).

## What this beta is not for

Being explicit, because these are the defaults a beta drifts into:

- **Not** optimising vanity engagement or maximising daily opens.
- **Not** simulating a finished payments marketplace.
- **Not** a broad launch. Trust and safety are not ready for open signup (OQ-020 … OQ-026).
- **Not** a growth test. Twenty people who need this beats a thousand who tried it once.

---

## What the beta must prove

### 1. Need
People genuinely want this — not "that's neat", but a gap they currently feel.

### 2. Marketplace liquidity
Providers and clients can find **useful** matches. Liquidity is local and category-dense:
a scattered cohort produces browsing, not matches.

### 3. Trust
Profiles, work examples, platform records, messaging, booking and reputation make dealing
with a stranger feel safer and more credible than a DM to an Instagram account.

### 4. Transaction intent
People book and complete **real services** even though they cannot pay in-app. This is the
sharpest signal in the whole beta: doing the work anyway means the product is carrying
real weight.

### 5. Community
The product feels alive — not a static directory.

### 6. Barter
Mutual-value service exchange is useful and culturally relevant **without becoming
exploitative** (PD-031).

### 7. Return behaviour
Providers come back because The Book helps them run their business and gives them
community, social and discovery value.

---

## Success criteria

### Minimum floor (Founder-set)

- **20+ real users** sign up and use the app
- **both sides represented** — providers and clients
- **useful feedback** — specific, not "looks good"
- users **looking forward to it continuing**
- **at least 2 successful bookings / interactions**

This is a floor, not a target. Clearing it means the beta was worth running.

### Signals of genuine product pull

Stronger than the floor, and what actually indicates a product worth building:

- "I would use this"
- **"I need this"**
- **"my barber / nail tech / trainer needs this"**
- **"when can I pay in here?"**
- repeat usage without prompting
- unprompted referrals and invites
- providers returning on their own
- completed real interactions

**Why "my barber needs this" beats "cool app".**

"Cool app" is a compliment about the artifact. It costs nothing, predicts nothing, and
people say it to be kind.

"My barber needs this" is different in three ways. It is **specific** — a real person with
a real business the speaker knows well. It is **an act of recommendation**, staking a
little social capital. And it means the speaker **modelled the product against a real
workflow** and concluded it fits. That is the difference between admiring a thing and
having a use for it.

"When can I pay in here?" is stronger still: the user has already integrated the product
into how they'd operate and is now blocked by the one missing piece. That is exactly the
feeling PD-042 is designed to produce.

---

## Cohort strategy

**Do not recruit 20–30 disconnected people.** Twenty strangers across twenty categories
produce no matches and no trades — every user sees an empty marketplace and leaves.

Recruit an **interlocking local cohort whose needs overlap**, so that natural
client/service/trade relationships form without prompting.

Candidate categories — illustrative, **not a locked list** (OQ-030):

hairstylists · barbers · nail techs · photographers · personal trainers · chefs and
meal-prep providers · makeup artists · content creators · massage and wellness providers ·
event-related providers

The test for the cohort is not "are these good categories" but: **does each person plausibly
need at least two others in the room?** A stylist needs photos. A photographer needs a
haircut before a shoot. A trainer needs meal prep. A meal-prep chef needs content. Those
overlaps are what turn a directory into a marketplace.

Every member should be both a **plausible provider** and a **plausible client** — that is
also the fastest way to test that one account genuinely serves both sides (PD-010).

---

## The barter principle

> **A trade should create mutual value. It should never be a mechanism for pressuring
> providers into discounting their work or exploiting unequal bargaining power.**

Natural mutual value:

- hair ↔ nails
- barber ↔ photography / content
- trainer ↔ chef / meal prep

**Not acceptable barter:** *"Do my hair for free and I'll post you."* That is not a trade —
it is a discount extracted with social pressure, and exposure is not consideration. Any
barter design that makes this pattern easy has failed regardless of how well it works
technically.

Do **not** invent a complicated barter economy for the beta: no trade credits, wallets,
multiparty swaps, or valuation engines (PD-032). Barter already exists in the codebase and
is audited before redesign (PD-033, Session 4).

---

## Beta operations

Deliberately manual. **Do not automate prematurely** — the point is to watch real journeys
closely enough to learn from them.

- **Concierge onboarding** — walk each provider through profile and first listing personally
- **Curated recruitment** — hand-picked for cohort overlap, not open signup
- **Feedback interviews** — real conversations, not in-app surveys
- **Manual issue triage and support** — founder-operated
- **Watch real journeys** end to end
- **Log friction** as it happens, not from memory
- **Weekly or milestone-based synthesis** — patterns, not anecdotes

At this size, manual operations are an advantage: they surface the "I didn't do that
because…" reasons that instrumentation never captures.

---

## Payments positioning

Payments are **intentionally not live** (PD-042).

The beta should leave users feeling: *"This is already useful. All it's missing is paying
through it."* The absence should read as a deliberate stage, not a broken feature — the
product should never present an in-app payment affordance that does not work.

Payments require their own readiness programme, not a session: processor selection, fee
structure and who pays it, deposits vs final charges, payouts, refunds, cancellation,
disputes, chargebacks, webhook handling, idempotency, ledger integrity, payout failure
handling, fraud, support, audit trails, non-prod destructive testing, and a controlled
pilot. Open: OQ-040 … OQ-046.

Building that before the loop is proven risks doing the hardest, highest-liability work in
the product for a loop that does not hold.

---

## What would make this beta a failure

Worth naming so it is recognisable early:

- Signups but no matches — cohort too scattered (fix: composition, not marketing)
- Browsing but no bookings — trust or intent is missing
- Bookings but no completions — the loop breaks after commitment
- Providers who never return — no business value beyond a listing
- Barter used to extract discounts — the model is being gamed (PD-031)
- Enthusiasm without specificity — "cool app" at scale

Any of these is more valuable discovered in a 20-person Houston beta than after payments,
safety operations and a public launch have been built on the assumption they were fine.
