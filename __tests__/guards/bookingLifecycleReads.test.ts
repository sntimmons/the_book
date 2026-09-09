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

// ── A CLIENT-FACING WINDOW CLAIM MUST BE DERIVED, NOT ASSERTED ────────────
//
// PD-077 tells the client "your provider has up to 72 hours to respond". The
// first version of that copy was a bare string with no predicate behind it, so
// it rendered on every submitted pending request FOREVER — including ones whose
// deadline had passed and which no provider could accept any more. Silence had
// been converted into a claim that never stops being made, which is precisely
// the defect ("has 24 hours to respond") PD-077 exists to end.
//
// The rule: a file that states the window must also read the column that bounds
// it. This is the same "absence of an update" shape as the guards above, and it
// is the check that would have caught it.
describe('a stated response window is bounded by the server column', () => {
  // The RESPONSE-window claim specifically. "72 hours before" is a provider
  // CANCELLATION POLICY option (lib/policy.ts, components/PolicyEditor.tsx) — a
  // different concept with no server deadline behind it — and flagging it would
  // teach the next author to widen an exemption list instead of reading the
  // finding.
  const WINDOW_CLAIM = /72 hours[\s\S]{0,80}?respond/

  it('finds the surfaces that state a window (a guard over nothing passes vacuously)', () => {
    const stating = sourceFiles().filter((rel) => WINDOW_CLAIM.test(code(rel)))
    expect(stating.length).toBeGreaterThan(0)
  })

  it('every surface that states the window also reads expires_at or the derived state', () => {
    const offenders: string[] = []
    for (const rel of sourceFiles()) {
      const src = code(rel)
      if (!WINDOW_CLAIM.test(src)) continue
      // Either it reads the server's deadline directly, or it consumes the
      // canonical derivation of it. `lib/bookingStatus.ts` is the derivation and
      // is exempt from needing to consume itself.
      // `app/book/confirmed.tsx` is the one legitimate exception and it is
      // EARNED, not assumed: the resume path was changed to route to
      // `/bookings/[id]`, so this screen is reachable only for a request just
      // sent. The exemption is spelled as a check on that fact — if the screen
      // ever regains a route that can carry an old request, the string here must
      // become derived like every other one.
      const freshOnly = rel === join('app', 'book', 'confirmed.tsx')
      const bounded =
        freshOnly
        || /expires_at/.test(src)
        || /bookingRequestUrgency|canAcceptRequest|requestTimeRemaining|requestUrgency/.test(src)
      if (!bounded) {
        offenders.push(
          `${rel} states a 72-hour response window without reading expires_at or the `
            + `derived request state — the claim would outlive the window it describes`,
        )
      }
    }
    expect(offenders).toEqual([])
  })

  it('the client detail screen can withhold the claim once the window has closed', () => {
    // The specific regression: the copy sat inside a status-only branch, and an
    // expired request keeps `status = 'pending'` by design (PD-071 — expired
    // requests are "not deleted and not hidden").
    const src = code(join('app', 'bookings', '[id].tsx'))
    expect(src).toMatch(/requestUrgency/)
    expect(src).toMatch(/expired/)
  })

  it('no booking-flow screen routes a RESUMED request to the just-sent confirmation', () => {
    // What earns confirmed.tsx its exemption above. `alreadySubmitted` means the
    // server found a request this client already sent — possibly days ago — so it
    // must not land on a screen that says it was just sent.
    for (const rel of [join('app', 'book', 'contract.tsx'), join('app', 'book', 'payment.tsx')]) {
      const src = code(rel)
      const branch = src.slice(src.indexOf('alreadySubmitted'))
      const upToReturn = branch.slice(0, branch.indexOf('return'))
      expect([rel, /book\/confirmed/.test(upToReturn)]).toEqual([rel, false])
    }
  })
})
