import {
  ensureBookingDraft,
  submitBookingRequest,
  BookingWriteBlockedError,
  ProviderUnavailableError,
  BookingDraftDetails,
} from '@/lib/bookingDraft'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }))

// The CLIENT half of "one intent = one request" (PD-071, item K).
//
// `supabase/tests/booking_lifecycle.test.sql` proves the database half — the
// partial unique index, the submit transition, the expiry boundary. Nothing
// proved this half, and these are the two paths that matter most and are hardest
// to reach by hand:
//
//   * the ALREADY-SENT path, which is what makes "one intent = one request"
//     survive a lost response and a back-out — the two ways a second, and in one
//     case UNSIGNED, request reached a provider;
//   * the RACE-ADOPTION path, which the module's own header calls "not defensive
//     decoration — two devices, or a double tap that outruns the first insert,
//     land there"; and
//   * the ZERO-ROW rule. RLS FILTERS a refused write rather than raising, so it
//     comes back with `error === null` and no rows. Treating that as success is
//     how a client is shown "BOOKING REQUEST SENT" for a request that was never
//     written — which is exactly what happened before review caught it.

const DETAILS: BookingDraftDetails = {
  providerId: 'prov-1',
  serviceId: 'svc-1',
  serviceName: 'Fade',
  requestedDate: '2026-09-20',
  requestedTime: '11:00 AM',
  appointmentTime: '2026-09-20T16:00:00.000Z',
  message: null,
  paymentAmount: 45,
}

/** A chainable PostgREST double whose terminal call resolves to `result`. */
function chain(result: unknown) {
  const thenable: any = {}
  for (const m of ['select', 'eq', 'is', 'not', 'update', 'insert', 'delete', 'order', 'limit']) {
    thenable[m] = jest.fn(() => thenable)
  }
  thenable.maybeSingle = jest.fn(() => Promise.resolve(result))
  thenable.single = jest.fn(() => Promise.resolve(result))
  // A terminal `.select()` (the row-count check) resolves rather than chaining.
  thenable.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return thenable
}

