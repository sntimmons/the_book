import {
  TIER,
  rankProviderSearch,
  tierFor,
  tierLabel,
  SearchableProvider,
} from '@/lib/providerSearchRank'

// ── SEARCH INTENT OUTRANKS POPULARITY ─────────────────────────────────────
//
// The PM ruling these assertions exist for. Search used to order every match by
// `average_rating DESC` with `limit 20`, so reputation history decided the list and
// relevance decided only whether you were in it at all. A provider whose display
// name WAS the query could sit below a loosely-matching higher-rated one, or be cut
// off the list entirely by the limit.
//
// The interesting assertions here are the ones where the RATING POINTS THE OTHER
// WAY — a 5.0 provider who is weakly relevant against an unrated one who is
// exactly what was asked for. If relevance is real, the unrated provider wins.

function mk(id: string, o: Partial<SearchableProvider> = {}): SearchableProvider {
  return {
    id,
    displayName: null,
    businessName: null,
    username: null,
    categoryName: null,
    customCategory: null,
    serviceNames: [],
    bio: null,
    location: null,
    neighborhood: null,
    averageRating: null,
    ...o,
  }
}

describe('tierFor — what kind of match is this', () => {
  it('puts a published SERVICE at the top tier', () => {
    expect(tierFor(mk('a', { serviceNames: ['Balayage', 'Cut'] }), 'balayage')).toBe(
      TIER.SERVICE_OR_CATEGORY,
    )
  })

  it('puts the provider CATEGORY at the top tier too', () => {
    expect(tierFor(mk('a', { categoryName: 'Lashes' }), 'lashes')).toBe(TIER.SERVICE_OR_CATEGORY)
  })

  it('counts a free-text trade, so an "Other" provider is not second class', () => {
    expect(tierFor(mk('a', { customCategory: 'Loc Retwist' }), 'retwist')).toBe(
      TIER.SERVICE_OR_CATEGORY,
    )
  })

  it('ranks SERVICE above NAME — the query describes what, not who', () => {
    // Somebody searching "balayage" is describing the work. A provider who performs
    // it answers the question better than one whose business name contains the word.
    const doesIt = mk('a', { serviceNames: ['Balayage'] })
    const namedIt = mk('b', { businessName: 'Balayage Bar' })
    expect(tierFor(doesIt, 'balayage')).toBeLessThan(tierFor(namedIt, 'balayage'))
  })

  it('matches a name on a word boundary and on a partial', () => {
    expect(tierFor(mk('a', { displayName: 'Alexandra' }), 'alex')).toBe(TIER.NAME)
    expect(tierFor(mk('a', { username: 'alexcuts' }), 'alexcuts')).toBe(TIER.NAME)
  })

  it('does not award a top tier for a coincidental substring', () => {
    // "lash" inside "eyelashes" is not a service match — the top tier needs a word
    // boundary, which is stricter than the database's `ilike %q%`.
    expect(tierFor(mk('a', { serviceNames: ['Eyelashes Refill'] }), 'lash')).toBe(TIER.BROADER)
  })

  it('drops a bio-only mention to the broader tier', () => {
    expect(tierFor(mk('a', { bio: 'I trained in balayage years ago' }), 'balayage')).toBe(
      TIER.BROADER,
    )
  })

  it('is WEAK when the database matched and we cannot see why', () => {
    // Still shown. Never silently dropped — the ruling makes rating a sort, not a
    // filter, and the same is true of relevance.
    expect(tierFor(mk('a'), 'balayage')).toBe(TIER.WEAK)
  })

  it('labels every tier, so an ordering can be explained', () => {
    for (const t of Object.values(TIER)) expect(tierLabel(t).length).toBeGreaterThan(0)
  })
})

