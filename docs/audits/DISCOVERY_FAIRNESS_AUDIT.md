# Discovery / Fairness — audit and bounded fixes

**Status:** Historical (dated snapshot). Not current-state documentation — the durable
operational answer is [../operations/DISCOVERY_OPERATIONS.md](../operations/DISCOVERY_OPERATIONS.md).
**Date:** 2026-09-13. **Against:** `main` @ `e78d819`, branch `feat/discovery-fairness`.
**Environments:** every live check against **non-production** `wcoyjeklscuqsumpjpfo`.
**Production `kxregomuawwcqvisuhtr` was never connected to, linked, migrated or queried.**

Core principle being tested: **"the algorithm should rank content, not secretly rank the worth of
the provider"** — and the locked rule that **providers who post nothing must not be penalised in
marketplace discovery.**

**Headline: the lane architecture already honoured both, and did so structurally rather than by
convention. Three objective defects were found at its edges. Four product decisions were returned to
the PM, ruled on, and implemented — see § 12, which is where this document's current conclusions
live. Sections 1–11 record the state as FOUND, before those rulings; where a row there disagrees with
§ 12, § 12 is what shipped.**

## 1. Surface inventory

| Surface | Relation | Ordering | Approved | Block-filtered | Deleted-filtered |
|---|---|---|---|---|---|
| Discover **lanes** (`fetchDiscoveryPool` → `buildDiscoveryLanes`) | `providers_visible` | per-lane, see § 5 | ✅ | ✅ | ✅ |
| Discover **complete grid** (`useProviders`) | `providers_visible` | ~~`is_featured` ▼, `average_rating` ▼, `id` ▲~~ → **`average_rating` ▼, `discovery_tiebreak` ▲** | ✅ | ✅ | ✅ |
| **Provider search** (`useProviderSearch`) | `providers_visible` | ~~`average_rating` ▼, limit 20~~ → **relevance tier, then rating, then tie-break** | ✅ | ✅ | ✅ |
| **Category results** | `providers_visible` (grid, `category_id`) | as grid | ✅ | ✅ | ✅ |
| **Nearby** screen (`app/nearby`) | `providers_visible` via `useProviders` | as grid | ✅ | ✅ | ✅ |
| **Top Rated** screen (`app/top-rated`) | `providers_visible` via `useProviders` | local `average_rating ?? 0` ▼ | ✅ | ✅ | ✅ |
| **Post-decline alternatives** (`declined.tsx`) | ~~`providers`~~ → **`providers_visible`** | `average_rating` ▼, limit 3 | ✅ | ❌ → **✅ fixed** | ✅ |
| **Open Today** module | `providers_open_today()` RPC (SECURITY INVOKER) | n/a — membership only | ✅ | ✅ | ✅ |
| **Provider profile** (direct open) | base `providers` | n/a | — | **deliberately not** (OQ-076 / PD-090) | ✅ |
| **Live count** stat | base `providers`, `count` only | n/a | ✅ | n/a — a number, no identity | ✅ |
| Reels / Community provider links | `community_posts_visible`, `providers_visible` | content order, not provider order | ✅ | ✅ | ✅ |

**No Reel-linked or Community-linked path ranks providers.** Those surfaces order *content*; a
provider link on a post is navigation, not placement.

## 2. Discoverability rule

Approved **and** not deleted/pending-deletion **and** not blocked with the viewer.

**The two filters live in different places, and that is the whole story of the defect found.**
Deletion is enforced at the **base table** — `providers_public_read` is

```
(NOT account_unavailable(user_id)) OR user_id = auth.uid() OR caller_deals_with_provider(id)
```

**which carries no block predicate at all.** Blocks are filtered only by `providers_visible`
(PD-089). So any surface querying `public.providers` to build a *list* shows blocked providers.

## 3. Visible ≠ bookable — audited, not assumed

| State | Visible | Bookable |
|---|---|---|
| Approved, service, availability | Yes | Yes |
| Approved, **no availability** | **Yes** | No |
| Approved, **no active service** | **Yes** | No |
| De-approved | No | No |
| Pending deletion / deleted | No | No |
| Blocked with viewer | No | No |

