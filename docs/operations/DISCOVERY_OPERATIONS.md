# Discovery and fairness — Operations and support note

**Status:** Authoritative. **Anchor:** `main` @ `e78d819` plus this branch. **Not merged.**
**Audit:** [../audits/DISCOVERY_FAIRNESS_AUDIT.md](../audits/DISCOVERY_FAIRNESS_AUDIT.md).
**Policy:** PD-089 (block filtering lives in the views), PD-090 / OQ-076 (accepted inference
limitation), PD-091 / PD-092 / PD-094 (canonical reputation), PD-104 (deleted accounts leave
public surfaces), PD-112 (a headline may not assert what its body calls future).

Written for whoever answers *"why am I not showing up?"* — which is a fair question from someone
whose income depends on the answer, and the question this whole surface has to be able to survive.

---

## 1. Who is discoverable

A provider appears in discovery when **all** of these are true:

| Requirement | Where it is enforced |
|---|---|
| `is_approved = true` | Every discovery query filters it |
| Account not deleted or pending deletion | `providers_public_read` — the **base table** policy, via `account_unavailable()` (PD-104) |
| No block in either direction with the viewer | `providers_visible` — **the view**, not the table (PD-089) |

**The two filters live in different places, and that matters.** Deletion is filtered at the base
table, so it cannot be bypassed. **Blocks are filtered only by `providers_visible`** — the base
table's SELECT policy carries no block predicate at all. A surface that queries
`public.providers` to build a list therefore shows blocked providers. That was a live defect on the
post-decline alternatives screen and is now fixed and guarded.

**What does NOT affect discoverability:** having no reviews, having no bookings, having no Reels,
having no Community posts, having no followers, being new, or being temporarily unbookable.

## 2. Visible is not the same as bookable

Keep these apart when answering a support question, because a provider can be one and not the other.

| | Visible in discovery | Bookable |
|---|---|---|
| Approved, complete profile, active service, availability set | Yes | Yes |
| Approved, but **no availability configured** | **Yes** | No |
| Approved, but **no active service** | **Yes** | No |
| **De-approved** | No | No |
| Pending deletion or deleted | No | No |
| Blocked with the viewer | No (for that viewer) | No |

**A provider is not hidden merely for being temporarily unbookable.** That is deliberate: a client
finding someone and discovering they cannot book today is a worse outcome than not finding them, but
it is recoverable — whereas a provider invisible because they have not finished setting up their
calendar has no way to learn that from the app. **Go Live** still requires profile basics, a profile
photo and at least one active service; those gate going live, not staying visible afterwards.

## 3. What affects marketplace ranking

**Discover is five named lanes, each of which states its own rule, over a complete grid.** The lanes
order attention; the grid below them still lists every approved provider, so a lane being full never
removes anybody from discovery.

| Lane | Who is in it | How it is ordered |
|---|---|---|
| **Near You** | Same neighborhood, or same city when neighborhoods do not match | Deterministic tie-break. **Not** by rating or bookings — it answers "who is around here" |
| **Open Today** | The server says they published working hours for today and have not blocked the date | Deterministic tie-break |
| **New to The Book** | Joined in the last **30 days** | Newest first |
| **Popular Near You** | Has **at least one completed booking** | Completed bookings, then reviews |
| **Worth a Look** | Everyone the rows above did not show | Deterministic tie-break |

Every lane is capped at **12**. That is a ceiling, not a quota: it stops one row becoming the whole
screen, and it applies to every lane identically.

**Measured on a representative 28-provider cohort:** every provider appeared in at least one lane,
nobody was left out, and the most any single provider occupied was **3 of 5** lanes. A provider can
legitimately be near you, open today and new at the same time — that is three true facts, not
favouritism.

## 4. What explicitly does NOT affect ranking

**No social or content signal reaches marketplace placement.** Not Reel likes, views, comments or
saves; not Community likes, replies or bookmarks; not follower count; not how often somebody posts.

This is structural rather than a policy anybody has to remember: the type the lane rules receive
(`DiscoveryProvider`) **has no content field at all**, so a content signal cannot reach them without
someone editing the type, the mapping and the module — three deliberate edits a reviewer would see.

**Say this plainly to a provider who asks whether posting more would help them get booked: it would
not, and it is not supposed to.** Reels decides which video plays next. It has nothing to do with who
appears in the marketplace. A service marketplace that quietly required content production would have
changed what it charges providers without telling them.

