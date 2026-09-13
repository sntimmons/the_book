// Provider search relevance. Pure logic, NO I/O — the same split as
// `lib/discovery.ts` and for the same reason: these rules decide who a searching
// client sees, and they must be readable, testable and arguable without a
// database or a device in the way.
//
// ══ THE RULING THIS IMPLEMENTS ════════════════════════════════════════════
//
// **SEARCH INTENT OUTRANKS POPULARITY.** A highly rated but weakly relevant
// provider must not outrank a strongly relevant one merely because they have more
// reputation history.
//
// That was the defect. Search filtered on a broad `or(...)` — name, bio, location,
// neighborhood, free-text category, plus category-name matches — and then ordered
// the whole result set by `average_rating DESC` with `limit 20`. So every match was
// pooled together and sorted by reputation alone: somebody whose display name IS
// the search term sat below a loosely-matching higher-rated provider, and with the
// limit they could be cut off the list entirely.
//
// ══ WHAT RANKS, AND IN WHAT ORDER ═════════════════════════════════════════
//
//   1. **RELEVANCE TIER** — what kind of match it is (below).
//   2. **CANONICAL RATING**, descending, only WITHIN a tier. Never across tiers.
//   3. **UNRATED AFTER RATED**, within the same tier — a secondary sort, never a
//      filter, and never an inversion of tier order.
//   4. **DETERMINISTIC TIE-BREAK** — `tiebreak()` from lib/discovery.ts, the same
//      function the lanes use, so ties favour nobody in particular.
//
// ══ WHAT DOES NOT RANK ════════════════════════════════════════════════════
//
// No social engagement, no follower count, no Reels activity, no Community
// activity, no hidden popularity score, and no `is_featured`. The input type below
// carries none of them, which is the enforcement: a signal that is not in
// `SearchableProvider` cannot reach this module without a type change a reviewer
// has to see. Identical in spirit to `DiscoveryProvider`.
//
// There is no semantic search, no embedding and no learned model. Every tier is a
// string comparison a person can check by hand against a provider's own row.
import { tiebreak } from './discovery'

/**
 * The only provider facts search ranking is allowed to see.
 *
 * DELIBERATELY NARROW, and deliberately NOT `Provider`. No `follower_count`, no
 * post or reel counts, no `is_featured`, no `is_trending`.
 */
export interface SearchableProvider {
  id: string
  displayName: string | null
  businessName: string | null
  username: string | null
  /** The provider's category name, resolved from `category_id`. */
  categoryName: string | null
  /** Their own free-text trade, used when the category is "Other". */
  customCategory: string | null
  /** The service names they actually publish. The strongest signal there is. */
  serviceNames: string[]
  bio: string | null
  location: string | null
  neighborhood: string | null
  /** Canonical revealed-review mean, or null when they have no rating yet. */
  averageRating: number | null
}

/**
 * Relevance tiers, strongest first. Lower number ranks higher.
 *
 * The numbers are ORDINAL, not weights — nothing is multiplied by them and there
 * is no score to tune. A provider is in exactly one tier: the strongest one they
 * qualify for.
 */
export const TIER = {
  /** The query names a service they publish, or their category. */
  SERVICE_OR_CATEGORY: 1,
  /** The query names them — display name, business name or handle. */
  NAME: 2,
  /** The query appears somewhere else relevant: bio, area. */
  BROADER: 3,
  /** Matched the database filter but none of the above. Still shown, last. */
  WEAK: 4,
} as const

export type RelevanceTier = (typeof TIER)[keyof typeof TIER]

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/** An exact whole-value match, or the query as a whole word inside the value. */
function strongMatch(value: string | null | undefined, q: string): boolean {
  const v = norm(value)
  if (v.length === 0) return false
  if (v === q) return true
  // Word-boundary containment: "lash" matches "Lash Extensions" but not "eyelashes".
  // Deliberately stricter than the substring match the database filter uses, so a
  // coincidental substring does not earn a top tier.
  return new RegExp(`(^|[^a-z0-9])${escapeRe(q)}([^a-z0-9]|$)`).test(v)
}

