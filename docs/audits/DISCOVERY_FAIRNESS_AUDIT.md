# Discovery / Fairness — audit and bounded fixes

**Status:** Historical (dated snapshot). Not current-state documentation — the durable
operational answer is [../operations/DISCOVERY_OPERATIONS.md](../operations/DISCOVERY_OPERATIONS.md).
**Date:** 2026-09-13. **Against:** `main` @ `e78d819`, branch `feat/discovery-fairness`.
**Environments:** every live check against **non-production** `wcoyjeklscuqsumpjpfo`.
**Production `kxregomuawwcqvisuhtr` was never connected to, linked, migrated or queried.**

Core principle being tested: **"the algorithm should rank content, not secretly rank the worth of
the provider"** — and the locked rule that **providers who post nothing must not be penalised in
marketplace discovery.**

**Headline: the lane architecture already honours both, and does so structurally rather than by
convention. Three objective defects were found at its edges and fixed. One ranking question is
genuinely a product decision and is returned rather than answered.**

## 1. Surface inventory

| Surface | Relation | Ordering | Approved | Block-filtered | Deleted-filtered |
|---|---|---|---|---|---|
| Discover **lanes** (`fetchDiscoveryPool` → `buildDiscoveryLanes`) | `providers_visible` | per-lane, see § 5 | ✅ | ✅ | ✅ |
| Discover **complete grid** (`useProviders`) | `providers_visible` | `is_featured` ▼, `average_rating` ▼, `id` ▲ | ✅ | ✅ | ✅ |
| **Provider search** (`useProviderSearch`) | `providers_visible` | `average_rating` ▼, limit 20 | ✅ | ✅ | ✅ |
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
the grid. They are absent from exactly one lane — **Popular Near You** — and that lane *excludes*
them rather than ranking them last, because it is about a track record and having none is not a
worse one.

**This is not a confirmed fairness defect at the lane level.** It *is* one in the grid and in search
— see § 12.

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
**Near You is always empty today** and *Popular Near You* correctly renames itself *"Popular on The
Book"*. That is a data-population gap, not a logic defect — and prompting providers to set a
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

## 12. Product decisions required — implementation stopped on these

### Decision 1 — how should unrated providers be ordered in the grid and in search? **(the one that matters)**

The grid orders `average_rating` ▼ and search orders `average_rating` ▼ limit 20. Because the stored
value for an unrated provider is `0`, **they sort below every rated provider, permanently, on both
surfaces.** The codebase has already decided that `0` means *not rated* for **display**
(`displayRating`); using it as a **sort key** contradicts that decision. But what should replace it is
a ranking weight, and ranking weights are not engineering's to choose.

| Option | What it does | Trade-off |
|---|---|---|
| **A — leave it** | Unrated stays last on both surfaces | Simplest; but a new provider is bottom-of-list on the two highest-traffic surfaces, and the lanes are doing all the fairness work alone |
| **B — order unrated by a neutral signal, after rated** (recommended) | Rated providers by rating; unrated after them, ordered by the same deterministic tie-break the lanes use, not by id | Keeps rating meaningful, removes "0 = worst" while changing nothing about who is *eligible*. Small, explainable, testable |
| **C — interleave** | Mix unrated into the rated ordering at a fixed cadence | Most opportunity for new providers; hardest to explain to a client wondering why an unrated provider is above a 4.8 |

**Recommendation: B.** It is the option that follows from a rule already locked (0 is an absence, not
a verdict) without inventing a new ranking philosophy, and it is the only one of the three whose
behaviour a provider could be told in one sentence.

### Decision 2 — does `is_featured` stay a ranking hook?

| Option | |
|---|---|
| **A — remove it from the grid's ORDER BY** (recommended) | It is inert, it is unset, and leaving it means one `UPDATE` silently pins somebody above the whole marketplace |
| **B — keep it and record a decision** authorising curated placement, with who may set it and on what basis | Honest if curation is wanted |
| **C — leave undecided** | The current state: a live hook with no ruling behind it |

**Recommendation: A**, and if curated placement is ever wanted, it should arrive as its own decision
with a visible label — which the "Featured" badge already exists to provide.

### Decision 3 — does search rank by relevance, or only by rating?

Search currently orders **only** by rating, so among matching providers a near-exact name match can
sit below a loosely-matching higher-rated one, and `limit 20` can cut it off entirely. Adding relevance
tiers (exact name › name contains › category › bio) is a ranking design, not a bug fix.
**No recommendation offered** — this is the one where the product intent genuinely isn't implied by
anything already decided.

### Decision 4 — does "Popular Near You" ship in beta?

It is the only lane that ranks on a track record, and in a 25–30 cohort it will show roughly the same
five providers to everyone. Keeping it is defensible (it ranks marketplace facts, and excludes rather
than demotes those without them); dropping it for the closed beta is also defensible. **Not
engineering's call.** Everything else about it is already fair.

**Not needed:** a minimum-review threshold (rating already requires a revealed review to exist at
all), variety rotation (measured concentration is 3 of 5), and any new-provider "boost" beyond the
existing New lane.

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
| Jest | **1076 / 1076**, 54 suites (was 1055) |
| B5B (non-prod) | **2274 / 2274**, 0 failed, zero residue |
| Concurrency harness | see PR — unchanged surface, no SQL touched |
| Migrations | **173 local == 173 applied**, zero mismatched — **no migration added** |

**No forward migration was needed.** Every fix is application code; no schema, policy, trigger or
grant changed, so no applied migration was touched.
