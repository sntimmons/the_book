# Future Product Ideas — exploration only

**Status:** **Exploratory — NOT authoritative.** Owner: Founder (Stephen).
**Category:** Product / exploration.

> **READ THIS BEFORE ANYTHING ELSE IN THIS FILE.**
>
> Nothing here is a Product Decision. Nothing here is built. Nothing here has been
> promised to a user, a provider, an investor, or a marketing audience.
>
> This file exists so that thinking done in a session is not lost between sessions. It is
> the opposite of [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md): that file holds only what is
> **locked**, and this one holds only what is **not**.

## How this file relates to the authoritative ones

| File | Holds | Authority |
|---|---|---|
| [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) | Locked decisions (PD-NNN) | **Authoritative** |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | Deliberately undecided questions (OQ-NNN) | **Authoritative** |
| [BETA_SCOPE.md](BETA_SCOPE.md) | What each surface actually is today | **Authoritative** |
| [ROADMAP.md](ROADMAP.md) | Sequencing of approved work | **Authoritative** |
| **This file** | Concepts being explored, and the reasoning behind them | **None** |

**Nothing in this file may be cited as a requirement, an acceptance criterion, or a
justification for a code change.** If a concept here becomes real, the path is: Founder
ruling → a PD entry (or an OQ entry if it is being deliberately deferred) → implementation.
The idea does not graduate by being written down well.

