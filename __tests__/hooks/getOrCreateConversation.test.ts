// Regression tests for getOrCreateConversation booking-upgrade behavior.
//
// Locks the QA-REGRESSION-001 fix: when a real booking is created for a pair that
// already has a pre-booking REQUEST conversation (pending/declined, booking_id
// null), the helper must NOT early-return the existing row untouched — it must
// attach the booking and open the conversation, so a prior request state can never
// block messaging about an actual booking. Conversely it must NEVER overwrite an
// existing booking_id, and must not touch anything when called without a bookingId.
//
// NOTE: this is a client-helper unit test (mocked Supabase). The server triggers/RLS
// are the real authority and are validated separately by the rolled-back DB
// role-simulation on non-prod (see FEATURE_PREBOOKING_MESSAGE_REQUESTS.md).

let mockBuilder: any

// jest.setup.js globally mocks @/hooks/useMessaging (so screen tests get a stub);
// here we need the REAL helper, with only its Supabase dependency mocked.
jest.unmock('@/hooks/useMessaging')

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (..._args: unknown[]) => mockBuilder },
}))

import { getOrCreateConversation } from '@/hooks/useMessaging'

/**
 * A chainable Supabase query-mockBuilder stub. select/insert/update/eq all return the
 * mockBuilder; maybeSingle/single resolve the configured lookup/insert results; awaiting
 * the mockBuilder itself (the `.update(...).eq(...)` terminal) resolves to { error }.
 */
function makeBuilder(cfg: {
  existing?: any
  insertResult?: { data?: any; error?: any }
}) {
  const b: any = {
    select: jest.fn(() => b),
    insert: jest.fn(() => b),
    update: jest.fn(() => b),
    eq: jest.fn(() => b),
    maybeSingle: jest.fn(() => Promise.resolve({ data: cfg.existing ?? null })),
    single: jest.fn(() =>
      Promise.resolve(cfg.insertResult ?? { data: { id: 'new-id' }, error: null }),
    ),
    // makes `await mockBuilder` (after update().eq()) resolve
    then: (onF: any, onR: any) => Promise.resolve({ data: null, error: null }).then(onF, onR),
  }
  return b
}

const CLIENT = 'client-1'
const PROVIDER = 'provider-1'
const BOOKING = 'booking-1'

describe('getOrCreateConversation booking upgrade', () => {
  it('upgrades an existing PENDING request when a real booking is supplied (does not early-return untouched)', async () => {
    mockBuilder = makeBuilder({
      existing: { id: 'conv-1', booking_id: null, request_status: 'pending' },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    expect(id).toBe('conv-1')
    // The critical regression assertion: the booking is attached and the request opened.
    expect(mockBuilder.update).toHaveBeenCalledWith({
      booking_id: BOOKING,
      request_status: 'accepted',
    })
  })

  it('upgrades an existing DECLINED request when a real booking is supplied', async () => {
    mockBuilder = makeBuilder({
      existing: { id: 'conv-2', booking_id: null, request_status: 'declined' },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    expect(id).toBe('conv-2')
    expect(mockBuilder.update).toHaveBeenCalledWith({
      booking_id: BOOKING,
      request_status: 'accepted',
    })
  })

  it('reuses an existing booking-linked conversation WITHOUT overwriting its booking_id', async () => {
    mockBuilder = makeBuilder({
      existing: { id: 'conv-3', booking_id: 'original-booking', request_status: null },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    expect(id).toBe('conv-3')
    // A second booking for the same pair must NOT clobber the first booking_id.
    expect(mockBuilder.update).not.toHaveBeenCalled()
  })

  it('reuses an existing pending request unchanged when called with NO bookingId (pre-booking path)', async () => {
    mockBuilder = makeBuilder({
      existing: { id: 'conv-4', booking_id: null, request_status: 'pending' },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER)
    expect(id).toBe('conv-4')
    expect(mockBuilder.update).not.toHaveBeenCalled()
  })

  it('creates a new conversation when none exists', async () => {
    mockBuilder = makeBuilder({
      existing: null,
      insertResult: { data: { id: 'created-5' }, error: null },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    expect(id).toBe('created-5')
    expect(mockBuilder.insert).toHaveBeenCalled()
    expect(mockBuilder.update).not.toHaveBeenCalled()
  })
})
