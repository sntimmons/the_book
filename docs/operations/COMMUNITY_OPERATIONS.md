# Community — Operations and support note

**Status:** Authoritative. Describes `main`.
**Anchor:** `main` @ `7826ca4` (2026-09-11) — squash-merge of PR #82, Community Reshape.

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

## 7. Reports, blocks, and what an operator can now actually do

**Reporting a post or a reply creates a real operator case**, through the same
intake every other report in the product uses. Report intake bounds (PD-088)
apply. The report now names the specific content, so an operator can open the
case and see the post or reply itself rather than hunting for it.

### Hiding and restoring (PD-099)

An authorized operator can **hide** a Community post or reply, and can **restore**
it later.

**Hiding is not a delete.** Say that plainly, internally and to anyone who asks:

| Hiding does | Hiding does NOT |
|---|---|
| Remove the content from the feed, threads, Discover and provider profiles | Delete the post or reply |
| Remove it for **everyone**, not just the reporter | Delete the report |
| Stay on the record — who hid it, when, against which case, and why | Delete the case |
| Stay reversible | Suspend the author |
| | Restrict a provider |
| | Resolve the case |

The last three matter operationally: **hiding is only hiding.** If a provider
should also lose their eligibility, that is a separate action with its own audit
row. If the case should be closed, close it. Nothing happens as a side effect of
something else, because a decision nobody made is one nobody can defend.

**Restoring** puts the content back on the ordinary surfaces. It does **not**
erase the fact that it was hidden — the operator screen shows *Visible*,
*Hidden by operator*, or *Restored — hidden before*, and the moderation history
lists every decision. An operator looking at something that has been hidden and
restored once already should know that.

**Blocking still applies on top.** Restoring content does not make it visible to
someone who has blocked its author — those are two independent rules and both
have to pass.

**The author is told — a provider is.** A provider whose post is hidden sees it
marked in Business → Community. There is no notification and none is promised;
the post is simply not silently missing from their own list.

**A CLIENT author is not told, and that is a known gap.** Clients have no "my
posts" screen, so a client whose post is hidden sees it disappear from the feed
with no explanation. They can still read it if they hold the link. If a client
asks why their post vanished, **say that it was hidden by The Book and that you
cannot say more** — do not suggest a bug, and do not invent a reason. Owed to a
later UX pass, not to this one.

**An operator cannot moderate their own matter.** They cannot hide or restore
their own content, a recommendation of a business they own, or content on a
report they filed themselves. Hand it to another operator.

### What support may say

- *"It has been reported and an operator will look at it."* — true.
- *"I can't tell you what will happen to it."* — true, and the honest answer.
- **Do not say the content is coming down**, is "being removed", or is under a
  process that ends in removal. An operator may hide it, may restore it later,
  and may decide it stays. **All three are real outcomes.**
- **Do not give a timeframe.** There is none.
- **Do not tell a reporter what was decided.** There is no channel to tell them
  through and none is promised.

### What an operator cannot do here

Suspend an account from this screen, act on many items at once, or filter content
automatically. There is no bulk moderation, no keyword or AI filtering, no
auto-ban, no content scoring and no priority queue. A person reads a case and
decides.

---

## 8. What Community does NOT promise

- **No moderation SLA.** No timeframe, no queue position, no notification. PD-068
  is explicit that there is no SLA, and this surface does not create one.
- **No guaranteed take-down.** An operator CAN hide content (§ 7), and is not
  obliged to. A report is not a removal request that gets granted.
- **No deletion as a moderation outcome.** Hiding is **not a delete** — the
  content, the report and the case are all kept.
- **No notification of an outcome**, to the reporter or to the author.
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

**Operators must actually read Community reports and decide.** That is the
obligation this surface creates, and it is new: before, a Community report could
only be acknowledged: now it has three real outcomes — **the content stays
visible, it is hidden, or it is restored** — and choosing between them is human
work that nothing else does.

**The queue has no SLA.** Nothing dequeues a case except a person, there is no
timeframe, and no priority ordering. The reportable surface grew from ~30
providers to every account holder, so report volume should be expected to rise.

**Hiding is reversible and recorded, which changes how it should be used.**
Because nothing is destroyed and every decision is attributable, an operator can
act promptly on something that looks bad and restore it after a closer look. The
failure mode to avoid is the opposite one: leaving something visible because the
decision felt irreversible. It is not.

**Provider eligibility remains the heavier action.** Withdrawing it silences a
business in Community, stops barter writes and stops new bookings. It is separate
from hiding a post, and should stay separate: hiding one post is not a verdict
about a business.

**Account erasure is NOT resolved.** Deleting a user who is the target of a
report can fail, and deleting an operator who has acted on a case can fail
because the append-only actor history conflicts with the foreign-key cleanup.
Both are recorded under **OQ-077** and are the subject of the next dedicated
workstream (Account Erasure & Retention Integrity). **Until that lands, do not
promise anyone that their account can be deleted.**
