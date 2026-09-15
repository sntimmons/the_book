import { readFileSync } from 'fs'
import { join } from 'path'

// THE PROVIDER PROFILE AFTER THE PHASE 3B MIGRATION.
//
// Source-level because these are structural properties that render perfectly
// happily when wrong: a re-introduced hex still paints, a dead control still
// draws, and a section that fills its own emptiness looks busier, not broken.

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

const PROFILE_SURFACES = [
  'components/ProviderProfile.tsx',
  'components/ProviderReviewsSection.tsx',
  'components/ProviderShoutouts.tsx',
] as const

describe('the profile resolves every colour from the theme', () => {
  it.each(PROFILE_SURFACES)('%s carries no colour literal', (rel) => {
    const src = stripComments(code(rel))
    const hits = (src.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) ?? []).filter((m) => m !== 'rgba(' && m !== 'rgb(')
    expect(hits).toEqual([])
  })

  it('the only rgba() left is the media scrim, which is constant by design', () => {
    // mediaScrim is the SAME ink in both schemes precisely because a scrim over
    // a photograph must not invert. A gradient needs alpha stops, which a hex
    // token cannot express — so these two are literals on purpose.
    const src = stripComments(code('components/ProviderProfile.tsx'))
    const rgba = src.match(/rgba\([^)]*\)/g) ?? []
    expect(rgba.every((c) => c.startsWith('rgba(33,31,29,'))).toBe(true)
    expect(rgba.length).toBeLessThanOrEqual(4)
  })

  it.each(PROFILE_SURFACES)('%s reads the theme rather than a scheme flag', (rel) => {
    expect(code(rel)).toMatch(/useTheme\(\)/)
  })
})

describe('the profile claims only what the product can honour', () => {
  const src = stripComments(code('components/ProviderProfile.tsx'))

  it('makes no live-presence claim', () => {
    // isLive was plumbed but always false, and the LIVE badge asserted a
    // presence the product has no way to know.
    expect(src).not.toMatch(/\bisLive\b/)
    expect(src).not.toMatch(/>LIVE</)
    expect(src).not.toMatch(/Available Now/i)
  })

  it('asks for a booking rather than claiming one', () => {
    expect(src).toContain('Request booking')
    expect(src).not.toContain('Book Now')
  })

  it('renders no control without a destination', () => {
    expect(src).not.toMatch(/See all/i)
    expect(src).not.toMatch(/View all/i)
  })

  it('makes no payment, fee or verification claim', () => {
    expect(src).not.toMatch(/cancellation fee|no-show fee|% of the service|deposit required to book/i)
    expect(src).not.toMatch(/\bverified\b/i)
    expect(src).not.toMatch(/payout|refund|protected payment/i)
  })

  it('keeps the controls that are real', () => {
    // Share is React Native's own Share API, invoked here — it is a supported
    // behaviour and stays, whatever a static frame shows.
    expect(src).toMatch(/Share\.share/)
    expect(src).toMatch(/onSave/)
    expect(src).toMatch(/onSafetyMenu/)
    expect(src).toMatch(/onMessage/)
  })
})

describe('sections are absent rather than empty', () => {
  const src = stripComments(code('components/ProviderProfile.tsx'))

  it.each([
    ['services', /services\.length > 0 \?/],
    ['process', /processMedia\.length > 0 \?/],
    ['portfolio', /portfolioPhotos\.length > 0 \?/],
    ['reels', /reels\.length > 0 \?/],
  ])('%s renders only when it has content', (_name, pattern) => {
    expect(src).toMatch(pattern)
  })
})

describe('the data path reads only what already exists', () => {
  const page = stripComments(code('app/providers/[id].tsx'))

  it('partitions process out of the same posts read, with no new content type', () => {
    expect(page).toMatch(/content_type === 'process'/)
    // One posts read, partitioned three ways — not three queries and not a
    // second content type.
    //
    // BASE `posts`, AND THAT IS THE RULING. A directly-opened profile sits
    // outside PD-089's ordinary-surface hiding rule for the closed beta
    // (founder ruling 2026-09-15, preserving PD-090/PD-104/OQ-076). This
    // assertion was briefly retargeted to `posts_visible` and is restored.
    expect((page.match(/\.from\('posts'\)/g) ?? []).length).toBe(1)
  })


  it('does not read the owner-only booking preferences table', () => {
    // provider_booking_preferences is readable ONLY by the provider who owns the
    // row (provider_read_own_preferences). A client read returns zero rows and
    // no error, so the policy defaults would render as the provider's own terms.
    expect(page).not.toContain('provider_booking_preferences')
  })

  it('still reads the live follower count, which Follow depends on', () => {
    expect(page).toMatch(/provider_follower_count/)
  })
})