**Also not a ranking input:** who a provider knows, how long they have been on the platform beyond
the 30-day New window, or anything an operator can type into a field.

## 5. How a new provider gets a real chance

A provider approved today, with no reviews, no bookings and no posts:

- appears in **New to The Book** for 30 days
- appears in **Near You** if they set a neighborhood
- appears in **Open Today** on days they have published hours
- appears in **Worth a Look** whenever the other rows did not show them
- appears in the complete grid

**They are absent from exactly one lane — Popular Near You — and that lane excludes them rather than
ranking them last**, because it is about a track record and having none is not a worse one.

## 6. How unrated providers are shown

**A provider with no reviews shows no rating.** Not `0.0`, not zero stars, not "unrated" as a
verdict — the rating simply is not rendered.

`providers.average_rating` is `NOT NULL DEFAULT 0`, so a brand-new provider's stored value **is**
`0`. Every surface goes through one helper (`displayRating`) which treats `0` as *"not rated yet"*,
because **the scale starts at 1**. If you ever see `★ 0.0` in the app, that is a bug — report it.

**Known limitation, and it is the open ranking question:** the complete grid and search results are
ordered by rating descending, and because the stored value for an unrated provider is `0`, they sort
**below every rated provider**. That is a ranking behaviour awaiting a product ruling, recorded in
the audit as the one open decision. It does not remove anybody from discovery, and the lanes are not
affected.

## 7. How "Open Today" should be read

**"Open Today" means the provider published working hours for today's weekday and has not blocked
today's date.** It is evaluated against **server** time, never a device clock.

**It does NOT mean they have a free appointment.** Booked time is deliberately not subtracted —
that needs a slot engine this beta does not have — so the label under-claims rather than telling a
client somebody is free when they are not.

**Never tell a client that "Open Today" means they can get in today.** If they ask, the honest answer
is: it means that provider is working today, and you will find out about a specific time by
requesting one.

The lane was titled *"Available Soon"* until this audit, over a subtitle that correctly said "open
today". That was fixed: a headline may not promise more than its own body (PD-112). **"Available
Soon" must not come back** unless the backend can actually establish a next free slot.

## 8. Location, and what it cannot do yet

**There is no latitude or longitude anywhere.** Provider location is two free-text fields —
`location` ("Houston, TX") and `neighborhood` ("Midtown") — typed by the provider.

So proximity is a **text match**: same neighborhood, else same city, case- and space-insensitive.
There is no distance, no radius and no sorting by how far away somebody is, and **there cannot be
until the data supports it.**

**Nothing exposes a precise address.** No street address is published in any discovery surface, and
none is stored for ranking. A provider's own service address is not part of this.

**Current non-production reality, stated because it changes what the lanes do:** **zero** providers
have set a neighborhood or a location. With no location data, **Near You is always empty** and
*Popular Near You* correctly renames itself *"Popular on The Book"*. This is a data-population gap,
not a logic defect — but it means location-based discovery is currently untested against real data,
and prompting providers to set a neighborhood would do more for discovery than any ranking change.

## 9. Known beta limitations

1. **The grid and search order by rating**, so unrated providers sort last. Open product question.
2. **No location data in practice**, so Near You is empty today.
3. **No slot engine**, so "Open Today" is an open state and never a free appointment.
4. **`is_featured` is the grid's first sort key.** Nothing in the product ever sets it — the only
   writes anywhere are erasure setting it `false`, and no client role can write it — so it is inert.
   It remains a hook that would pin a provider above the entire marketplace if anyone ever set it.
   **If you are asked to "feature" somebody, that is a product decision, not a support action.**
5. **`is_trending` is never set either**, so the "Trending" badge is unreachable.
6. **Search returns at most 20 results** and does not rank by how well the match fits the query.

## 10. Fairness behaviour Operations should understand

- **There is no manual ranking dial, and that is on purpose.** An operator cannot raise or lower a
  provider's placement, and cannot pin a rating — that is enforced by a trigger that refuses any
  stored reputation number the canonical function did not produce, including from `service_role`.
- **"Why am I not showing up?" has a checkable answer.** Work down § 1: approved, not deleted, not
  blocked by that viewer. Then § 2 for bookability. Every lane states its own rule, so "why am I not
  in that row" is answerable from the provider's own data.
- **Do not promise placement**, to anybody, for any reason.
- **A provider asking whether to post more Reels to get booked should be told no.** Content and
  marketplace are separate systems, and telling them otherwise would make the promise false.
