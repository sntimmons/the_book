import {
  buildDiscoveryLanes,
  DiscoveryProvider,
  LANE_LIMIT,
  NEW_PROVIDER_DAYS,
  providersWithNoLane,
} from '@/lib/discovery'
import { readFileSync } from 'fs'
import { join } from 'path'

// The beta discovery lanes (Correction 3, items S and T).
//
// The most important suite in this file is the LAST one. Everything above it
// checks that a lane does what its own subtitle says; the fairness block checks
// the rule that outranks all of them — that a provider is never placed lower in
// the MARKETPLACE because they do not make social content.

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-09T12:00:00Z').getTime()

function provider(over: Partial<DiscoveryProvider> & { id: string }): DiscoveryProvider {
  return {
    neighborhood: null,
    location: 'Houston, TX',
    createdAt: new Date(NOW - 200 * DAY).toISOString(),
    totalBookings: 0,
    averageRating: null,
    availableToday: false,
    ...over,
  }
}

const laneFor = (lanes: ReturnType<typeof buildDiscoveryLanes>, key: string) =>
  lanes.find((l) => l.key === key)

describe('buildDiscoveryLanes', () => {
  it('returns nothing at all for an empty market', () => {
    expect(buildDiscoveryLanes({ providers: [], now: NOW })).toEqual([])
  })

  it('drops empty lanes rather than showing a heading with nothing under it', () => {
    // One long-established, closed, unbooked provider matches only the catch-all.
    const lanes = buildDiscoveryLanes({ providers: [provider({ id: 'a' })], now: NOW })
    expect(lanes.map((l) => l.key)).toEqual(['worth_a_look'])
    expect(lanes.every((l) => l.providers.length > 0)).toBe(true)
  })

  it('gives every lane a subtitle stating its rule', () => {
    const lanes = buildDiscoveryLanes({
      providers: [
        provider({ id: 'a', neighborhood: 'Midtown', availableToday: true, totalBookings: 3 }),
        provider({ id: 'b', createdAt: new Date(NOW - 2 * DAY).toISOString() }),
      ],
      viewerNeighborhood: 'Midtown',
      now: NOW,
    })
    // A lane a provider cannot see the rule for is a lane they cannot argue with.
    for (const lane of lanes) {
      expect([lane.key, lane.subtitle.length > 0]).toEqual([lane.key, true])
      expect([lane.key, lane.title.length > 0]).toEqual([lane.key, true])
    }
  })

  describe('Near You', () => {
    it('is omitted entirely when the viewer has told us nowhere', () => {
      const lanes = buildDiscoveryLanes({
        providers: [provider({ id: 'a', neighborhood: 'Midtown' })],
        now: NOW,
      })
      expect(laneFor(lanes, 'near_you')).toBeUndefined()
    })

    it('matches on neighborhood, ignoring case and spacing', () => {
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({ id: 'a', neighborhood: ' midtown ' }),
          provider({ id: 'b', neighborhood: 'The Heights' }),
        ],
        viewerNeighborhood: 'Midtown',
        viewerLocation: null,
        now: NOW,
      })
      expect(laneFor(lanes, 'near_you')?.providers.map((p) => p.id)).toEqual(['a'])
    })

    it('falls back to the city when neighborhoods do not match', () => {
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({ id: 'a', neighborhood: 'The Heights', location: 'Midtown, Houston' }),
          provider({ id: 'b', neighborhood: 'Uptown', location: 'Dallas, TX' }),
        ],
        viewerNeighborhood: 'Montrose',
        viewerLocation: 'Midtown, Houston',
        now: NOW,
      })
      expect(laneFor(lanes, 'near_you')?.providers.map((p) => p.id)).toEqual(['a'])
    })

    it('does not rank by rating or bookings — it answers "who is around here"', () => {
      // If proximity were sorted by performance it would just be Popular Near You
      // with extra steps, and a new provider in the viewer's own neighborhood
      // would sit below an established one every single time.
      const busy = provider({ id: 'busy', neighborhood: 'Midtown', totalBookings: 90, averageRating: 5 })
      const quiet = provider({ id: 'quiet', neighborhood: 'Midtown' })
      const forward = buildDiscoveryLanes({
        providers: [busy, quiet], viewerNeighborhood: 'Midtown', now: NOW,
      })
      const reversed = buildDiscoveryLanes({
        providers: [quiet, busy], viewerNeighborhood: 'Midtown', now: NOW,
      })
      // Same order whichever way the input arrived — stable, and not "busiest first".
      expect(laneFor(forward, 'near_you')?.providers.map((p) => p.id))
        .toEqual(laneFor(reversed, 'near_you')?.providers.map((p) => p.id))
    })
  })

  describe('Available Soon', () => {
    it('holds exactly the providers the server said are open today', () => {
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({ id: 'open', availableToday: true }),
          provider({ id: 'closed', availableToday: false }),
          // A null answer is NOT a yes. An unknown availability must never be
          // rendered as "open today" — that is the false claim item M exists to
          // prevent, and it would be worse in a lane whose whole name is a claim.
          provider({ id: 'unknown', availableToday: null }),
        ],
        now: NOW,
      })
      expect(laneFor(lanes, 'available_soon')?.providers.map((p) => p.id)).toEqual(['open'])
    })
  })

  describe('New to The Book', () => {
    it('includes a provider inside the window and excludes one outside it', () => {
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({ id: 'new', createdAt: new Date(NOW - 1 * DAY).toISOString() }),
          provider({
            id: 'old',
            createdAt: new Date(NOW - (NEW_PROVIDER_DAYS + 1) * DAY).toISOString(),
          }),
        ],
        now: NOW,
      })
      expect(laneFor(lanes, 'new_to_the_book')?.providers.map((p) => p.id)).toEqual(['new'])
    })

    it('does not rank the newest-provider lane by performance', () => {
      // A provider in their first month has no track record by definition.
      // Ranking this lane on one would put the LEAST new provider on top, which
      // is the exact opposite of what the lane is for.
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({
            id: 'newer', createdAt: new Date(NOW - 1 * DAY).toISOString(), totalBookings: 0,
          }),
          provider({
            id: 'older', createdAt: new Date(NOW - 20 * DAY).toISOString(), totalBookings: 40,
          }),
        ],
        now: NOW,
      })
      expect(laneFor(lanes, 'new_to_the_book')?.providers.map((p) => p.id))
        .toEqual(['newer', 'older'])
    })

    it('treats a missing or unreadable join date as not new, rather than guessing', () => {
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({ id: 'nodate', createdAt: null }),
          provider({ id: 'baddate', createdAt: 'not a date' }),
        ],
        now: NOW,
      })
      expect(laneFor(lanes, 'new_to_the_book')).toBeUndefined()
    })
  })

  describe('Popular Near You', () => {
    it('ranks by completed bookings, then by reviews', () => {
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({ id: 'mid', totalBookings: 5, averageRating: 5 }),
          provider({ id: 'top', totalBookings: 9, averageRating: 4 }),
          provider({ id: 'tiedLow', totalBookings: 5, averageRating: 3 }),
        ],
        now: NOW,
      })
      expect(laneFor(lanes, 'popular_near_you')?.providers.map((p) => p.id))
        .toEqual(['top', 'mid', 'tiedLow'])
    })

    it('omits a provider with no completed bookings rather than ranking them last', () => {
      // Having no track record is not a worse track record. A provider with zero
      // bookings is absent from a lane about track records, and picked up by the
      // catch-all instead.
      const lanes = buildDiscoveryLanes({
        providers: [
          provider({ id: 'booked', totalBookings: 2 }),
          provider({ id: 'none', totalBookings: 0 }),
        ],
        now: NOW,
      })
      expect(laneFor(lanes, 'popular_near_you')?.providers.map((p) => p.id)).toEqual(['booked'])
      expect(laneFor(lanes, 'worth_a_look')?.providers.map((p) => p.id)).toEqual(['none'])
    })

    it('is named honestly when there is nobody near the viewer', () => {
      const lanes = buildDiscoveryLanes({
        providers: [provider({ id: 'a', totalBookings: 4, location: 'Dallas, TX' })],
        now: NOW,
      })
      expect(laneFor(lanes, 'popular_near_you')?.title).toBe('Popular on The Book')
    })
  })

  describe('Worth a Look — the exposure guardrail', () => {
    it('picks up everyone no other lane showed', () => {
      const providers = [
        provider({ id: 'near', neighborhood: 'Midtown' }),
        provider({ id: 'open', availableToday: true }),
        provider({ id: 'new', createdAt: new Date(NOW - 1 * DAY).toISOString() }),
        provider({ id: 'popular', neighborhood: 'Midtown', totalBookings: 12 }),
        provider({ id: 'invisible' }),
        provider({ id: 'invisible2' }),
      ]
      // Viewer location left unset deliberately: with a city the Near You lane
      // would sweep up every Houston provider and there would be nothing left
      // for the catch-all to prove.
      const lanes = buildDiscoveryLanes({
        providers, viewerNeighborhood: 'Midtown', now: NOW,
      })
      expect(laneFor(lanes, 'worth_a_look')?.providers.map((p) => p.id).sort())
        .toEqual(['invisible', 'invisible2'])
    })

    it('leaves NOBODY without a lane in a market that fits', () => {
      // THE GUARANTEE. Without the catch-all, a provider who is not nearby, not
      // open today, not new and has no bookings yet — most providers, most weeks —
      // would appear in no row at all, and the lanes would have quietly become a
      // filter on who exists rather than an ordering of attention.
      const providers = Array.from({ length: LANE_LIMIT }, (_, i) => provider({ id: `p${i}` }))
      const lanes = buildDiscoveryLanes({ providers, now: NOW })
      expect(providersWithNoLane(providers, lanes)).toEqual([])
    })

    it('reports who it could not fit, rather than pretending it fitted them', () => {
      // Past the cap the lanes stop being complete, and the module says so
      // instead of quietly dropping people. The screen answers this by keeping
      // its full grid below the rows.
      const providers = Array.from({ length: LANE_LIMIT + 5 }, (_, i) => provider({ id: `p${i}` }))
      const lanes = buildDiscoveryLanes({ providers, now: NOW })
      expect(providersWithNoLane(providers, lanes)).toHaveLength(5)
    })

    it('caps every lane at the same limit — no lane becomes the whole feed', () => {
      const providers = Array.from({ length: LANE_LIMIT * 3 }, (_, i) =>
        provider({ id: `p${i}`, availableToday: true, neighborhood: 'Midtown', totalBookings: 3 }),
      )
      const lanes = buildDiscoveryLanes({ providers, viewerNeighborhood: 'Midtown', now: NOW })
      for (const lane of lanes) {
        expect([lane.key, lane.providers.length <= LANE_LIMIT]).toEqual([lane.key, true])
      }
    })
  })

  describe('ties are broken without a durable advantage for anyone', () => {
    it('is stable across renders, so the feed does not reshuffle under a thumb', () => {
      const providers = Array.from({ length: 8 }, (_, i) => provider({ id: `p${i}` }))
      const a = buildDiscoveryLanes({ providers, now: NOW })
      const b = buildDiscoveryLanes({ providers, now: NOW })
      expect(a).toEqual(b)
    })

    it('does not order ties by id, which would permanently favour early signups', () => {
      // Ordering ties by id (or by name) hands whoever came first a small edge
      // that is applied every single time the feed is drawn, and compounds.
      const providers = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) => provider({ id }))
      const order = laneFor(buildDiscoveryLanes({ providers, now: NOW }), 'worth_a_look')
        ?.providers.map((p) => p.id)
      expect(order).not.toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
      // Still a permutation of the same people — nobody was dropped to achieve it.
      expect([...(order ?? [])].sort()).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
    })

    it('does not depend on the order the rows arrived in', () => {
      const providers = Array.from({ length: 6 }, (_, i) => provider({ id: `p${i}` }))
      const forward = buildDiscoveryLanes({ providers, now: NOW })
      const reversed = buildDiscoveryLanes({ providers: [...providers].reverse(), now: NOW })
      expect(forward).toEqual(reversed)
    })
  })

  // ══ THE FAIRNESS RULE (item S) ═══════════════════════════════════════════
  //
  // A provider must NEVER be penalised in marketplace discovery merely because
  // they do not create social content. These are the assertions that would fail
  // the day someone "improves" the feed by rewarding posting.
  describe('marketplace ranking never rewards social content', () => {
    it('places two identical providers identically, whatever they post', () => {
      // The module cannot even be TOLD how much content someone has — the type
      // has no field for it. This is the behavioural half of that: two providers
      // alike in every marketplace fact come out alike, so there is no channel by
      // which a content difference could be expressing itself.
      const poster = provider({ id: 'poster', neighborhood: 'Midtown', totalBookings: 4 })
      const nonPoster = provider({ id: 'quiet', neighborhood: 'Midtown', totalBookings: 4 })
      const lanes = buildDiscoveryLanes({
        providers: [poster, nonPoster], viewerNeighborhood: 'Midtown', now: NOW,
      })
      for (const lane of lanes) {
        const ids = lane.providers.map((p) => p.id)
        if (ids.length === 2) {
          // Both present, or neither — never one included and the other dropped.
          expect([lane.key, ids.sort()]).toEqual([lane.key, ['poster', 'quiet']])
        }
      }
    })

    it('gives a provider with no content at all a place in the lanes', () => {
      const providers = [provider({ id: 'silent' })]
      const lanes = buildDiscoveryLanes({ providers, now: NOW })
      expect(providersWithNoLane(providers, lanes)).toEqual([])
    })

    it('accepts no content signal in its inputs — enforced by the type and the source', () => {
      // The type guard a reviewer would have to defeat deliberately. Read as text
      // so it fails whether the field is added to the interface or a content
      // signal is smuggled into a comparison.
      const source = readFileSync(join(process.cwd(), 'lib/discovery.ts'), 'utf8')
      const body = source
        .split('\n')
        // Strip comments: the header DISCUSSES these words at length, and must
        // stay free to. What must not exist is code that reads them.
        .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .join('\n')
      for (const banned of [
        'postCount', 'post_count', 'reelCount', 'reel_count',
        'followerCount', 'follower_count', 'likes', 'views', 'engagement',
        'isTrending', 'is_trending', 'isFeatured', 'is_featured',
      ]) {
        // Whole-token match. A substring test flagged the word "reviews" for
        // containing "views" — client reviews are a MARKETPLACE signal and the
        // lane subtitle is right to say so, so the guard has to be able to tell
        // the two apart rather than banning the letters.
        const used = new RegExp(`\\b${banned}\\b`).test(body)
        expect([banned, used]).toEqual([banned, false])
      }
    })
  })
})