function mockFrom(...results: unknown[]) {
  const calls = [...results]
  ;(supabase.from as jest.Mock).mockImplementation(() => chain(calls.shift()))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ensureBookingDraft', () => {
  it('returns the request ALREADY SENT for this intent instead of sending a second', async () => {
    // THE ASSERTION THIS SUITE EXISTS FOR. Two paths reach it and neither can be
    // caught by a screen's own state: a retry after the server committed but the
    // response was lost, and backing out past the send step into a fresh screen
    // instance. Before this, both inserted and submitted a SECOND request — and
    // the lost-response one carried no contract signature, because the signature
    // had already been written against the first.
    mockFrom({ data: [{ id: 'sent-1' }], error: null })
    await expect(ensureBookingDraft('user-1', DETAILS)).resolves.toEqual({
      id: 'sent-1',
      alreadySubmitted: true,
    })
    // It asks the server FIRST and creates nothing.
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('rethrows a failed already-sent lookup rather than sending again', async () => {
    // The fail-open that would recreate the duplicate: reading a broken lookup as
    // "nothing sent yet".
    mockFrom({ data: null, error: { code: '08006' } })
    await expect(ensureBookingDraft('user-1', DETAILS)).rejects.toBeTruthy()
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('resumes an existing draft instead of inserting a second one', async () => {
    mockFrom(
      { data: [], error: null }, // nothing sent for this intent
      { data: { id: 'draft-1' }, error: null }, // a live draft
      { data: [{ id: 'draft-1' }], error: null }, // the revision
    )
    await expect(ensureBookingDraft('user-1', DETAILS)).resolves.toEqual({
      id: 'draft-1',
      alreadySubmitted: false,
    })
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(3)
  })

  it('inserts when the client has no draft with this provider', async () => {
    mockFrom(
      { data: [], error: null },
      { data: null, error: null },
      { data: { id: 'new-1' }, error: null },
    )
    await expect(ensureBookingDraft('user-1', DETAILS)).resolves.toEqual({
      id: 'new-1',
      alreadySubmitted: false,
    })
  })

  it('adopts the row that won a race rather than reporting a failure', async () => {
    // THE PATH THAT CANNOT BE REACHED BY HAND. Two devices, or a double tap that
    // outruns the first insert: the unique index rejects the second insert, and
    // the correct response is to adopt the draft that landed — the client did
    // nothing wrong and there is exactly one request either way.
    mockFrom(
      { data: [], error: null }, // nothing sent for this intent
      { data: null, error: null }, // no draft found
      { data: null, error: { code: '23505' } }, // insert lost the race
      { data: { id: 'winner' }, error: null }, // re-find
      { data: [{ id: 'winner' }], error: null }, // revise the adopted row
    )
    await expect(ensureBookingDraft('user-1', DETAILS)).resolves.toEqual({
      id: 'winner',
      alreadySubmitted: false,
    })
  })

  it('reports a de-approved provider as unavailable, not as a generic failure', async () => {
    mockFrom(
      { data: [], error: null },
      { data: null, error: null },
      { data: null, error: { code: 'PT426' } },
    )
    await expect(ensureBookingDraft('user-1', DETAILS)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    )
  })

  it('rethrows a failed LOOKUP rather than treating it as "no draft"', async () => {
    // The most dangerous fail-open in this module: reporting a broken lookup as
    // absence would insert a SECOND request for the same intent.
    mockFrom(
      { data: [], error: null },
      { data: null, error: { code: '08006', message: 'connection failure' } },
    )
    await expect(ensureBookingDraft('user-1', DETAILS)).rejects.toBeTruthy()
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(2)
  })

  it('treats a zero-row revision as a failure, not a silent success', async () => {
    // RLS filtered the update. No error, no rows. Before this check the flow
    // carried on and eventually showed a confirmation screen.
    mockFrom(
      { data: [], error: null },
      { data: { id: 'draft-1' }, error: null },
      { data: [], error: null },
    )
    await expect(ensureBookingDraft('user-1', DETAILS)).rejects.toBeInstanceOf(
      BookingWriteBlockedError,
    )
  })
})

describe('submitBookingRequest', () => {
  it('sends the request and confirms the server actually stamped it', async () => {
    mockFrom(
      { data: { id: 'b1', submitted_at: null }, error: null },
      { data: [{ id: 'b1', submitted_at: '2026-09-09T12:00:00Z' }], error: null },
    )
    await expect(submitBookingRequest('b1')).resolves.toBeUndefined()
  })

  it('is idempotent: an already-submitted request returns quietly', async () => {
    // A double tap, or a retry after a response the client never saw, must land
    // on the same request rather than on an error screen.
    mockFrom({ data: { id: 'b1', submitted_at: '2026-09-09T12:00:00Z' }, error: null })
    await expect(submitBookingRequest('b1')).resolves.toBeUndefined()
    expect((supabase.from as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('THROWS when the submit affected zero rows', async () => {
    // The defect this test exists for: a policy-filtered submit returns no error
    // and no rows, and the client was shown "BOOKING REQUEST SENT" for a request
    // that did not exist — permanently, for that provider.
    mockFrom({ data: { id: 'b1', submitted_at: null }, error: null }, { data: [], error: null })
    await expect(submitBookingRequest('b1')).rejects.toBeInstanceOf(BookingWriteBlockedError)
  })

  it('THROWS when the row comes back still unsubmitted', async () => {
    // Belt and braces: a row returned without the stamp is not a sent request,
    // whatever the row count says.
    mockFrom(
      { data: { id: 'b1', submitted_at: null }, error: null },
      { data: [{ id: 'b1', submitted_at: null }], error: null },
    )
    await expect(submitBookingRequest('b1')).rejects.toBeInstanceOf(BookingWriteBlockedError)
  })

  it('rethrows a failed pre-read rather than submitting blind', async () => {
    mockFrom({ data: null, error: { code: '08006' } })
    await expect(submitBookingRequest('b1')).rejects.toBeTruthy()
  })
})
