import { readFileSync } from 'fs'
import { join } from 'path'

// DISCOVER AFTER THE PHASE 4B REDESIGN.
//
// Source-level because every property below renders perfectly happily when
// wrong: a re-introduced hex still paints, a masonry height still lays out, and
// a badge nobody can earn still draws an empty box.

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

const SURFACES = [
  'app/(tabs)/index.tsx',
  'components/DiscoveryLanes.tsx',
  'components/DiscoverCommunity.tsx',
  'components/ui/ProviderCard.tsx',
] as const

describe('Discover resolves every colour from the theme', () => {
  it.each(SURFACES)('%s carries no colour literal', (rel) => {
    expect(stripComments(code(rel)).match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) ?? []).toEqual([])
  })

  it.each(SURFACES)('%s reads the theme', (rel) => {
    expect(code(rel)).toMatch(/useTheme\(\)/)
  })

  it('no legacy palette value survives anywhere on the surface', () => {
    for (const rel of SURFACES) {
      const src = stripComments(code(rel))
      for (const legacy of ['#080808', '#F0E8D5', '#C8922A', '240,232,213']) {
        expect(src).not.toContain(legacy)
      }
    }
  })
})

describe('dead and unearned UI is gone', () => {
  const src = stripComments(code('app/(tabs)/index.tsx'))

  it('no Featured or Trending badge', () => {
    // Both columns are DEFAULT false, pinned immutable by the providers UPDATE
    // policy, and written by nothing — the badges could never appear.
    expect(src).not.toMatch(/is_featured|is_trending/)
    expect(src).not.toMatch(/Featured|Trending/)
  })

  it('no popularity claim replaced them', () => {
    expect(src).not.toMatch(/\bpopular\b|\bhot\b|\brecommended\b|\bstaff pick/i)
  })

  it('no marketing block', () => {
    expect(src).not.toMatch(/Philosophy|Talent is everywhere/i)
  })

  it('no human silhouette stands in for a missing photo', () => {
    expect(src).not.toMatch(/Silhouette/)
    expect(stripComments(code('components/ui/ProviderCard.tsx'))).not.toMatch(/Silhouette/)
  })

  it('the grid is uniform, not masonry', () => {
    // Variable tile height by list position was unearned prominence.
    expect(src).not.toMatch(/heightForIndex|packColumns|masonry/i)
    expect(src).toMatch(/cardWidth/)
  })
})

describe('the header and search are wired to what already exists', () => {
  const src = stripComments(code('app/(tabs)/index.tsx'))

  it('search is a field that opens the EXISTING search screen', () => {
    expect(src).toContain('Search braiders, barbers, nails…')
    expect(src).toContain("'/(tabs)/search'")
    // Not a second search implementation.
    expect(src).not.toMatch(/providerSearchRank|tierFor/)
  })

  it('the area control opens the existing profile editor, and invents no location', () => {
    expect(src).toContain('Set your area')
    expect(src).toContain("'/me/edit'")
    expect(src).not.toMatch(/geolocation|Geolocation|getCurrentPosition|latitude|longitude|miles|mi away/i)
  })

  it('the header no longer competes with Business or a search icon', () => {
    // The provider's route into their own dashboard belongs where a provider
    // already goes, not as a fourth action on the client browse surface.
    // `businessName` on a card is the provider's trading name, not this control.
    expect(src).not.toContain("'/(tabs)/business'")
    expect(src).not.toMatch(/briefcase/i)
    expect(src).toMatch(/Notifications/)
    expect(src).toMatch(/Your profile/)
  })
})

describe('a failure is not an empty marketplace', () => {
  const hook = stripComments(code('hooks/useProviders.ts'))
  const src = stripComments(code('app/(tabs)/index.tsx'))

  it('the lane pool reports failure as null rather than an empty list', () => {
    expect(hook).toMatch(/fetchDiscoveryPool\([^)]*\): Promise<Provider\[\] \| null>/)
    expect(hook).toMatch(/if \(error\) return null/)
  })

  it('the screen distinguishes the two and offers a retry', () => {
    expect(src).toMatch(/poolFailed/)
    expect(src).toContain('ErrorState')
    expect(src).toContain('onRetry')
    expect(src).toContain('EmptyState')
  })

  it('a successful retry clears the previous failure', () => {
    expect(hook).toMatch(/setError\(null\)/)
  })
})

describe('the lane rules are presentation-untouched', () => {
  const rules = code('lib/discovery.ts')

  it('Worth a Look still means residual exposure, not quality', () => {
    expect(rules).toMatch(/filter\(\(p\) => !shown\.has\(p\.id\)\)/)
    expect(rules).toContain('Also working in Houston')
    expect(rules).not.toMatch(/highest rated|most booked|most followed|staff pick|promoted/i)
  })

  it('no lane ranks on bookings, social or a featured flag', () => {
    const shipped = rules.slice(rules.indexOf('export function buildDiscoveryLanes'))
    expect(shipped).not.toMatch(/\.sort\(byBookingsThenRating\)/)
    expect(shipped).not.toMatch(/follower|likes|engagement|is_featured|is_trending/i)
  })

  it('DiscoveryProvider was not widened with a social field', () => {
    const iface = rules.slice(rules.indexOf('export interface DiscoveryProvider'), rules.indexOf('export type LaneKey'))
    expect(iface).not.toMatch(/follow|like|engagement|post_count|reel/i)
  })

  it('Phase 4C stayed out: no Reels lane, no follow lane', () => {
    const lanes = stripComments(code('components/DiscoveryLanes.tsx'))
    expect(lanes).not.toMatch(/reel/i)
    expect(lanes).not.toMatch(/People You Follow|provider_follows/i)
    expect(stripComments(code('app/(tabs)/index.tsx'))).not.toMatch(/provider_follows|People You Follow/i)
  })
})

describe('Community stays secondary', () => {
  const src = stripComments(code('app/(tabs)/index.tsx'))

  it('renders below the grid and is hidden inside a category filter', () => {
    // Compare RENDER sites, not the import at the top of the file.
    const renderedCommunity = src.indexOf('<DiscoverCommunity')
    const renderedGrid = src.indexOf('{leftCol.map(renderCard)}')
    expect(renderedCommunity).toBeGreaterThan(renderedGrid)
    expect(src).toMatch(/activeCategoryId === null \? <DiscoverCommunity/)
  })
})
