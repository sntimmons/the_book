import fs from 'fs'
import path from 'path'

// PRODUCT DECISION: a negative service experience is still a NORMAL review.
// Every 1-5 star rating must continue through the SAME review flow, carrying the
// selected rating, with text optional and no positive-language affirmation and no
// Phase 2 structured signal required. Serious incident reporting stays separate.

const root = path.join(__dirname, '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')
const stripTs = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const satisfaction = read('app', 'post-booking', 'satisfaction.tsx')
const clientForm = read('app', 'post-booking', 'review.tsx')
const issue = read('app', 'post-booking', 'issue.tsx')

// Reimplementation of satisfaction.tsx's reviewHref() — kept in lockstep by the
// source-parity test below, so these behavioural cases cannot silently drift.
function reviewHref(id: string | undefined, rating: number): string {
  const parts: string[] = []
  if (id) parts.push('id=' + id)
  if (rating > 0) parts.push('rating=' + rating)
  return '/post-booking/review' + (parts.length ? '?' + parts.join('&') : '')
}

// Mirrors review.tsx's parsedRating.
function parsedRating(ratingParam: string | undefined): number | null {
  const n = parseInt(ratingParam ?? '', 10)
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n
  return null
}

function ratingParamOf(href: string): string | undefined {
  return href.split('?')[1]?.split('&').find((p) => p.startsWith('rating='))?.split('=')[1]
}

describe('every rating 1-5 reaches the SAME normal review form', () => {
  it.each([1, 2, 3, 4, 5])('a %i-star rating routes to /post-booking/review', (stars) => {
    const href = reviewHref('bk1', stars)
    expect(href.startsWith('/post-booking/review')).toBe(true)
    // never diverted into the report/incident system
    expect(href).not.toMatch(/issue|report/i)
  })

  it.each([1, 2, 3, 4, 5])('a %i-star rating is PRESERVED end to end', (stars) => {
    const href = reviewHref('bk1', stars)
    expect(ratingParamOf(href)).toBe(String(stars))
    // and survives the receiving screen's parse/clamp
    expect(parsedRating(ratingParamOf(href))).toBe(stars)
  })

  it('low ratings are not treated differently from high ones', () => {
    const low = reviewHref('bk1', 1).replace('rating=1', 'rating=N')
    const high = reviewHref('bk1', 5).replace('rating=5', 'rating=N')
    expect(low).toBe(high)
  })

  it('a rating is required to continue, but nothing more', () => {
    expect(stripTs(satisfaction)).toMatch(/const canContinue = rating > 0/)
  })
})

describe('the single continue path makes no positive-experience claim', () => {
  it('the primary CTA is rating-neutral', () => {
    expect(stripTs(satisfaction)).not.toMatch(/Yes, it was great/)
    // stripTs so a comment mentioning the label cannot satisfy this
    expect(stripTs(satisfaction)).toMatch(/Continue to review/)
  })

  it('no affirmation of a good experience is required anywhere on the path', () => {
    const src = stripTs(satisfaction)
    expect(src).not.toMatch(/it was great|was great\?|loved it|happy with/i)
  })

  it('the review form does not presuppose a positive experience', () => {
    expect(stripTs(clientForm)).not.toMatch(/what made this appointment great/i)
  })
})

describe('ordinary negative feedback is NOT routed into incident reporting', () => {
  it('the secondary action no longer reads as the negative-review branch', () => {
    expect(stripTs(satisfaction)).not.toMatch(/Something wasn't right/)
    expect(stripTs(satisfaction)).toMatch(/Report a problem/)
  })

  it('the report path is separate: it writes reports, never a review', () => {
    expect(issue).toMatch(/from\('reports'\)/)
    expect(issue).not.toMatch(/provider_reviews|client_reviews/)
  })

  it('the report path carries no rating (it is not a review path)', () => {
    const fn = satisfaction.slice(satisfaction.indexOf('function issueHref'))
    expect(fn.slice(0, fn.indexOf('}'))).not.toMatch(/rating/)
  })

  it('the review CTA is primary and the report action secondary', () => {
    const src = stripTs(satisfaction)
    expect(src.indexOf('Continue to review')).toBeLessThan(src.indexOf('Report a problem'))
  })
})

describe('text and tags stay optional; no Phase 2 signal required', () => {
  it('submission requires only the rating', () => {
    expect(clientForm).toMatch(/const canPost = parsedRating != null/)
    expect(stripTs(clientForm)).not.toMatch(/reviewText\.trim\(\)\.length > 10/)
  })

  it('the insert sends null text/tags rather than demanding them', () => {
    expect(clientForm).toMatch(/review_text:/)
    expect(clientForm).toMatch(/tags:/)
  })

  it('no structured signal gates the negative-review path', () => {
    for (const src of [satisfaction, clientForm]) {
      expect(stripTs(src)).not.toMatch(
        /review_signals|reliability_score|cancellation_score|conduct_profile/,
      )
    }
  })
})

// Guards the reimplementations above against drift from the real source, and binds
// them to the two places a regression would actually land: the CTA's call site and
// the value written to the row. Without these, a rating-dependent branch on the
// button or a hardcoded `rating: 5` would leave every other test in this file green.
describe('source parity — the guard is bound to the real call sites', () => {
  it('reviewHref in the screen matches the logic modelled here', () => {
    const fn = satisfaction.slice(
      satisfaction.indexOf('function reviewHref'),
      satisfaction.indexOf('function issueHref'),
    )
    expect(fn).toMatch(/parts\.push\('id=' \+ id\)/)
    expect(fn).toMatch(/if \(rating > 0\) parts\.push\('rating=' \+ rating\)/)
    expect(fn).toMatch(/'\/post-booking\/review'/)
  })

  it('the primary CTA calls reviewHref() unconditionally — no rating-dependent branch', () => {
    const src = stripTs(satisfaction)
    // the exact, whole call site: any conditional expression here fails the match
    expect(src).toMatch(/onPress=\{\(\) => router\.push\(reviewHref\(\) as never\)\}/)
    // and no navigation anywhere in the screen branches on the rating value
    expect(src).not.toMatch(/router\.push\([^)]*rating\s*[<>=!]/)
    expect(src).not.toMatch(/rating\s*[<>=!]=?\s*\d[^)]*\?[^)]*Href\(\)/)
  })

  it('the insert writes the parsed rating, not a literal or a substitute', () => {
    expect(stripTs(clientForm)).toMatch(/rating:\s*parsedRating,/)
    expect(stripTs(clientForm)).not.toMatch(/rating:\s*\d/)
  })

  it('parsedRating in the review form matches the clamp modelled here', () => {
    expect(clientForm).toMatch(/n >= 1 && n <= 5/)
  })
})
