// reviews.ts imports `@/lib/supabase`; stub it (isRevealed / aggregateClientDimensions
// are pure and never touch the client).
jest.mock('@/lib/supabase', () => ({ supabase: {} }))

import { isRevealed, aggregateClientDimensions } from '@/lib/reviews'

const DAY = 24 * 60 * 60 * 1000

// Locks the blind-reveal PRODUCT RULE: a review is revealed once the counterpart
// exists OR the booking completed > 7 days ago.
describe('isRevealed', () => {
  const now = Date.parse('2026-08-20T00:00:00Z')

  it('reveals when the counterpart review exists', () => {
    const counterpart = new Set(['bk1'])
    const completedAt = new Map<string, string | null>([['bk1', null]])
    expect(isRevealed('bk1', counterpart, completedAt, now)).toBe(true)
  })

  it('reveals when completion is older than 7 days', () => {
    const completedAt = new Map<string, string | null>([
      ['bk2', new Date(now - 8 * DAY).toISOString()],
    ])
    expect(isRevealed('bk2', new Set(), completedAt, now)).toBe(true)
  })

  it('hides when completion is newer than 7 days and no counterpart', () => {
    const completedAt = new Map<string, string | null>([
      ['bk3', new Date(now - 6 * DAY).toISOString()],
    ])
    expect(isRevealed('bk3', new Set(), completedAt, now)).toBe(false)
  })

  it('hides when there is neither a counterpart nor a completion date', () => {
    expect(isRevealed('bk4', new Set(), new Map(), now)).toBe(false)
  })
})

describe('aggregateClientDimensions', () => {
  it('counts only answered boolean dimensions', () => {
    const stats = aggregateClientDimensions([
      { showedUp: true, onTime: true, followedPolicy: null, paymentCompleted: undefined },
      { showedUp: true, onTime: false, followedPolicy: true, paymentCompleted: null },
      { showedUp: false, onTime: null, followedPolicy: true, paymentCompleted: undefined },
    ])
    expect(stats.showedUp).toEqual({ yes: 2, total: 3 })
    expect(stats.onTime).toEqual({ yes: 1, total: 2 }) // one null ignored
    expect(stats.followedPolicy).toEqual({ yes: 2, total: 2 })
    expect(stats.paymentCompleted).toEqual({ yes: 0, total: 0 }) // all unanswered
    expect(stats.hasAny).toBe(true)
  })

  it('reports hasAny=false when nothing is answered', () => {
    const stats = aggregateClientDimensions([
      { showedUp: null, onTime: null, followedPolicy: null, paymentCompleted: null },
    ])
    expect(stats.hasAny).toBe(false)
  })
})
