// Regression tests for getOrCreateConversation.
//
// Locks two things:
//
// 1. QA-REGRESSION-001 — when a real booking is created for a pair that already has a
//    pre-booking REQUEST conversation (pending/declined, booking_id null), the helper must NOT
//    early-return the existing row untouched. It must attach the booking and open the
//    conversation, so a prior request state can never block messaging about an actual booking.
//    Conversely it must NEVER overwrite an existing booking_id, and must not touch anything
//    when called without a bookingId.
//
// 2. Slice 2B — resolution is DELEGATED to `resolve_conversation`. It is no longer done here.
//    A provider<->provider pair has two legal representations of the same conversation
//    (`client_id` is a user id, `provider_id` is a providers row id), and resolving one
//    orientation client-side created a second thread for a pair that already had one. The
//    canonical key and its unique index live in the database; these tests pin that the client
//    asks the server rather than resolving for itself.
//
// NOTE: this is a client-helper unit test (mocked Supabase). The server triggers/RLS/index are
// the real authority and are validated separately by the rolled-back DB role-simulation on
// non-prod (supabase/tests/messaging.test.sql).

let mockBuilder: any
let mockRpc: any

// jest.setup.js globally mocks @/hooks/useMessaging (so screen tests get a stub);
// here we need the REAL helper, with only its Supabase dependency mocked.
jest.unmock('@/hooks/useMessaging')

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (..._args: unknown[]) => mockBuilder,
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import { getOrCreateConversation } from '@/hooks/useMessaging'

/**
 * A chainable Supabase query-builder stub. select/update/eq all return the builder;
 * maybeSingle resolves the row the RPC's id was read back as; awaiting the builder itself
 * (the `.update(...).eq(...)` terminal) resolves to { error }.
 */
function makeBuilder(cfg: { existing?: any; attachError?: any }) {
  const b: any = {
    select: jest.fn(() => b),
    insert: jest.fn(() => b),
    update: jest.fn(() => b),
    eq: jest.fn(() => b),
    maybeSingle: jest.fn(() => Promise.resolve({ data: cfg.existing ?? null })),
    then: (onF: any, onR: any) =>
      Promise.resolve({ data: null, error: cfg.attachError ?? null }).then(onF, onR),
  }
  return b
}

function setup(cfg: {
  resolved?: string | null
  resolveError?: any
  existing?: any
  attachError?: any
}) {
  mockRpc = jest.fn(() =>
    Promise.resolve({
      data: cfg.resolveError ? null : (cfg.resolved ?? 'conv-default'),
      error: cfg.resolveError ?? null,
    }),
  )
  mockBuilder = makeBuilder({ existing: cfg.existing, attachError: cfg.attachError })
}

const CLIENT = 'client-1'
const PROVIDER = 'provider-1'
const BOOKING = 'booking-1'

describe('getOrCreateConversation — resolution is server-authoritative', () => {
  it('delegates resolution to resolve_conversation instead of querying one orientation', async () => {
    setup({ resolved: 'conv-0', existing: { id: 'conv-0', booking_id: null, request_status: null } })
    const id = await getOrCreateConversation(CLIENT, PROVIDER)
    expect(id).toBe('conv-0')
    expect(mockRpc).toHaveBeenCalledWith('resolve_conversation', {
      p_client_id: CLIENT,
      p_provider_id: PROVIDER,
      p_booking_id: null,
    })
    // The client must not create the row itself — that is what could produce a second thread.
    expect(mockBuilder.insert).not.toHaveBeenCalled()
  })

  it('passes the bookingId through so a new row is created already linked', async () => {
    setup({
      resolved: 'conv-new',
      existing: { id: 'conv-new', booking_id: BOOKING, request_status: null },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    expect(id).toBe('conv-new')
    expect(mockRpc).toHaveBeenCalledWith('resolve_conversation', {
      p_client_id: CLIENT,
      p_provider_id: PROVIDER,
      p_booking_id: BOOKING,
    })
    // Already linked by the server, so there is nothing to attach.
    expect(mockBuilder.update).not.toHaveBeenCalled()
  })

  it('returns null when resolution fails rather than an id the caller would trust', async () => {
    setup({ resolveError: { message: 'resolve failed' } })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    expect(id).toBeNull()
    expect(mockBuilder.update).not.toHaveBeenCalled()
  })
})

describe('getOrCreateConversation booking upgrade', () => {
  it('upgrades an existing PENDING request when a real booking is supplied (does not early-return untouched)', async () => {
    setup({
      resolved: 'conv-1',
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
    setup({
      resolved: 'conv-2',
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
    setup({
      resolved: 'conv-3',
      existing: { id: 'conv-3', booking_id: 'original-booking', request_status: null },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    expect(id).toBe('conv-3')
    // A second booking for the same pair must NOT clobber the first booking_id.
    expect(mockBuilder.update).not.toHaveBeenCalled()
  })

  it('reuses an existing pending request unchanged when called with NO bookingId (pre-booking path)', async () => {
    setup({
      resolved: 'conv-4',
      existing: { id: 'conv-4', booking_id: null, request_status: 'pending' },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER)
    expect(id).toBe('conv-4')
    expect(mockBuilder.update).not.toHaveBeenCalled()
  })

  it('does NOT silently pretend success when the booking-attach update fails', async () => {
    setup({
      resolved: 'conv-6',
      existing: { id: 'conv-6', booking_id: null, request_status: 'pending' },
      attachError: { message: 'attach rejected' },
    })
    const id = await getOrCreateConversation(CLIENT, PROVIDER, BOOKING)
    // The attach failed → the conversation may still be request-gated, so the
    // helper must surface failure (null) rather than return an id the caller
    // would treat as an open chat.
    expect(mockBuilder.update).toHaveBeenCalled()
    expect(id).toBeNull()
  })
})