Matches the stated product rule: a valid public provider is **not** hidden merely for being
temporarily unbookable. Go Live still gates on profile basics + photo + one active service.

## 4. Social neutrality — PASS, structurally

`DiscoveryProvider` — the only type the lane rules see — carries **no** content field: no post
count, no reel count, no follower count, no likes, views or engagement. A social signal cannot reach
ranking without editing the type, the mapping and the module.

Swept TypeScript and SQL for accidental joins, ordering and cached values. **Nothing found.**
`follower_count` *is* selected into `PUBLIC_PROVIDER_FIELDS` and displayed as a stat on a profile the
viewer already opened — **display, never ordering** — and the provider profile deliberately reads a
live RPC because the stored column is stale. `is_trending` exists but **nothing ever sets it**.

Already covered by `__tests__/lib/discovery.test.ts` § "marketplace ranking never rewards social
content"; now also by the ranking-column write guard in
`__tests__/guards/discoveryFairness.test.ts`.

## 5. Canonical reputation — PASS

`provider_reputation_canonical()` is the single source; `average_rating`, `review_count`,
`rating_client_count` and the `rating` mirror are maintained by the recompute and **enforced by a
trigger that refuses any stored reputation number the canonical function did not produce, including
one written by `service_role`** — `providers_reputation_is_derived_ins` / `_upd`, both confirmed
live. Search's `minRating` filter and its ordering both name `average_rating`, not the mirror.

**No stale rating authority anywhere.** No client role holds UPDATE on any reputation column.

## 6. New-provider fairness — PASS at the lane level

Measured on a representative 28-provider cohort (5 established with bookings and ratings, 4 joined
in the last 5 days, 23 unrated, a third open today):

| Metric | Measured |
|---|---|
| Providers appearing in ≥1 lane | **28 / 28** |
| Providers in **no** lane | **0** |
| Max lanes occupied by any one provider | **3 of 5** |
| Top-5 concentration | 3, 2, 2, 2, 2 |
| **New** providers surfacing | **4 / 4** |
| **Unrated** providers surfacing | **23 / 23** |

A provider approved today with nothing behind them appears in **New to The Book** (30 days),
**Near You** (if they set a neighborhood), **Open Today** (on published days), **Worth a Look**, and
the grid. As found, they were absent from exactly one lane — **Popular Near You** — and that lane
*excluded* them rather than ranking them last, because it is about a track record and having none is
not a worse one. **That lane is now deferred entirely** (§ 12, ruling 4), so a new provider is absent
from no surviving lane at all.

**This was not a confirmed fairness defect at the lane level.** It *was* one in the grid and in
search, and § 12 is where both were fixed.

## 7. Domination / variety — PASS

`LANE_LIMIT = 12` on every lane identically; ties broken by a deterministic hash of the id, which
the existing suite asserts is **not** ordered by id (that would permanently favour early signups) and
is stable across renders. `worth_a_look` is an exposure guarantee: it holds everyone the rows above
missed, and `providersWithNoLane()` exists so the claim is checkable rather than asserted.

Max concentration measured at 3 of 5 lanes, and a provider legitimately near you, open today and new
is three true facts rather than favouritism. **No rotation or quota is needed**, which matches the
instruction not to invent one.

## 8. Location — DATA IS NOT THERE YET; documented rather than invented

**There is no latitude or longitude column anywhere.** Location is two provider-typed free-text
fields, `location` and `neighborhood`. Proximity is therefore a case- and space-insensitive **text
match**: same neighborhood, else same city. No distance, no radius, no sort by how far.

**No precise-address exposure.** Verified live: **no** column matching address / street / zip /
postal / lat / lon is granted SELECT to `anon` or `authenticated` on `providers`.

