import { readFileSync } from 'fs'
import { join } from 'path'

// EVERY PRODUCT-CREATED VIDEO POST MUST HAVE A USABLE STILL.
//
// ── THE DEFECT THIS LOCKS OUT ─────────────────────────────────────────────
//
// Nothing wrote `posts.thumbnail_url`. Every video a provider uploaded stored
// NULL, and the consequence was split across four surfaces with no error
// anywhere: the Reels tab played `media_url` and looked fine, while Discover's
// "See the work" dropped the item and provider search and the business posts
// grid drew blank tiles. One upload, three broken surfaces, and the one surface
// that worked is the one a provider would check.
//
// Source-level because the failure is an ABSENCE. A missing column in an insert
// renders perfectly happily — there is nothing to see at the moment it goes
// wrong, and the damage only appears on other screens later.

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

/** Every file in the app that inserts a row into `posts`. */
const POST_INSERT_SITES = [
  'app/(tabs)/business/posts.tsx',
  'app/(tabs)/business/portfolio.tsx',
  'app/onboarding/provider/golive.tsx',
] as const

describe('the set of post-creation paths is the set this guard knows about', () => {
  it('no new insert site appeared without being listed here', () => {
    // A guard that checks three files while a fourth exists proves nothing. This
    // is the assertion that keeps the list honest.
    const roots = ['app', 'components', 'lib', 'hooks']
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of require('fs').readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(e.name)) {
          const src = stripComments(code(rel))
          if (/from\(\s*['"]posts['"]\s*\)[\s\S]{0,80}?\.insert\(/.test(src)) found.push(rel)
        }
      }
    }
    roots.forEach(walk)
    expect(found.sort()).toEqual([...POST_INSERT_SITES].sort())
  })
})

describe('every video-creating path supplies a thumbnail', () => {
  it('business/posts.tsx writes thumbnail_url from the upload result', () => {
    const src = stripComments(code('app/(tabs)/business/posts.tsx'))
    expect(src).toMatch(/thumbnailUrl/)
    expect(src).toMatch(/thumbnail_url:\s*thumbnailUrl/)
    expect(src).toMatch(/media_type:\s*kind === 'image' \? 'image' : 'video'/)
  })

  it('golive.tsx writes thumbnail_url on every reel row', () => {
    const src = stripComments(code('app/onboarding/provider/golive.tsx'))
    const reels = src.slice(src.indexOf('reelUrls.map('))
    const row = reels.slice(0, reels.indexOf('}))'))
    expect(row).toMatch(/media_type:\s*'video'/)
    expect(row).toMatch(/thumbnail_url:\s*item\.thumbnailUrl/)
  })

  it('portfolio.tsx creates images only, so it needs no video-thumbnail behaviour', () => {
    const src = stripComments(code('app/(tabs)/business/portfolio.tsx'))
    expect(src).toMatch(/media_type:\s*'image'/)
    expect(src).not.toMatch(/'video'/)
  })
})

describe('the still is produced at the shared boundary, not per caller', () => {
  const src = stripComments(code('lib/storage.ts'))

  it('the upload contract carries the thumbnail', () => {
    expect(src).toMatch(/thumbnailUrl:\s*string \| null/)
    expect(src).toMatch(/export interface UploadedMedia/)
  })

  it('a video that cannot produce a still fails the whole upload', () => {
    // The invariant has to be enforced where the media is, not hoped for at
    // three call sites. No still -> no url -> no row.
    expect(src).toMatch(/if \(VIDEO_EXT\.includes\(ext\)\)/)
    expect(src).toMatch(/if \(!still\.url\)/)
    expect(src).toMatch(/return \{ url: null, thumbnailUrl: null, error: still\.error \}/)
  })

  it('and removes the orphaned video object rather than leaving it in the bucket', () => {
    expect(src).toMatch(/\.remove\(\[data\.path\]\)/)
  })

  it('never substitutes an unrelated image', () => {
    // A still that is not a frame of THIS video is a picture of somebody else's
    // work on somebody's post.
    expect(src).not.toMatch(/placeholder|fallbackImage|defaultThumb|stockImage/i)
  })

  it('imports the native module lazily, so a build without it degrades instead of crashing', () => {
    // A top-level import of a native module absent from the running binary
    // throws at MODULE LOAD and takes down every screen that touches storage.
    expect(src).not.toMatch(/^import .*expo-video-thumbnails/m)
    expect(src).toMatch(/require\('expo-video-thumbnails'\)/)
    expect(src).toMatch(/typeof VideoThumbnails\?\.getThumbnailAsync !== 'function'/)
  })

  it('an image upload is unchanged and claims no thumbnail', () => {
    expect(src).toMatch(/return \{ url: urlData\.publicUrl, thumbnailUrl: null, error: null \}/)
  })
})

