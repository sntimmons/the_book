import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// ── ANDROID RENDERS AT MOST THREE `Alert.alert` BUTTONS ───────────────────
//
// `Alert.alert` maps its button array onto the native dialog's positive /
// negative / neutral slots. There are three. Anything past the third is
// SILENTLY DROPPED — no error, no warning, no log.
//
// Session 8 shipped three pickers built this way. The provider report sheet
// listed nine reasons, the community post sheet five, and the post-booking
// flow its own set; on Android each rendered three of them, and because
// `Cancel` is conventionally LAST in the array, the dismiss control was among
// the buttons that did not exist. A person trying to report a safety concern
// got a dialog that did not offer "Safety concern" and could not be closed.
//
// This is not a thing a unit test of behaviour can catch — it is a property of
// the platform's dialog, invisible to jsdom and to iOS. So it is caught here,
// in the source, before it ships again. A picker longer than three options is
// a sheet: see components/ReportSheet.tsx.

// Every directory that can contain a screen or a helper that raises a dialog.
// `store` and `context` hold none today; nothing stopped one arriving, and the
// cost of scanning them is nil.
const ROOTS = ['app', 'components', 'hooks', 'lib', 'store', 'context']
const MAX_ANDROID_BUTTONS = 3

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * The full text of each `Alert.alert(...)` call, parens balanced.
 *
 * **Skips over string literals and comments**, which the first version did not.
 * It balanced parens by raw character scan, so the first `)` inside a MESSAGE
 * closed the call early and the button array was never seen at all:
 *
 *     Alert.alert('Could not save', 'Try again (error 27)', [ ...four buttons ])
 *
 * counted zero buttons and passed. No such string exists in the repo today,
 * which is exactly why it needed fixing now — a guard that fails by passing
 * silently has the same failure mode as the platform bug it was written to catch.
 */
function alertCalls(src: string): { text: string; line: number; truncated: boolean }[] {
  const calls: { text: string; line: number; truncated: boolean }[] = []
  const needle = 'Alert.alert('
  let from = 0
  for (;;) {
    const start = src.indexOf(needle, from)
    if (start === -1) return calls
    let depth = 0
    let i = start + needle.length - 1
    let closed = false
    for (; i < src.length; i++) {
      const c = src[i]
      // Strings and template literals: skip to the matching quote, honouring
      // backslash escapes. Anything inside is text, not syntax.
      if (c === "'" || c === '"' || c === '`') {
        const quote = c
        i++
        for (; i < src.length; i++) {
          if (src[i] === '\\') i++
          else if (src[i] === quote) break
        }
        continue
      }
      if (c === '/' && src[i + 1] === '/') {
        i = src.indexOf('\n', i)
        if (i === -1) break
        continue
      }
      if (c === '/' && src[i + 1] === '*') {
        const close = src.indexOf('*/', i + 2)
        if (close === -1) break
        i = close + 1
        continue
      }
      if (c === '(') depth++
      else if (c === ')') {
        depth--
        if (depth === 0) {
          closed = true
          break
        }
      }
    }
    calls.push({
      text: src.slice(start, closed ? i + 1 : src.length),
      line: src.slice(0, start).split('\n').length,
      // An unbalanced call means the scanner lost its place. That is reported as
      // an offender rather than skipped — see the test below.
      truncated: !closed,
    })
    from = closed ? i + 1 : start + needle.length
  }
}

/**
 * Drop any NESTED `Alert.alert(...)` from a call before counting its buttons.
 *
 * A confirm-then-act menu legitimately contains further alerts inside its
 * `onPress` handlers — `openOfferMenu` in the community feed has two — and each
 * of those is its own dialog with its own three slots. Counting them against
 * the outer menu would report a two-button menu as a seven-button one, and a
 * guard that cries wolf is a guard that gets deleted.
 */
function withoutNested(call: string): string {
  const needle = 'Alert.alert('
  let out = call
  for (;;) {
    const start = out.indexOf(needle, 1)
    if (start === -1) return out
    let depth = 0
    let i = start + needle.length - 1
    for (; i < out.length; i++) {
      if (out[i] === '(') depth++
      else if (out[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    out = out.slice(0, start) + out.slice(i + 1)
  }
}

/**
 * Blank out comments and string CONTENT before anything is counted.
 *
 * `alertCalls` already skips both while balancing parens, but the counting was
 * done on the raw slice — so a commented-out `{ text: … }` was counted as a
 * button. That direction fails LOUDLY rather than silently, which is the right
 * way round for a guard to be wrong, but it is still wrong: a false positive
 * that has to be explained is a guard people start ignoring.
 *
 * Quotes are kept and only their contents removed, so the shape of the code
 * survives for the regexes below.
 */
function codeOnly(src: string): string {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"' || c === '`') {
      out += c
      i++
      for (; i < src.length; i++) {
        if (src[i] === '\\') i++
        else if (src[i] === c) break
      }
      out += c
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      if (nl === -1) break
      i = nl
      out += '\n'
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2)
      if (close === -1) break
      i = close + 1
      continue
    }
    out += c
  }
  return out
}