**Current non-production reality: 0 of 6 providers have set a neighborhood or a location.** So
**Near You is always empty today**, and *Popular Near You* silently renamed itself *"Popular on The
Book"* — which is part of why ruling 4 defers it. That is a data-population gap, not a logic defect — and prompting providers to set a
neighborhood would do more for discovery than any ranking change. **No distance-based ranking factor
was introduced**, because the data cannot support one honestly.

## 9. Availability — supports "open today" only

`providers_open_today()` evaluates published working hours for today's weekday minus blocked dates
against **server** time. It means **open**, not "has a free slot" — booked time is deliberately not
subtracted, because that needs a slot engine this beta does not have.

So the backend truthfully supports **Open Today** and **no availability configured**. It does **not**
support "available within a future window", and **"Available Soon" was therefore a false label** —
fixed in § 11. A failed lookup returns `null`, not an empty set, so "we could not ask" never renders
as "nobody is open".

## 10. Lanes — the existing set is the smallest coherent model

Five lanes already exist, each with a subtitle stating its own rule, over a complete grid. Eligibility,
ordering and empty-state are defined per lane (a lane with nobody in it is dropped rather than shown
empty). **No new lane is proposed.** The architecture already matches the "visible, explainable lanes
over one opaque ranking" principle, so the smallest coherent model is the one that is there — with one
label corrected.

## 11. Objective defects found, and fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| **D1** | **Post-decline alternatives leaked blocked providers.** `declined.tsx` read base `providers`, which has no block predicate — so the app actively **recommended** a provider the client had blocked. | Non-prod with a control: **no block → base=1, view=1; after block → base=1, view=0**. Policy text confirms no block predicate. | Read `providers_visible` |
| **D2** | **Unrated providers entered the lane rules as rating `0`.** `averageRating: p.average_rating ?? p.rating` never yields null (both columns are `NOT NULL DEFAULT 0`), violating `DiscoveryProvider`'s own documented `null` contract and bypassing `displayRating` — the one decided answer that 0 is *not rated*, since the scale starts at 1. In Popular it ranked an unrated provider below a one-star one. | Source + the type's own docstring | Use `displayRating(p)` |
| **D3** | **A lane titled "Available Soon" over data that only means "open today".** Its own subtitle said "Open today, based on the hours they published". PD-112: a headline may not assert what its body calls something else. | `availableToday` semantics; no slot engine exists | Title → **"Open Today"** |

**Red-green verified:** reverting all three fails 5 assertions in
`__tests__/guards/discoveryFairness.test.ts`; restored, 21/21 pass.

**Not fixed, because it is inert and not a defect:** `is_featured` is the grid's first sort key and
its column comment calls it "Admin-curated". **Nothing in the product ever sets it** — the only
writes anywhere are erasure setting it `false`, no client role holds UPDATE, and **0 rows have it
true**. It remains a hook that would pin a provider above the entire marketplace if set. Recorded in
§ 12 as a decision, not silently removed.

## 12. Product decisions — ALL FOUR RULED ON, 2026-09-13, and implemented

The audit stopped on these and returned options. The PM ruled on all four; this section records the
rulings and what was built.

### Ruling 1 — UNRATED IS NEUTRAL, NOT ZERO QUALITY

An unrated provider is not coerced into a rating of `0` for ranking or display. Rating may sort
**after** the surface's own primary rule; unrated providers follow the rated ones within that
otherwise-equal group and are then ordered by the existing deterministic tie-break. **Rating presence
may not override user intent.**

**Implemented:**

- **Search:** relevance tier → canonical rating among the rated → unrated → tie-break.
- **Grid:** rating descending (which already places rated before unrated, since the stored value for
  an unrated provider is `0`) → **`discovery_tiebreak`**.

**The grid needed a migration, and the reason is worth recording.** The ruling says unrated providers
use *the existing deterministic tie-break* — `tiebreak()` in `lib/discovery.ts`, which the lanes use.
The grid could not: it is **paginated server-side** (`range(offset, offset+19)`), so ordering must be
decided by the database or pagination tears, and PostgREST's `order=` takes a **column**, not an
expression. So the grid's second key was `id ASC`, which ordered **the entire unrated tail by signup
date, permanently, on the most-visited surface in the product** — today that is every provider.

