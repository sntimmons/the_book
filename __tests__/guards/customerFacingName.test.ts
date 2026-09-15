import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// THE CUSTOMER-FACING NAME IS "THIRD".
//
// Legacy user-visible copy said "The Book". This guard stops it coming back in
// anything a user can read, while deliberately leaving it alone everywhere it is
// NOT a brand string a user sees:
//
//   * code comments — they carry reasoning and history, and rewriting them would
//     distort the record of why decisions were made
//   * identifiers, route names, database objects, migrations, Supabase objects
//   * documentation, which is a separate archive with its own history
//
// ── WHY THIS IS LINE-BASED AND NOT A PARSER ──────────────────────────────
//
// The obvious implementation walks the file character by character tracking string
// state. It is wrong here, and quietly so: JSX text contains bare apostrophes —
// `Tap the bookmark on a provider's profile` — which a naive parser reads as the
// start of a string literal. From there it is desynced, and it starts reporting
// comments as user-visible copy. That is exactly the false positive this file
// exists to avoid, so classification is done per line instead.

const ROOTS = ['app', 'components', 'lib', 'hooks', 'store', 'context']
const LEGACY = 'The Book'

// ── WHY THE MATCH IS CASE-INSENSITIVE ────────────────────────────────────
//
// It was `line.indexOf('The Book')`, which is case-SENSITIVE — and the six auth
// screens render the brand as a letter-spaced wordmark, `>THE BOOK<`. So this
// guard passed over six live violations from the day it was written: every
// client who tapped Sign In or Sign Up saw the old name at the top of the
// screen, and the test that exists to prevent exactly that could not see them.
//
// A brand string is the same brand string in any casing. Matching is now
// case-insensitive — with a TRAILING WORD BOUNDARY, which is load-bearing: the
// app says "Tap the bookmark on a provider's profile", and without `\\b` a
// case-insensitive `the book` swallows "the bookmark", "the booking" and "the
// booked" and reports ordinary copy as a brand violation. The self-tests below
// pin that exact case.
const LEGACY_RE = new RegExp(`${LEGACY.replace(/ /g, '\\s+')}\\b`, 'i')

/** Line numbers (1-based) where LEGACY appears OUTSIDE any comment. */
export function visibleOccurrences(src: string): number[] {
  const out: number[] = []
  let inBlock = false
  src.split('\n').forEach((line, i) => {
    const startedInBlock = inBlock

    // Update block state from this line's delimiters.
    let scan = line
    while (true) {
      if (!inBlock) {
        const open = scan.indexOf('/*')
        if (open === -1) break
        inBlock = true
        scan = scan.slice(open + 2)
      } else {
        const close = scan.indexOf('*/')
        if (close === -1) break
        inBlock = false
        scan = scan.slice(close + 2)
      }
    }

    // `at` is the offset of the match, which the comment tests below need.
    const m = line.match(LEGACY_RE)
    if (!m || m.index === undefined) return
    const at = m.index
    if (startedInBlock) return // continuation of a block comment

    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

    // A `//` earlier on the line comments out the rest of it.
    const lineComment = line.indexOf('//')
    if (lineComment !== -1 && lineComment < at) return

    // A `/* … */` opened earlier on this line and enclosing the term.
    const blockOpen = line.lastIndexOf('/*', at)
    if (blockOpen !== -1) {
      const closeBefore = line.indexOf('*/', blockOpen)
      if (closeBefore === -1 || closeBefore > at) return
    }

    out.push(i + 1)
  })
  return out
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) sourceFiles(p, acc)
    else if (/\.tsx?$/.test(entry)) acc.push(p)
  }
  return acc
}

describe('no user-visible copy calls the product "The Book"', () => {
  it('finds none in any string literal or rendered text', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const src = readFileSync(file, 'utf8')
        if (!LEGACY_RE.test(src)) continue
        for (const line of visibleOccurrences(src)) {
          offenders.push(`${file.replace(`${process.cwd()}/`, '')}:${line}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the classifier itself is honest', () => {
  it('flags a plain string, which is what reaches a user', () => {
    expect(visibleOccurrences(`const a = 'The Book takes no payment'`)).toEqual([1])
  })

  it('flags JSX text', () => {
    expect(visibleOccurrences(`  <Text>Booked on The Book</Text>`)).toEqual([1])
  })

  it('flags a template literal', () => {
    expect(visibleOccurrences('const a = `Check out ${x} on The Book`')).toEqual([1])
  })

  it('ignores a line comment', () => {
    expect(visibleOccurrences('// The Book used to be the name')).toEqual([])
  })

  it('ignores a trailing comment after real code', () => {
    expect(visibleOccurrences(`const a = 1 // The Book, historically`)).toEqual([])
  })

  it('ignores a single-line JSX comment', () => {
    expect(visibleOccurrences('{/* The Book never charges it. */}')).toEqual([])
  })

  it('ignores a multi-line JSX comment, including lines with quotes in them', () => {
    const src = [
      '{/* PRODUCT TRUTH: a note promising "refunds within 48 hours" sat here.',
      '    The Book takes no payment, so there is nothing to refund. */}',
    ].join('\n')
    expect(visibleOccurrences(src)).toEqual([])
  })

  it('ignores a JSDoc block', () => {
    const src = ['/**', ' * The Book was the old name.', ' */'].join('\n')
    expect(visibleOccurrences(src)).toEqual([])
  })

  it("is not desynced by an apostrophe in JSX text — the bug this replaced", () => {
    const src = [
      `  <Text>Tap the bookmark on a provider's profile to save them.</Text>`,
      '  // The Book, historically, called this something else',
      `  <Text>Booked on The Book</Text>`,
    ].join('\n')
    // Only line 3 is user-visible; the comment on line 2 must not be reported.
    expect(visibleOccurrences(src)).toEqual([3])
  })
})