const FILES = ROOTS.flatMap(sourceFiles)

describe('no Alert.alert offers more buttons than Android will draw', () => {
  it('finds source to check (a passing test over zero files proves nothing)', () => {
    expect(FILES.length).toBeGreaterThan(20)
  })

  it('declares at most three buttons in any single alert', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      for (const call of alertCalls(readFileSync(file, 'utf8'))) {
        const buttons = (withoutNested(codeOnly(call.text)).match(/\btext:/g) ?? []).length
        if (buttons > MAX_ANDROID_BUTTONS) {
          offenders.push(`${file}:${call.line} declares ${buttons} buttons`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('parses every call it finds', () => {
    // If the scanner cannot balance a call it has lost its place, and every
    // count after it is meaningless. Loud, not silent.
    const unparsed: string[] = []
    for (const file of FILES) {
      for (const call of alertCalls(readFileSync(file, 'utf8'))) {
        if (call.truncated) unparsed.push(`${file}:${call.line} could not be parsed`)
      }
    }
    expect(unparsed).toEqual([])
  })

  it('declares its buttons inline, where they can be counted', () => {
    // The third way to defeat a `text:` count: hoist the array.
    //
    //     const buttons = [ ...six of them ]
    //     Alert.alert(title, message, buttons)
    //
    // scores zero and passes. A button array whose length is not visible at the
    // call site cannot be checked at the call site — which is reason enough not
    // to write one, so this asks for the array rather than trying to follow the
    // variable.
    const offenders: string[] = []
    for (const file of FILES) {
      for (const call of alertCalls(readFileSync(file, 'utf8'))) {
        const body = withoutNested(codeOnly(call.text))
        // A third argument that is neither an array literal nor absent.
        const thirdArg = /,\s*(?:\[|\)|$)/
        const hasButtons = body.includes('text:')
        const looksHoisted = /,\s*[A-Za-z_$][\w$]*\s*\)\s*$/.test(body.trim())
        if (looksHoisted && !hasButtons && thirdArg.test(body)) {
          offenders.push(`${file}:${call.line} passes a variable as its button array`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('never spreads a list into the button array', () => {
    // The shape that caused the bug. `...REASONS.map(r => ({ text: r.label }))`
    // reads as ONE `text:` in the source and expands to as many buttons as the
    // list is long, so a count alone would call it safe. A button array whose
    // length is not visible at the call site cannot be checked at the call
    // site, which is reason enough not to write one.
    const offenders: string[] = []
    for (const file of FILES) {
      for (const call of alertCalls(readFileSync(file, 'utf8'))) {
        if (/\.\.\..*\.map\(/s.test(withoutNested(codeOnly(call.text)))) {
          offenders.push(`${file}:${call.line} spreads a mapped list into its buttons`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})


// ── THE SCANNER IS ITSELF TESTED ──────────────────────────────────────────
//
// A guard over real source can only ever report "nothing found", which is the
// same answer a broken guard gives. So the scanner is fed sources that WOULD
// defeat an earlier version of it, and asked to notice.

function buttonsIn(src: string): number {
  const [call] = alertCalls(src)
  return (withoutNested(codeOnly(call.text)).match(/\btext:/g) ?? []).length
}

describe('the scanner survives what would have fooled it', () => {
  it('is not closed early by a parenthesis inside a message', () => {
    // The first version balanced parens by raw character scan, so this counted
    // ZERO buttons and passed.
    const src = `Alert.alert('Could not save', 'Try again (error 27)', [
      { text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' },
    ])`
    expect(buttonsIn(src)).toBe(4)
  })

  it('is not closed early by a parenthesis in a template literal', () => {
    const src = 'Alert.alert(`Failed (${code})`, msg, [\n' +
      "      { text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' },\n    ])"
    expect(buttonsIn(src)).toBe(4)
  })

  it('is not confused by an escaped quote inside a message', () => {
    const src = `Alert.alert('That didn\\'t work (sorry)', m, [
      { text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' },
    ])`
    expect(buttonsIn(src)).toBe(4)
  })

  it('ignores a commented-out button', () => {
    const src = `Alert.alert(t, m, [
      { text: 'A' }, // { text: 'ignored' }
      { text: 'B' },
    ])`
    expect(buttonsIn(src)).toBe(2)
  })

  it('does not count a nested alert against its parent', () => {
    const src = `Alert.alert(t, m, [
      { text: 'A', onPress: () => Alert.alert(t2, m2, [
        { text: 'X' }, { text: 'Y' }, { text: 'Z' },
      ]) },
      { text: 'B' },
    ])`
    expect(buttonsIn(src)).toBe(2)
  })

  it('reports an unbalanced call rather than skipping it', () => {
    const [call] = alertCalls("Alert.alert('unterminated', m, [{ text: 'A' }]")
    expect(call.truncated).toBe(true)
  })
})
