import { readFileSync } from 'fs'
import { join } from 'path'

// REELS AFTER THE SESSION 6B "HELD LIGHT" MIGRATION.
//
// Source-level, for the same reason the other surface guards are: every defect
// this file locks out renders perfectly happily when wrong. A re-introduced hex
// still paints. A decorative glyph still draws. A count that should not be on a
// content surface still reads as a number. None of it throws, and none of it is
// visible in a screenshot taken in one appearance on one account.

const code = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function stripComments(src: string): string {
  let inBlock = false
  return src
    .split('\n')
    .map((line) => {
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
        if (lineComment !== -1 && (block === -1 || lineComment < block)) {
          return out + line.slice(i, lineComment)
        }
        if (block !== -1) {
          out += line.slice(i, block)
          inBlock = true
          i = block + 2
          continue
        }
        return out + line.slice(i)
      }
      return out
    })
    .join('\n')
}

const REELS = 'app/(tabs)/reels.tsx'
const src = () => stripComments(code(REELS))

describe('Reels resolves every colour from the theme', () => {
  it('carries no colour literal', () => {
    const hits = (src().match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [])
    expect(hits).toEqual([])
  })

  it('the only rgba() is the media scrim, built from Ink', () => {
    // mediaScrim is the SAME Ink in both schemes because a scrim over a
    // photograph must not invert, and a gradient needs alpha stops that a hex
    // token cannot express. Ink is rgb(33,31,29). Same exception the provider
    // profile takes, and it is one helper rather than scattered literals.
    const rgba = src().match(/rgba\([^)]*\)/g) ?? []
    expect(rgba).toEqual(['rgba(${INK},${alpha})'])
    expect(src()).toContain("const INK = '33,31,29'")
  })

  it('reads the theme rather than a scheme flag', () => {
    expect(src()).toMatch(/useTheme\(\)/)
    expect(src()).not.toMatch(/scheme === ['"]dark['"]/)
  })

  it('no retired The Book palette value survives anywhere', () => {
    // Gold and bone are not roles in the Third system. They were 24 of the 35
    // literals this screen carried before the migration.
    const raw = code(REELS)
    for (const legacy of ['C8922A', 'F0E8D5', '080808', 'FF2D55', '1A1410']) {
      expect(raw).not.toContain(legacy)
    }
  })
})

describe('no engagement or popularity number is shown', () => {
  it('the rail renders no count', () => {
    const s = src()
    expect(s).not.toMatch(/formatCount/)
    expect(s).not.toMatch(/label=\{[^}]*reel\.(likes|comments)[^}]*\}/)
  })

  it('like and comment interactions still exist', () => {
    // The ruling removed the NUMBERS, not the interactions.
    const s = src()
    expect(s).toMatch(/onLike/)
    expect(s).toMatch(/onComment/)
    expect(s).toMatch(/from\(\s*['"]post_likes['"]\s*\)/)
    expect(s).toMatch(/from\(\s*['"]post_comments['"]\s*\)/)
  })

  it('an active Like never takes the primary action colour', () => {
    // actionPrimary is Mulberry and belongs to the screen's one marketplace
    // CTA. An active Like that borrowed it would compete with the thing the
    // screen exists to drive.
    const s = src()
    const railBlock = s.slice(s.indexOf('rightActions'), s.indexOf('leftContent'))
    expect(railBlock).not.toMatch(/actionPrimary/)
    expect(railBlock).not.toMatch(/statusDanger/)
  })

  it('there is no engagement-red token or literal', () => {
    expect(code(REELS)).not.toMatch(/LIKE_RED|engagementRed|likeRed/)
  })
})

describe('playback is a real control and the decorative glyph is gone', () => {
  it('no always-mounted centre play-circle', () => {
    const s = src()
    expect(s).not.toMatch(/play-circle/)
    expect(s).not.toMatch(/name="play"/)
  })

  it('playback follows viewer intent as well as feed position', () => {
    const s = src()
    expect(s).toMatch(/shouldPlay=\{isActive && wantsPlay\}/)
    expect(s).toMatch(/setWantsPlay/)
  })

  it('the paused state is carried in a word, not only in colour', () => {
    expect(src()).toMatch(/PAUSED/)
  })

  it('a single tap does not fire while a double-tap is still possible', () => {
    // Otherwise every double-tap-to-like also pauses the video underneath it.
    const s = src()
    expect(s).toMatch(/singleTapTimer/)
    expect(s).toMatch(/clearTimeout\(singleTapTimer\.current\)/)
  })
})

describe('one provider identity, and truthful attribution only', () => {
  it('the duplicate rail avatar is gone', () => {
    const s = src()
    expect(s).not.toMatch(/railAvatar/)
    expect(s).not.toMatch(/followBadge/)
  })

  it('the provider avatar is rendered exactly once', () => {
    // Count RENDER SITES, not mentions: the type field and the fetch mapping
    // also name `providerAvatarUrl` and neither of them draws anything.
    const s = src()
    expect((s.match(/styles\.providerAvatarImg/g) ?? []).length).toBe(1)
    expect((s.match(/styles\.providerAvatar\b/g) ?? []).length).toBe(1)
    expect((s.match(/styles\.providerAvatarInitials/g) ?? []).length).toBe(1)
  })

  it('claims nothing the product cannot establish', () => {
    const s = src()
    for (const claim of ['Verified', 'verified', 'Available now', 'Top rated', 'Popular', 'Trending']) {
      expect(s).not.toContain(claim)
    }
  })
})

describe('the primary action says what it does', () => {
  it('is labelled View & book, never Book alone', () => {
    const s = src()
    expect(s).toMatch(/View &amp; book/)
    expect(s).not.toMatch(/>\s*Book\s*</)
  })

  it('routes to the provider profile and does not touch the booking flow', () => {
    const s = src()
    expect(s).toMatch(/router\.push\(`\/providers\/\$\{reel\.providerId\}`/)
    expect(s).not.toMatch(/\/book\//)
    expect(s).not.toMatch(/startBooking/)
  })

  it('takes actionPrimary, the one primary action fill', () => {
    expect(src()).toMatch(/styles\.bookBtn, \{ backgroundColor: colors\.actionPrimary \}/)
  })
})

describe('the provider-only creation affordance', () => {
  it('requires a signed-in, role-resolved provider with a provider row', () => {
    expect(src()).toMatch(/const canCreate = !!user && isProvider && !!myProviderId/)
  })

  it('routes into the EXISTING Posts & Reels uploader', () => {
    const s = src()
    expect(s).toMatch(/router\.push\('\/\(tabs\)\/business\/posts'/)
    // No second uploader: this screen must not gain a picker or an upload call.
    expect(s).not.toMatch(/ImagePicker|launchImageLibrary|uploadMedia|uploadMultiple/)
  })

  it('is gated everywhere it appears', () => {
    const s = src()
    const pushes = s.split("router.push('/(tabs)/business/posts'").length - 1
    const gates = (s.match(/canCreate/g) ?? []).length
    expect(pushes).toBeGreaterThanOrEqual(1)
    // Declaration, prop on the item, prop in the interface, destructure, and a
    // gate at each entry point.
    expect(gates).toBeGreaterThanOrEqual(pushes + 2)
  })

  it('is not a floating button and adds no tab', () => {
    const s = src()
    expect(s).not.toMatch(/position: 'absolute'[^}]*bottom: \d+[^}]*borderRadius: 28/)
    expect(s).not.toMatch(/Tabs\.Screen|createBottomTab/)
  })
})

describe('navigation and product rules are untouched', () => {
  it('Reels still reads posts_visible, so PD-089 blocking still applies', () => {
    expect(src()).toMatch(/from\(\s*['"]posts_visible['"]\s*\)/)
  })

  it('the tab bar is not redefined here', () => {
    expect(src()).not.toMatch(/tabBar|Tabs\b/)
  })
})
