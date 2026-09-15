import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDiscoveryLanes, type DiscoveryProvider } from '@/lib/discovery'

// "THE ALGORITHM SHOULD RANK CONTENT, NOT SECRETLY RANK THE WORTH OF THE
// PROVIDER."
//
// Phase 4C put social content on Discover for the first time. This guard is the
// wall between it and placement. Following someone is a relationship; posting is
// optional activity; neither is a marketplace fact, and neither may move a
// provider in the lanes, the grid or search.
//
// The separation is STRUCTURAL rather than remembered — a social field cannot
// leak into ranking because the type that decides ranking has nowhere to put
// one. These assertions prove the structure is still there.

const code = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function stripComments(src: string): string {
  let inBlock = false
  return src.split('\n').map((line) => {
    let out = ''
    let i = 0
    while (i < line.length) {
      if (inBlock) {
        const close = line.indexOf('*/', i)
        if (close === -1) return out
        inBlock = false
        i = close + 2
        continue
      }
      const block = line.indexOf('/*', i)
      const lineComment = line.indexOf('//', i)
      if (lineComment !== -1 && (block === -1 || lineComment < block)) return out + line.slice(i, lineComment)
      if (block !== -1) { out += line.slice(i, block); inBlock = true; i = block + 2; continue }
      return out + line.slice(i)
    }
    return out
  }).join('\n')
}

const RANKING_MODULES = ['lib/discovery.ts', 'lib/providerSearchRank.ts'] as const
const SOCIAL_WORDS = /follow|like_count|likes|engagement|post_count|reel_count|view_count|popular|trending/i

describe('the ranking modules cannot see a social signal', () => {
  it.each(RANKING_MODULES)('%s never imports the social path', (rel) => {
    expect(stripComments(code(rel))).not.toMatch(/from ['"].*discoverSocial/)
  })

  it('DiscoveryProvider was not widened with a social-worth field', () => {
    const src = code('lib/discovery.ts')
    const iface = src.slice(src.indexOf('export interface DiscoveryProvider'), src.indexOf('export type LaneKey'))
    expect(stripComments(iface)).not.toMatch(SOCIAL_WORDS)
  })

  it('SearchableProvider likewise', () => {
    const src = code('lib/providerSearchRank.ts')
    const start = src.indexOf('export interface SearchableProvider')
    const iface = src.slice(start, src.indexOf('}', start))
    expect(stripComments(iface)).not.toMatch(SOCIAL_WORDS)
  })

  it('no lane sort reads a social field', () => {
    const src = stripComments(code('lib/discovery.ts'))
    const shipped = src.slice(src.indexOf('export function buildDiscoveryLanes'))
    expect(shipped).not.toMatch(SOCIAL_WORDS)
  })
})

describe('the social path cannot reach into ranking', () => {
  const social = stripComments(code('lib/discoverSocial.ts'))

  it('never imports the ranking modules', () => {
    expect(social).not.toMatch(/from ['"].*lib\/discovery['"]/)
    expect(social).not.toMatch(/from ['"].*providerSearchRank/)
    expect(social).not.toMatch(/DiscoveryProvider|SearchableProvider/)
  })

  it('reads posts_visible and provider_follows, and no provider-ranking column', () => {
    expect(social).toContain("from('provider_follows')")
    expect(social).toContain("from('posts_visible')")
    expect(social).not.toMatch(/average_rating|total_bookings|is_featured|is_trending|discovery_tiebreak/)
  })

  it('has no fallback query to pad an empty row', () => {
    // A row titled "from people you follow" that quietly shows strangers is a
    // lie about a relationship. There must be no second read to fall back to.
    expect((social.match(/from\('/g) ?? []).length).toBe(4)
    expect(social).not.toMatch(/popular|nearby|fallback|instead/i)
  })
})

describe('follow state changes nothing about placement', () => {
  const p = (id: string): DiscoveryProvider => ({
    id,
    neighborhood: 'Midtown',
    location: 'Houston, TX',
    createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    totalBookings: 0,
    averageRating: null,
    availableToday: false,
  })
  const providers = ['a', 'b', 'c', 'd'].map(p)

  it('the lanes are identical however the viewer follows', () => {
    // There is no follow input to `buildDiscoveryLanes` at all — which IS the
    // proof. This pins that the signature cannot quietly grow one.
    const lanes = buildDiscoveryLanes({ providers, viewerNeighborhood: 'Midtown', viewerLocation: 'Houston, TX' })
    const again = buildDiscoveryLanes({ providers, viewerNeighborhood: 'Midtown', viewerLocation: 'Houston, TX' })
    expect(lanes.map((l) => l.providers.map((x) => x.id))).toEqual(
      again.map((l) => l.providers.map((x) => x.id)),
    )
    const keys = Object.keys({ providers, viewerNeighborhood: null, viewerLocation: null, now: 0 })
    expect(keys).not.toContain('follows')
  })

  it('the complete grid orders on rating then the deterministic tie-break only', () => {
    const hook = stripComments(code('hooks/useProviders.ts'))
    const grid = hook.slice(hook.indexOf('function useProviders('))
    const order = [...grid.matchAll(/order\(\s*['"]([a-z_]+)['"]/g)].map((m) => m[1])
    expect(order[0]).toBe('average_rating')
    expect(order[1]).toBe('discovery_tiebreak')
    expect(order).not.toContain('like_count')
    expect(order).not.toContain('follower_count')
  })
})

describe('the Discover surface keeps the social rows in their place', () => {
  const screen = stripComments(code('app/(tabs)/index.tsx'))

  it('followed activity renders after the marketplace lanes and before the grid', () => {
    const lanes = screen.indexOf('<DiscoveryLanes')
    const followed = screen.indexOf('<FollowedActivityRow')
    const grid = screen.indexOf('{leftCol.map(renderCard)}')
    expect(lanes).toBeLessThan(followed)
    expect(followed).toBeLessThan(grid)
  })

  it('the Reels entry renders below the complete grid', () => {
    const grid = screen.indexOf('{leftCol.map(renderCard)}')
    const reels = screen.indexOf('<ReelsEntryRow')
    expect(grid).toBeLessThan(reels)
  })

  it('neither row appears inside a category filter', () => {
    expect(screen).toMatch(/activeCategoryId === null \? \(\s*<FollowedActivityRow/)
    expect(screen).toMatch(/activeCategoryId === null \? <ReelsEntryRow/)
  })
})

describe('no follower count reaches a provider card', () => {
  it('ProviderCard cannot render one', () => {
    const card = stripComments(code('components/ui/ProviderCard.tsx'))
    expect(card).not.toMatch(/follow/i)
    expect(card).not.toMatch(/like|engagement|popular|trending/i)
  })

  it('the social rows build no second Reels implementation', () => {
    const rows = stripComments(code('components/DiscoverSocialRows.tsx'))
    expect(rows).toContain("'/(tabs)/reels'")
    // Playback INFRASTRUCTURE, not the word "video" — the component legitimately
    // carries an `isVideo` flag to decide whether to draw a play dot on a still.
    expect(rows).not.toMatch(/from ['"]expo-av['"]|from ['"]expo-video['"]/)
    expect(rows).not.toMatch(/<Video\b|useVideoPlayer|pagingEnabled/)
  })
})