`20261135000000` adds `providers.discovery_tiebreak`, `generated always as (md5(id::text)) stored`:
deterministic, stable across renders, meaningless, indexed to match the grid's ORDER BY, and
**writable by nobody at all** — which is the opposite of `is_featured`. md5 because it is IMMUTABLE
(a generated column requires it) and because it is **not monotonic in the tail**, the same
load-bearing property `lib/discovery.ts` explains.

**A second defect of the same class was found while asserting this** and is fixed in the same pass:
`fetchDiscoveryPool` ordered its 200-row pool by `id ASC`. Above 200 approved providers that makes the
pool **the oldest accounts**, and since the lanes can only rank what the pool contains, everybody past
the cut would be invisible in every lane. The cohort is far below 200 today so nothing was excluded —
the ordering was still the same durable advantage, one layer up. Now ordered on `discovery_tiebreak`.

### Ruling 2 — `is_featured` is OUT of marketplace ranking

No approved beta rule authorises a silent featured-provider override. **Removed from the grid's
ORDER BY.** The column remains and still drives the visible "Featured" badge — a label is not a
hidden reorder — but it may not reorder results, boost discovery, or override relevance or fairness.

Pinned by assertions that the grid's ORDER BY does not name it, that neither ranking module mentions
it, and that the search input type has no such field.

### Ruling 3 — SEARCH RELEVANCE TIERS

Implemented in `lib/providerSearchRank.ts` — pure logic, no I/O, same split as `lib/discovery.ts`.

| Tier | Qualifies |
|---|---|
| **1 — service or category** | The query matches a **published service name**, the provider's category name, or their free-text trade, on a **word boundary** |
| **2 — name** | Display name, business name or handle, on a word boundary **or** as a partial ("alex" → "Alexandra") |
| **3 — broader** | A loose (substring) service/category hit, or the bio, neighborhood or location |
| **4 — weak** | The database filter matched and the reason is not visible. **Still shown, last** |

Then: **canonical rating descending within a tier** → **unrated after rated** → **`tiebreak()`**, the
same function the lanes use. **No rating difference can cross a tier boundary.**

**Service and category outrank name deliberately:** somebody searching "balayage" is describing the
work, not the person, so a provider who performs it answers better than one whose business name
contains the word. The top tier requires a **word boundary**, which is stricter than the database's
`ilike %q%`, so a coincidental substring ("lash" inside "eyelashes") does not earn tier 1.

**Why the pool is fetched and ranked client-side:** tiers depend on the **service names** a provider
publishes (another table) and on a word-boundary match PostgREST cannot express. Leaving
`order(rating).limit(20)` on the server would let the server choose **which twenty** the client is
allowed to rank — the original defect, one step earlier. The pool is bounded at 200, ranked, then
trimmed to 20.

**Not introduced:** semantic or AI search, embeddings, learned models, social engagement, follower
counts, Reels or Community activity, or any hidden popularity score. The input type
(`SearchableProvider`) carries none of them, and a test asserts the shape.

### Ruling 4 — "POPULAR NEAR YOU" DOES NOT SHIP

Deferred, **not because it was unfair.** It ranked completed bookings and reviews — marketplace facts
— and excluded providers with no track record rather than ranking them last. The problem is **"Near"**:
no lat/long model, free-text location, no distance truth, and zero providers with a populated
neighborhood. The label would imply a precision the product cannot establish, and with `near` always
empty it silently retitled itself "Popular on The Book" — a popularity row nobody approved.

**The lane code is kept dormant** (permitted by the ruling) so the reasoning survives for whoever
re-enables it; `buildDiscoveryLanes` never returns it, so it cannot surface. **No replacement location
lane was invented.** Reconsider only after provider neighborhood / service-area data is populated and
audited.

### A regression this pass caused, caught by the committed suite

`20261135000000` broke one erasure assertion: *"a departing provider's server-derived counters can
still be recomputed"* began failing with `PT440`.

