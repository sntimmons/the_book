# Messages — "Working Letter"

**Authoritative for this surface.** The approved art direction for Messages — the inbox, the
**first-contact composer**, and the conversation thread — and what Sessions 7B and 7C built
against it.

**The surface is three screens, not two:**

| Screen | File | Migrated |
|---|---|---|
| Inbox | `app/(tabs)/messages.tsx` | Session 7B |
| First-contact composer | `app/messages/new.tsx` | Session 7C |
| Conversation thread | `app/messages/[id].tsx` | Session 7B |

Cross-app principles live in
[THIRD_VISUAL_SYSTEM.md](THIRD_VISUAL_SYSTEM.md); nothing here is a global rule unless that
document says so.

**Status: engineering-complete for the buildout phase; final visual consistency approval
deferred to the whole-app visual pass.** The remaining visual migration is build-first (founder
ruling, 2026-09-15) — see
[ROADMAP.md](../product/ROADMAP.md#how-the-remaining-visual-migration-proceeds--build-first-founder-ruling-2026-09-15).
This screen is **not** "founder visually final".

---

## 1. The point of view

**Two people arranging real work.** The thread reads as working correspondence — dated,
legible, attributable — not a stream of casual chatter. Messages are *records*.

Messaging here is functional infrastructure between people who may be about to owe each other
money, time and a finished job. It should feel personal and trustworthy **without pretending to
be social DMs**, and the restraint is what carries the trust: nothing on this surface performs
friendliness, and nothing implies a capability the product does not have.

---

## 2. What was wrong before

Neither screen had been migrated, and the legacy styling was carrying two untruths.

| | Before | Now |
|---|---|---|
| Colour | **~72 literals across the two screens**, zero `useTheme`. Gold `#C8922A` and bone `#F0E8D5` — values from the retired The Book palette that **are not roles in the Third system**. | Every colour from the theme. **Zero literals on both screens.** |
| Status bar | `StatusBar style="light"` hardcoded — invisible on a Porch canvas. | Follows the scheme. |
| iOS accessory | `backgroundColor="#111111"` hardcoded. | `bgElevated`. |
| Refresh spinner | Gold. | `textSecondary`. |
| **The "All" filter** | Labelled **All**, but excluded pending requests and declined ones. | Labelled **Conversations**. |
| **Empty state** | *"Message a provider to get started"* — **an instruction this screen cannot carry out.** | Each filter describes itself and instructs nothing. |
| Day boundaries | None. A reply three weeks later sat directly under the message it answered. | A dated rule opens each day. |

---

## 3. The inbox

**Hairline-separated rows, no cards.** The visual system already names hairline rows as the
reference pattern for lists of facts, and a card per conversation would put a container around
every one of them for nothing.

**Filters: Conversations · Requests · Bookings.** Text plus an underline, **deliberately not
segmented pills** — and unlike the inert "For You" that Reels just lost, this selected-tab
affordance is truthful, because these are three real controls with three real states.

> **Only the label changed.** The filter key is still `'all'` and its predicate is still
> `inboxSection(c.request_status) === 'active'`, byte for byte. Renaming the key would have
> been a larger diff for no gain and would have invited the reading that the behaviour changed
> with the name. It did not.

**Why "All" had to go.** It excluded pending requests, which live under Requests, and declined
ones, which are hidden from the active lists. A viewer whose only conversation was a pending
request opened Messages, landed on "All", and was told there was nothing there — while a
request sat one filter across. "Conversations" describes what the list actually holds.

| Element | Treatment |
|---|---|
| **Header** | "Messages" at `titleLarge`. The compose slot stays empty — it was removed because it was a no-op, and an empty corner is honest. |
| **Avatar** | 44pt monogram on `bgSubtle`. **Not a placeholder for a photo — there is no photo.** The messaging data layer carries no avatar URL for either party, so this is the honest representation, and adding one is a data change, not a styling one. |
| **Unread** | The name's **weight** (`FONT.extrabold` vs `FONT.semibold`) plus a `statusLocal` dot. Colour is never the only carrier. Only the face changes, never the size — swapping ramp entries would shift every row below as messages arrive. |
| **Numbers** | **None.** `unread_count` is real in the data layer and is deliberately not printed; a count would be new unread semantics. |
| **Time** | `caption`, `textSecondary`, top-right. Logic unchanged. |
| **Booking context** | A `labelMeta` **line**, not a pill — a bordered chip makes a fact look like a filter. In `statusLocal`, the colour this system reserves for place and truthful status. **Screen-specific; not a new universal rule.** |
| **Preview** | `bodySmall`, one line, `textSecondary`. |
| **Requests count** | Truthful, inline, inside the filter: `Requests (3)`. **The Messages tab carries no badge** — that would be new unread semantics. |
| **Loading** | Three shimmer rows at real row height, tinted `bgSubtle`. |
| **Empty** | Type-led, per filter, no decorative icon. A 48pt chat glyph was the loudest thing on an empty screen. |

---

## 4. The thread

**Slabs, not chat bubbles.** Incoming and outgoing are told apart by **alignment and one tonal
step** — `bgSurface` with a hairline on the left, `bgElevated` on the right. Radius 10, no
tails.

**No Mulberry on a message.** Mulberry is the one primary-action fill on this screen and it
belongs to **Send** and to **Accept**. An outgoing bubble in the action colour would spend it on
every sentence the viewer typed and weaken the two controls that need it.

**Grouping is untouched** — same sender, inside the same five-minute window, exactly as before.

**Day separators** open each calendar day with a hairline rule and a centred `caption` label:
*Today*, *Yesterday*, a weekday inside the last week, then an explicit date. They are **derived
from the timestamps the messages already carry** — no message data changes, no grouping
semantics change, nothing is persisted.

**System notices stay unattributed** — centred, italic, `textSecondary`, visually distinct from
both participants. A platform notice is authored by nobody, and rendering it in the
counterparty's slab would be the impersonation the server-side representation exists to avoid.

### The context band

A hairline-bounded band beneath the header carrying **only what the screen already knew**: the
booking service, and the request state. It invents no state and changes no gating.

It exists because both facts were previously in bad places — the service as a second line
crowding the header, and the request notice down beside the keyboard, which is the worst place
to explain why you cannot type. The band is outside the list, so it **never scrolls away**.

**Safety notices are deliberately NOT in it.** The blocker's notice stays immediately above the
composer, paired with the composer it does not close and with its own Unblock action.
**Relocating a safety notice is a safety change, not a visual one**, and this was a visual
session.

### States, all preserved exactly

| State | Treatment |
|---|---|
| **Composer available** | Hairline-topped bar, `bgSurface` field, Mulberry send when there is text. |
| **Client, pending** | No composer. `REQUEST_PENDING_CLIENT_COPY` in the band, from the library — never inlined. |
| **Declined** | No composer. The existing neutral copy. |
| **Provider, pending** | Prompt plus **Accept as the one Mulberry fill** and **Decline as an outline**, kept at the **bottom** where the composer would be and where the thumb already is. |
| **Blocked by me** | The existing notice above the composer, with Unblock. **The composer stays open** — a pair with a live booking keeps a working thread by design, and the client cannot evaluate that condition, so hiding it would be a guess and half the time the wrong one. |
| **Refused send** | `MESSAGE_REFUSED_COPY`, unchanged. Names no cause (PD-082). |
| **Not found / empty / loading** | Type-led, no icons. |

---

## 5. Light / Dark / System

**Messages follows the viewer's choice completely. There is no permanently dark treatment.**

The reasoning is structural. Reels is scheme-invariant because `mediaScrim` and `textOnAction`
are pinned across schemes so lettering over a photograph holds. **Messages has no media on it at
all** — it is type on surfaces. It has no mechanism forcing invariance and no reason to claim
one, and a permanently dark Messages would be the only screen in the app that ignores the
setting, against the system's "every surface resolves from one tree".

No approved "matte-dark Messages" treatment was found anywhere in this repository when this work
began. **This is a screen-specific recommendation and not a new cross-app rule.**

---

## 6. What this surface does NOT have, and must not grow by imitation

No typing indicators, presence, online status, read receipts, delivery receipts, reactions,
voice notes, attachments, response-time claims, search, archive or pinning. None of these exist
in the data layer and none were added.

**`is_read` cannot become a read receipt.** It is **one boolean serving two readers** — it
drives the recipient's unread count, and the mark-read write is already carefully scoped so the
actor opening a thread does not clear a notice addressed to the counterparty. Presenting it to a
sender as "seen" would be a false claim about a field that does not mean that.

**Realtime IS real.** Both the inbox and the thread hold live subscriptions; new messages arrive
without a refresh. That behaviour is untouched.

---

## 7. Tracked for the later device pass

Not provable in the development environment (no Xcode on this machine, Command Line Tools only):

- **Keyboard behaviour** — `KeyboardAvoidingView` on both platforms, and whether the composer
  and the context band coexist correctly with the keyboard raised.
- **The iOS `InputAccessoryView`** — it renders only on device, so its new `bgElevated`
  background and its Done/Send row are unverified in both schemes.
- **Safe areas** on a notched device, particularly the composer's bottom inset.
- **Realtime delivery** against a live database, and scroll position when a message arrives.
- **Long-thread scrolling** with day separators interleaved, and `FlatList` performance.
- **Light/Dark legibility of the slabs** — `bgSurface` against `bgElevated` is one tonal step,
  and one step is exactly where a real screen decides whether it reads.
- **The composer's `autoFocus`** — the keyboard opens on mount, and how that lands against the
  header and the docked action is a device question.

---

## 8. The first-contact composer

`app/messages/new.tsx`. Reached from the **provider profile's Message control** and from the
**booking flow's datetime step**, whenever `messageEntryAction` resolves to `compose` — that is,
when no conversation exists between the pair, or the one that does was declined.

**It was the broken step in the middle of a migrated journey.** The provider profile is
migrated and the thread is migrated; this screen was still on the retired The Book palette, so a
client crossed from Third into The Book and back into Third to send one sentence. Session 7C
closed that, presentationally and only presentationally.

**It is the entry page into Working Letter, not a third Messages style.** It borrows the
thread's own vocabulary rather than inventing one: the same hairline-bounded header with the
monogram in the same place, the same input surface and radius, and a single Mulberry action —
the same fill Send and Accept take in the thread, appearing exactly once here.

**Nothing functional changed.** `sendPrebookingRequest` still decides everything that matters:
who may start a conversation, whether an existing thread is reused rather than duplicated, and
the re-request path for a declined one. The screen calls it, and reports what it says. It
touches no table itself.

**It reports the helper's refusal verbatim** and falls back to a generic line only when the
helper gave no reason. That matters because those messages are already curated to avoid raw
trigger text — including the deliberately neutral *"This conversation cannot be re-opened from
here."*, which covers a case the repository records as an open product question rather than a
decided one.

**On success it `replace()`s into the thread**, never pushes, so Back returns to the profile
rather than to a spent composer.

**The copy was not rewritten.** The one claim worth checking — *"Once they accept, you can chat
normally"* — is true: `composerState` opens the composer on `accepted`.

---

## 9. Guards

- `__tests__/guards/messagesWorkingLetter.test.ts` — zero colour literals on both screens, no
  retired palette value, the three filter predicates unchanged, the Requests count truthful, no
  numeric unread, no compose control, gating still from `composerState`, the blocker notice
  **not** moved into the band, Accept is the only Mulberry action, no slab takes the action
  colour, and no absent capability named anywhere.
- `__tests__/app/messagesInbox.render.test.tsx` — **renders the real inbox**: the renamed filter
  selects exactly the rows the old one did, pending and declined stay out of it, the count is
  truthful and disappears at zero, rows open the right thread, and no empty state instructs an
  impossible action.
- `__tests__/app/messagesThread.render.test.tsx` — **renders the real thread**: day separators
  derive correctly and emit one per calendar day rather than one per message, and the composer
  opens or closes exactly as `composerState` dictates for open, pending and declined.
- `__tests__/app/messagesComposer.render.test.tsx` — **renders the real first-contact composer**:
  the recipient the route supplied is the recipient the send uses, an empty message never sends,
  success `replace()`s into the thread, a refusal surfaces the helper's own words and stays put,
  and Back still returns. The guard additionally pins that the screen is **reachable** from both
  entry points — if that ever stops being true it becomes dead code, and somebody should find
  out from a failing test rather than a styling audit.