/** Plain substring, the same shape as the database's `ilike %q%`. */
function looseMatch(value: string | null | undefined, q: string): boolean {
  const v = norm(value)
  return v.length > 0 && v.includes(q)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Which tier does this provider land in for this query?
 *
 * SERVICE AND CATEGORY OUTRANK NAME on purpose. Somebody searching "balayage" is
 * describing what they want done, not who they want to see — and a provider who
 * publishes that service is a better answer than one whose business name happens
 * to contain the word.
 */
export function tierFor(p: SearchableProvider, query: string): RelevanceTier {
  const q = norm(query)
  if (q.length === 0) return TIER.WEAK

  // 1. A service they publish, or their trade.
  if (p.serviceNames.some((s) => strongMatch(s, q))) return TIER.SERVICE_OR_CATEGORY
  if (strongMatch(p.categoryName, q)) return TIER.SERVICE_OR_CATEGORY
  if (strongMatch(p.customCategory, q)) return TIER.SERVICE_OR_CATEGORY

  // 2. Who they are.
  if (strongMatch(p.displayName, q)) return TIER.NAME
  if (strongMatch(p.businessName, q)) return TIER.NAME
  if (strongMatch(p.username, q)) return TIER.NAME

  // A partial name match still beats a bio mention: "alex" for "Alexandra" is very
  // likely the person being looked for.
  if (looseMatch(p.displayName, q)) return TIER.NAME
  if (looseMatch(p.businessName, q)) return TIER.NAME
  if (looseMatch(p.username, q)) return TIER.NAME

  // A loose service/category hit lands here rather than in tier 1, because the
  // strict form above is what earns the top tier.
  if (p.serviceNames.some((s) => looseMatch(s, q))) return TIER.BROADER
  if (looseMatch(p.categoryName, q)) return TIER.BROADER
  if (looseMatch(p.customCategory, q)) return TIER.BROADER

  // 3. Mentioned somewhere relevant.
  if (looseMatch(p.bio, q)) return TIER.BROADER
  if (looseMatch(p.neighborhood, q)) return TIER.BROADER
  if (looseMatch(p.location, q)) return TIER.BROADER

  // 4. The database matched it and we cannot see why. Shown, but last.
  return TIER.WEAK
}

/**
 * Order search results: tier, then rating within tier, then a fair tie-break.
 *
 * PURE AND STABLE. Same input, same output, every render — a results list that
 * reshuffled under a thumb would be fairer and unusable.
 */
export function rankProviderSearch<T extends SearchableProvider>(
  providers: T[],
  query: string,
): T[] {
  const tiers = new Map<string, RelevanceTier>()
  for (const p of providers) tiers.set(p.id, tierFor(p, query))

  return [...providers].sort((a, b) => {
    // 1. RELEVANCE FIRST, ALWAYS. No rating difference can cross a tier boundary,
    // which is the whole ruling in one comparison.
    const ta = tiers.get(a.id) ?? TIER.WEAK
    const tb = tiers.get(b.id) ?? TIER.WEAK
    if (ta !== tb) return ta - tb

    // 2. UNRATED AFTER RATED, within the tier. "Unrated" is an absence, not a zero:
    // it does not compete on the rating scale at all, it simply follows those that
    // do. It never crosses a tier and never removes anybody.
    const ra = a.averageRating
    const rb = b.averageRating
    const aRated = ra != null && ra > 0
    const bRated = rb != null && rb > 0
    if (aRated !== bRated) return aRated ? -1 : 1

    // 3. Canonical rating, descending, among the rated.
    if (aRated && bRated && ra !== rb) return (rb as number) - (ra as number)

    // 4. The same deterministic tie-break the lanes use. NOT by id — that would
    // hand early signups a permanent edge inside every tier.
    return tiebreak(a.id) - tiebreak(b.id)
  })
}

/**
 * The tier a caller can show the user, if it ever wants to explain an ordering.
 *
 * Exported because "why is this provider above that one" should have an answer
 * that does not require reading this file.
 */
export function tierLabel(tier: RelevanceTier): string {
  switch (tier) {
    case TIER.SERVICE_OR_CATEGORY:
      return 'Offers what you searched for'
    case TIER.NAME:
      return 'Name matches your search'
    case TIER.BROADER:
      return 'Related match'
    default:
      return 'Other match'
  }
}
