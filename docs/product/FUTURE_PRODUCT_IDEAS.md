# Future Product Ideas — exploration only

**Status:** **Exploratory — NOT authoritative.** Owner: Founder (Stephen).
**Category:** Product / exploration.
**Last substantive update:** 2026-09-08 — payment pressure-test reconciliation.

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
[§ 2.19](#219-what-this-exploration-must-not-contradict).

**This file is not legal advice, not a payment-provider architecture approval, and not
policy.** The payment material below has been *pressure-tested*, which is a stronger claim
than *brainstormed* and a much weaker one than *decided*.

## Status labels used in this file

Every concept carries all four. They are separate questions and a concept can be far
along on one and nowhere on another.

| Label | Meaning |
|---|---|
| **EXPLORED CONCEPT** | Thought through, written down, reasoning captured |
| **PRESSURE-TESTED** | Additionally stress-tested against abuse, UX friction, and operating reality — findings recorded, including the ones that killed the earlier version |
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

Framing, not specification.

> ### "If you honor the booking, The Book protects you."

The protection is **earned by conduct**, and by conduct on **both** sides. It is not a
client-protection product with a provider attached, and it is not a provider-payout product
with a client attached. A provider who shows up, communicates, and does the work should not
lose money because the client changed their mind. A client who books in good faith should
not lose money because the provider vanished. **The same sentence has to be true read from
either seat**, or it is marketing rather than a principle.

> ### "The Book handles the complexity so the user only has to tell us what happened."

The internal rules can be as intricate as they need to be. The **user-facing surface must
not be.** A provider should not have to understand hold windows or ledger mechanics to get
paid. A client should not have to argue a case to get a refund they are plainly owed.

**This one nearly got lost, and recovering it is the main finding of the pressure test** —
see [§ 2.1](#21-the-pressure-test-conclusion-internal-complexity-is-not-visible-ux). The
short version: **good policy with bad UX is still bad product.**

> ### "Money follows delivered value, and the person who breaks the agreement pays for the break."

*Exploratory design principle. Not legal or payment-contract language, and deliberately not
written in a form anyone could quote at a customer.*

It is useful because it decides cases in a consistent direction rather than case by case:
money moves toward work that actually happened, and the cost of a broken agreement lands on
whoever broke it. Most of the hard cases in this document are hard precisely because one or
both halves are ambiguous — nobody can agree what was delivered, or nobody can establish who
broke it. **When the principle cannot be applied, that is the signal a human has to look**,
not a signal to invent a rule.

> ### Rules-first, evidence-first, professional-first — not provider-first, not client-first

The marketplace should decide from **what was agreed** and **what can be shown**, not from
who complained more persuasively or who is more valuable to retain.

This is the load-bearing one, and the one most likely to be quietly abandoned under
pressure. Every marketplace drifts toward whichever side is scarcer — for a services
marketplace that is usually the provider early and the client later. A stated rule the
platform does not follow is worse than no stated rule, because it teaches both sides that
the written policy is decorative.

**Related but already decided, and not reopened here:** the barter slice already implements
a rules-first, evidence-first resolution at the obligation level (**PD-064 … PD-067** — an
operator resolves; participants cannot resolve their own trade; the record is immutable;
participant statements are preserved even when the outcome contradicts them). A useful
precedent to reason from, and **not** a payments decision.

---

# 2. Transaction protection — the exploration

**EXPLORED CONCEPT · PRESSURE-TESTED · NOT YET IMPLEMENTED · NOT YET PROMISED EXTERNALLY ·
REQUIRES PRODUCT + LEGAL + PAYMENT/COMPLIANCE REVIEW.**

Payments are **intentionally not live** (**PD-042**). None of the mechanics below is decided;
**OQ-040 … OQ-046** hold the undecided questions and this file does not answer them.

## 2.0 Terminology caution — read before writing any of these words down

Several words here are **legally and operationally loaded**. Using them casually in a doc, a
screen, or a marketing asset creates an expectation, and in some cases a regulatory
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
words themselves.** The working names are **Protected Booking** and **Protected Payment** —
descriptions of intent, not legal claims.

**What is actually being sold, if any of this ships.** Not escrow. **Confidence that the
agreement will be handled professionally.** That framing survives legal review in a way
"your money is protected" may not, and it is also the more honest description of what a
rules-first marketplace can offer.

## 2.1 The pressure-test conclusion: internal complexity is not visible UX

**This is the most important finding in the document.**

The earlier direction had three buckets — **protected service payment**, **approved
pre-service expenses**, **earned funds**. Independent pressure testing found the direction
**correct** and the *exposure* **wrong**: putting that architecture in front of every user
creates so much friction that a good policy becomes a bad product.

**The distinction to hold onto:**

| | |
|---|---|
| **Internal payment complexity** | May be as sophisticated as it needs to be. Buckets, states, holds, reserves, risk tiers |
| **Visible user experience** | Must be simple, and simple *by category* |

**Nobody booking a haircut should feel like they are using project-finance software.** A
$60 appointment and a $12,000 remodel are the same product only in the sense that both are
bookings; treating them identically at the UI is how a marketplace loses the $60 side, which
is the volume side.

The three buckets did not die. They became the **internal** model beneath the lanes below.

## 2.2 The three payment lanes — the strongest current researched direction

**EXPLORED · PRESSURE-TESTED · NOT DECIDED.** The lane *concept* is the strongest current
direction. The examples, thresholds, and category boundaries are **not settled** — where a
given trade lands, and whether a lane is chosen by category, by value, by the provider, or by
some combination, is open.

### Lane A — simple / everyday service

*Barber · hairstylist · nails · lashes · makeup · massage if supported later · simple
cleaning · small handyman jobs · mobile beauty · other straightforward appointments.*

**What it competes with, and this is the whole design constraint:** Booksy, Square
Appointments, StyleSeat, Vagaro, Fresha, direct booking — and, most of all, **Instagram DM +
Cash App / Zelle / Venmo**, which is free and takes about four seconds. See
[§ 2.17](#217-competitive-pressure--the-real-competitor-is-what-they-already-do-for-free).

**The visible experience should feel roughly like:**

> book → pay the deposit or prepayment → appointment happens → provider gets paid quickly

**Explore:** provider-defined deposit within marketplace guardrails · clearly disclosed
cancellation and no-show terms · saved payment method for balance collection · a **very
lightweight** arrival/completion attestation · fast, predictable payout · a dispute route for
when something genuinely goes wrong.

**Explicitly DO NOT require for ordinary small services:** milestone setup · a materials
workflow · receipt upload · evidence forms · any payment terminology the user has to learn.

**The provider cash-flow finding, which is a retention risk and not a detail.** Holding a
completed small-service payment for days may drive good providers away, and it hits hardest
exactly the providers this marketplace needs — barbers, stylists, beauty providers, mobile
professionals, anyone running on daily cash flow. A barber who waits days for $60 will go
back to Cash App, and will be right to. **Explore fast payout after the service and its risk
window; the length of that window is not decided.**

### Lane B — project booking

*Contractors · handymen · landscaping installs · larger cleaning projects · home projects ·
work requiring materials · multi-stage work.*

**Research conclusion: milestones are probably a better primary concept than exposing a large
materials bucket.** A milestone is a thing both people can point at. A materials bucket is an
accounting construct, and it invites the abuse in
[§ 2.4](#24-materials-pre-service-expenses-and-earned-funds).

**Explore:** an agreed scope · an initial milestone · a materials/site milestone · a midpoint
· completion · client approval at checkpoints where appropriate · photos and other evidence
generated in the normal course of the job · a defined way to handle partial performance.

Materials may still exist as a **specific advance** where that is genuinely the right shape —
they are not replaced by milestones, they are contained by them.

**NOT decided, and specifically not by any number appearing anywhere:** the split, the
threshold at which a booking becomes Lane B, percentage caps, or how many milestones a job
has. See [§ 2.18](#218-the-numbers-that-are-not-decisions).

### Lane C — event / high-value / complex

*Catering · weddings · large photography and videography packages · DJs · event planners ·
large contractors · complex high-dollar projects.*

**Explore:** provider-defined payment schedules · a booking commitment · preparation
milestones · a larger earned portion before the service date (real, in this category — see
[§ 2.5](#25-pre-service-labour-is-not-materials)) · balance timing relative to the event date
· provider contracts attached where appropriate · **manual review during beta** ·
category-specific cancellation rules.

**A deliberate limit.** The Book does **not** need to become the entire legal contract for a
$10,000+ event during early beta. Trying to is how the beta stalls: this category has the
most legal surface, the fewest transactions, and the highest per-incident cost of getting it
wrong.

## 2.3 Protected service payment

Money for a booking is committed at booking time and released to the provider when the
service has been honoured — rather than moving at an arbitrary moment and being clawed back
through argument.

The obvious shape is: client commits → service happens → funds release. The interesting part
is every case where that line does not run straight, which is the rest of this section.

**Open beneath it:** capture versus authorization (**OQ-042**); what "honoured" means and who
decides; how long a hold can last before it is hostile to provider cash flow; what happens on
partial delivery.

## 2.4 Materials, pre-service expenses, and earned funds

Two failure modes, pulling in opposite directions, and a model has to survive both.

> **"We're not going to make contractors finance somebody else's project."**

A provider who has to buy $900 of tile before day one cannot be told the money releases after
completion. If the protection model forces providers to bankroll clients, good providers
leave and the marketplace keeps whoever can absorb the risk.

> **And: a client must not lose protection because the provider labelled most of the price
> "materials."**

This is the **major abuse vector** in the whole model. If materials are a route to early
access to protected funds, then "materials" becomes the shape every dishonest quote takes.

**Guardrails to explore — none of them decided:** itemization · client approval before the
spend · risk- and category-aware thresholds · receipt evidence when a job is disputed ·
additional review when the material proportion is unusual for the category ·
provider-history-based limits · **direct client purchase from the supplier** for very large
material costs, which sidesteps the problem entirely rather than policing it.

### Returnable versus custom / non-returnable

| Kind | Example | Direction |
|---|---|---|
| **Standard / reusable / returnable** | Standard paint, generic cleaning supplies, common tools, unopened stock | Generally **business inventory**. It should not become a client-funded sunk cost merely because one booking cancelled — the provider still owns a usable asset |
| **Client-specific / custom / non-returnable** | Made-to-measure cabinetry, monogrammed event goods, client-dimensioned materials, custom prints and signage, perishables already bought | Cannot be undone or resold. Someone bears it, and *whoever broke the agreement* is the only defensible default |

**Exact policy not locked.** The distinction is the useful part; the treatment of each side of
it is a future decision.

### Client-funded material ownership — **REQUIRES LEGAL + PAYMENT + PRODUCT REVIEW**

**Recorded as an important future question, and deliberately not answered.**

Outside research points in a clear direction: **if a client's money directly purchased
client-specific materials, there may be a strong argument that those materials should
ultimately belong to the client if the provider cannot perform.**

Worked example. A provider buys custom lumber for Client A, then cancels.

Possible fair outcomes, none selected:

- the provider **transfers the materials** to Client A;
- the provider **returns them and refunds** the client;
- the loss is genuinely unresolvable and goes to **manual review**.

**This is not a legal conclusion.** Title transfer, mechanics' liens in some trades, and
disposal of hazardous or perishable goods all bear on it, and none has been assessed.

## 2.5 Pre-service labour is not materials

An important distinction that a naive model loses.

*Photography planning · location scouting · catering preparation · event coordination ·
design work · contractor prep · staff reservation.*

These represent **legitimate earned value before service day**. They are labour, not goods.

**Do not hide provider labour inside a "materials" field** — it corrupts the materials
guardrails in [§ 2.4](#24-materials-pre-service-expenses-and-earned-funds), makes the receipt
and itemization checks meaningless, and misdescribes what the client is paying for.

**Explore instead:** a milestone · a disclosed preparation fee · a booking retainer ·
disclosed cancellation compensation. All of which have the advantage of being nameable to the
client, which "materials" would not be.

## 2.6 Partial performance

**Identified by outside research as a major gap in the earlier model, and it is.**

A provider completes 60% of a $4,000 landscaping job. Then work stops. A single
deposit-plus-final-payment model handles this badly: there is no defined position between
"nothing happened" and "everything happened", so it collapses into an argument.

**Milestones make partial performance tractable**, because a checkpoint that was reached is a
fact rather than a percentage estimate. That is the strongest argument for Lane B being
milestone-shaped.

**Direction:** project work should define **deliverable checkpoints** where practical.

**Do NOT automate percentage-of-work disputes in beta.** "What fraction of this job was
done?" is exactly the judgment a person should make while the marketplace is small enough for
a person to make it. See [§ 2.14](#214-the-operational-cost-and-what-stays-manual-in-beta).

## 2.7 Rescheduling and cancellation

Most protection models collapse these into "cancellation" and then cannot tell the situations
apart when it matters.

### A reschedule is a mutual amendment

**One party proposes; the other accepts. Neither side can force a new date.** This is the
existing exploratory position and it is preserved.

**Repeated reschedules are an abuse pattern on either side**, and the model has to see both:

- **Provider abuse:** holding a deposit while repeatedly moving the appointment — functionally
  keeping the client's money and the client's optionality at the same time.
- **Client abuse:** repeatedly occupying valuable calendar inventory, which for a Lane A
  provider is the actual product being consumed.

**Explore:** tracking **who initiated** each reschedule · a reasonable free-reschedule
allowance · an eventual refund-or-exit route once it is clear the booking will not happen ·
reliability effects. **The number of allowed reschedules is not locked** and does not appear
in this file as a figure.

### The four cases

| Case | Who moved | The instinct | The complication |
|---|---|---|---|
| **Mutual reschedule** | Both agreed | Nothing owed; the booking moves and the money follows it | Repeated "mutual" reschedules can be one side wearing the other down |
| **Provider-caused cancellation** | Provider | Unearned service money returns to the client | A genuine emergency and a better-paying job look identical from outside |
| **Client late cancel / no-show** | Client | Provider compensated for reserved time | Their real loss depends on notice, refill chance, and what they had already spent |
| **Neither cancelled; it just did not happen** | Unclear | — | The hardest and most common. Evidence matters most and exists least |

### Provider-cancelled bookings

If the provider breaks the agreement, **unearned service money should generally return to the
client**, and **the provider must not be able to unilaterally convert their own cancellation
into a forced client reschedule.** The client chooses: reschedule, or exit with a refund.

Exact refund treatment, and what happens to materials already bought, remain future
decisions — see [§ 2.4](#24-materials-pre-service-expenses-and-earned-funds).

### Client late cancellation and no-show — the symmetric half

**Providers need protection too, and this is where a client-first drift would show first.** A
provider who reserved the time and followed the agreement should not automatically lose all
compensation because the client no-showed, cancelled at the last minute, or rescheduled until
the slot was worthless.

**Explore disclosed cancellation and no-show protection.** Disclosure is what makes it fair:
the client agreed to the terms at booking, so enforcing them is not a penalty invented after
the fact. **No percentages are locked.**

### No-fault events — **and Houston makes this concrete**

Severe weather, flooding, hurricanes, dangerous driving conditions, emergencies, an unsafe
location, infrastructure failure.

A future payment and reschedule system probably needs a **no-fault / force-majeure-like
path** that does not automatically punish either side. Neither of them broke the agreement,
so the principle in [§ 1](#1-the-north-star-concepts) — *the person who breaks the agreement
pays for the break* — has no one to point at, which is exactly the signal that a different
mechanism is needed.

**No rules invented here.** Recorded because a Houston beta will meet this within its first
hurricane season, and discovering it then is worse than recording it now.

## 2.8 Evidence and attestation — generated, not demanded

**Strong outside-research consensus: The Book should produce useful evidence as a natural
by-product of a normal booking**, rather than asking people to compile a case.

A possible lightweight ladder:

> provider: **"I'm here."** → client: **"Service started."** → provider: **"Service
> complete."** → client: **"Confirm completed."**

**Supporting evidence that already exists or could:** timestamps · message history · photos ·
deliverable access · receipts · the approved scope · reschedule history.

**Evidence intensity must scale with service category, transaction value, risk, and whether
there is a dispute at all.** A $60 haircut and a $12,000 remodel should not carry the same
attestation burden.

- **Do NOT lock GPS as mandatory.** It is a privacy cost, it is spoofable, and it is a poor
  fit for mobile providers.
- **Do NOT require heavy check-in for every small service.** That is the friction that loses
  Lane A.
- **Do NOT make ordinary users prepare a legal case.** If evidence only exists because
  someone filled in a form, it will not exist when it is needed.

## 2.9 Subjective quality disputes — **HIGH / MEDIUM, unresolved**

*"I didn't like my haircut." · "I don't like the photos." · "The cleaning wasn't good
enough." · "The landscaping died two months later."*

Three different things get called the same thing, and the model must distinguish them:

| | Adjudicable? |
|---|---|
| **Service not provided** | Yes — this is a fact question |
| **Objective breach of the agreement** | Usually — measurable against agreed scope |
| **Subjective dissatisfaction** | **No** — this is a preference, not a breach |

**The Book must not become an automatic refund engine for subjective preference
disagreements.** A marketplace that refunds taste teaches clients that dissatisfaction is
free and teaches providers that doing the work is not enough — which destroys exactly the
professional-first position in [§ 1](#1-the-north-star-concepts).

Reviews are the existing outlet for dissatisfaction that is not a breach, and they already
work ([REVIEWS_MODEL.md](REVIEWS_MODEL.md)). **Needs future product, legal and payment
policy. Not designed.**

## 2.10 Milestone payments

Agreed checkpoints, each releasing a portion. **Primary structure for Lane B**, and probably
useful in Lane C.

**Attractive because** it distributes risk over time instead of concentrating it at one
moment, gives both sides an early signal that something is going wrong, and makes
[partial performance](#26-partial-performance) resolvable.

**Hard because** defining a milestone precisely enough to adjudicate is real work, and
pushing that work onto the provider at booking time is exactly the complexity
[§ 2.1](#21-the-pressure-test-conclusion-internal-complexity-is-not-visible-ux) says to
absorb. A milestone nobody can objectively call is a dispute with a schedule.

## 2.11 Payout timing, trust, and provider retention

**Faster payout may be one of the strongest provider-retention tools available**, and it
costs nothing to a provider who has done nothing wrong.

**Explore:** a predictable payout date · a new-provider risk window · faster payout for
established providers · same-day or instant eligibility for trusted providers · an optional
**provider-paid instant payout fee** if the processor supports it.

**Possible future value proposition: "Build trust. Get paid faster."**
**STATUS: EXPLORATORY / DO NOT PROMISE.**

**The tension, named rather than buried in a formula.** Slower payouts reduce fraud loss and
preserve the ability to reverse a bad outcome. They also punish exactly the providers the
marketplace most needs to attract — new ones, small ones, daily-cash-flow ones.
**"Risk-based" is a polite way of saying new providers get worse terms**, and that is a real
strategic cost that should be visible in the decision rather than hidden in a score.

**Not locked:** provider tiers · booking counts · rating thresholds · dispute thresholds ·
payout delays. None of these has an approved value — see
[§ 2.18](#218-the-numbers-that-are-not-decisions).

**Open, and worth deciding deliberately:** whether payout speed is visible to the provider
(probably yes, or it feels arbitrary) and whether it is visible to **clients** (probably
not — it would function as a trust badge nobody defined). Discovery ranking is separately
**UNDECIDED** in [BETA_SCOPE.md](BETA_SCOPE.md); **a payout-risk score must not leak into
discovery** without its own decision.

## 2.12 Chargebacks — **HIGH RISK**

**The single largest financial exposure in the model, and it sits outside the model.**

An external card chargeback can **bypass The Book's internal dispute outcome entirely**:

> client books → service is delivered → provider is paid → weeks later the client contacts
> their bank → the processor reverses the funds

The Book can have adjudicated correctly, paid correctly, and still be out the money. At scale
this is a marketplace-solvency question, not a support question.

**Explore:** evidence automatically generated from normal product usage
([§ 2.8](#28-evidence-and-attestation--generated-not-demanded)) · structured dispute-evidence
packets for the payment provider · payout reserves · provider risk controls · a clawback
policy · a marketplace loss reserve · category- and value-dependent risk treatment.

**The UX insight that makes this survivable:** the evidence has to already exist when the
chargeback arrives 40 days later. **It cannot be requested from the user at dispute time** —
by then the appointment is a memory and nobody kept anything. This is the strongest argument
for the attestation ladder being a normal part of every booking rather than a dispute
feature.

## 2.13 Off-platform leakage — **HIGH RISK**

> Client pays the deposit through The Book. Provider says: **"Zelle me the rest."**

**Everyone loses, including the provider who suggested it:**

- The Book loses the transaction and its revenue;
- the **client loses protection** on the majority of the money;
- the **provider loses marketplace protection** too — no record, no evidence, no recourse;
- dispute evidence is fatally weakened for both;
- the marketplace economics stop working.

**Explore:** on-platform balance collection that is genuinely easier than asking · saved-card
capture · the clear rule that **protection applies only to money processed through The Book**
· warnings when off-platform payment is solicited · positive incentives to stay on-platform.

**Not purely punitive.** The existing documented position is *discourage; enforcement
UNDECIDED* ([BETA_SCOPE.md](BETA_SCOPE.md) § Off-platform payments) — **do not invent message
scanning, keyword blocking, or bans here.** The durable answer is making on-platform the
easier path, which is the same answer as
[§ 2.17](#217-competitive-pressure--the-real-competitor-is-what-they-already-do-for-free).

## 2.14 The operational cost, and what stays manual in beta

Every rule above implies a human somewhere. Evidence review, dispute decisions, expense
verification, appeals, refund exceptions, and "we could not determine this" all land on a
person. At small scale that is the Founder; at any real scale it is staff.

**This is the single most likely reason a well-designed protection model fails.** Not wrong
rules — judgment-call volume exceeding capacity, with the fallback becoming "refund whoever
complains loudest", which is the drift [§ 1](#1-the-north-star-concepts) exists to prevent.

**Strong research consensus: do not automate complex financial judgment too early.**
Deliberately manual during beta:

- financial disputes
- custom-material disputes
- high-value project disputes
- partial-performance disputes
- unusual project structures
- trusted-provider tier decisions, initially
- chargeback evidence handling
- subjective quality disputes

**The reason is not caution for its own sake.** The Book needs **real Houston operating data**
before automating judgment — what actually goes wrong, how often, and in which categories.
Automating a rule before you have seen the cases encodes a guess.

Worth measuring early: what fraction of bookings need a human decision, and what the target
is.

## 2.15 Abuse scenarios — both directions

A model stress-tested against only one side's bad actors will be gamed by the other's.
Written as pairs deliberately.

| Client-side abuse | Provider-side abuse |
|---|---|
| Book, receive the service, claim it never happened | Take the booking, never show, claim the client cancelled |
| Approve materials, cancel, keep the materials | **Call an excessive share of the job "materials" to reach protected funds early** |
| Serial late-cancel, absorbing reserved time | Serial reschedule until the client gives up, so the cancellation reads as client-caused |
| Dispute after a completed job to recover the fee | Demand off-platform payment after booking on-platform |
| Use protection as a free option to hold a slot | Use milestone structure to collect early and abandon late |
| **Chargeback after a legitimately delivered service** | **Inflate pre-service "expenses" that are really labour** |

**Two structural notes.** The *same* mechanic usually enables both columns — advances prevent
contractor-financing and enable a materials scam, and the benefit cannot be kept without the
exposure. And **abuse is usually a pattern, not an event**: single-transaction rules cannot
see it, and cross-transaction detection is its own build with its own false-positive cost.

## 2.16 Recurring services

*Weekly cleaning · lawn service · recurring barber appointments · maintenance contracts.*

These probably **do not fit a repeated manual confirmation flow.** Asking for an attestation
ladder every week for the same standing appointment is friction with no protective value —
and it will simply be tapped through, which makes the evidence worthless as well as annoying.

**Explore a separate recurring booking and payment UX later.** Not designed.

## 2.17 Competitive pressure — the real competitor is what they already do for free

Named because it constrains every design above.

**Booking / provider tools:** Booksy · StyleSeat · Square Appointments · Vagaro · Fresha
**Lead marketplaces:** Thumbtack · Angi
**Client-management / contracts:** HoneyBook · Dubsado
**And the actual incumbent:** direct Instagram/DM booking · Cash App · Zelle · Venmo

**The biggest competitor is usually "what providers already do for free."** That workflow has
no fees, no onboarding, no attestation, and no waiting for a payout. It also has no
protection — but a provider who has never been burned does not price that in.

**The implication for everything above:** protection has to be valuable **without making the
workflow obviously harder**. Any step added to Lane A has to earn its place against a
four-second alternative. This is the same conclusion as
[§ 2.1](#21-the-pressure-test-conclusion-internal-complexity-is-not-visible-ux), arrived at
from the market side instead of the design side.

## 2.18 The numbers that are NOT decisions

> **Every figure below is a MODEL-GENERATED HYPOTHESIS produced during pressure testing.
> None is approved, recommended, or agreed. They are recorded ONLY as examples of the
> questions that will need answers — never as the answers.**

| Figure that appeared | The actual open question |
|---|---|
| 20% / 25% deposits | What deposit range is fair per lane and per category, and who sets it? |
| 30% milestones, 30/40/30 splits | How is a project split, and by whom? |
| 24-hour / 48-hour dispute windows | How long should a client have to raise a problem? |
| 3-day payout | How fast can payout be without unacceptable risk? |
| 10 completed bookings | What, if anything, earns faster payout? |
| $500 material limits | Is there a materials threshold, and is it per-category? |
| 2 provider reschedules | How many reschedules before something changes? |
| Rating thresholds, provider tiers | Should tiers exist at all, and on what signal? |

**Anyone citing one of these numbers as a requirement is misreading this file.** If a number
becomes real, it becomes real through a Founder ruling recorded in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md), not by having appeared in a pressure test.

## 2.19 What this exploration must NOT contradict

Locked or already-positioned, and **not reopened by anything in this file**:

- **PD-042** — the loop is proven before payments go live. **Unchanged by this update.**
- **OQ-040 … OQ-046** — processor, fee structure and payer, deposits vs final charges,
  payouts and refunds, cancellation/disputes/chargebacks, the support model, and
  controlled-pilot readiness are all **open**. This file does not answer any of them, and
  nothing here should be read as a preferred answer.
- **BETA_SCOPE.md** — payments and deposits are **PLACEHOLDER / FUTURE**; the revenue model is
  **UNDECIDED — business-model research**, keeping percentage, payer, naming, and
  *transactional vs subscription vs hybrid* all open.
- **BETA_SCOPE.md § Safety incident escalation** — **UNDECIDED**. Severe safety incidents are a
  separate, higher-severity path and must **never** be routed through a payment-dispute flow.
- **BETA_SCOPE.md § Accountability** — "three bad reviews = automatic suspension" is explicitly
  **not approved**. Nothing here may introduce automatic punitive escalation.
- **BETA_SCOPE.md § Off-platform payments** — discourage; **enforcement UNDECIDED**. No message
  scanning, keyword blocking, or bans invented here.
- **Reviews** — reviews come only from completed Book transactions, two-sided and blind
  ([REVIEWS_MODEL.md](REVIEWS_MODEL.md)). A dispute outcome is **not** a review and must not
  become a back door into reputation.
- **Barter** — not a discount mechanism (**PD-031**), and **no** effect on public reputation
  or ranking in the first beta. A payments protection model must not quietly attach money to
  a barter obligation.

---

# 3. Payment rollout strategy — staged, and exploratory

**EXPLORED CONCEPT · NOT YET IMPLEMENTED · NOT CURRENT SCOPE.**

A strong staged concept worth preserving: **do not launch the most complicated payment model
across every provider category on day one.**

| Phase | Shape |
|---|---|
| **1** | Simple **Lane A** services only |
| **2** | Concierge / **manual-first** project bookings — a human runs Lane B before tooling does |
| **3** | Repeatable project and milestone tooling |
| **4** | Complex and high-value categories (**Lane C**) |

**An alternative worth keeping on the table:** early beta might test **deposit and
accountability flows** before processing the full service balance — proving that the
behavioural half works before taking on the financial half.

**This is exploratory and is NOT current scope.** It does not modify **PD-042**, and it does
not commit the beta to a payments phase at all.

---

# 4. Professionalism and accountability — both directions

**EXPLORED CONCEPT · NOT YET IMPLEMENTED · NOT YET PROMISED EXTERNALLY · REQUIRES PRODUCT
REVIEW.**

> **"Professionalism goes both ways."**
>
> **"The Book isn't trying to pick sides. We're trying to make both sides act
> professionally."**

The product's job is to make the professional choice the *easy* one, not to punish the
unprofessional one. Most no-shows and late cancels are not malice; they are friction,
forgetfulness, and the absence of a graceful way out. **A one-tap "I need to move this" that
both sides can act on prevents more bad outcomes than any penalty schedule.**

**Not designed. Explicitly not a strike system** — see the accountability position in
[BETA_SCOPE.md](BETA_SCOPE.md), which forbids automatic suspension thresholds.

---

# 5. Where the rest of the ideas live

This file is the payments/protection exploration. Other future-facing material has homes and
is **not** duplicated here:

- **Undecided product questions** → [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) (OQ-NNN)
- **Sequencing of approved work** → [ROADMAP.md](ROADMAP.md)
- **What each surface is today** → [BETA_SCOPE.md](BETA_SCOPE.md)
- **Beta thesis and success criteria** → [HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md)
- **How any of this may be talked about publicly** →
  [../marketing/MARKETING_MESSAGE_BANK.md](../marketing/MARKETING_MESSAGE_BANK.md)

---

# 6. The workflow rule

When future product work turns up something worth saying out loud:

1. **The product implication** goes in the right product document — a **Product Decision** if
   it has been formally ruled, [ROADMAP.md](ROADMAP.md) or the current-state docs where
   applicable, and **this file** while it is still exploratory.
2. **The marketing implication** goes in
   [MARKETING_MESSAGE_BANK.md](../marketing/MARKETING_MESSAGE_BANK.md), carrying a status
   flag, its audience, its format, and whether it is safe to publish.
3. **Marketing copy must never present an exploratory or unbuilt capability as live.**
4. **A Product Decision is never created from marketing copy.** A good line is evidence that
   an idea is *communicable*, not that it is *approved*. The PD ledger is fed by Founder
   rulings, never by a hook that landed well.

Adding an idea here costs nothing and commits nothing. That is the point — the file is cheap
to write to precisely so good thinking is not lost to the alternative, which is skipping the
exploration step and putting an unapproved idea somewhere it will be mistaken for a decision.
