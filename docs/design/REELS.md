# Reels — "Held Light"

**Authoritative for this surface.** The approved art direction for the Reels tab and what
Session 6B built against it. Cross-app principles live in
[THIRD_VISUAL_SYSTEM.md](THIRD_VISUAL_SYSTEM.md); nothing here is a global rule unless that
document says so.

**Status: engineering-complete for the buildout phase; final visual consistency approval
deferred to the whole-app visual pass.**

The remaining visual migration is **build-first** (founder ruling, 2026-09-15): art direction →
implementation → light build-phase validation → next surface, with one whole-app visual and
navigation consistency pass, a founder final visual review, and deep device QA at the end. **A
surface does not wait on a founder device review before the next one begins**, and this screen
is not "founder visually final" — no founder review of it has happened. The process, and what it
explicitly does not relax, is recorded in
[ROADMAP.md](../product/ROADMAP.md#how-the-remaining-visual-migration-proceeds--build-first-founder-ruling-2026-09-15).

**What that does not cover — tracked for the later device pass**, because none of it can be
executed in the development environment (this machine has no Xcode, only Command Line Tools):

- that video actually **plays and pauses** on a device, and that the deferred single-tap does
  not feel laggy against a real double-tap
- that the **seek line** tracks smoothly from real `onPlaybackStatusUpdate` intervals
- that **audio** stops on navigation away and does not bleed under a pushed screen
- **scroll/paging feel** on a real list of real videos, and memory behaviour over a long feed
- that the **scrim** holds legibility over real provider footage rather than a mocked view
- **VoiceOver** ordering and announcement of the paused state on device

---

## 1. The point of view

**The reel is a window onto somebody's workshop, and Third stays out of the way.**

Chrome behaves like a caption in a photo book — bottom-left margin, typographic, quiet. Trust
comes from restraint: the platform does not shout over a provider's work. The video is the
dominant surface in every state, and nothing is dimmed to make chrome legible.

The reading order is deliberate and it is a sentence:

> **who made this → where they work → what they said → the way to reach them.**

That last step is a sentence ending, not the fifth icon in a column.

---

## 2. What was wrong before

The screen was never migrated onto the Third system, and three defects had accumulated behind
that fact.

| | Before | Now |
|---|---|---|
| Colour | **35 literals**, including gold `#C8922A` and bone `#F0E8D5` — values from the retired The Book palette that are **not roles in this system at all**. No `useTheme`. | Every colour resolves from the theme. One sanctioned `rgba()`. |
| Play control | A 48pt `play-circle` at **5% opacity** with `pointerEvents="none"`, mounted on **every reel in every state**. Commented as a load-failure fallback; nothing ever conditioned it. | Deleted. There is no centre play control. |
| Playback | **A single tap did nothing.** `handleVideoTap` only counted double-taps. There was no way to pause a video, and the one thing that implied there was could not be pressed. | Single tap toggles play/pause. |
| Identity | The same provider rendered **twice** — rail avatar with a follow badge, and the caption row. | One identity block. |
| Conversion | **"Book" was the fifth icon in a five-icon rail**, weighted the same as Share, and it did not book — it opened the profile. | One Mulberry **"View & book"** control under the provider's name. |
| Engagement | Like and comment **tallies** on the rail. | No count of any kind. |

---

## 3. Hierarchy

1. **Video** — full-bleed, dominant, never dimmed for chrome.
2. **Provider identity** — avatar, name (`titleCard`), category · neighbourhood (`labelMeta`).
3. **View & book** — the one primary action, in Mulberry.
4. **Caption** — `bodyDefault`, two lines, restrained and subordinate.
5. **The rail** — four quiet glyphs, lower right.

**Typography is deliberately narrow: nothing on this screen is larger than `titleCard` (18).**
The video supplies the scale contrast, so the type does not compete for it. That restraint is
the position, not an absence of one.

---

## 4. Colour

Everything resolves from the semantic tokens. Three roles do the work:

- **`textOnAction`** (Linen) — every glyph and every line of type over media.
- **`mediaScrim`** (Ink) — both gradients, and the ground behind a loading video.
- **`actionPrimary`** (Mulberry) — the one primary action, and nothing else.

`textOnAction` and `mediaScrim` are the two roles the system fixes as **identical in both
schemes**, because lettering over a photograph and a scrim over one must not invert. **So this
surface looking the same in Light and Dark is the system working, not the migration missing.**
Only the comment sheet and the empty state resolve differently per scheme, because only they
sit on a real surface rather than on video.

**One `rgba()` literal survives, deliberately.** A gradient needs alpha stops and a hex token
cannot express one, so Ink's channels are written out once as `INK = '33,31,29'` behind a
`scrim(alpha)` helper. This is the same exception the provider profile takes.

**Cypress on the neighbourhood.** The place name in the meta line takes `statusLocal`, because
in this system Cypress is the colour of *where* — place and truthful status, never quality.
**This is a screen-specific treatment and is not a universal rule**; extending it elsewhere is
a PM/founder decision, not an inference from this document.

---

## 5. Playback

**Single tap toggles. Double tap still likes.**

The single-tap action is **deferred past the double-tap window** rather than fired immediately.
Without that, every double-tap-to-like would also pause the video underneath it — two gestures
on one region, one of them wrong.

Playback obeys **two** conditions: `isActive` (the feed's position) **and** `wantsPlay` (the
viewer's intent). Scrolling away still stops audio; scrolling back does not silently resume
something the viewer paused; and intent resets when a card becomes active again, so a paused
reel does not stay paused forever after the viewer has moved on and come back.

**Paused is said, not merely shown.** The word `PAUSED` appears under the wordmark, and the
seek line at the frame's bottom edge brightens from 0.28 to 0.9. The system requires state to
be carried in words rather than colour alone, and a paused video is otherwise indistinguishable
from one that stalled.

**The word is mounted only while paused, not merely faded to zero.** A transparent `Text` node
is still in the accessibility tree, so keeping it mounted meant a screen reader announced
"PAUSED" over a video that was playing. The fade-**out** is the cheaper of the two costs.

**There is no centre play control, and that is the point.** A control that does not do anything
must not be shown; the old glyph did nothing and looked broken. A genuine load failure is a
separate concern and is not represented by a decorative icon.

---

## 6. The rail

Four glyphs — Like, Save, Comment, Share — outline, uniform stroke, `textOnAction`, lower right.

**Gone from it:** the provider's avatar, the follow badge, every count, and Book.

**Active state is a filled glyph plus a changed word** ("Like" → "Liked"), never a colour of its
own. There is deliberately **no engagement-red token** in this system, and an active Like that
borrowed Mulberry would compete with the action the screen exists to drive.

**Four, not the three the art direction sketched.** All four interactions work today, and
removing a working control would have been a product change nobody approved. Recorded as a
deviation rather than quietly reconciled.

---

## 7. Identity and attribution

One block: avatar, name, `category · neighbourhood`, and Follow as a word rather than a `+`
badge. Tapping it opens the profile; Follow is hidden on your own reel, where the database
would reject the row.

**Attribution only.** No verification mark, no availability claim, no rating, no popularity
language, no count. The identity line answers *whose work is this*, never *is this good* —
which is the marketplace rule, not a styling choice.

---

## 8. The primary action

**"View & book"**, in Mulberry, under the identity block.

It is not labelled "Book", because it routes to the provider profile where the real booking
action lives. A control labelled "Book" that opens a profile promises something it does not do,
and the system rules out copy that sounds confident about what the product cannot do.

**The booking flow is untouched by this session**, and this control does not deep-link into it.

---

## 9. Provider Reel creation

The header's right slot was reserved as an empty spacer with a note that a capture entry point
would live there once one existed. One does: the **Posts & Reels uploader**.

- **Provider-only**, and *eligible* means **both** halves: `isProvider` (the resolved role) and
  a `providerId` (the row the uploader needs). A provider still mid-onboarding can have the
  first without the second, and an entry point to a door the uploader would turn you away from
  is worse than no entry point.
- **Routes into the existing uploader** at `/(tabs)/business/posts`. **It is not a second
  upload system** — this screen has no picker and no upload call of its own.
- **Not a tab, not a floating button.** A consumer sees the same empty space they saw before,
  which is why the spacer stays rather than the header re-centring.
- The empty feed offers the same destination at full weight, because there is no video there to
  compete with.

**The durable provider-management path remains Me / My Studio.** This is a contextual entry
point only.

---

## 10. What this is not

It does not read as a TikTok clone, and the reasons are structural rather than stylistic: no
counts, no engagement-red, one avatar instead of two, a four-glyph rail sitting in the lower
third instead of a five-item column spanning the right edge, and a **labelled primary action in
a wine fill** where a clone puts its fifth icon.

What makes it Third is the reading order — who, where, what, then how to reach them — and a
place name rendered in the colour this system reserves for place.

---

## 11. Open, and NOT to be cleaned up unilaterally: the "For You" label

**Do not change this without a founder decision.** It is recorded here because it looks exactly
like tidy-up work, and it is not — it touches what the feed claims to be.

**What it is.** A `View` holding a `Text` and a 2pt full-width `textOnAction` underline. It is
**not** wrapped in a `Pressable` or `TouchableOpacity` and has no handler: it is **static copy
styled as a selected tab**. The underline is the standard "this option is selected" affordance,
so it reads as one choice out of several while being the only one that exists.

**What the feed actually is.** `posts_visible`, `media_type = 'video'`, active, non-demo,
`order('created_at', desc)`. Nothing re-sorts it afterwards. That is **strict reverse
chronology over every eligible video in the marketplace** — no personalization, no follow
input, no engagement input, no ranking of any kind. The only viewer-dependent element is
PD-089's block filter, which *removes* rows for safety; it does not *order* them.

**The mismatch.** "For You" is the category term for an algorithmically personalized feed, so
the label claims a personalization the product does not perform, and the underline claims a
selector that does not exist. Two repository rules bear on it directly: the visual system rules
out *copy that sounds confident about something the product cannot do*, and **PD-073** requires
beta discovery lanes to **print the rule that put content in front of you** — "For You" prints
no rule, and the rule it implies is not the rule in force.

**Smallest correction, recommended but NOT implemented:** delete the label and its underline,
leaving the "Reels" wordmark and the provider-only `+`. It removes a false claim and a phantom
selector, and it adds nothing. If a word is wanted in that space, **"Latest"** is the only one
that is true today.

**Explicitly out of scope without founder approval:** a Following feed, a second feed, a
category switcher, or any ranking behaviour.

---

## 11. Guards

- `__tests__/guards/reelsHeldLight.test.ts` — source-level: zero colour literals, no retired
  palette value anywhere, no count, no engagement-red, no centre glyph, the label is
  "View & book", the creation affordance is gated and routes to the existing uploader, and
  Reels still reads `posts_visible` so PD-089 blocking still applies.
- `__tests__/app/reelsHeldLight.render.test.tsx` — **renders the real screen**: identity appears
  exactly once, a four-figure like count and three-figure comment count are absent from the
  tree, a tap produces the word PAUSED, "View & book" routes to the profile, and a client and a
  half-onboarded provider both see no Add-a-reel control.

The two answer different questions. The guard proves the source does not contain a thing; the
render test proves the output does not either — which is the claim that actually matters for a
count that must be absent or a control a client must never see.
