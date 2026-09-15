# The Third visual system

**Authoritative.** The durable, cross-app design principles — the ones that outlive any one
screen. Screen-specific decisions live beside their surface (see
[DISCOVER.md](DISCOVER.md)); what is here should still be true a year from now.

This document describes what has been **approved and built**, not an aspiration. Where a
principle has a mechanical guard behind it, the guard is named — a rule nobody can break by
accident is worth more than a rule everybody agrees with.

---

## 1. What Third is trying to feel like

**Warm, welcoming, community-connected.** A Houston service marketplace where the work and
the people are the subject. Not luxury, not generic tech, not an AI-looking product.

The practical test: could this screen belong to a specific city and a specific trade, or
could it belong to any app? If the second, it is wrong, however clean it looks.

**What that rules out**, and these are house rules rather than taste:

- gradients as decorative identity, neon, glassmorphism
- excessive pills, cards, shadows and rounding
- centred marketing stacks inside working surfaces
- decorative metrics, unexplained status labels
- generic or synthetic-feeling provider imagery
- copy that sounds confident about something the product cannot do

**Real work, hands, providers and authentic service imagery** are the visual material. A
marketplace whose photographs could be stock is not showing anybody's business.

---

## 2. The semantic colour system

Colour is addressed by **role**, never by value. A screen asks for `bgCanvas` or
`textPrimary`; it never asks for Paper or `#F8F4EE`.

| Role | Light | Dark |
|---|---|---|
| `bgCanvas` | Porch `#F0EAE2` | Night Porch `#151719` |
| `bgSurface` | Paper `#F8F4EE` | Iron `#202326` |
| `bgElevated` | White | a step above Iron |
| `bgSubtle` | Linen | Ink |
| `textPrimary` | Ink `#211F1D` | Linen `#F1ECE5` |
| `textSecondary` | Moss Gray `#72766D` | Clay Dust `#D8CEC2` |
| `textOnAction` | Linen — **the same in both** | Linen |
| `borderSubtle` | Clay Dust | Moss Gray |
| `actionPrimary` | Mulberry `#713652` — **constant in both** | Mulberry |
| `statusLocal` | Cypress `#356A62` | lifted Cypress `#7FBDB2` |
| `statusOutcome` | Moss Gray | Clay Dust |
| `statusDanger` | `#9A4D4D` | lifted `#E09A9A` |
| `mediaScrim` | Ink — **the same in both** | Ink |

**Cypress means place and truthful status** — neighbourhood, locality, "open today". It is
the colour of *where*, not of *good*.

**Mulberry is the one primary action fill**, constant across schemes so a button keeps its
identity when the appearance changes.

**Danger is for genuine error and destruction only.** A no-show, a decline and a
cancellation are **outcomes**, not errors, and take `statusOutcome`. Reaching for the danger
treatment to add emphasis is how a product starts telling users that ordinary events are
failures.

**Font: Manrope, only.** The ramp (`displayHero` → `caption`) is the whole type system.

---

## 3. Light / Dark / System, and why it is not an inversion

Three states: an explicit Light or Dark choice, and System, which is the default.

**Every surface resolves from one tree.** There is no second stylesheet, no
`scheme === 'dark' ? … : …` branching, and no parallel dark implementation to keep in sync.
A screen that needs a per-scheme decision has a token missing, not a condition missing.

**A mixed surface model, not a flipped one.** Two roles are deliberately **identical in both
schemes** — `mediaScrim` and `textOnAction` — because a scrim over a photograph must not
invert, and lettering on media must stay legible whatever the viewer chose. That is what
lets the provider profile run its hero photograph straight into a dark identity band that
holds in Light *and* Dark from the same markup.

Elsewhere the two schemes behave differently on purpose:

- **Light** is warm and editorial — a paper ground, generous air, content floating on it.
- **Dark** is flatter, continuous and restrained. It is **not** Light with the colours
  swapped: stacking elevated cards on a dark canvas produces a tiled, heavy screen, so dark
  surfaces sit closer together and lean on spacing rather than elevation.