describe('downstream surfaces still show stills, and only Reels plays', () => {
  // THE LIST BELOW IS CENSUSED, NOT HAND-MAINTAINED.
  //
  // The first version of this guard asserted the still-rule against a
  // hand-written list of two files while a third — the provider's own public
  // profile — rendered a video URL through <Image> and showed empty rectangles.
  // A list nobody checks for completeness proves only that the files on it are
  // fine. So every file that reads `media_type` must be accounted for here, and
  // adding a new one fails this test until someone says which kind it is.
  const PLAYS = ['app/(tabs)/reels.tsx']
  const DRAWS_A_STILL = [
    'app/(tabs)/search.tsx',
    'app/(tabs)/business/posts.tsx',
    'app/providers/[id].tsx',
    'lib/discoverSocial.ts',
    'hooks/useProviders.ts',
  ]
  // Writers, not readers: they create rows and never render one.
  const WRITES_ONLY = ['app/(tabs)/business/portfolio.tsx', 'app/onboarding/provider/golive.tsx']

  it('every file that reads media_type is accounted for as a player or a still', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const e of require('fs').readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(e.name) && code(rel).includes('media_type')) found.push(rel)
      }
    }
    ;['app', 'components', 'lib', 'hooks'].forEach(walk)
    expect(found.sort()).toEqual([...PLAYS, ...DRAWS_A_STILL, ...WRITES_ONLY].sort())
  })

  it.each([
    ['app/(tabs)/search.tsx', /isVideo \? post\.thumbnail_url : post\.media_url/],
    ['app/(tabs)/business/posts.tsx', /isVideo \? post\.thumbnail_url : post\.media_url/],
    [
      'app/providers/[id].tsx',
      /media_type === 'video' \? r\.thumbnail_url : r\.media_url/,
    ],
  ])('%s draws a still, not a player', (rel, pattern) => {
    const src = stripComments(code(rel))
    expect(src).toMatch(pattern)
    expect(src).not.toMatch(/shouldPlay|<Video\b/)
  })

  it('Discover resolves a video to its thumbnail and never mounts a player', () => {
    const lib = stripComments(code('lib/discoverSocial.ts'))
    expect(lib).toMatch(/media_type === 'video' \? r\.thumbnail_url/)
    const rows = stripComments(code('components/DiscoverSocialRows.tsx'))
    expect(rows).not.toMatch(/shouldPlay|<Video\b|from ['"]expo-av['"]/)
  })

  it('See the work remains a doorway into the existing Reels experience', () => {
    const rows = stripComments(code('components/DiscoverSocialRows.tsx'))
    expect(rows).toContain("'/(tabs)/reels'")
    expect(rows).not.toMatch(/from ['"]expo-av['"]|useVideoPlayer|pagingEnabled/)
  })

  it('the provider profile selects the still it renders', () => {
    // It renders every tile through <Image>, which has nothing to show for an
    // .mp4 — so the column has to be in the query before the ternary can work.
    const screen = stripComments(code('app/providers/[id].tsx'))
    expect(screen).toMatch(/\.select\('id, media_url, thumbnail_url, media_type/)
    const profile = stripComments(code('components/ProviderProfile.tsx'))
    expect(profile).not.toMatch(/shouldPlay|<Video\b|useVideoPlayer|from ['"]expo-av['"]/)
  })

  it('the Reels tab is still the only surface that plays media_url', () => {
    const reels = stripComments(code('app/(tabs)/reels.tsx'))
    expect(reels).toMatch(/shouldPlay/)
  })
})

describe('no ranking or marketplace logic moved', () => {
  it('the storage boundary touches no discovery, ranking or eligibility module', () => {
    const src = stripComments(code('lib/storage.ts'))
    expect(src).not.toMatch(/discovery|providerSearchRank|DiscoveryProvider|average_rating|is_featured/i)
  })

  it('the thumbnail is never read as a ranking or eligibility input', () => {
    for (const rel of ['lib/discovery.ts', 'lib/providerSearchRank.ts']) {
      expect(stripComments(code(rel))).not.toMatch(/thumbnail/i)
    }
  })
})