describe('rankProviderSearch — relevance first, rating second, never the reverse', () => {
  it('THE RULING: a strongly relevant UNRATED provider beats a weakly relevant 5.0', () => {
    // The assertion that would have failed before this work, and the one the whole
    // module exists for.
    const relevantUnrated = mk('relevant', { serviceNames: ['Balayage'], averageRating: null })
    const irrelevantPerfect = mk('famous', { bio: 'ask me about balayage', averageRating: 5 })
    const out = rankProviderSearch([irrelevantPerfect, relevantUnrated], 'balayage')
    expect(out.map((p) => p.id)).toEqual(['relevant', 'famous'])
  })

  it('an exact service match beats an unrelated highly rated provider', () => {
    const exact = mk('exact', { serviceNames: ['Silk Press'], averageRating: 3.2 })
    const unrelated = mk('unrelated', { bio: 'silk press sometimes', averageRating: 5 })
    expect(rankProviderSearch([unrelated, exact], 'silk press')[0].id).toBe('exact')
  })

  it('no rating difference can cross a tier boundary, at any size', () => {
    const top = mk('top', { categoryName: 'Lashes', averageRating: 1 })
    const lower = mk('lower', { bio: 'lashes', averageRating: 5 })
    expect(rankProviderSearch([lower, top], 'lashes')[0].id).toBe('top')
  })

  it('uses canonical rating to order WITHIN a tier', () => {
    const a = mk('a', { serviceNames: ['Cut'], averageRating: 4.2 })
    const b = mk('b', { serviceNames: ['Cut'], averageRating: 4.9 })
    expect(rankProviderSearch([a, b], 'cut').map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('places UNRATED after rated inside a tier, without excluding them', () => {
    const rated = mk('rated', { serviceNames: ['Cut'], averageRating: 4.1 })
    const unrated = mk('unrated', { serviceNames: ['Cut'], averageRating: null })
    const out = rankProviderSearch([unrated, rated], 'cut')
    expect(out.map((p) => p.id)).toEqual(['rated', 'unrated'])
    expect(out).toHaveLength(2)
  })

  it('treats a stored 0 as UNRATED, not as the worst possible rating', () => {
    // `average_rating` is NOT NULL DEFAULT 0 in the database. A 0 arriving here must
    // behave exactly like null — an absence, not a verdict — or the old defect is
    // back by another route.
    const zero = mk('zero', { serviceNames: ['Cut'], averageRating: 0 })
    const one = mk('one', { serviceNames: ['Cut'], averageRating: 1 })
    const nul = mk('null', { serviceNames: ['Cut'], averageRating: null })
    const out = rankProviderSearch([zero, one, nul], 'cut')
    // The rated provider leads; the two unrated follow in tie-break order, and
    // neither is ranked as though it scored zero.
    expect(out[0].id).toBe('one')
    expect(out.slice(1).map((p) => p.id).sort()).toEqual(['null', 'zero'])
  })

  it('breaks remaining ties deterministically and NOT by id order', () => {
    // Sequential ids: if the output came back sorted, the tie-break is handing early
    // signups a permanent edge inside every tier. Same property lib/discovery.ts
    // asserts for the lanes, and it is the same function.
    const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`)
    const out = rankProviderSearch(
      ids.map((id) => mk(id, { serviceNames: ['Cut'] })),
      'cut',
    ).map((p) => p.id)
    expect(out).not.toEqual(ids)
    expect([...out].sort()).toEqual([...ids].sort())
  })

  it('is stable — the same query twice gives the same order', () => {
    const list = Array.from({ length: 8 }, (_, i) => mk(`p${i}`, { serviceNames: ['Cut'] }))
    expect(rankProviderSearch(list, 'cut').map((p) => p.id)).toEqual(
      rankProviderSearch(list, 'cut').map((p) => p.id),
    )
  })

  it('does not depend on the order the rows arrived in', () => {
    const list = [
      mk('a', { serviceNames: ['Cut'], averageRating: 4 }),
      mk('b', { categoryName: 'Barber', averageRating: 5 }),
      mk('c', { bio: 'cut', averageRating: 4.8 }),
    ]
    const forward = rankProviderSearch(list, 'cut').map((p) => p.id)
    const reversed = rankProviderSearch([...list].reverse(), 'cut').map((p) => p.id)
    expect(forward).toEqual(reversed)
  })

  it('ranks nobody out of the list — relevance is a sort, not a filter', () => {
    const list = [mk('a', { serviceNames: ['Cut'] }), mk('b'), mk('c', { bio: 'cut' })]
    expect(rankProviderSearch(list, 'cut')).toHaveLength(3)
  })

  it('never returns the same provider twice', () => {
    const list = Array.from({ length: 20 }, (_, i) => mk(`p${i}`, { serviceNames: ['Cut'] }))
    const out = rankProviderSearch(list, 'cut').map((p) => p.id)
    expect(new Set(out).size).toBe(out.length)
  })
})

describe('no social or curated signal can reach search ranking', () => {
  // The enforcement is the TYPE: a signal absent from SearchableProvider cannot be
  // read by the ranker. This asserts the shape so adding one is a deliberate edit a
  // reviewer sees, exactly as DiscoveryProvider is asserted in discovery.test.ts.
  it('SearchableProvider carries no engagement, follower or featured field', () => {
    const keys = Object.keys(mk('a'))
    for (const banned of [
      'followerCount',
      'follower_count',
      'postCount',
      'post_count',
      'reelCount',
      'reel_count',
      'likes',
      'views',
      'saves',
      'comments',
      'engagement',
      'popularity',
      'score',
      'isFeatured',
      'is_featured',
      'isTrending',
      'is_trending',
    ]) {
      expect(keys).not.toContain(banned)
    }
  })

  it('two providers identical except for anything unlisted rank identically', () => {
    // Whatever a caller attaches beyond the interface is invisible to the ranker.
    const a = { ...mk('a', { serviceNames: ['Cut'] }), followerCount: 99999, is_featured: true }
    const b = { ...mk('b', { serviceNames: ['Cut'] }), followerCount: 0, is_featured: false }
    const out = rankProviderSearch([a, b], 'cut')
    // Order is decided purely by the deterministic tie-break, so it matches the
    // order those two ids take with no extra fields at all.
    const plain = rankProviderSearch([mk('a', { serviceNames: ['Cut'] }), mk('b', { serviceNames: ['Cut'] })], 'cut')
    expect(out.map((p) => p.id)).toEqual(plain.map((p) => p.id))
  })
})
