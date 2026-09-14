import { readFileSync } from 'fs'
import { join } from 'path'

// GUARDS FOR THE PHASE 2C CLIENT BOOKING SCREENS.
//
// Source-level on purpose. These protect properties that are easy to regress with an
// innocent-looking edit — a re-introduced hex, a duplicated flow chrome, a provider
// action leaking into the client branch, a claim about availability or payment that
// the product cannot honour — and that a render test would not necessarily catch,
// because the wrong value renders perfectly happily.

const code = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

// ── WHY COPY ASSERTIONS RUN AGAINST STRIPPED SOURCE ──────────────────────
//
// Several of these files quote the copy they REMOVED, inside a comment explaining
// why it went ("PRODUCT TRUTH: \"You won't be charged now\" implied a later
// charge."). A copy guard reading the raw file sees the removed sentence and fails,
// which would push the next person to delete the explanation rather than fix a
// defect. So comments are stripped first.
//
// Line-based, not a character parser: JSX text is full of bare apostrophes
// (`a provider's profile`), which a naive string-state parser reads as the start of
// a literal and then desyncs on, misclassifying comments as visible copy. The
// self-tests at the bottom of this file pin that exact failure mode.
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
          if (close === -1) break
          inBlock = false
          i = close + 2
          continue
        }
        const open = line.indexOf('/*', i)
        const lineComment = line.indexOf('//', i)
        if (lineComment !== -1 && (open === -1 || lineComment < open)) {
          out += line.slice(i, lineComment)
          break
        }
        if (open === -1) {
          out += line.slice(i)
          break
        }
        out += line.slice(i, open)
        inBlock = true
        i = open + 2
      }
      return out
    })
    .join('\n')
}

// KNOWN, DELIBERATE IMPRECISION: a `//` inside a string (a URL, say) truncates the
// rest of that line. That is safe here because every assertion built on this is a
// NEGATIVE match — over-stripping can only make a guard miss something, never make
// it fail on innocent code, and the guards that must not be fooled (colour literals,
// component usage) read the raw source instead.

/** Source with every comment removed — what a user could actually end up reading. */
const copy = (rel: string) => stripComments(code(rel))

const SERVICE = 'app/book/service.tsx'
const DATETIME = 'app/book/datetime.tsx'
const POLICY = 'app/book/policy.tsx'
const CONTRACT = 'app/book/contract.tsx'
const SEND = 'app/book/payment.tsx'
const SENT = 'app/book/confirmed.tsx'
const VERIFICATION = 'app/book/verification.tsx'
const DETAIL = 'app/bookings/[id].tsx'

const FLOW_STEPS = [SERVICE, DATETIME, POLICY, CONTRACT, SEND]
const TERMINALS = [SENT, VERIFICATION]
const ALL = [...FLOW_STEPS, ...TERMINALS, DETAIL]

