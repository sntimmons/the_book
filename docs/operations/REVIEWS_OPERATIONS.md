# Reviews — Operations and support note

**Status:** Authoritative. Describes `main`.
**Anchor:** `main` @ `a253c3f` (2026-09-11) — squash-merge of PR #81, Reviews Phase 2.

Written for whoever answers a user asking *"where is my review?"* or *"why did
my rating not move?"*. Limits sit beside behaviour, because a support note that
lists only what works is how people get promised things.

---

## 1. When reviews reveal

**The blind window is 7 days from completion**, measured from the
server-stamped `completed_at` — not from the appointment, not from a device
clock, and not from anything either party can set.

A review reveals when **either** of these is true:

- the other side has also submitted a review, **or**
- the 7-day window has closed.

**Whichever comes first.** Reviewing is what buys you the right to see — that is
what makes the window fair rather than merely slow.

**Held separately:** a booking under dispute (`under_review`) holds reveal for a
review **that had not revealed yet** — and only that one. A review that was
already public when the dispute was filed **stays public and keeps counting**.
See § 6b, which is the rule support will actually be asked about. `under_review`
is a `service_role` state; no participant can set it.

---

## 2. If only one side reviews

**The submitted review is fully valid and reveals when the window closes.**
Silence from the other side never invalidates, delays beyond the window, or
suppresses it. The non-reviewing side simply contributes no review.

**Mutual submission is not required and never has been.** If a user believes
their review is being "held hostage" until the other party reviews, that is
wrong — it will appear when the window ends regardless.

---

## 3. Can repeat customers review again?

**Yes.** Every completed booking creates its own review opportunity. A client on
their tenth visit can review every time, and each review is stored and shown.

---

## 4. How repeated reviews affect reputation

**One client, one voice — their most recent.**

The public rating is the mean of the **latest revealed review from each distinct
client**. Every review is still recorded, still displayed, and still counted in
the review count.

**"Latest" means the most recently completed SERVICE, not the most recently
written review** (PD-092). If a client visits on the 1st and the 5th, then
reviews the 5th visit first and the 1st visit a week later, the **5th visit's**
review is the one in the rating — the later-written review of the older haircut
does not replace it. The ordering key is the booking's server-stamped
`completed_at`. If two of the same client's bookings were completed at the exact
same instant (a provider marking both complete in one action), the tie goes to
the later-written review.

| Number | What it means |
|---|---|
| **Rating** | The mean of each distinct client's most recent revealed review |
| **Clients** (shown beside the rating) | How many distinct clients that rating rests on |
| **Reviews** (the list) | Every revealed review, including repeats |

**Why it works this way.** Twenty reviews from one client are one relationship,
not twenty, and treating them as twenty would let two people manufacture a
reputation. Using the **latest** means a loyal client who is disappointed this
time moves the rating *today* rather than being outvoted by their own past
enthusiasm — quality changing over time is exactly what repeat reviews are good
for.

**What support will be asked, and the honest answer:**

> *"I have twenty five-star reviews and my rating only counts three."*

Correct, and intended. The rating counts **clients**, not receipts. Three clients
who love you is three data points. The profile shows both numbers so nobody has
to guess which one they are reading.

> *"Can you fix my rating / set it back / adjust it manually?"*

**No, and there is no mechanism to.** The public rating is computed from the
eligible review data and nothing else — there is no operator rating field, no
override, no pin, and no support path that produces one. The database refuses to
store a rating it cannot reproduce from the reviews, so this is not a policy
support is choosing to apply; it is not possible. If a rating looks wrong, the
question is whether a REVIEW is eligible, which is an adjudication question, not
a number to type over.

---

## 5. Can reviews be edited or deleted?

**No. Neither side, at any point.** There is no update path and no delete path —
not in the app and not in the database, for any client role.

**Say it that way, not as "nobody can."** The database refuses it for every role a
person can log in as; it does not refuse it to the service key, which is how
backfills and account erasure work at all. That difference never reaches a user
and there is no support path to it, but an absolute claim in a support script is
one the product cannot back (OQ-080).

This is deliberate: an editable or deletable review is a reputation-manipulation
loop (write, see the effect, rewrite). **Support cannot edit or delete a review
either** — there is no tool for it, and any future one would be an operator
action with an audit trail, not a support convenience.

---

## 6. What to say when…

