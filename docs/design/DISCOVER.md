# Discover

**Authoritative.** The approved design of the screen everyone lands on, as built and
**founder visually approved on 2026-09-15** (Phase 4B core redesign, Phase 4C social entry
points).

Cross-app principles live in [THIRD_VISUAL_SYSTEM.md](THIRD_VISUAL_SYSTEM.md). The
operational rules behind the lanes — eligibility, fairness, ordering — live in
[../operations/DISCOVERY_OPERATIONS.md](../operations/DISCOVERY_OPERATIONS.md). This
document is the **visual and hierarchical** contract.

---

## 1. Marketplace-first hierarchy

Discover is a **marketplace browse surface**. Finding and choosing a provider is the page;
everything else is a doorway near the end of it.

The approved order, top to bottom:

| # | Section |
|---|---|
| 1 | Header — "Discover" and the viewer's area |
| 2 | Search field |
| 3 | Rebook nudge — conditional, quiet |
| 4 | Category pills |
| 5 | **Near You** |
| 6 | **Open Today** |
| 7 | **New to Third** |
| 8 | **Worth a Look** |
| 9 | **From people you follow** |
| 10 | **Everyone on Third** — the complete grid |
| 11 | Load more |
| 12 | **See the work** — Reels doorway |
| 13 | Community |

Nothing above the grid may grow into a surface that replaces it.

---

## 2. Header and area

`Discover` as the screen title, with the viewer's **neighbourhood beneath it in Cypress** —
the colour of place.

When no area is set it reads **"Set your area"** and is a **real control**, opening the same
profile editor that already owns `clients.neighborhood`. "Near You" is meaningless if the
viewer cannot see or change what *near* means.

**No GPS, no mileage, no geocoding, no distance claim of any kind.** Area is a neighbourhood
string the user chose.

Two header actions only — Notifications and Me. Search was promoted out of the header, and
the provider's route into Business belongs where a provider already goes, not as a competing
action on the client browse surface.

---

## 3. Search

A **persistent tappable field** directly beneath the header, placeholder
*"Search braiders, barbers, nails…"*.

It is an **entry point, not an implementation** — it opens the existing search screen, and
Discover imports no ranking module. Finding someone is the first thing this screen is for;
it should not cost an icon hunt in a crowded header.

---

## 4. Marketplace lanes

Four horizontal rows above the grid, each with its **rule visible underneath its name**.

| Lane | Rule shown to the viewer |
|---|---|
| Near You | Providers working in your area. |
| Open Today | Open today, based on the hours they published. |
| New to Third | Joined in the last 30 days. |
| Worth a Look | Also working in Houston |

**The subtitles are not decoration.** A provider whose living depends on this feed is
entitled to know why they are in a row — or why they are not. A lane whose rule is invisible
is a lane nobody can argue with.

**An empty lane is dropped, never rendered as a heading over blank space.** A row titled
"New to Third" above nothing tells the viewer the product is broken, not that nobody is new.

Lanes order **attention**, never who exists. Every approved provider is in the grid below
regardless of which rows they fit.

---

## 5. From people you follow

**Placement: after the four marketplace lanes, before the complete grid.** Above them it
would read as the primary way Discover works and imply that following someone lifts them in
the marketplace. Below the paginated grid it would be unreachable in practice.

**Role does not control visibility — viewer follow state does.** A provider browsing
Discover is a client like anyone else and sees this row whenever *their own* follows
qualify. There is no role gate anywhere in the path.

**Attribution, in two lines:**

- provider identity first, `labelMeta` at `textPrimary`
- relative time beneath, `caption` at `textSecondary`

Two lines because the person should read before the clock; one grey run made the name as
faint as the timestamp. The card is 132pt square media above that attribution.

**Relationship-focused, never recommendation-focused.** It says who and when. It carries no
rating, follower count, likes, engagement, badge, verification, completed bookings, price or
quality language — and the type behind it has no field that could.

**Hidden entirely when the viewer has no eligible followed activity.** No filler, no
placeholder, and **no fallback to popular or nearby providers** — a row with this title
quietly showing strangers would be a lie about a relationship. A query failure hides the row
rather than showing something else.