**Media keeps its prominence in both.** Photographs are the brightest thing on the screen in
either scheme, and nothing is dimmed to make chrome legible.

---

## 4. Containers, borders and spacing

**Restraint is the default.** Hairline borders and flat surfaces before cards; cards before
shadows; shadows almost never. A card inside a card is a mistake, not a hierarchy.

**Hairline-separated rows beat card stacks** for lists of facts — the booking detail and the
provider's booking terms are the reference implementation.

**Breathable spacing** on an 8-based scale (8 / 12 / 16 / 20 / 24 / 32 / 48), a 20pt outer
margin, and **one section rhythm per screen** expressed as a named constant so it cannot
drift apart section by section.

**Equal structural weight unless something has earned otherwise.** Discover's browse grid is
uniform for exactly this reason: variable tile heights chosen by list position handed the
first provider unearned prominence. Size is a claim; only make it when it is true.

---

## 5. Hierarchy and action emphasis

**One primary action per screen**, in Mulberry. Everything else is an outline, an icon or a
line of text.

A secondary control must never out-weigh the primary one — the provider profile's **Follow**
sits beneath **Request booking** for that reason, not beside it.

**State is carried in words, not only in colour.** A Follow button says "Following"; a
rating renders as a number beside its star. Colour may reinforce a state and may not be its
only carrier.

**If a control does not do anything, do not show it.** A destination that does not exist, a
badge nothing can set, a "coming soon" that is not coming — each is worse than an absent
row. This has removed real UI: Featured and Trending badges no column could set, See-all
links with nowhere to go, and ten dead Settings rows.

**A field the product cannot source is absent, not filled.** No dash, no placeholder, no
inferred value, no default presented as a specific provider's term. An empty-looking value
is a claim; absence is not.

---

## 6. Social and relationship content

**Social activity may support discovery. It may never visually imply provider quality or
marketplace rank.**

> *The algorithm should rank content, not secretly rank the worth of the provider.*

Following is a **relationship**. Posting is **optional activity**. Neither is a marketplace
fact, and neither moves a provider in any ranked surface.

Visually this means content surfaces carry **attribution and nothing evaluative**:

| | |
|---|---|
| Allowed | provider identity, and a subordinate timestamp |
| Never | rating, follower count, likes, views, engagement, badges, verification, completed bookings, price, or quality language |

The identity line answers *whose work is this*. It never answers *is this good*.

**The separation is structural rather than remembered.** `lib/discovery.ts` — which decides
placement — has no follow input at all, and `DiscoveryProvider` carries no social field, so
a social signal cannot reach ranking even by mistake. `lib/discoverSocial.ts` imports
neither and returns its own types.
Guard: `__tests__/guards/socialSignalSeparation.test.ts`.

**Completed bookings are context, never popularity** (PD-126): a count of finished work, not
of interest, never a ranking input, never visually dominant.

---

## 7. What is excluded from this system

**The founder-protected Welcome experience is out of scope.** `app/index.tsx`, the welcome
video and the first-open / setup flow are **not** migrated onto these tokens and must not be
changed as part of any visual-system work. Reopening it is an explicit Founder decision, not
a consistency argument.

---

## 8. Where this is already true

Bookings list and booking flow, booking detail, the provider profile, Me and Settings,
Discover, and **Reels** all resolve every colour from these tokens and support Light / Dark /
System from one tree. Guards assert zero colour literals on those surfaces.

**Reels is the surface that shows what the two scheme-invariant roles are for.** Nearly all of
its chrome reads `textOnAction` and `mediaScrim`, so it looks the same in Light and Dark — that
is §3 working, not a migration left half-done. Its screen-specific decisions, including the
Cypress treatment of the neighbourhood, live in [REELS.md](REELS.md) and **are not
cross-app rules**.

`components/ui/` holds the shared primitives — Button, Avatar, StatusBadge, TextField,
SearchInput, EmptyState, ErrorState, ProviderCard, BookingFlowScreen, TerminalStatement,
DayCell, TimeSlot, AcknowledgeRow, ReferencePhotos. **Prefer an existing primitive; propose
a new one only when a surface genuinely needs it.**
