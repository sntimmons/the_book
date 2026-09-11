# Community — Operations and support note

**Status:** Authoritative for the branch `feat/community-reshape`. **Not merged.**
**Anchor:** `main` @ `e029ebc` plus that branch.

Written for whoever answers *"why can't I post that?"*, *"can you take this
down?"* or *"how do I get recommended?"*. Limits sit beside behaviour, because a
support note that lists only what works is how people get promised things.

---

## 1. What Community is

A **service community**. It exists so people can find providers, ask service
questions, recommend providers they trust, and so providers can say something
useful about their business.

It is **not** a social network, a status feed, or a place to build an audience.
There is no follower count that matters here, no trending, and no ranking by
likes.

**Discover is still the marketplace.** Community is a secondary route reached
from Discover and from Business. It has no bottom tab.

---

## 2. Exactly what a CLIENT can do

| Can | Cannot |
|---|---|
| Post **Looking for someone** | Post any provider-type content |
| Post **Need advice** | Post a generic status ("what's on your mind") — there is no such option, in the app or in the database |
| Post **Who does this style?** | Speak as a business, even if they own one — that is a different post type and the server rewrites it |
| Post **Recommend a provider** (shoutout) | Recommend a provider who is not approved, themselves, or anyone they are blocked with |
| Read every post and reply | Read anything as a signed-out visitor |
| Reply in any thread | Send "I can help" — that is a provider answering |
| Like, save, and remove their **own** posts and replies | Edit a reply, or edit anything about a post except its text |
| Report any post | See who else liked a post |

**A provider posting as a person is a client here.** That is intended: a
provider asking another provider for a recommendation is a person asking, and
the post shows their name, not their business.

---

## 3. Exactly what a PROVIDER can do

Everything a client can do, **plus** three things as their business:

| Action | What it is |
|---|---|
| **Open today** | A short note attached to a day they are already published as open. See § 5. |
| **Update** | Something that changed. |
| **Announcement** | Something new worth knowing. |

And in a thread: **answer as their business**, including **"I can help"** on a
post from someone looking for a provider. Every provider answer carries a route
to their profile — that is the point of the surface.

**Creating and managing provider posts lives in Business → Community**, not in
Me and not in the Me tab. Trades (barter) lives in Business → Trades.

### A restricted or deapproved provider

**Cannot post, announce, or answer as their business.** The server refuses it
(`PT431`) — this is the same eligibility gate barter writes have always had, and
Community did not have until now.

**They are still a person.** They can read, ask questions as themselves, reply
as themselves, and their existing history stays visible. Deapproval removes a
business's voice, not an account's.

---

## 4. Who sees what

- **Signed-out visitors see nothing.** Not the feed, not a thread, not a count.
  Discover shows them a prompt to sign in. This is deliberate: the block filter
  is per-viewer and there is no viewer to filter for.
- **Blocked pairs disappear from each other's Community, both directions.** The
  blocker stops seeing the other person's posts and replies, and the blocked
  party stops seeing the blocker's. A third party still sees both — this is a
  per-viewer hide, not a deletion.
- **A blocked party cannot reply** to a post they already hold a link to.
- **Nobody can see who liked a post.** The number is public; the names are not.

---

## 5. Open Today — the rules

**The provider does not declare they are open. Their published hours do.**

- An Open Today note can only be posted on a day the provider's **published
  availability** already shows them open, in their own timezone, against server
  time. If it does not, the write is refused and they are sent to set their
  hours. Business → Community disables the button and says so rather than
  offering a tap that can only fail.
- **It ends when their day ends.** The expiry is set by the server, never by the
  app, and cannot be extended.
- **It also stops surfacing the moment they block that date**, before it expires.
- **Nothing is deleted.** The note stays in their history in Business →
  Community, marked as ended. History does not have to be destroyed to stop
  something surfacing.

**"Open today" means published hours for today. It does NOT mean a free slot.**
Booked time is not subtracted anywhere in this product. If a client asks whether
a provider has availability, the honest answer is that they are open today and
the client should ask them.

---