// A raw hex, or an rgba() — there is no documented exception on any of these files.
const LITERAL = /(['"])#[0-9A-Fa-f]{3,8}\1|rgba\([^)]*\)/g

describe('no screen in the client booking flow carries its own colour', () => {
  it.each(ALL)('%s has no colour literal', (file) => {
    expect(code(file).match(LITERAL)).toBeNull()
  })

  it.each(ALL)('%s resolves colour from the theme, or owns no colour at all', (file) => {
    const s = code(file)
    // Either the screen reads the theme itself, or it declares no styles of its own
    // and hands every pixel to already-themed components (verification.tsx does).
    const readsTheme = /useTheme\(\)/.test(s)
    const ownsNoStyles = !/StyleSheet\.create\(/.test(s)
    expect(readsTheme || ownsNoStyles).toBe(true)
  })
})

describe('one flow chrome, not eight', () => {
  it.each(FLOW_STEPS)('%s renders the shared BookingFlowScreen', (file) => {
    expect(code(file)).toMatch(/<BookingFlowScreen/)
  })

  it.each(FLOW_STEPS)('%s does not re-implement the top bar or sticky footer', (file) => {
    const s = code(file)
    // The old per-screen chrome: a topBar with a hand-rolled back button, and an
    // absolutely positioned CTA bar. Both now belong to the shell.
    expect(s).not.toMatch(/styles\.topBar\b/)
    expect(s).not.toMatch(/styles\.backBtn\b/)
    expect(s).not.toMatch(/position: 'absolute',\s*\n\s*bottom: 0/)
  })

  it.each(FLOW_STEPS)('%s gets its step label from the progress authority', (file) => {
    const s = code(file)
    expect(s).toMatch(/bookingProgressLabel\(/)
    expect(s).toMatch(/progressLabel=\{/)
  })

  it.each(FLOW_STEPS)('%s hardcodes no step total', (file) => {
    // "Step 3 of 5" may only ever come from lib/bookingProgress.ts, which knows
    // whether a contract step exists for this provider.
    expect(code(file)).not.toMatch(/Step \d+ of \d+/)
  })
})

describe('a confirmation is not a progress step', () => {
  it.each(TERMINALS)('%s uses TerminalStatement, not the flow shell', (file) => {
    const s = code(file)
    expect(s).toMatch(/<TerminalStatement/)
    expect(s).not.toMatch(/<BookingFlowScreen/)
    expect(s).not.toMatch(/progressLabel/)
    expect(s).not.toMatch(/bookingProgressLabel/)
  })
})

describe('the flow claims nothing about live availability or scarcity', () => {
  const s = copy(DATETIME)

  it('describes times as PUBLISHED rather than as live availability', () => {
    expect(s).toMatch(/publish/i)
    expect(s).not.toMatch(/AVAILABLE TIMES/)
    expect(s).toMatch(/PUBLISHED TIMES/)
  })

  it('says outright that picking a time does not confirm it', () => {
    expect(s).toMatch(/not a confirmed slot until/i)
  })

  it('explains a greyed slot as published hours, and denies live availability', () => {
    expect(s).toMatch(/Greyed times are outside the hours/i)
    expect(s).toMatch(/does\n?\s*not show live availability/i)
  })

  it('uses no urgency, scarcity or capacity language', () => {
    for (const bad of [
      /\bonly \d+ (left|slot|spot)/i,
      /\blast (slot|spot|one)\b/i,
      /\bhurry\b/i,
      /\bselling fast\b/i,
      /\b\d+ (people|others) (are )?(viewing|looking)/i,
      /\bbook now before\b/i,
      /\bspots? remaining\b/i,
      /\bin high demand\b/i,
    ]) {
      expect(s).not.toMatch(bad)
    }
  })

  it('reuses the approved picker components rather than hand-rolling cells', () => {
    expect(s).toMatch(/<DayCell/)
    expect(s).toMatch(/<TimeSlotChip/)
    expect(s).not.toMatch(/styles\.dayCellSelected|styles\.timeSlotSelected/)
  })
})

describe('payment copy stays true', () => {
  it.each([SEND, SENT, POLICY])('%s never promises an in-app charge', (file) => {
    const s = copy(file)
    for (const bad of [
      /you('|’)ll be charged/i,
      /your card will be/i,
      /payment will be taken/i,
      /pay (now|here) /i,
      /charged (now|when|after)/i,
      /we (will )?(hold|authorize|capture)/i,
    ]) {
      expect(s).not.toMatch(bad)
    }
  })

  it('the send step says plainly that Third takes no payment', () => {
    expect(code(SEND)).toMatch(/Third does not take payment/)
  })

  it('the sent statement says the same', () => {
    expect(code(SENT)).toMatch(/Third does not take payment in this beta/)
  })
})

describe('the send step is the only control that claims to send', () => {
  it('the policy step continues to the agreement, it does not send', () => {
    const s = code(POLICY)
    expect(s).toMatch(/label="Continue to agreement"/)
    expect(s).not.toMatch(/label="Send[^"]*"/i)
  })

  it('the service and date steps only continue', () => {
    for (const file of [SERVICE, DATETIME]) {
      expect(code(file)).not.toMatch(/label="Send[^"]*"/i)
    }
  })

  it('the send step sends, and says what it is doing while it does', () => {
    const s = code(SEND)
    expect(s).toMatch(/label="Send booking request"/)
    expect(s).toMatch(/loadingLabel="Sending your request/)
  })
})

describe('the acknowledge shape is shared, not re-invented per step', () => {
  it.each([POLICY, CONTRACT])('%s uses the shared AcknowledgeRow', (file) => {
    expect(code(file)).toMatch(/<AcknowledgeRow/)
  })
})

describe('the contract step keeps its acceptance semantics', () => {
  const s = code(CONTRACT)

  it('still gates acceptance on the contract having been opened', () => {
    expect(s).toMatch(/opened/i)
  })

  it('still reads and writes a versioned contract', () => {
    expect(s).toMatch(/version/i)
  })

  it('owns its own scroll, so the read-to-the-end gate still works', () => {
    // Nesting the contract body inside the shell's ScrollView would break the
    // scroll-position gate, so the shell is told to stand down.
    expect(s).toMatch(/scrollable=\{false\}/)
  })
})

describe('the shared detail route shows client presentation without losing provider logic', () => {
  const s = code(DETAIL)
  const visible = copy(DETAIL)

  it('still branches on who is looking', () => {
    expect(s).toMatch(/isProvider/)
  })

  it('keeps every provider action reachable from the provider branch', () => {
    for (const label of [
      'Review request',
      'Mark complete',
      'Mark no show',
      'No show',
      'Cancel booking',
    ]) {
      expect(s).toContain(label)
    }
  })

  it('puts every provider-only action behind an isProvider branch', () => {
    // Each provider control must sit inside a block that begins with an
    // `if (isProvider)`. Split on those and assert none appear before the first.
    const beforeFirstBranch = s.slice(0, s.indexOf('if (isProvider)'))
    for (const label of ['Mark complete', 'Mark no show', 'Review request']) {
      expect(beforeFirstBranch).not.toContain(label)
    }
  })

  it('does not invent a provider bookings mode', () => {
    expect(s).not.toMatch(/My business|My appointments/)
  })

  it('states the response window from the server-derived urgency, not a constant', () => {
    expect(s).toMatch(/requestUrgency === 'expired'/)
    expect(s).toMatch(/bookingRequestUrgency\(/)
  })

  it('tells the same story as the Bookings list, from the same helper', () => {
    // A request that says "Sent Sep 13. Waiting on Marcus." in the list must not
    // say something different when opened.
    expect(s).toMatch(/bookingListNote\(/)
    expect(s).not.toMatch(/Sent \$\{/)
  })

  it('states the payment truth on the detail too', () => {
    expect(visible).toMatch(/Third does not take payment in this beta/)
  })

  it('shows only fields it actually reads — no placeholder data', () => {
    // The approved frame carries Length and Where. This query returns neither, so
    // they are absent rather than filled with a dash that looks like a value.
    expect(s).not.toMatch(/label="Length"/)
    expect(s).not.toMatch(/label="Where"/)
  })

  it('never blames either party for an outcome', () => {
    for (const bad of [
      /didn(’|')?t show up/i,
      /failed to/i,
      /you missed/i,
      /they missed/i,
      /at fault/i,
      /no[- ]?show fee/i,
    ]) {
      expect(visible).not.toMatch(bad)
    }
  })

  it('shows no raw backend enum', () => {
    for (const raw of [
      '>cancelled_by_client<',
      '>no_show<',
      '>checked_in<',
      "'cancelled_by_provider'}",
    ]) {
      expect(s).not.toContain(raw)
    }
  })
})

// ── The classifier, tested against the failure that produced it ──────────
describe('stripComments', () => {
  it('removes a whole-line comment', () => {
    expect(stripComments('// charged now\nconst a = 1')).toBe('\nconst a = 1')
  })

  it('removes a trailing comment but keeps the code before it', () => {
    expect(stripComments('const a = 1 // charged now')).toBe('const a = 1 ')
  })

  it('removes a multi-line JSX block comment', () => {
    const src = ['{/* PRODUCT TRUTH: "charged now" was removed', '    because it lied. */}', '<Text>Fine</Text>'].join('\n')
    expect(stripComments(src)).not.toMatch(/charged now/)
    expect(stripComments(src)).toMatch(/<Text>Fine<\/Text>/)
  })

  it('does NOT desync on a bare apostrophe in JSX text', () => {
    // The defect this method exists to avoid: a character-level parser treats the
    // apostrophe in "provider's" as a string opener, desyncs, and starts reporting
    // comments as visible copy — or worse, visible copy as comments.
    const src = ["<Text>Open a provider's profile</Text>", '// charged now', '<Text>Second line</Text>'].join('\n')
    const out = stripComments(src)
    expect(out).toMatch(/provider's profile/)
    expect(out).not.toMatch(/charged now/)
    expect(out).toMatch(/Second line/)
  })

  it('keeps code that follows a closed block comment on the same line', () => {
    expect(stripComments('/* gone */ const a = 1')).toBe(' const a = 1')
  })
})
