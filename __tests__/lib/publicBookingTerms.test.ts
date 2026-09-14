import {
  NO_PUBLIC_BOOKING_TERMS,
  UNPUBLISHED_TERMS_COPY,
  bookingTermsCopy,
  fetchPublicBookingTerms,
  hoursPhrase,
} from '@/lib/publicBookingTerms'
import { supabase } from '@/lib/supabase'
import { DEFAULT_POLICY } from '@/lib/policy'

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }))
const rpc = supabase.rpc as unknown as jest.Mock

beforeEach(() => {
  rpc.mockReset()
})

// THE DEFECT THIS REPLACES.
//
// `provider_booking_preferences` is owner-only, so a client's direct read
// returned zero rows and no error, and `rowsToPolicy` filled the gap with
// DEFAULT_POLICY. The client was shown a constant beside that provider's real
// terms and then agreed to it. Nothing here may resolve to a default.
describe('fetchPublicBookingTerms', () => {
  it('reads the narrow RPC, not the owner-only table', async () => {
    rpc.mockResolvedValue({ data: [{ cancellation_window_hours: 48, lateness_grace_minutes: 10 }], error: null })
    const terms = await fetchPublicBookingTerms('p1')
    expect(rpc).toHaveBeenCalledWith('provider_public_booking_terms', { p_provider_id: 'p1' })
    expect(terms).toEqual({ cancellationWindowHours: 48, latenessGraceMinutes: 10 })
  })

  it('returns nulls — never defaults — when the provider has published nothing', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await expect(fetchPublicBookingTerms('p1')).resolves.toEqual(NO_PUBLIC_BOOKING_TERMS)
  })

  it('returns nulls when the RPC errors, rather than guessing', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } })
    await expect(fetchPublicBookingTerms('p1')).resolves.toEqual(NO_PUBLIC_BOOKING_TERMS)
  })

  it('never substitutes the platform default for a real value', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const terms = await fetchPublicBookingTerms('p1')
    // DEFAULT_POLICY says '24 hours before' / '15 minutes'. Neither may appear.
    expect(terms.cancellationWindowHours).toBeNull()
    expect(terms.latenessGraceMinutes).toBeNull()
    expect(DEFAULT_POLICY.cancelWindow).toBe('24 hours before')
    expect(bookingTermsCopy(terms).cancellation).toBeNull()
  })

  it('does not call out at all without a provider id', async () => {
    await expect(fetchPublicBookingTerms('')).resolves.toEqual(NO_PUBLIC_BOOKING_TERMS)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts a single-object response as well as a set', async () => {
    rpc.mockResolvedValue({ data: { cancellation_window_hours: 2, lateness_grace_minutes: 0 }, error: null })
    await expect(fetchPublicBookingTerms('p1')).resolves.toEqual({
      cancellationWindowHours: 2,
      latenessGraceMinutes: 0,
    })
  })

  it('rejects a value it cannot trust rather than rendering it', async () => {
    rpc.mockResolvedValue({ data: [{ cancellation_window_hours: -3, lateness_grace_minutes: 'x' }], error: null })
    await expect(fetchPublicBookingTerms('p1')).resolves.toEqual(NO_PUBLIC_BOOKING_TERMS)
  })
})

describe('bookingTermsCopy', () => {
  it('states the provider’s real window and grace', () => {
    expect(bookingTermsCopy({ cancellationWindowHours: 48, latenessGraceMinutes: 10 })).toEqual({
      cancellation: 'Free cancellation up to 48 hours before',
      grace: '10 minute grace if you are running late',
      nonedPublished: false,
    })
  })

  it('distinguishes no grace period from an unpublished one', () => {
    // Zero is a term the provider SET. Null is a term they never set. Collapsing
    // the two is how a default becomes a claim.
    expect(bookingTermsCopy({ cancellationWindowHours: 24, latenessGraceMinutes: 0 }).grace).toBe(
      'No grace period if you are running late',
    )
    expect(bookingTermsCopy({ cancellationWindowHours: 24, latenessGraceMinutes: null }).grace).toBeNull()
  })

  it('says nothing at all when nothing is published', () => {
    const copy = bookingTermsCopy(NO_PUBLIC_BOOKING_TERMS)
    expect(copy).toEqual({ cancellation: null, grace: null, nonedPublished: true })
  })

  it('does not say "1 hours"', () => {
    expect(hoursPhrase(1)).toBe('1 hour')
    expect(hoursPhrase(24)).toBe('24 hours')
  })

  it('the unpublished copy neither guesses nor judges', () => {
    const all = Object.values(UNPUBLISHED_TERMS_COPY).join(' ')
    expect(all).not.toMatch(/\d+\s*(hour|minute)/i)
    expect(all).not.toMatch(/strict|lenient|flexible|no policy/i)
    expect(UNPUBLISHED_TERMS_COPY.hint).toMatch(/ask your provider/i)
  })

  it('carries no fee, deposit or payment language', () => {
    const copy = bookingTermsCopy({ cancellationWindowHours: 24, latenessGraceMinutes: 15 })
    const all = [copy.cancellation, copy.grace, ...Object.values(UNPUBLISHED_TERMS_COPY)].join(' ')
    expect(all).not.toMatch(/fee|charge|%|deposit|refund|payout|payment/i)
  })
})