---

## 6. Everyone on Third

The complete browse surface, and the reason the lanes are safe to ship.

**A uniform two-column grid.** Every card has the same structural dimensions. Variable tile
heights chosen by list position handed unearned prominence to whoever happened to be first —
the lanes work hard to rank nobody, and a grid that made the top provider look like the best
one quietly undid that.

**One `ProviderCard` component, two variants** (`lane`, `grid`), so the truth rules live in
one place:

| | Lane | Grid |
|---|---|---|
| Media — portfolio → profile photo → neutral tile | ✅ | ✅ |
| Name (business, else display) | ✅ | ✅ |
| Trade · neighbourhood | ✅ | ✅ |
| Rating — **only when real** | ✅ | ✅ |
| **Open today** — only when server-true | — (the lane already says it) | ✅ |

**Never on a card:** completed bookings, follower count, likes, engagement, verification
mark, Featured, Trending, a single provider-level price, or any availability beyond the one
fact the server can answer.

**Unrated is an absence, not a verdict.** `average_rating` is `NOT NULL DEFAULT 0`, so the
rating element is omitted entirely rather than rendering `0.0`, and "New" is never styled as
though it were a score.

**Missing media is not a quality signal.** The fallback is a **neutral tile**, never a human
silhouette — drawing the absence of a *picture* as the absence of a *person*.

---

## 7. See the work

**Placement: below the complete grid**, so provider discovery stays the page.

**A doorway into the Reels experience that already exists.** It owns no playback and builds
no second Reels implementation — it draws stills and routes to the tab.

- **104 × 168 portrait tiles**, every tile the same size. **No single reel is promoted into
  a hero card**, and **nothing autoplays**.
- A **small provider identity line** beneath each tile, `caption` at `textSecondary`. A wall
  of unlabelled clips on a marketplace reads as stock footage; naming the provider is what
  makes it somebody's work.
- Attribution resolves **after** the set is final and **cannot filter it** — a reel whose
  provider name is unreadable still appears, unnamed.
- **Ordered by recency alone.** No like count, view count or engagement is even selected.

*"See the work"* — not *"these are the best providers"*.

**Where the stills come from.** Every product-created video post carries one, guaranteed at
the shared upload boundary: `lib/storage.ts` generates a still from the uploaded video and
**fails the whole upload if it cannot**, so a video row without a still cannot exist. This
row therefore renders from real product video, not only from seeded content.

> *Addressed in Session 5 (2026-09-15), engineering-complete in PR #112 and **awaiting a real
> device upload** before it is called closed — the fix depends on a native module. It
> previously read as a deferred defect here: nothing wrote `thumbnail_url`, so this row dropped
> every product-created video while the Reels tab played the same clip happily.*

---

## 8. Community

**Secondary, and below provider discovery.** Capped, and hidden inside a category filter for
the same reason the lanes are — the viewer has already narrowed on purpose.

It is a doorway onto the marketplace, not a replacement for it, and **it reorders nothing
above it**. Community is not, and does not become, primary navigation.

---

## 9. Spacing rhythm

One **`SECTION_GAP` of 32** shared by every Discover section, matching the browse heading's
own top margin, so *From people you follow → Everyone on Third → See the work* breathe
identically.

The load-more control sits **20** above, not 32 — a control belongs nearer the thing it
extends than the section that follows it.

20pt outer margin, 12pt column gap, no containers and no separators between sections. The
rhythm does the dividing.

---

## 10. The rule that outranks the layout

**Social activity and engagement never affect provider ranking or worth.**

Following, posting, likes and views influence nothing about placement — not the lanes, not
the grid, not search. The separation is structural: `lib/discovery.ts` has no follow input,
`DiscoveryProvider` carries no social field, and `lib/discoverSocial.ts` imports neither
ranking module.

Guards: `__tests__/guards/socialSignalSeparation.test.ts`,
`__tests__/guards/discoveryFairness.test.ts`, `__tests__/guards/discoverRedesign.test.ts`.