`refuse_provider_write_when_account_inactive` decides "is this a recompute or is this the caller
editing their presence" by comparing `to_jsonb(new) - v_derived` against `to_jsonb(old) - v_derived`.
**PostgreSQL computes generated columns AFTER before-row triggers**, so `new.discovery_tiebreak` was
NULL inside the trigger while `old` held the md5 — a difference that is not a difference. A provider
in their 30-day grace period could no longer have their counters recomputed, which is a real erasure
regression (a booking completed by somebody else would have started failing).

Fixed by `20261136000000`, which adds the column to the allow-list where it belongs on the array's own
terms — *"columns no person sets"* — and it is the strongest member of that set, being writable by
nobody at all.

**Worth carrying forward:** any whole-row `to_jsonb(new) = to_jsonb(old)` comparison in a BEFORE
trigger is broken by adding a generated column, and it fails in the **safe-looking** direction — a
refusal, not a leak — so it surfaces as a mysterious permission error rather than as anything that
points at the cause.

## 13. Duplicated-authority inventory

| Rule | Server authority | UX mirror | Risk |
|---|---|---|---|
| Provider visibility | **`providers_visible`** (block) + `providers_public_read` (deletion) | `.eq('is_approved', true)` at each call site | **This was the defect.** One call site read the wrong relation. Now guarded by a test naming the surfaces |
| Canonical rating | `provider_reputation_canonical()` + `reputation_is_derived` trigger | `displayRating()` — one helper | Low; the mirror column is trigger-constrained |
| Block exclusion | `contact_blocked_provider()`, the `_visible` views, PT427 triggers | feed reads | Low |
| Provider eligibility | `is_approved` + write policies | per-call-site filter | **Mirror is a filter repeated at 6 call sites.** Harmless today (all agree), but it is convention, not enforcement — a seventh call site could omit it. Candidate for one shared query helper, deliberately **not** refactored here |
| Availability | `providers_open_today()` | `fetchOpenTodayProviderIds` (null vs empty) | Low; the null/empty distinction is the honest one |
| Lane rules | **none — client-side** | `lib/discovery.ts` | **Acceptable and worth stating:** the lanes decide *attention*, never *access*. Every provider they order was already authorised by the view, so a client that ignored the lane rules entirely could still only see providers it may see |

**No duplicated server-authoritative ranking logic exists.** The only server ranking input is the
grid's/search's `ORDER BY`, which is a single query in each case.

## 14. Security / privacy conclusion

**No discovery change weakens privacy, and one strengthens it.** Verified live:

- `providers_visible`, `posts_visible`, `clients_public` — all `postgres`-owned **definer** views
- `providers_visible` readable by `anon` and `authenticated`, which is what a public marketplace is
- **no** address / street / zip / postal / lat / lon column granted to any client role
- `providers_open_today()` is **SECURITY INVOKER**, so it can only return providers the caller could
  already see — the right choice for a function returning provider ids
- `account_unavailable()` remains granted to client roles: the OQ-076 residual, **accepted** for the
  closed beta (PD-090), unchanged here and not narrowed

**D1 was a privacy fix**: a blocked provider being recommended to the person who blocked them is a
safety outcome, not only a filtering bug.

## 15. Validation

| Check | Result |
|---|---|
| typecheck | clean |
| `lint:ci` | 0 errors, 209 warnings (baseline 210) |
| Jest | **1105 / 1105**, 56 suites |
| B5B (non-prod) | **2282 / 2282**, 0 failed, zero residue |
| Concurrency harness | 224 / 224, zero residue |
| Migrations | **175 local == 175 applied**, zero mismatched |

**Two forward migrations, both genuinely required.** `20261135000000` (the ordering key the ruling
needs, plus republishing `providers_visible` to expose it) and `20261136000000` (the generated-column
BEFORE-trigger correction above). **No applied migration was edited.** The view was republished from
`pg_get_viewdef` rather than retyped, and both of its security predicates — the bidirectional block
check and `account_unavailable` — are re-asserted in B5B, because a `create or replace view` is a full
rewrite and that is exactly when a predicate gets dropped.