## 6. Recommendations (shoutouts) — the rules

**A shoutout is not a review, and the difference matters in support.**

| | Review | Shoutout |
|---|---|---|
| Requires a completed booking | **Yes** | No |
| Visible immediately | No — 7-day blind window | **Yes** |
| Can be removed by its author | **No, ever** | Yes |
| Moves the star rating | **Yes** | **No. Nothing.** |

A shoutout must name a **real, approved provider**. Nobody can recommend their
own business, or anyone they are blocked with.

**"Worked together"** appears on a shoutout only when the **server verified** a
completed booking between that author and that provider. Its absence means
nothing was claimed — most good recommendations will not have one in a beta this
size, and that is expected, not suspicious.

> *"Can a shoutout raise my place in search?"*

**No.** Nothing in Community affects marketplace ranking. Not shoutouts, not
likes, not how often a provider posts. A provider who never opens Community is
not ranked lower for it.

---

## 7. Reports, blocks and what an operator can actually do

**Reporting a post creates a real operator case**, through the same intake every
other report in the product uses. The reported post's id travels in the case
notes so an operator can find the content. Report intake bounds (PD-088) apply.

**What an operator can do today:** read the case, claim it, resolve it, dismiss
it, note it, and — separately — withdraw a provider's eligibility, which stops
them creating new provider Community activity.

**What an operator CANNOT do today: take a post down.** There is no take-down
mechanism. The only removal path is the author's own delete.

**Support must not tell a reporter the content will be removed**, or that it
will be "reviewed for removal", or anything implying a take-down outcome exists.
It does not. This is filed as **OQ-082**.

If content must come down urgently, the available levers are: the author
removing it, and withdrawing the provider's eligibility (which stops **new**
provider activity and does not remove existing posts).

---

## 8. What Community does NOT promise

- **No moderation SLA.** No timeframe, no queue position, no notification. PD-068
  is explicit that there is no SLA, and this surface does not create one.
- **No content take-down.** See § 7.
- **No verification of a recommendation** beyond the "Worked together" badge, and
  that badge is about a booking, not about honesty.
- **No audience, reach or promotion.** Posting does not make a provider more
  discoverable in the marketplace. If a provider asks how to get more bookings
  from Community, the honest answer is: by being useful to someone who asked a
  question, not by posting more.
- **No client photo or gallery system.** Community is text and structure. Reels
  and portfolio media remain provider surfaces.
- **No edit history.** A post's text can be corrected by its author; everything
  else about it is fixed. A reply cannot be edited at all.
- **No guarantee anyone answers.** In a beta this size, many posts will get no
  reply. Say so plainly rather than implying a response is coming.

---

## 9. When Community is sparse — what to say

It will be sparse. A 25-30 person beta produces a handful of posts a week, and
**that is the expected state, not a failure**.

- **Do not imply there is more activity than there is.** No "join the
  conversation", no "see what everyone's saying".
- **The useful framing is a direct one:** *"Ask for a recommendation and a
  provider will see it."* That is true of a quiet surface and stays true of a
  busy one.
- **Nothing in the product manufactures activity.** There are no seeded posts, no
  fake accounts and no placeholder content. An empty Community shows an honest
  empty state and the four things a person can do about it.
- If a provider asks whether it is worth posting, the honest answer is that a
  single useful answer to a real question is worth more than a feed of updates —
  and that not posting costs them nothing.

---

## 10. New human operational obligation

**Community reports are new operator work, and the queue has no SLA.** The
reportable surface grew from ~30 providers to every account holder, so report
volume should be expected to rise. Nothing dequeues a case except a person.

**And the outcome available for a Community report is narrower than for other
report types**, because there is no take-down (§ 7). An operator working a
Community case can record what happened and, in a severe case, withdraw a
provider's eligibility — and that is the whole toolset. **Do not promise more
than that to a reporter, and do not let a case sit implying more is coming.**

**Provider eligibility is now load-bearing in a second place.** Withdrawing it
silences a business in Community as well as stopping barter writes and new
bookings. That is intended, and it is a bigger action than it was last week.
