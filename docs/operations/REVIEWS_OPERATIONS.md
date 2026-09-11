# Reviews — Operations and support note

**Status:** Authoritative for the branch `feat/reviews-phase-2`. **Not merged.**
**Anchor:** `main` @ `2da313a` plus that branch.

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

**Held separately:** a booking under dispute (`under_review`) holds reveal for
both sides until the dispute is resolved. That is a `service_role` state; no
participant can set it.

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

---

## 5. Can reviews be edited or deleted?

**No. Neither side, at any point.** There is no update path and no delete path —
not in the app and not in the database, for any client role.

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
| **"Can I change my review?"** | No. Reviews cannot be edited or deleted by anyone. |
| **"My rating didn't move after a great review."** | If it was from a client who has reviewed before, it **replaced** their previous review rather than adding to it. If the booking completed very recently, the review may still be blind. |
| **"Can I review my barter trade?"** | **No. Barter is outside reviews and reputation entirely for beta.** There is no path from a trade to a review, and a barter trade never affects anyone's rating. |
| **"Is this reviewer verified?"** | The only thing the product guarantees is that **every review is attached to a real completed booking between those two accounts**. It does not verify identity, and it does not verify that the review is fair or accurate. |

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

---

## 8. New human operational obligation

**A booking held `under_review` holds BOTH reviews indefinitely.** That state is
set and cleared only by an operator; there is no timeout, no automatic release,
and no notification to either party. A dispute nobody works is a review nobody
sees — and neither participant is told why.
