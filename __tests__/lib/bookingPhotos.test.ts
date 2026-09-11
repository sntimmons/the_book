import { attachBookingPhotos, PHOTO_PARTIAL_COPY, MAX_BOOKING_PHOTOS } from '@/lib/bookingPhotos'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), storage: { from: jest.fn() } },
}))
jest.mock('expo-file-system', () => ({
  File: class {
    async base64() {
      return 'AAAA'
    }
  },
}))

// Requirement B. The rule every assertion here defends:
// **a request must never claim photos were attached when they were not.**
//
// The picker shipped long before persistence did — files went into a Zustand
// field, were never uploaded, and were discarded on reset — so the client
// believed their provider had context the provider never received.

function chainSelect(rows: unknown[]) {
  const c: any = {}
  c.select = jest.fn(() => c)
  c.eq = jest.fn(() => Promise.resolve({ data: rows, error: null }))
  return c
}

beforeEach(() => jest.clearAllMocks())

describe('attaching reference photos', () => {
  it('reports nothing attached when nothing was asked for', async () => {
    await expect(attachBookingPhotos('b1', 'u1', [])).resolves.toEqual({
      attached: 0,
      requested: 0,
      failed: false,
    })
  })

  it('does not re-upload what a previous attempt already attached', async () => {
    // A retry after a partial failure must top up, not duplicate. The server
    // caps at three, so a retry that re-sent everything would be refused
    // outright and the client would lose the photos that had not landed yet.
    ;(supabase.from as jest.Mock).mockReturnValue(
      chainSelect([
        { storage_path: 'u1/b1/0.jpg' },
        { storage_path: 'u1/b1/1.jpg' },
        { storage_path: 'u1/b1/2.jpg' },
      ]),
    )
    const r = await attachBookingPhotos('b1', 'u1', ['x', 'y', 'z'])
    expect(r.attached).toBe(MAX_BOOKING_PHOTOS)
    expect(supabase.storage.from).not.toHaveBeenCalled()
  })

  it('reports a partial attach honestly rather than rounding up', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(chainSelect([]))
    ;(supabase.storage.from as jest.Mock).mockReturnValue({
      upload: jest.fn(() => Promise.resolve({ error: { message: 'nope' } })),
    })
    const r = await attachBookingPhotos('b1', 'u1', ['x', 'y'])
    expect(r.attached).toBe(0)
    expect(r.requested).toBe(2)
    expect(r.failed).toBe(true)
  })
})

describe('what the client is told when photos do not attach', () => {
  it('does not claim the request failed, because it did not', () => {
    // The booking is sent either way. Losing a reference photo must not cost
    // someone their appointment, and telling them the request failed would make
    // them send a second one.
    const body = PHOTO_PARTIAL_COPY.body.toLowerCase()
    expect(body).toContain('was sent')
    for (const p of ['try again', 'failed to send', 'not sent']) {
      expect([p, body.includes(p)]).toEqual([p, false])
    }
  })

  it('tells them what the provider can actually see, and offers a way through', () => {
    const body = PHOTO_PARTIAL_COPY.body.toLowerCase()
    expect(body).toContain('can see the ones that did')
    expect(body).toContain('message')
  })
})

describe('a retry resumes the file that failed, not the next index', () => {
  it('uploads the MIDDLE failure and does not duplicate the one that landed', async () => {
    // The bug this replaced: the resume point was the row COUNT used as an
    // INDEX, which is only correct when failures are a suffix. Photos [A,B,C]
    // with B failing gave `already = 2`, so the retry skipped B forever and
    // re-uploaded C under a fresh timestamped path — producing A, C, C while
    // `attached === requested` suppressed the partial-attach warning. The client
    // was told everything landed, the provider saw a duplicate, and the photo
    // that actually failed was unreachable.
    //
    // Paths are now deterministic per source index, so a retry can tell which
    // of the client's files is already there.
    ;(supabase.from as jest.Mock).mockReturnValue(
      chainSelect([{ storage_path: 'u1/b1/0.jpg' }, { storage_path: 'u1/b1/2.jpg' }]),
    )
    const upload = jest.fn((_path: string, _body: unknown, _opts?: unknown) =>
      Promise.resolve({ error: null }),
    )
    ;(supabase.storage.from as jest.Mock).mockReturnValue({ upload })

    await attachBookingPhotos('b1', 'u1', ['A', 'B', 'C'])

    // Exactly one upload, and it is index 1 — the one that failed before.
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0]?.[0]).toBe('u1/b1/1.jpg')
  })
})