| Situation | What to say |
|---|---|
| **"My review is missing."** | If the booking completed within the last 7 days and the other side has not reviewed, it is **blind** — recorded, not lost, and it appears when the window ends. Confirm the booking actually reached **completed**: an uncompleted or cancelled booking creates no review opportunity. |
| **"Why can't I see what they wrote about me?"** | The window is blind on purpose, so neither side can retaliate. Reviewing yourself reveals both immediately. |
| **"They never reviewed me, so mine is stuck."** | It is not. It reveals when the 7 days end, regardless of what the other side does. |
| **"Can I change my review?"** | No. There is no edit path and no delete path for either side, and support has no tool for it either. |
| **"My rating didn't move after a great review."** | If it was from a client who has reviewed before, it **replaced** their previous review rather than adding to it. If the booking completed very recently, the review may still be blind. |
| **"Can I review my barter trade?"** | **No. Barter is outside reviews and reputation entirely for beta.** There is no path from a trade to a review, and a barter trade never affects anyone's rating. |
| **"Is this reviewer verified?"** | The only thing the product guarantees is that **every review is attached to a real completed booking between those two accounts**. It does not verify identity, and it does not verify that the review is fair or accurate. |

---

## 6b. When a booking is placed under review

**First, the thing support gets wrong about this section: there is no dispute
button.** `under_review` is set and cleared by an **operator only** — no screen,
no API call and no support macro lets a client or a provider put a booking under
review. What a user actually has is **Report an issue** on the booking, which
creates a case in the operator queue. An operator may then decide to place the
booking under review. Do not tell a user to "file a dispute"; tell them what
Report an issue does.

**And opening a hold never changes a rating.** That is the single most important
sentence here, because the opposite would make the hold a weapon: whoever could
trigger one could delete a review they did not like, with nothing adjudicated.

What a hold actually does depends on whether the review was public yet:

| At the moment the hold opens | What happens |
|---|---|
| The review had **not revealed yet** (still inside the blind window, no counterpart review) | It **stays held** and keeps counting for nothing. Nothing public is being retracted, because nothing was public. |
| The review **was already revealed** | It **stays visible and keeps counting.** The rating does not move. |

So a provider who asks *"a client reported this booking — will my rating
recover?"* should be told their rating never dropped, and a provider who asks
*"I reported this review, why is it still up?"* should be told that reporting is
not how a review comes down, because nothing is.

**While a hold is open, no new review can be written on that booking** — neither
side can add a statement to a contested record. That takes nothing away from
anyone; it only stops something being added.

**Lifting the hold** returns the booking to the ordinary reveal rule. A review
still inside its blind window is still blind; a review whose window has closed
reveals normally.

**Only an operator resolution could change a revealed review's standing**, and
**no resolution rule does so today.** If one is ever approved it must be written
down as a product decision first — the current answer to *"can an operator remove
this review?"* is **no**.

*(This reverses `20261079000000`, which made the stored rating drop the instant a
hold opened. `20261082000000` latches reveal instead. If the number ever starts
moving when a dispute is filed, that is a regression, not a fix.)*

---

## 7. What the system does NOT promise

- **No identity verification** behind a review. The guarantee is transaction
  linkage, and nothing more.
- **No judgement of fairness or accuracy.** A review can be unfair and still be
  a legitimate review.
- **No removal on request.** There is no path to delete a review, including for
  support.
- **No barter reputation.** Trades produce no reviews and affect no rating.
- **No notification** when a review reveals. Nothing tells either party; they see
  it when they look.
- **No SLA on disputes.** A booking held `under_review` stays held until an
  operator resolves it, and nothing dequeues that automatically.
- **No review removal by dispute.** Filing a dispute does not take down a
  published review or move a rating, and there is no approved resolution that
  does either.
- **No manual rating.** There is no operator override, pin, or adjustment for a
  provider's public rating. It is derived from eligible review data, and the
  database will not store a value it cannot reproduce.
- **No defence against many accounts.** PD-091 stops ONE client inflating a
  rating by booking repeatedly — twenty reviews from one client is one voice.
  It does nothing about twenty accounts each leaving one review, because the
  rule counts distinct client accounts and nothing verifies that two accounts
  are two people. Bounding that needs identity, which the beta does not have.
  **If support is asked "is this rating real?", the honest answer is that the
  reviews are all linked to completed bookings between those accounts, and that
  The Book does not verify the accounts are different people.**

---

## 8. New human operational obligation

**A booking held `under_review` blocks NEW reviews on it indefinitely, and holds
any review that had not revealed yet.** That state is set and cleared only by an
operator; there is no timeout, no automatic release, and no notification to
either party. A dispute nobody works is a review window that never opens — and
neither participant is told why.

**What changed with the dispute ruling, operationally:** a hold is now a
narrower instrument than it was. It can no longer be used — by anyone, including
an operator — to take a published review down, so a complaint about an
already-visible review **cannot be resolved by opening a hold**. It arrives
through **Report an issue** on the booking, becomes an operator case, and the
outcome today is that the review stays. Expect that conversation, and do not
promise otherwise.

**Support must not say a review will be removed, reviewed for removal, or
"looked into" in a way that implies removal.** No such outcome exists.