**A concept here must never contradict a locked PD.** Where an idea touches locked
territory, this file says so explicitly and defers. Several already do — see
[§ 2.9](#29-what-this-exploration-must-not-contradict).

## Status labels used in this file

Every concept carries all four. They are separate questions and a concept can be far
along on one and nowhere on another.

| Label | Meaning |
|---|---|
| **EXPLORED CONCEPT** | Thought through, written down, reasoning captured |
| **NOT YET IMPLEMENTED** | No code, no schema, no migration exists |
| **NOT YET PROMISED EXTERNALLY** | Has not been said to any user, provider, or audience |
| **REQUIRES FUTURE REVIEW** | Which review gate it must pass — product, legal, and/or payment/compliance |

Where a concept has been shown to users in any form, that is stated explicitly, because it
changes what "not promised" means. Two have: the in-app **Protection Center** and **Find Me
Someone Today** preview screens (`app/preview/`) are labelled *coming soon* and collect an
interest signal. They describe intent; they are not a promise of a date or of specific
mechanics, and nothing in this file should be presented as more committed than they are.

---

# 1. The north-star concepts

Two sentences the Founder has used to describe where transaction protection should land.
They are framing, not specification.

> ### "If you honor the booking, The Book protects you."

The protection is **earned by conduct**, and by conduct on **both** sides. It is not a
client-protection product with a provider attached, and it is not a provider-payout product
with a client attached. A provider who shows up, communicates, and does the work should not
lose money because the client changed their mind. A client who books in good faith should
not lose money because the provider vanished. **The same sentence has to be true read from
either seat**, or it is marketing rather than a principle.

> ### "The Book handles the complexity so the user only has to tell us what happened."

The internal rules can be as intricate as they need to be. The **user-facing surface must
not be.** A provider should not have to understand escrow states, hold windows, or ledger
mechanics to get paid. A client should not have to argue a case to get a refund they are
plainly owed. The interface people touch should be closer to *"what happened?"* → *"here is
what that means"* than to a claims form.

This has a hard implication that is easy to lose: **complexity hidden from the user still
has to be paid for by someone.** It is paid for in operational load, support headcount, and
edge-case handling. A rule that is simple to state and impossible to adjudicate is not
simple. See [§ 2.8](#28-the-operational-cost-nobody-sees-in-a-mockup).

> ### Rules-first and evidence-first — not provider-first, not client-first

The marketplace should decide from **what was agreed** and **what can be shown**, not from
who complained more persuasively or who is more valuable to retain.

This is the load-bearing one, and it is the one most likely to be quietly abandoned under
pressure. Every marketplace drifts toward whichever side is scarcer — for a services
marketplace that is usually the provider early and the client later. A stated rule that the
platform does not follow is worse than no stated rule, because it teaches both sides that
the written policy is decorative.

**Related but already decided, and not reopened here:** the barter slice already implements
a rules-first, evidence-first resolution at the obligation level (**PD-064 … PD-067** — an
operator resolves; participants cannot resolve their own trade; the record is immutable;
participant statements are preserved even when the outcome contradicts them). That is a
useful precedent to reason from and **not** a payments decision.

---

# 2. Transaction protection — the exploration

**EXPLORED CONCEPT · NOT YET IMPLEMENTED · NOT YET PROMISED EXTERNALLY · REQUIRES PRODUCT +
LEGAL + PAYMENT/COMPLIANCE REVIEW.**

Payments are **intentionally not live** (**PD-042**). None of the mechanics below is decided;
**OQ-040 … OQ-046** hold the undecided questions and this file does not answer them.

## 2.0 Terminology caution — read before writing any of these words down

Several words in this space are **legally and operationally loaded**. Using them casually in
a doc, a screen, or a marketing asset creates an expectation, and in some cases a regulatory
obligation.

| Word | Why it is dangerous | Safer framing while unreviewed |
|---|---|---|
| **Escrow** | A regulated term in many jurisdictions, with licensing implications. Saying it may assert a legal relationship that does not exist. | "held until", "released when", "protected booking" |
| **Insurance** / **covered** | Insurance is regulated; "covered" implies a policy. | "protection", "what we do if…" |
| **Guarantee** | A promise the platform must then honour in every case, including ones nobody modelled. | "protection", "what happens if" |
| **Trust account** | Implies a specific custodial arrangement and licensing. | avoid entirely |
| **Refund** | Reasonably safe, but it has a specific meaning to card networks and must line up with actual chargeback behaviour. | keep, but define precisely |

**RULE: no document, screen, or marketing asset may use "escrow", "insured", "covered", or
"guaranteed" for The Book's money handling until legal and payment review has ruled on the
words themselves.** The concept can be explored under a neutral working name — this file uses
**"protected booking"**, which is a description of intent and not a legal claim.

## 2.1 Protected service payment

**The core idea.** Money for a booking is committed at booking time and released to the
provider when the service has been honoured — rather than moving at an arbitrary moment and
being clawed back through argument.

The obvious shape: client commits funds → service happens → funds release. The interesting
part is every case where that line does not run straight, which is the rest of this section.

**Open beneath it:** when funds are captured versus authorized (**OQ-042**); what "honoured"
means and who decides; how long a hold can last before it is hostile to the provider's cash
flow; what happens on partial delivery.

## 2.2 Approved pre-service expenses, materials advances, and earned funds

This is the part most consumer-marketplace models get wrong for skilled trades, and the
Founder has been explicit about it:

> **"We're not going to make contractors finance somebody else's project."**

A hair appointment and a bathroom remodel are not the same transaction. A provider who has
to buy $900 of tile before day one cannot be told the money releases after completion. If
the platform's protection model forces providers to bankroll clients, good providers leave
and the marketplace is left with whoever can afford to absorb the risk.

**Concepts under exploration:**

- **Approved pre-service expenses** — costs agreed *in advance*, visibly, as part of the
  booking, rather than claimed afterwards. Approval before spend is what makes them
  adjudicable later.
- **Materials advances** — a portion released before service specifically for materials, at
  a point both sides agreed to.
- **Earned funds** — the idea that money can become the provider's *progressively*, as
  identifiable work is completed, rather than in one all-or-nothing moment.

**Returnable vs custom / non-returnable is the distinction that decides fairness.**

| Kind | Example | If the job dies mid-way |
|---|---|---|
| **Returnable** | Standard stock, unopened, restockable | Can plausibly be returned; the client should not pay for it, and the provider should not eat a restocking fee they did not cause |
| **Custom / non-returnable** | Cut-to-size, personalised, perishable, special-order, already installed | Cannot be undone. Someone must bear it, and "whoever caused the cancellation" is the only defensible answer |

**Client ownership / transfer of purchased materials.** If a client has paid for materials,
there is a real question about whether those materials are *theirs* — and if a job ends
early, whether they are entitled to take possession. This is genuinely unresolved and has
legal edges (title transfer, liens in some trades, disposal of hazardous or perishable
goods). **Not designed. Requires legal review.**

**Open beneath it:** what evidence an expense approval requires; whether receipts are
mandatory and who verifies them; caps; what stops an advance being a cash-out route.

## 2.3 Rescheduling and cancellation — the four cases

Most protection models collapse these into "cancellation" and then cannot tell the
situations apart when it matters.

| Case | Who moved | The instinct | The complication |
|---|---|---|---|
| **Mutual reschedule** | Both agreed | Nothing is owed; the booking simply moves | Repeated "mutual" reschedules can be one side wearing the other down. A reschedule that both sides tapped is not automatically a reschedule both sides wanted |
| **Provider-caused cancellation** | Provider | Client made whole; provider absorbs their own sunk costs | A provider with a genuine emergency is not the same as a provider who took a better job. The platform can rarely tell them apart from the outside |
| **Client late cancel / no-show** | Client | Provider compensated for the reserved time | The provider's real loss depends on notice, whether the slot could be refilled, and what they had already spent |
| **Nobody cancelled; it just did not happen** | Unclear | — | The hardest case and the most common in practice. This is where evidence matters most and exists least |

**Mutual rescheduling** deserves its own mechanic rather than being a cancellation with a
new date: the money should follow the booking rather than unwind and re-form, and neither
side should be penalised for an agreed change.

**Note the existing precedent, which is not a payments decision:** barter already implements
mutual pre-delivery cancellation as **two independent acts** rather than one act plus an
assent (**PD-046**, **PD-060**, **PD-061**), and deliberately never infers agreement from
silence or a timeout. That shape — *derive a joint state from two explicit acts* — is worth
carrying into payments thinking.

## 2.4 Evidence-based disputes

The barter adjudication slice establishes a pattern this could inherit:

- eligibility to be adjudicated is a **narrow, explicit state**, not "anyone can escalate";
- participants **cannot** decide their own case;
- the record is **immutable** and cannot be flipped;
- **history is preserved** — a participant's account of what happened survives an outcome
  that contradicts it;
- outcomes are **obligation-level**, not one verdict for the whole trade;
- there is an honest **"we could not determine this"** outcome, so nobody is forced to
  invent a finding to close a case.

That last one matters more in payments than in barter, because in payments *someone still
has the money*. "Closed without resolution" needs a defined financial consequence, and there
is no obviously fair default. **Undecided.**

**Evidence, realistically.** Timestamps, message history, and in-app actions are strong.
Photos are weaker than they look (undated, unlocated, arguable). "They were rude" is not
adjudicable at all. A dispute model should be honest about which claims it can actually
decide and should not invite claims it cannot.

## 2.5 Milestone payments

For longer jobs: agreed checkpoints, each releasing a portion.

**Attractive because** it distributes risk over time instead of concentrating it at one
moment, and it gives both sides an early signal that something is going wrong.

**Hard because** defining a milestone precisely enough to adjudicate is real work, and
pushing that work onto the provider at booking time is exactly the complexity the second
north star says to absorb. A milestone nobody can objectively call is a dispute with a
schedule.

## 2.6 Payout timing, trust, and risk

**Trusted-provider faster payout** and **new-provider / risk-based payout delays** are the
same lever from two ends: how long the platform holds funds before releasing them.

**The tension, stated plainly:** slower payouts reduce fraud loss and increase the
platform's ability to reverse a bad outcome. They also punish exactly the providers who most
need cash flow — new ones, small ones, and the ones the marketplace most needs to attract.
"Risk-based" is a polite way of saying *new providers get worse terms*, which is a real
strategic cost and should be named rather than hidden in a formula.

> **"Protecting clients shouldn't mean punishing good providers."**

**Open:** what earns faster payout; whether it is visible to the provider (it should
probably be, or it feels arbitrary); whether it is visible to *clients* (probably not — it
would function as a trust badge the platform never defined). Ranking and fairness are
adjacent and separately **UNDECIDED** in [BETA_SCOPE.md](BETA_SCOPE.md) § Discovery /
ranking; do not let a payout-risk score leak into discovery without a decision.

## 2.7 Abuse scenarios — both directions

A protection model that has only been stress-tested against one side's bad actors will be
gamed by the other's. Written as pairs deliberately.

| Client-side abuse | Provider-side abuse |
|---|---|
| Book, receive the service, claim it never happened | Take the booking, never show, claim the client cancelled |
| Approve materials, cancel, keep the materials | Inflate "approved expenses" for work not done |
| Serial late-cancel, absorbing providers' reserved time | Serial reschedule until the client gives up and cancels, so the cancellation reads as client-caused |
| Dispute after a completed job to recover the fee | Demand off-platform payment after booking on-platform |
| Use protection as a free option to hold a slot | Use milestone structure to collect early and abandon late |

**Two structural notes.** First, the *same* mechanic usually enables both columns — advances
enable a materials scam in one direction and prevent contractor-financing in the other, and
you cannot keep the benefit without the exposure. Second, **abuse is usually a pattern, not
an event**; single-transaction rules cannot see it, and cross-transaction pattern detection
is its own build with its own false-positive cost.

Off-platform leakage is related and already has a documented position: discourage, and
**enforcement is UNDECIDED** — see [BETA_SCOPE.md](BETA_SCOPE.md) § Off-platform payments.
Do not invent message scanning or punitive rules here.

## 2.8 The operational cost nobody sees in a mockup

Every rule above implies a human somewhere. Evidence review, dispute decisions, expense
verification, appeals, refund exceptions, and the "we could not determine this" cases all
land on a person. At small scale that is the Founder; at any real scale it is staff.

**This is the single most likely reason a well-designed protection model fails.** Not because
the rules were wrong, but because the volume of judgment calls exceeded the capacity to make
them, and the fallback became "refund whoever complains loudest" — which is the
provider-first/client-first drift the north star exists to prevent.

Worth measuring before designing: what fraction of bookings would plausibly need a human
decision, and what the target is.

## 2.9 What this exploration must NOT contradict

Locked or already-positioned, and **not reopened by anything in this file**:

- **PD-042** — the loop is proven before payments go live.
- **OQ-040 … OQ-046** — processor, fee structure and payer, deposits vs final charges,
  payouts and refunds, cancellation/disputes/chargebacks, the support model, and
  controlled-pilot readiness are all **open**. This file does not answer any of them, and a
  concept here must not be read as a preferred answer.
- **BETA_SCOPE.md** — payments and deposits are **PLACEHOLDER / FUTURE**; the revenue model
  is **UNDECIDED — business-model research**; the option space explicitly keeps percentage,
  payer, naming, and *transactional vs subscription vs hybrid* all open.
- **BETA_SCOPE.md § Safety incident escalation** — **UNDECIDED**. Severe safety incidents are
  a separate, higher-severity path and must never be routed through a payment-dispute flow.
- **BETA_SCOPE.md § Accountability** — "three bad reviews = automatic suspension" is
  explicitly **not approved**. Nothing here may introduce automatic punitive escalation.
- **Reviews** — reviews come only from completed Book transactions and are two-sided and
  blind ([REVIEWS_MODEL.md](REVIEWS_MODEL.md)). A dispute outcome is **not** a review, and
  must not be allowed to become a back door into reputation.
- **Barter** — barter is **not** a discount mechanism (**PD-031**) and has **no** effect on
  public reputation or ranking in the first beta. A payments protection model must not
  quietly attach money to a barter obligation.

---

# 3. Professionalism and accountability — both directions

**EXPLORED CONCEPT · NOT YET IMPLEMENTED · NOT YET PROMISED EXTERNALLY · REQUIRES PRODUCT
REVIEW.**

> **"Professionalism goes both ways."**
>
> **"The Book isn't trying to pick sides. We're trying to make both sides act
> professionally."**

The framing worth preserving: the product's job is to make the professional choice the
*easy* one, not to punish the unprofessional one. Most no-shows and late cancels are not
malice; they are friction, forgetfulness, and the absence of a graceful way out. A one-tap
"I need to move this" that both sides can act on prevents more bad outcomes than any penalty
schedule.

**Not designed. Explicitly not a strike system** — see the accountability position in
[BETA_SCOPE.md](BETA_SCOPE.md), which forbids automatic suspension thresholds.

---

# 4. Where the rest of the ideas live

This file is the payments/protection exploration. Other future-facing material already has
homes and is **not** duplicated here:

- **Undecided product questions** → [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) (OQ-NNN)
- **Sequencing of approved work** → [ROADMAP.md](ROADMAP.md)
- **What each surface is today** → [BETA_SCOPE.md](BETA_SCOPE.md)
- **Beta thesis and success criteria** → [HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md)
- **How any of this may be talked about publicly** →
  [../marketing/MARKETING_MESSAGE_BANK.md](../marketing/MARKETING_MESSAGE_BANK.md)

---

# 5. The workflow rule

When future product work turns up something worth saying out loud:

1. **The product implication** goes in the right product document — this file if it is still
   exploratory, [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) if it is a decision being deliberately
   deferred, [ROADMAP.md](ROADMAP.md) if it is approved work being sequenced.
2. **The marketing implication** goes in
   [MARKETING_MESSAGE_BANK.md](../marketing/MARKETING_MESSAGE_BANK.md), carrying a status
   flag.
3. **Marketing copy must never present an exploratory or unbuilt capability as live.**
4. **A Product Decision is never created from marketing copy.** A good line is evidence that
   an idea is *communicable*, not that it is *approved*. The PD ledger is fed by Founder
   rulings, never by a hook that landed well.

Adding an idea here costs nothing and commits nothing. That is the point — the file is
cheap to write to precisely so that good thinking is not lost to the alternative, which is
skipping the exploration step and putting an unapproved idea somewhere it will be mistaken
for a decision.
