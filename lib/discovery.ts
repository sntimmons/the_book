// Beta discovery lanes (Correction 3, items S and T). Pure logic, NO I/O — the
// same split as lib/obligationState.ts and for the same reason: these rules
// decide who gets seen, and they must be readable, testable and arguable without
// a database or a device in the way.
//
// ══ THE FAIRNESS RULE THAT OUTRANKS EVERYTHING ELSE HERE ══════════════════
//
// **A provider is NEVER ranked lower in marketplace discovery because they do
// not make social content.** Not by post count, not by reel count, not by
// followers, not by likes, not by views, not by "engagement", and not by any
// proxy for those. A barber who has never opened Reels and a barber who posts
// daily are ordered by the same signals: where they work, whether they are open,
// how new they are, and what their completed bookings and reviews say.
//
// This is a MARKETPLACE. Someone's livelihood is on the other side of it, and a
// service marketplace that quietly requires content production has changed what
// it is charging providers without telling them. Reels is a real surface and it
// is real social proof, but CONTENT RANKING AND MARKETPLACE RANKING ARE TWO
// DIFFERENT SYSTEMS: Reels decides which video plays next, and nothing in this
// file consults it. If a content signal ever appears in a lane input below, that
// is the defect, whatever else it improves.
//
// The `DiscoveryProvider` type is the enforcement: it carries no content field at
// all, so a content signal cannot reach this module without a type change that a
// reviewer has to see. `__tests__/lib/discovery.test.ts` asserts it too.
//
// ══ WHAT THIS IS AND IS NOT ═══════════════════════════════════════════════
//
// Item T is explicit about the shape: visible lanes, exposure and fairness
// guardrails, and the SIMPLEST INSPECTABLE logic — **no rigid percentage
// quotas**. There is no scoring model here, no weights to tune, no
// personalisation and no machine learning. Each lane is a filter and a sort that
// a person can read in ten seconds and check against a provider's own row.
//
// Nothing here decides who is APPROVED. Every provider is ELIGIBLE for a lane —
// `worth_a_look` catches everyone the other lanes missed — but `LANE_LIMIT` means
// a lane can still be full, so in a large market some providers will not fit into
// the rows. That is why the Discover screen keeps its complete grid BELOW the
// lanes: the lanes are an ordering of ATTENTION, never a filter on who exists,
// and `providersWithNoLane` at the bottom of this file is how a caller checks
// that it has not accidentally made them one.

/**
 * The only provider facts discovery is allowed to see.
 *
 * DELIBERATELY NARROW. There is no `post_count`, no `reel_count`, no
 * `follower_count` and no engagement field, because the fairness rule above says
 * none of them may influence marketplace placement — and a field that is not
 * here cannot be used by accident.
 */
export interface DiscoveryProvider {
  id: string
  /** The provider's own neighborhood string, as they entered it. */
  neighborhood: string | null
  /** Their broader location ("Houston, TX"). Used when neighborhoods do not match. */
  location: string | null
  /** When they joined. ISO from the server. */
  createdAt: string | null
  /** Completed bookings on The Book. A marketplace fact, not a social one. */
  totalBookings: number | null
  /** Their revealed review average, or null when they have no revealed reviews. */
  averageRating: number | null
  /**
   * The SERVER's answer to "are they open today?" — published working hours for
   * today's weekday, minus blocked dates, evaluated against server time
   * (`public.available_today`). Never recomputed from a device clock, and it
   * means OPEN, not "has a free slot".
   */
  availableToday: boolean | null
}

export type LaneKey =
  | 'near_you'
  | 'available_soon'
  | 'new_to_the_book'
  | 'popular_near_you'
  | 'worth_a_look'

export interface DiscoveryLane {
  key: LaneKey
  /** The lane's own name, shown to the viewer. */
  title: string
  /**
   * One line saying what put these providers here.
   *
   * EVERY LANE HAS ONE, and it is not decoration. A lane whose rule is invisible
   * is a lane a provider cannot argue with — and "why am I not in that row" is a
   * fair question for someone whose income depends on the answer.
   */
  subtitle: string
  providers: DiscoveryProvider[]
}

