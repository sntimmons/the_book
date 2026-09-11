import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ── A PROVIDER'S RATING IS COMPUTED ONCE, AND NOT IN TYPESCRIPT ───────────
//
// PD-091 made the public rating the mean of the LATEST revealed review from each
// DISTINCT client; PD-092 made "latest" the most recently completed SERVICE. The
// rule lives in exactly one place — `provider_reputation_canonical()` — and
// `supabase/tests/reviews_phase2.test.sql` § 6b asserts that exactly one function
// in the schema contains it.
//
// THIS IS THE OTHER HALF OF THAT ASSERTION, and it exists because the SQL half
// passed while the app was wrong. `ProviderReviewsSection` and the see-all page
// averaged the fetched review rows in TypeScript:
//
//     const sum = reviews.reduce((s, r) => s + (r.rating || 0), 0)
//     return { average: sum / reviews.length, count: reviews.length }
//
// That is a second definition of the rating, and after PD-091 it is a DIFFERENT
// rating — twenty receipts from one loyal client average as twenty voices. So a
// provider profile rendered the canonical value in its header stat and the
// receipts mean, larger and in 40pt, a few rows below, both labelled "Rating".
// The two agree only until someone books the same provider twice, which is
// precisely the case the rule exists to govern.
//
// The database is the only thing that may answer "what is this provider's
// rating". Surfaces read it through `fetchProviderReputation`, which calls the
// `provider_reputation` RPC.
//
// WHAT THIS GUARD DOES NOT FORBID: averaging anything else. Response times,
// completion rates and per-dimension tallies are different questions with
// different rules. It looks only for an average taken over a `rating` field.

const ROOT = join(__dirname, '..', '..')
const ROOTS = ['app', 'components', 'lib', 'hooks', 'context', 'store']

// The one place a rating may be read from the server, and the RPC it calls.
const ALLOWED = new Set(['lib/reviews.ts'])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((r) => {
  try {
    return walk(join(ROOT, r))
  } catch {
    return []
  }
}).map((f) => relative(ROOT, f).split(sep).join('/'))

describe('a provider rating has exactly one definition', () => {
  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no module averages review ratings to produce a provider rating', () => {
    // `.rating` summed in a reduce, or divided by a `.length` — the two shapes a
    // hand-rolled mean takes. Deliberately blunt: a false positive here is a
    // conversation, and a false negative is a second rating on a profile.
    const summedRating = /reduce\([^)]*\)\s*=>\s*[^)]*\.rating/
    const offenders: string[] = []
    for (const f of files) {
      if (ALLOWED.has(f)) continue
      const src = readFileSync(join(ROOT, f), 'utf8')
      if (summedRating.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('the canonical reader exists and calls the database rule', () => {
    const src = readFileSync(join(ROOT, 'lib/reviews.ts'), 'utf8')
    expect(src).toContain('export async function fetchProviderReputation')
    expect(src).toContain("supabase.rpc('provider_reputation'")
    // The removed helper must stay removed. Re-adding it is how the second
    // definition came back the first time.
    expect(src).not.toContain('export function aggregateFromRevealed')
  })

  it('the surfaces that display a provider rating read it from the database', () => {
    for (const f of [
      'components/ProviderReviewsSection.tsx',
      'app/reviews/all/[id].tsx',
    ]) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      expect(src).toContain('fetchProviderReputation')
      expect(src).not.toContain('aggregateFromRevealed')
    }
  })
})
