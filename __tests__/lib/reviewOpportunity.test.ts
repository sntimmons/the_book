// Phase 1 review-opportunity helpers + truthfulness guards.

import fs from 'fs'
import path from 'path'

let mockRpc: jest.Mock

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}))

import {
  getReviewOpportunity,
  reviewOpportunityCopy,
  reviewSubmitErrorMessage,
  ReviewOpportunity,
} from '@/lib/reviews'

describe('reviewOpportunityCopy (pure)', () => {
  it('eligible is actionable with a direction-specific CTA label', () => {
    expect(reviewOpportunityCopy('eligible', 'client_to_provider')).toMatchObject({
      actionable: true,
      label: 'Leave review',
    })
    expect(reviewOpportunityCopy('eligible', 'provider_to_client')).toMatchObject({
      actionable: true,
      label: 'Review client',
    })
  })

  it('already_submitted / window_closed / under_review are NOT actionable and carry truthful bodies', () => {
    for (const dir of ['client_to_provider', 'provider_to_client'] as const) {
      expect(reviewOpportunityCopy('already_submitted', dir).actionable).toBe(false)
      expect(reviewOpportunityCopy('window_closed', dir).body).toMatch(/review period.*ended/i)
      expect(reviewOpportunityCopy('under_review', dir).body).toMatch(/under review/i)
    }
  })

  it('none of the state copy claims the review is public/live/visible', () => {
    const states: ReviewOpportunity[] = [
      'eligible',
      'already_submitted',
      'window_closed',
      'under_review',
      'not_completed',
      'not_participant',
      'unknown',
    ]
    for (const s of states) {
      for (const dir of ['client_to_provider', 'provider_to_client'] as const) {
        const c = reviewOpportunityCopy(s, dir)
        expect(`${c.title} ${c.body} ${c.label}`).not.toMatch(/now live|public|visible to/i)
      }
    }
  })

  it('not_completed / not_participant / unknown produce no review ENTRY (no CTA label)', () => {
    for (const s of ['not_completed', 'not_participant', 'unknown'] as const) {
      expect(reviewOpportunityCopy(s, 'client_to_provider')).toMatchObject({
        actionable: false,
        label: '',
      })
    }
  })

  // Defense-in-depth: a deep link or stale notification can still land on these.
  // They must be TERMINAL and truthful — an explanation and a safe exit, no retry.
  it('not_completed is terminal and truthful (the no_show landing state)', () => {
    for (const dir of ['client_to_provider', 'provider_to_client'] as const) {
      const c = reviewOpportunityCopy('not_completed', dir)
      expect(c).toMatchObject({ actionable: false, terminal: true })
      expect(c.title).not.toBe('')
      expect(c.body).toMatch(/isn.t eligible for a review/i)
      expect(c.body).toMatch(/wasn.t completed/i)
      // never invites a retry
      expect(`${c.title} ${c.body}`).not.toMatch(/try again/i)
    }
  })

  it('not_participant is terminal and reveals nothing about the booking', () => {
    const c = reviewOpportunityCopy('not_participant', 'client_to_provider')
    expect(c).toMatchObject({ actionable: false, terminal: true })
    expect(c.body).toMatch(/isn.t available for this booking/i)
    expect(`${c.title} ${c.body}`).not.toMatch(/try again/i)
  })

  it('unknown is NOT terminal — a read failure is never presented as a verdict', () => {
    for (const dir of ['client_to_provider', 'provider_to_client'] as const) {
      expect(reviewOpportunityCopy('unknown', dir).terminal).toBe(false)
    }
  })

  it('eligible is not terminal', () => {
    expect(reviewOpportunityCopy('eligible', 'client_to_provider').terminal).toBe(false)
  })

  it('exactly the non-actionable, non-unknown states are terminal', () => {
    const terminalStates: ReviewOpportunity[] = [
      'already_submitted',
      'window_closed',
      'under_review',
      'not_completed',
      'not_participant',
    ]
    for (const s of terminalStates) {
      expect(reviewOpportunityCopy(s, 'client_to_provider').terminal).toBe(true)
    }
  })

  it('no state is both actionable and terminal', () => {
    const all: ReviewOpportunity[] = [
      'eligible',
      'already_submitted',
      'window_closed',
      'under_review',
      'not_completed',
      'not_participant',
      'unknown',
    ]
    for (const s of all) {
      const c = reviewOpportunityCopy(s, 'provider_to_client')
      expect(c.actionable && c.terminal).toBe(false)
      // an actionable state always has a CTA label; a non-actionable one never does
      expect(c.actionable).toBe(c.label !== '' && !c.terminal)
    }
  })
})

describe('getReviewOpportunity (RPC read)', () => {
  beforeEach(() => {
    mockRpc = jest.fn()
  })

  it('returns the server-authoritative state from the RPC', async () => {
    mockRpc.mockResolvedValue({ data: 'window_closed', error: null })
    await expect(getReviewOpportunity('bk1', 'client_to_provider')).resolves.toBe('window_closed')
    expect(mockRpc).toHaveBeenCalledWith('review_opportunity', {
      p_booking_id: 'bk1',
      p_direction: 'client_to_provider',
    })
  })

  it('returns "unknown" on a read error (never guesses)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getReviewOpportunity('bk1', 'provider_to_client')).resolves.toBe('unknown')
  })
})

describe('reviewSubmitErrorMessage (truthful terminal mapping)', () => {
  beforeEach(() => {
    mockRpc = jest.fn()
  })

  it('maps window_closed / under_review / already_submitted to a truthful message', async () => {
    mockRpc.mockResolvedValue({ data: 'window_closed', error: null })
    await expect(reviewSubmitErrorMessage('bk', 'client_to_provider')).resolves.toMatchObject({
      body: expect.stringMatching(/review period.*ended/i),
    })
    mockRpc.mockResolvedValue({ data: 'under_review', error: null })
    await expect(reviewSubmitErrorMessage('bk', 'provider_to_client')).resolves.toMatchObject({
      body: expect.stringMatching(/under review/i),
    })
  })

  it('maps not_completed / not_participant to a truthful message (no retry loop)', async () => {
    mockRpc.mockResolvedValue({ data: 'not_completed', error: null })
    await expect(reviewSubmitErrorMessage('bk', 'client_to_provider')).resolves.toMatchObject({
      body: expect.stringMatching(/isn.t eligible for a review/i),
    })
    mockRpc.mockResolvedValue({ data: 'not_participant', error: null })
    await expect(reviewSubmitErrorMessage('bk', 'provider_to_client')).resolves.toMatchObject({
      body: expect.stringMatching(/isn.t available for this booking/i),
    })
  })

  it('returns null for eligible/unknown so the caller shows its generic retry', async () => {
    mockRpc.mockResolvedValue({ data: 'eligible', error: null })
    await expect(reviewSubmitErrorMessage('bk', 'client_to_provider')).resolves.toBeNull()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(reviewSubmitErrorMessage('bk', 'client_to_provider')).resolves.toBeNull()
  })
})

// Truthfulness guard: the client confirmation screen must not claim public
// visibility (QA-TRUTH-002). It may only say the review was submitted and is private.
describe('submitted.tsx says submitted/blind, never "now live"/public', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'post-booking', 'submitted.tsx'),
    'utf8',
  )
  it('contains no public-visibility claim', () => {
    expect(src).not.toMatch(/now live|Other Houston clients can now see|is now live/i)
  })
  it('states the review was submitted and stays private', () => {
    expect(src).toMatch(/Review submitted/)
    expect(src).toMatch(/stays private/i)
  })
})