export interface DiscoveryInputs {
  providers: DiscoveryProvider[]
  /** The viewer's neighborhood, when they have set one. */
  viewerNeighborhood?: string | null
  /** The viewer's city / location string, when they have one. */
  viewerLocation?: string | null
  /** Server-relative "now", in ms. Injected so the rules are testable. */
  now?: number
}

/** A provider counts as NEW for their first 30 days. One number, stated once. */
export const NEW_PROVIDER_DAYS = 30

/**
 * The most providers any one lane will show.
 *
 * NOT a quota — item T rules those out, and this is the opposite of one: it is a
 * ceiling that stops a single lane from becoming the whole feed, and it applies
 * to every lane identically. `worth_a_look` is capped too, but only because a
 * screen has to end somewhere; nobody is EXCLUDED by it, since the grid below the
 * lanes still shows every approved provider.
 */
export const LANE_LIMIT = 12

/** Loose text match — same neighborhood, or same city — case- and space-insensitive. */
function sameArea(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** The city part of "Midtown, Houston" / "Houston, TX". */
function cityOf(location: string | null | undefined): string | null {
  if (!location) return null
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  return parts[parts.length > 1 ? 1 : 0]
}

function isNear(p: DiscoveryProvider, hood: string | null, location: string | null): boolean {
  if (sameArea(p.neighborhood, hood)) return true
  const viewerCity = cityOf(location)
  return !!viewerCity && (sameArea(cityOf(p.location), viewerCity) || sameArea(p.neighborhood, viewerCity))
}

function isNew(p: DiscoveryProvider, now: number): boolean {
  if (!p.createdAt) return false
  const at = new Date(p.createdAt).getTime()
  if (Number.isNaN(at)) return false
  return now - at <= NEW_PROVIDER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * A STABLE tiebreak that is not alphabetical and not creation order.
 *
 * Ordering ties by name would hand a permanent advantage to whoever is called
 * Aaliyah, and ordering by id would hand it to whoever signed up first — a
 * durable, invisible edge that compounds every time the feed is drawn. This
 * derives a fixed pseudo-random rank from the provider's id, so ties land in an
 * arbitrary but CONSISTENT order that favours nobody in particular. It is stable
 * across renders on purpose: a feed that reshuffled on every scroll would be
 * fairer and unusable.
 */
function tiebreak(id: string): number {
  // FNV-1a, then an xorshift finalizer. The finalizer is the load-bearing part:
  // a plain polynomial hash is MONOTONIC in the last character, so ids that
  // differ only in their tail ("a1", "a2", "a3") come out in exactly the order
  // they would have come out sorted — which is the durable advantage this
  // function exists to remove, hiding behind arithmetic. Proven by the test that
  // feeds it sequential ids.
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return h >>> 0
}

function byBookingsThenRating(a: DiscoveryProvider, b: DiscoveryProvider): number {
  const bookings = (b.totalBookings ?? 0) - (a.totalBookings ?? 0)
  if (bookings !== 0) return bookings
  const rating = (b.averageRating ?? 0) - (a.averageRating ?? 0)
  if (rating !== 0) return rating
  return tiebreak(a.id) - tiebreak(b.id)
}

function byNewestFirst(a: DiscoveryProvider, b: DiscoveryProvider): number {
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
  if (bt !== at) return bt - at
  return tiebreak(a.id) - tiebreak(b.id)
}

/**
 * Build the beta discovery lanes.
 *
 * Lanes are returned in the order they should be shown, and an EMPTY lane is
 * dropped rather than rendered as a heading with nothing under it — a row that
 * says "New to The Book" above a blank space tells the viewer the product is
 * broken, not that nobody is new.
 *
 * ── THE EXPOSURE GUARANTEE ────────────────────────────────────────────────
 *
 * `worth_a_look` is every provider no other lane picked up. It is what makes the
 * lane system safe to ship: without it, a provider who is not near the viewer,
 * not open today, not new and has no completed bookings yet — which describes
 * almost every provider in their second month — would appear in no lane at all,
 * and lanes would have quietly become a filter on who exists. It is a real lane
 * with a real name, not a dumping ground, and its rule is stated like every
 * other one's.
 *
 * It is subject to `LANE_LIMIT` like every other lane, so on a large market it
 * does not literally hold everyone. The screen is what closes that gap: the
 * lanes sit ABOVE the complete, paginated grid. A caller that renders these
 * lanes with nothing beneath them must check `providersWithNoLane` and account
 * for whoever it returns.
 */
export function buildDiscoveryLanes(inputs: DiscoveryInputs): DiscoveryLane[] {
  const { providers, viewerNeighborhood = null, viewerLocation = null } = inputs
  const now = inputs.now ?? Date.now()
  if (providers.length === 0) return []

  const near = providers.filter((p) => isNear(p, viewerNeighborhood, viewerLocation))
  const lanes: DiscoveryLane[] = []

  // NEAR YOU — proximity, and nothing else. Deliberately unsorted by rating or
  // bookings: this lane answers "who is around here", and letting the busiest
  // providers own the top of it would make it a popularity lane with a location
  // filter, which the next lane already is.
  if (viewerNeighborhood || viewerLocation) {
    lanes.push({
      key: 'near_you',
      title: 'Near You',
      subtitle: 'Providers working in your area.',
      providers: [...near].sort((a, b) => tiebreak(a.id) - tiebreak(b.id)).slice(0, LANE_LIMIT),
    })
  }

  // AVAILABLE SOON — the server said they are open today. Named "soon" rather
  // than "available now" because being open is not the same as having a free
  // slot, and the product does not know the second thing.
  lanes.push({
    key: 'available_soon',
    title: 'Available Soon',
    subtitle: 'Open today, based on the hours they published.',
    providers: providers
      .filter((p) => p.availableToday === true)
      .sort((a, b) => tiebreak(a.id) - tiebreak(b.id))
      .slice(0, LANE_LIMIT),
  })

  // NEW TO THE BOOK — the anti-incumbency lane, and the reason it is not sorted
  // by rating or bookings: a provider in their first month has neither, and a
  // lane FOR them that ranked on them would put the least new provider on top.
  lanes.push({
    key: 'new_to_the_book',
    title: 'New to The Book',
    subtitle: `Joined in the last ${NEW_PROVIDER_DAYS} days.`,
    providers: providers.filter((p) => isNew(p, now)).sort(byNewestFirst).slice(0, LANE_LIMIT),
  })

  // POPULAR NEAR YOU — the only lane that ranks on performance, and it ranks on
  // COMPLETED BOOKINGS AND REVIEWS. Those are marketplace facts: a person hired
  // them and a person rated them. No content signal reaches this comparison, and
  // a provider with no bookings yet is absent rather than ranked last — this lane
  // is about a track record, and having none is not a worse one.
  const popular = (near.length > 0 ? near : providers)
    .filter((p) => (p.totalBookings ?? 0) > 0)
    .sort(byBookingsThenRating)
    .slice(0, LANE_LIMIT)
  lanes.push({
    key: 'popular_near_you',
    title: near.length > 0 ? 'Popular Near You' : 'Popular on The Book',
    subtitle: 'Ranked by completed bookings and client reviews.',
    providers: popular,
  })

  // WORTH A LOOK — the exposure guarantee. See the note above the function.
  const shown = new Set(lanes.flatMap((l) => l.providers.map((p) => p.id)))
  lanes.push({
    key: 'worth_a_look',
    title: 'Worth a Look',
    subtitle: "Providers you haven't seen in the rows above.",
    providers: providers
      .filter((p) => !shown.has(p.id))
      .sort((a, b) => tiebreak(a.id) - tiebreak(b.id))
      .slice(0, LANE_LIMIT),
  })

  return lanes.filter((l) => l.providers.length > 0)
}

/**
 * Which providers did the lanes leave out?
 *
 * Exported so the exposure claim is CHECKABLE rather than merely asserted in a
 * comment, and used by the test suite. Empty whenever the lanes are not at their
 * limit; when it is not empty, the caller owes those providers a route to being
 * seen — which on the Discover screen is the full grid below the rows.
 */
export function providersWithNoLane(
  providers: DiscoveryProvider[],
  lanes: DiscoveryLane[],
): string[] {
  const shown = new Set(lanes.flatMap((l) => l.providers.map((p) => p.id)))
  return providers.filter((p) => !shown.has(p.id)).map((p) => p.id)
}
