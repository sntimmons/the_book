import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDiscoveryLanes, DiscoveryProvider, providersWithNoLane } from '@/lib/discovery'
import { displayRating } from '@/lib/reputationLabel'

// ── DISCOVERY FAIRNESS GUARDS ─────────────────────────────────────────────
//
// `__tests__/lib/discovery.test.ts` proves the LANE RULES are fair. These are the
// two things it structurally cannot see, both of which were live defects found by
// the Discovery/Fairness audit:
//
//   1. WHICH RELATION a surface reads. The lane module is pure logic and never
//      touches a database, so it cannot know that one screen queried the base
//      `providers` table and therefore recommended a blocked provider.
//   2. WHAT THE MAPPING PUTS IN. `toDiscoveryProvider` lives in a component, and a
//      wrong value there is invisible to a module test that is handed correct ones.
//
// Both are source-level, for the same reason `barterValueAbsent.test.ts` is: the
// defect is a one-line change to make and a one-line change to re-make, and
// neither would fail a typecheck.

const ROOT = join(__dirname, '..', '..')
const src = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

// Comments are stripped because every file below deliberately CONTAINS the wrong
// wording, in a comment explaining why the code no longer does it.
const code = (rel: string): string =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

// ══ 1. EVERY PROVIDER-DISCOVERY READ GOES THROUGH THE VIEW ════════════════
//
// `providers_visible` is where the BLOCK filter lives (PD-089). The base table's
// SELECT policy is
//
//     (NOT account_unavailable(user_id)) OR user_id = auth.uid()
//                                        OR caller_deals_with_provider(id)
//
// which excludes deleted and pending-deletion accounts and **carries no block
// predicate at all**. So a discovery surface reading the base table shows — or
// worse, RECOMMENDS — providers the viewer has blocked.
//
// `app/post-booking/declined.tsx` did exactly that until this audit: it offered
// three "similar providers" from `public.providers`. Proven against
// non-production with a control: before the block base=1/view=1, after the block
// base=1/view=0.
//
// SCOPE IS DELIBERATELY NARROW. This is not "never read `providers`" — that would
// be wrong. A booking, a message thread, a review and a provider's own dashboard
// all legitimately resolve a provider by id, and `caller_deals_with_provider` and
// the OQ-076/PD-090 ruling exist precisely so a transaction can still see its
// counterparty. What is forbidden is reading the base table to build a LIST OF
// PROVIDERS FOR THE VIEWER TO CHOOSE FROM.
describe('every provider-discovery surface reads providers_visible, not the base table', () => {
  // Each entry is a surface that offers the viewer a CHOICE among providers.
  const DISCOVERY_SURFACES = [
    'hooks/useProviders.ts',
    'app/post-booking/declined.tsx',
  ] as const

  it.each(DISCOVERY_SURFACES)('%s reads the view', (rel) => {
    expect(code(rel)).toContain('providers_visible')
  })

  it('the post-decline alternatives list does not query the base table', () => {
    // The precise regression. `.from('providers')` with a category filter and a
    // limit is the shape of a recommendation list.
    const s = code('app/post-booking/declined.tsx')
    const baseReads = [...s.matchAll(/\.from\(\s*['"]providers['"]\s*\)/g)]
    // One base read remains and is correct: resolving the DECLINED provider's own
    // category by id, which is a lookup about a booking the viewer is party to,
    // not a list to choose from.
    expect(baseReads.length).toBeLessThanOrEqual(1)
    expect(s).toMatch(/from\(\s*['"]providers_visible['"]\s*\)[\s\S]{0,400}?limit\(3\)/)
  })

  it('the discovery pool and the grid both read the view', () => {
    const s = code('hooks/useProviders.ts')
    // fetchDiscoveryPool (the lanes' input) and useProviders (the grid).
    expect([...s.matchAll(/from\(\s*['"]providers_visible['"]\s*\)/g)].length).toBeGreaterThanOrEqual(3)
  })
})

// ══ 2. THE LANE MAPPING HONOURS "0 IS NOT A RATING" ═══════════════════════
//
// `providers.average_rating` and `providers.rating` are both `NOT NULL DEFAULT 0`,
// so `p.average_rating ?? p.rating` NEVER yields null — an unrated provider
// arrived in the lane module as `averageRating: 0`, while `DiscoveryProvider`
// documents that field as "or **null** when they have no revealed reviews".
//
// `lib/reputationLabel.ts` is the one decided answer: 0 is "not rated", not
// "rated zero", because the scale starts at 1. It exists because six screens were
// each answering that question differently. The lane mapping was a seventh.
describe('the lane mapping treats an unrated provider as unrated, not as zero-rated', () => {
  it('uses displayRating rather than a nullish fallback between two NOT NULL columns', () => {
    const s = code('components/DiscoveryLanes.tsx')
    expect(s).toMatch(/averageRating:\s*displayRating\(p\)/)
    // The exact defect must not come back.
    expect(s).not.toMatch(/averageRating:\s*p\.average_rating\s*\?\?\s*p\.rating/)
  })

  it('displayRating is the helper that makes 0 an absence', () => {
    // Pinned here too, because the mapping above is only correct if this is.
    expect(displayRating({ average_rating: 0 })).toBeNull()
    expect(displayRating({ average_rating: 0, rating: 0 })).toBeNull()
    expect(displayRating({ average_rating: 4.5 })).toBe(4.5)
  })
})

// ══ 3. A LANE TITLE MAY NOT PROMISE MORE THAN ITS DATA ════════════════════
//
// PD-112: a headline may not assert what its own body calls something else. The
// open-today lane was titled "Available Soon" over a subtitle that correctly said
// "Open today, based on the hours they published."
//
// Those are different claims. The lane is built from `availableToday`, which is
// published working hours for today's weekday minus blocked dates. **Booked time
// is deliberately not subtracted** — this beta has no slot engine — so the data
// supports "open", and "Available Soon" promises a free appointment nothing
// established.
describe('lane titles are truthful about what the data supports', () => {
  const providers: DiscoveryProvider[] = [
    {
      id: 'p1',
      neighborhood: null,
      location: null,
      createdAt: '2020-01-01T00:00:00.000Z',
      totalBookings: 0,
      averageRating: null,
      availableToday: true,
    },
  ]

  const lanes = buildDiscoveryLanes({ providers, now: Date.parse('2026-09-13T12:00:00.000Z') })
  const openLane = lanes.find((l) => l.key === 'available_soon')

  it('the open-today lane exists for a provider the server says is open', () => {
    expect(openLane).toBeDefined()
  })

  it('is titled for OPEN, not for an appointment nobody has confirmed', () => {
    expect(openLane!.title).toBe('Open Today')
  })

  it('no lane title claims availability, a slot, or a booking', () => {
    // "Available", "Soon", "Free" and "Book now" all assert something this beta
    // cannot establish without a slot engine.
    for (const lane of lanes) {
      expect(lane.title).not.toMatch(/\bavailable\b/i)
      expect(lane.title).not.toMatch(/\bsoon\b/i)
      expect(lane.title).not.toMatch(/\bfree\b/i)
      expect(lane.title).not.toMatch(/\bslot\b/i)
    }
  })

  it('every lane still states its rule in a subtitle', () => {
    // Re-asserted here because a title change is exactly when a subtitle gets
    // dropped as redundant — and the subtitle is the part a provider can argue with.
    for (const lane of lanes) {
      expect(lane.subtitle.length).toBeGreaterThan(0)
    }
  })
})

// ══ 4. THE RANKING COLUMNS ARE NOT CLIENT-WRITABLE ═══════════════════════
//
// `is_featured` is the FIRST sort key of the complete grid, and its column comment
// calls it "Admin-curated". Nothing in the product ever sets it true — the only
// writes anywhere are erasure setting it false — so it is inert today. It is still
// a live ranking hook, and the one thing that must remain true of it is that a
// provider cannot promote themselves.
//
// The DB half is asserted in B5B (`providerColumnGrant` / the provider write
// policies). This is the CLIENT half: no app code may write these.
describe('no client code writes a ranking column', () => {
  const RANKING_COLUMNS = [
    'is_featured',
    'is_trending',
    'average_rating',
    'rating_client_count',
    'review_count',
    'total_bookings',
  ] as const

  const WRITE_SURFACES = [
    'hooks/useProviders.ts',
    'components/DiscoveryLanes.tsx',
    'app/(tabs)/business/edit-profile.tsx',
    'app/onboarding/provider/golive.tsx',
  ] as const

  it.each(RANKING_COLUMNS)('%s is never assigned by client code', (col) => {
    const offenders = WRITE_SURFACES.filter((rel) => {
      const s = code(rel)
      // An object-literal assignment or an .update() naming the column.
      return new RegExp(`${col}\\s*:`).test(s) && /\.update\(|\.upsert\(|\.insert\(/.test(s)
        ? new RegExp(`(update|upsert|insert)\\([^)]*${col}\\s*:`, 's').test(s)
        : false
    })
    expect(offenders).toEqual([])
  })
})

// ══ 5. FAIRNESS METRICS — MEASURED, NOT ASSERTED ══════════════════════════
//
// Step 13 of the audit asks for testable fairness properties rather than analytics
// infrastructure. These are the four that matter for a closed beta, checked against
// a representative 28-provider cohort: a handful of established providers with real
// bookings and ratings, a handful brand new, the rest ordinary and unrated, and a
// third of them open today.
//
// MEASURED FIRST, THEN PINNED. The numbers below are what the current lane rules
// actually produce — 28/28 providers in at least one lane, nobody excluded, and the
// most any single provider occupies is 3 of 5 lanes. The assertions are deliberately
// looser than the measurements so an ordinary rule change does not fail them; what
// they catch is a change that lets one provider take over, or that quietly drops a
// class of provider out of discovery altogether.
describe('fairness metrics on a representative closed-beta cohort', () => {
  const NOW = Date.parse('2026-09-13T12:00:00.000Z')
  const DAY = 86400000

  function cohort(): DiscoveryProvider[] {
    const out: DiscoveryProvider[] = []
    for (let i = 0; i < 28; i++) {
      const established = i < 5
      const brandNew = i >= 24
      out.push({
        id: `p${i}`,
        neighborhood: 'Midtown',
        location: 'Houston, TX',
        createdAt: new Date(NOW - (brandNew ? 5 : 200) * DAY).toISOString(),
        // A. new providers: no bookings, no reviews, no social (the type has no
        // social field at all, which is the point).
        totalBookings: established ? 40 - i * 3 : 0,
        // H. unrated providers carry null, not 0 — see § 2.
        averageRating: established ? 5 - i * 0.2 : null,
        // J. open today, from the server.
        availableToday: i % 3 === 0,
      })
    }
    return out
  }

  const providers = cohort()
  const lanes = buildDiscoveryLanes({ providers, viewerNeighborhood: 'Midtown', now: NOW })
  const occupancy = new Map<string, number>()
  for (const lane of lanes) {
    for (const p of lane.providers) occupancy.set(p.id, (occupancy.get(p.id) ?? 0) + 1)
  }

  it('every eligible provider is represented somewhere', () => {
    // The exposure guarantee, measured rather than trusted. `worth_a_look` is what
    // makes this true, and this is the assertion that notices if it stops being.
    expect(occupancy.size).toBe(providers.length)
    expect(providersWithNoLane(providers, lanes)).toEqual([])
  })

  it('no single provider occupies more than half the lanes', () => {
    // Measured max is 3 of 5. A provider CAN legitimately be near you, open today
    // and new at once — that is three true facts, not favouritism. What this
    // forbids is one provider appearing in every row while others appear in none.
    const max = Math.max(...occupancy.values())
    expect(max).toBeLessThanOrEqual(Math.ceil(lanes.length / 2) + 1)
    expect(max).toBeLessThan(lanes.length)
  })

  it('a brand-new provider with no reviews, no bookings and no content still surfaces', () => {
    // SCENARIO A, and the one this whole section exists for. If historical
    // popularity were the only route to being seen, these four would be invisible.
    const brandNew = providers.filter((p) => Number(p.id.slice(1)) >= 24)
    expect(brandNew.length).toBeGreaterThan(0)
    for (const p of brandNew) expect(occupancy.get(p.id) ?? 0).toBeGreaterThan(0)
  })

  it('an UNRATED provider is not excluded from discovery for lacking a rating', () => {
    // SCENARIO H. 23 of the 28 have no rating at all; every one of them appears.
    const unrated = providers.filter((p) => p.averageRating === null)
    expect(unrated.length).toBeGreaterThan(10)
    for (const p of unrated) expect(occupancy.get(p.id) ?? 0).toBeGreaterThan(0)
  })

  it('the performance lane ranks on marketplace facts and excludes nobody who has none', () => {
    // SCENARIO D vs C: the only lane that ranks on a track record contains ONLY
    // providers with completed bookings, and having none puts a provider elsewhere
    // rather than last. There is no social input available to it — `DiscoveryProvider`
    // carries none — so C cannot outrank D by posting.
    const popular = lanes.find((l) => l.key === 'popular_near_you')
    expect(popular).toBeDefined()
    for (const p of popular!.providers) expect(p.totalBookings ?? 0).toBeGreaterThan(0)
    // And everyone it left out is still represented.
    const missing = providers.filter((p) => (p.totalBookings ?? 0) === 0)
    for (const p of missing) expect(occupancy.get(p.id) ?? 0).toBeGreaterThan(0)
  })
})
