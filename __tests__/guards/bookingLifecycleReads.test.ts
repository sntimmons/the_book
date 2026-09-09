import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// ── TWO RULES THAT WERE BROKEN BY OMISSION, NOT BY A WRONG LINE ───────────
//
// Correction 3 gave `bookings` a second axis — `submitted_at` — and the failures
// that followed were all of the same shape: code written when a `bookings` row
// could only mean "a real request" carried on assuming that after the meaning
// widened. Nothing was written incorrectly; things were simply not updated, and
// no test could notice an omission.
//
// So these two guards look for the ABSENCE of the update, in the two places where
// getting it wrong is user-visible and silent:
//
//   1. A client-facing list that reads a client's own bookings and does not
//      exclude drafts, which showed an unsent draft as "Pending — waiting for
//      provider confirmation" for a request no provider could see.
//   2. A booking deadline computed from `created_at`, which after this change is
//      the DRAFT timestamp — so a request submitted from a day-old draft arrived
//      at the provider already "expired", and could not be answered at all.
//
// Both are grep-shaped for the same reason `betaClaimsAbsent` is: the property is
// "this pattern does not appear", and a unit test cannot assert that about code
// nobody has written yet.

const ROOT = join(__dirname, '..', '..')
const ROOTS = ['app', 'components', 'lib', 'hooks', 'context', 'store']

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, full))
    }
  }
  for (const r of ROOTS) walk(join(ROOT, r))
  return out.sort()
}

/**
 * Source with comments stripped, so prose about a rule is not a hit.
 *
 * A whole-line comment is removed WITH ITS NEWLINE. Leaving a blank line behind
 * broke the query-chunking below: a `.not('submitted_at', …)` that sits after an
 * explanatory comment fell outside its own chunk, and the guard reported four
 * files that had in fact been fixed. A guard that lies about a fix is worse than
 * no guard, because the next author "fixes" it by deleting the assertion.
 */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*\r?\n/gm, '')
    .replace(/[ \t]*\/\/.*$/gm, '')
}

describe('an unsent draft is never presented as a sent request', () => {
  // A query that reads the CALLER'S OWN bookings — `.eq('user_id', …)` — is a
  // client-facing read, and the client's SELECT policy deliberately returns their
  // drafts (that is what makes resuming one possible). So each of these must say
  // what it wants: exclude drafts, or select `submitted_at` and decide per row.
  const OWN_BOOKING_READ = /from\(\s*'bookings'\s*\)([\s\S]{0,700}?)(?=\n\s*\n|from\(\s*'|$)/g

  it('finds the client booking reads to check (a guard over nothing passes vacuously)', () => {
    let found = 0
    for (const rel of sourceFiles()) {
      const src = code(rel)
      let m: RegExpExecArray | null
      OWN_BOOKING_READ.lastIndex = 0
      while ((m = OWN_BOOKING_READ.exec(src)) !== null) {
        if (/\.eq\(\s*'user_id'/.test(m[1]) && /\.select\(/.test(m[1])) found += 1
      }
    }
    expect(found).toBeGreaterThan(2)
  })

  it('every read of a client’s own bookings accounts for drafts', () => {
    const offenders: string[] = []
    for (const rel of sourceFiles()) {
      const src = code(rel)
      let m: RegExpExecArray | null
      OWN_BOOKING_READ.lastIndex = 0
      while ((m = OWN_BOOKING_READ.exec(src)) !== null) {
        const body = m[1]
        if (!/\.eq\(\s*'user_id'/.test(body) || !/\.select\(/.test(body)) continue
        // A write's `.select()` is a returning clause, not a list read.
        if (/\.(insert|update|upsert|delete)\(/.test(body)) continue
        const excludes = /submitted_at/.test(body)
        if (!excludes) {
          offenders.push(
            `${rel} reads the client's own bookings without excluding or selecting ` +
              `submitted_at — an unsent DRAFT would be presented as a real request`,
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('a booking deadline is never computed from created_at', () => {
  // `created_at` is stamped when the DRAFT is created, at the contract step.
  // `submitted_at` is when the request was actually made, and `expires_at` is the
  // server's deadline derived from it. Two provider screens computed
  // `created_at + 24 hours`, which was wrong in three ways at once and disabled
  // Decline — something the server deliberately permits forever.
  it('no source file adds a 24-hour window to a booking timestamp', () => {
    const offenders: string[] = []
    for (const rel of sourceFiles()) {
      const src = code(rel)
      // Scoped to files that actually read bookings. Other modules legitimately
      // use a 24-hour constant next to a `created_at` — the review reveal window
      // (7 days) and the new-provider window (30 days) both do — and flagging
      // those would train the next author to widen the exemption list rather than
      // read the finding.
      if (!/from\(\s*'bookings'\s*\)/.test(src)) continue
      // A BARE 24-hour span. `7 * 24 * 60 * 60 * 1000` is the review reveal
      // window and is a different rule entirely, so a leading multiplier means
      // this is not a one-day deadline — the negative lookbehind is what tells
      // the two apart without an exemption list.
      if (!/(?<![\d)]\s*\*\s*)24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src)) continue
      if (/created_at|createdAt/.test(src)) {
        offenders.push(
          `${rel} computes a 24-hour deadline alongside created_at — booking expiry ` +
            `is 72 hours from submitted_at, and lives in lib/bookingStatus.ts`,
        )
      }
    }
    expect(offenders).toEqual([])
  })

  it('the expiry rule is stated once, in the canonical module', () => {
    const status = code(join('lib', 'bookingStatus.ts'))
    // It reads the server's own columns and nothing else.
    expect(status).toMatch(/submitted_at/)
    expect(status).toMatch(/expires_at/)
    // And it does not re-derive the deadline from created_at.
    expect(status).not.toMatch(/created_at/)
  })
})
