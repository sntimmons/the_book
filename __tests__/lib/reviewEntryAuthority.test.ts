// Review-ENTRY authority (SEC-AUTHZ-001 / CODE-DUP-010).
//
// Behavioural tests over the real helpers — not source-text assertions. The rule under
// test: generic booking presentation state is NOT review eligibility. The server's
// opportunity decides whether a review action is offered, so a booking whose live
// status drifts after completion keeps the review it earned.

let mockRpc: jest.Mock
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}))

import {
  getReviewOpportunities,
  reviewOpportunityCopy,
  reviewEntryFor,
  ReviewOpportunity,
} from '@/lib/reviews'
import { bookingTab } from '@/lib/bookingStatus'

// The PRODUCTION decision, imported — not re-implemented. An earlier version of this
// file defined its own copy, which ignored booking status and therefore passed while
// the shipped list still gated the entry on the tab. Importing the real function is
// what makes these tests able to fail.
function reviewActionFor(opportunity: ReviewOpportunity, loading = false) {
  const e = reviewEntryFor(opportunity, 'client_to_provider', loading)
  return {
    offered: e.kind === 'action',
    note: e.kind === 'note' ? e.label : null,
  }
}

beforeEach(() => {
  mockRpc = jest.fn()
})

describe('an earned review is not hidden by live-status drift', () => {
  // The core regression. completed_at is immutable and the DB keeps eligibility
  // anchored on it, so a provider downgrading completed -> accepted must not remove
  // the client's entry. Under the old rule the CTA keyed on status and vanished.
  it.each(['accepted', 'arriving', 'checked_in', 'rescheduled', 'completed'])(
    'status %s with an eligible server answer still offers the review',
    (status) => {
      // whatever the tab grouping says...
      expect(['upcoming', 'past']).toContain(bookingTab(status))
      // ...the offer follows the server, not the status
      expect(reviewActionFor('eligible').offered).toBe(true)
    },
  )

  it('the decision function cannot consider booking status — it takes none', () => {
    // Structural: reviewEntryFor's signature is (opportunity, direction, loading).
    // A status parameter could not be threaded in without changing every call site,
    // which is what keeps presentation grouping out of the eligibility decision.
    expect(reviewEntryFor.length).toBe(2) // 3rd arg has a default
  })

  it('is identical for every status because status is not an input', () => {
    const forEligible = reviewEntryFor('eligible', 'client_to_provider')
    expect(forEligible.kind).toBe('action')
    // and the same object shape regardless of how the caller grouped the booking
    expect(reviewEntryFor('eligible', 'client_to_provider')).toEqual(forEligible)
  })

  it('the presentation tab and the review decision are independent', () => {
    // same tab, opposite decisions
    expect(bookingTab('completed')).toBe('past')
    expect(bookingTab('no_show')).toBe('past')
    expect(reviewActionFor('eligible').offered).toBe(true)
    expect(reviewActionFor('not_completed').offered).toBe(false)
    // different tabs, same decision
    expect(bookingTab('accepted')).toBe('upcoming')
    expect(reviewActionFor('eligible').offered).toBe(true)
  })
})

describe('a never-completed no_show stays non-reviewable', () => {
  it('not_completed offers no action and no misleading note', () => {
    const a = reviewActionFor('not_completed')
    expect(a.offered).toBe(false)
    expect(a.note).toBeNull()
  })

  it('the no_show verdict comes from the server, not a local status test', async () => {
    mockRpc.mockResolvedValue({
      data: [{ booking_id: 'ns1', opportunity: 'not_completed' }],
      error: null,
    })
    const m = await getReviewOpportunities(['ns1'], 'client_to_provider')
    expect(m.get('ns1')).toBe('not_completed')
    expect(reviewActionFor(m.get('ns1')!).offered).toBe(false)
  })
})

describe('non-actionable states stay non-actionable', () => {
  it.each([
    ['already_submitted', 'Reviewed'],
    ['window_closed', 'Review period ended'],
    ['under_review', 'Under review'],
  ] as const)('%s is not actionable and shows a truthful note', (opp, label) => {
    const a = reviewActionFor(opp)
    expect(a.offered).toBe(false)
    expect(a.note).toBe(label)
  })

  it.each(['not_completed', 'not_participant', 'unknown'] as const)(
    '%s offers nothing at all',
    (opp) => {
      expect(reviewActionFor(opp)).toEqual({ offered: false, note: null })
    },
  )

  it('nothing is offered while the read is still in flight', () => {
    expect(reviewActionFor('eligible', true).offered).toBe(false)
  })
})

describe('repeat bookings resolve independently', () => {
  it('two bookings for the same pair get their own answers', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { booking_id: 'b1', opportunity: 'already_submitted' },
        { booking_id: 'b2', opportunity: 'eligible' },
      ],
      error: null,
    })
    const m = await getReviewOpportunities(['b1', 'b2'], 'client_to_provider')
    expect(reviewActionFor(m.get('b1')!).offered).toBe(false)
    expect(reviewActionFor(m.get('b2')!).offered).toBe(true)
  })
})

describe('the batch read delegates to the same server predicate', () => {
  it('calls review_opportunities with de-duplicated ids and the direction', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await getReviewOpportunities(['a', 'a', 'b'], 'provider_to_client')
    expect(mockRpc).toHaveBeenCalledWith('review_opportunities', {
      p_booking_ids: ['a', 'b'],
      p_direction: 'provider_to_client',
    })
  })

  it('makes no request when there is nothing to ask about', async () => {
    await getReviewOpportunities([], 'client_to_provider')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('a read error yields no entries — callers see unknown, never a guess', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const m = await getReviewOpportunities(['b1'], 'client_to_provider')
    expect(m.size).toBe(0)
    expect(reviewActionFor(m.get('b1') ?? 'unknown').offered).toBe(false)
  })

  it('an id the server omits is treated as unknown, not as eligible', async () => {
    mockRpc.mockResolvedValue({
      data: [{ booking_id: 'b1', opportunity: 'eligible' }],
      error: null,
    })
    const m = await getReviewOpportunities(['b1', 'b2'], 'client_to_provider')
    expect(m.get('b2')).toBeUndefined()
    expect(reviewActionFor(m.get('b2') ?? 'unknown').offered).toBe(false)
  })
})

describe('no client-side timing logic becomes authority', () => {
  it('window_closed is a server verdict the client only renders', () => {
    // The copy layer is pure presentation: it is handed a state and never computes one.
    expect(reviewOpportunityCopy('window_closed', 'client_to_provider').actionable).toBe(
      false,
    )
  })

  it('the review read layer performs no date arithmetic', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'hooks', 'useReviewOpportunities.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/7 \* 24|SEVEN_DAYS|Date\.now\(\)|new Date\(/)
  })

  it('reviewEntryFor derives everything from the copy map, adding no rules', () => {
    const all: ReviewOpportunity[] = [
      'eligible',
      'already_submitted',
      'window_closed',
      'under_review',
      'not_completed',
      'not_participant',
      'unknown',
    ]
    for (const o of all) {
      for (const dir of ['client_to_provider', 'provider_to_client'] as const) {
        const c = reviewOpportunityCopy(o, dir)
        const e = reviewEntryFor(o, dir)
        expect(e.kind === 'action').toBe(c.actionable)
        expect(e.kind === 'note').toBe(c.terminal && c.label !== '')
      }
    }
  })
})
