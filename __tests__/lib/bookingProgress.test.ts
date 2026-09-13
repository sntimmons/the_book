import {
  bookingProgressLabel,
  bookingStepNumber,
  bookingStepTotal,
  bookingSteps,
} from '@/lib/bookingProgress'

// ── A PROGRESS INDICATOR IS A CLAIM ───────────────────────────────────────
//
// The booking flow had none at all across seven screens, while provider onboarding
// — the less critical flow — had both a step count and skip links. These assertions
// pin the part that is easy to get wrong: the count must never overstate the work
// remaining, and one step is CONDITIONAL, so a hard-coded total would.
//
// `app/book/contract.tsx` skips straight to sending when the provider has no active
// contract. So a client either takes six steps or five, and the indicator has to be
// honest in both cases and honest while it does not yet know which.

describe('the step list reflects whether a contract applies', () => {
  it('includes the contract step when one is required', () => {
    expect(bookingSteps(true)).toEqual([
      'service',
      'datetime',
      'message',
      'policy',
      'contract',
      'send',
    ])
  })

  it('omits it when the provider has no contract', () => {
    expect(bookingSteps(false)).toEqual(['service', 'datetime', 'message', 'policy', 'send'])
  })

  it('assumes the longer list while the answer is unknown', () => {
    // Not a guess about the total — the caller never shows one while this is null.
    // It is so `indexOf('contract')` still resolves on the screen that discovers a
    // contract exists.
    expect(bookingSteps(null)).toContain('contract')
  })
})

describe('the total is stated only when it is actually known', () => {
  it('is 6 with a contract and 5 without', () => {
    expect(bookingStepTotal(true)).toBe(6)
    expect(bookingStepTotal(false)).toBe(5)
  })

  it('IS NULL WHILE UNKNOWN — the assertion this module exists for', () => {
    // A hard-coded total would either promise a contract step that never comes or
    // leave a gap where step 5 should be. Both are the indicator lying.
    expect(bookingStepTotal(null)).toBeNull()
  })
})

describe('labels never overstate the remaining work', () => {
  it('states step and total once the flow is known', () => {
    expect(bookingProgressLabel('service', true)).toBe('Step 1 of 6')
    expect(bookingProgressLabel('contract', true)).toBe('Step 5 of 6')
    expect(bookingProgressLabel('send', true)).toBe('Step 6 of 6')
  })

  it('renumbers correctly when the contract step does not apply', () => {
    // The client who skips the contract must see send as 5 of 5, not 6 of 6 with a
    // missing step behind them.
    expect(bookingProgressLabel('send', false)).toBe('Step 5 of 5')
    expect(bookingProgressLabel('policy', false)).toBe('Step 4 of 5')
  })

  it('omits the total rather than inventing one', () => {
    expect(bookingProgressLabel('service', null)).toBe('Step 1')
    expect(bookingProgressLabel('policy', null)).toBe('Step 4')
  })

  it('says "Last step" on the send screen when the total is unknown', () => {
    // Send is last on BOTH paths, so this is true without knowing which path it is —
    // and a bare number cannot tell somebody they have arrived.
    expect(bookingProgressLabel('send', null)).toBe('Last step')
  })

  it('NEVER claims the request is sent, on any path', () => {
    for (const c of [true, false, null] as const) {
      for (const step of bookingSteps(c)) {
        const label = bookingProgressLabel(step, c) ?? ''
        expect(label).not.toMatch(/\b(sent|submitted|complete|done|finished)\b/i)
      }
    }
  })

  it('returns null for a step that is not part of this booking', () => {
    expect(bookingProgressLabel('contract', false)).toBeNull()
    expect(bookingStepNumber('contract', false)).toBeNull()
  })

  it('does not count the confirmation screen as a step', () => {
    // `/book/confirmed` is the outcome. Numbering it would make the indicator read
    // "6 of 6" before the request is sent and then need a seventh for success.
    for (const c of [true, false] as const) {
      expect(bookingSteps(c)).not.toContain('confirmed')
      expect(bookingSteps(c)[bookingSteps(c).length - 1]).toBe('send')
    }
  })
})
