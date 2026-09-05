import { barterWriteFailure, BarterWriteOp } from '../../lib/barterErrors'

// The classifier exists because SQLSTATE alone is ambiguous: 23514 is the class code for
// many distinct barter rules. These tests pin the property that actually matters — that the
// SAME code means different things for different operations, and that anything unrecognised
// stays retryable rather than being force-fitted to a terminal message.

const pgErr = (code: string) => ({ code, message: 'raw db text', details: '', hint: '' })

describe('barterWriteFailure', () => {
  it('reads 23514 as the daily limit when responding', () => {
    const r = barterWriteFailure('respond', pgErr('23514'))
    expect(r.terminal).toBe(true)
    expect(r.title).toBe('Daily limit reached')
  })

  it('reads the SAME 23514 as a stale answer when accepting', () => {
    const r = barterWriteFailure('accept', pgErr('23514'))
    expect(r.terminal).toBe(true)
    expect(r.title).toBe('Already answered')
  })

  it('reads the SAME 23514 as the delete guard when deleting an offer', () => {
    const r = barterWriteFailure('deleteOffer', pgErr('23514'))
    expect(r.terminal).toBe(true)
    expect(r.title).toBe('This offer has responses')
  })

  it('reads 23505 as already-matched when accepting, already-sent when responding', () => {
    expect(barterWriteFailure('accept', pgErr('23505')).title).toBe('Already matched')
    expect(barterWriteFailure('respond', pgErr('23505')).title).toBe('Already sent')
  })

  it('treats decline like accept for an illegal transition', () => {
    const r = barterWriteFailure('decline', pgErr('23514'))
    expect(r.terminal).toBe(true)
    expect(r.title).toBe('Already answered')
  })

  // The safety property: an unknown failure must never be presented as permanent.
  it.each<[BarterWriteOp]>([
    ['respond'], ['accept'], ['decline'], ['closeOffer'], ['deleteOffer'],
  ])('treats an unmapped code as retryable for %s', (op) => {
    const r = barterWriteFailure(op, pgErr('08006')) // connection failure
    expect(r.terminal).toBe(false)
    expect(r.body).toBe('Please try again.')
  })

  it('treats a transport error with no code as retryable, not permanent', () => {
    // postgrest-js synthesises an error with an empty code for network failures. Reporting
    // "this offer has responses" for a dropped connection was a real shipped defect.
    for (const e of [{ code: '' }, {}, null, undefined, new Error('Network request failed')]) {
      expect(barterWriteFailure('deleteOffer', e).terminal).toBe(false)
    }
  })

  it('never leaks raw database text to the user', () => {
    const raw = 'duplicate key value violates unique constraint "barter_interests_pkey"'
    const r = barterWriteFailure('accept', { code: '23505', message: raw })
    expect(r.title + r.body).not.toContain('constraint')
    expect(r.title + r.body).not.toContain('barter_interests')
  })

  it('does not map a code an operation cannot produce', () => {
    // closeOffer is a plain is_active update; it has no terminal server rule today.
    expect(barterWriteFailure('closeOffer', pgErr('23514')).terminal).toBe(false)
  })

  // A zero-row write is detected by the CLIENT, not reported by the server. It must never be
  // reported as a specific server rule -- an earlier draft returned SQLSTATE 42501 for it,
  // which made the UI assert "Not your offer" for a row that had simply been deleted.
  describe('zero-row writes', () => {
    const noRows = { barterClientCode: 'no_rows' }

    it.each([['respond'], ['accept'], ['decline'], ['closeOffer'], ['deleteOffer']] as const)(
      'is terminal for %s (retrying cannot make a missing row reappear)',
      (op) => {
        expect(barterWriteFailure(op, noRows).terminal).toBe(true)
      },
    )

    it('never asserts WHY the row was missing, because it cannot know', () => {
      for (const op of ['respond', 'accept', 'decline', 'closeOffer', 'deleteOffer'] as const) {
        const r = barterWriteFailure(op, noRows)
        expect(`${r.title} ${r.body}`).not.toMatch(/permission|not your|owner|allowed/i)
      }
    })

    it('says "offer" for offer operations and "response" for response operations', () => {
      expect(barterWriteFailure('closeOffer', noRows).title).toMatch(/offer/i)
      expect(barterWriteFailure('deleteOffer', noRows).title).toMatch(/offer/i)
      expect(barterWriteFailure('decline', noRows).title).toMatch(/response/i)
      expect(barterWriteFailure('accept', noRows).title).toMatch(/response/i)
    })

    it('does not let the discriminator collide with the server code space', () => {
      // A real 42501 from the server still means "not yours"; the client signal does not.
      expect(barterWriteFailure('decline', { code: '42501' }).title).not.toEqual(
        barterWriteFailure('decline', noRows).title,
      )
    })
  })
})

// Slice 3a-0b: the release operation. Both codes the RPC raises are TERMINAL — retrying
// cannot make a negotiation active again, and cannot make you a participant.
describe('release', () => {
  it('treats "no longer in negotiation" (23514) as terminal, not retryable', () => {
    const r = barterWriteFailure('release', { code: '23514' })
    expect(r.terminal).toBe(true)
    expect(`${r.title} ${r.body}`).not.toMatch(/try again/i)
  })

  it('says something TRUE for a non-participant (42501) — not "not your offer"', () => {
    const r = barterWriteFailure('release', { code: '42501' })
    expect(r.terminal).toBe(true)
    expect(r.title).toMatch(/negotiation/i)
    // The nearest pre-existing copy is about offer ownership, which is false here: a responder
    // is not "not your offer", they are simply not in this negotiation.
    expect(`${r.title} ${r.body}`).not.toMatch(/your offer/i)
  })

  it('keeps a transient failure retryable', () => {
    const r = barterWriteFailure('release', { message: 'network down' })
    expect(r.terminal).toBe(false)
    expect(r.body).toMatch(/try again/i)
  })

  it('never leaks raw database text', () => {
    const raw = 'duplicate key value violates unique constraint "x"'
    const r = barterWriteFailure('release', { code: '23514', message: raw })
    expect(`${r.title} ${r.body}`).not.toContain(raw)
  })
})


describe('a closed post is not the responder\'s doing', () => {
  // The property PD-052's rationale rests on: a closed-post refusal must never be reported as
  // "Already answered", which blames the responder for something the owner did. This was the
  // one mapping with no test.
  it('reports decline on a closed post as a closed post', () => {
    const f = barterWriteFailure('decline', { code: '55000' })
    expect(f.terminal).toBe(true)
    expect(f.title).toMatch(/closed/i)
  })

  it('and never confuses it with "already answered"', () => {
    expect(barterWriteFailure('decline', { code: '55000' })).not.toEqual(
      barterWriteFailure('decline', { code: '23514' }),
    )
  })

  it('says the same for accept', () => {
    const f = barterWriteFailure('accept', { code: '55000' })
    expect(f.terminal).toBe(true)
    expect(f.title).toMatch(/closed/i)
  })

  it('does not tell a user to retry a reopen that can never succeed', () => {
    const f = barterWriteFailure('closeOffer', { code: '55000' })
    expect(f.terminal).toBe(true)
    expect(f.body).not.toMatch(/try again/i)
  })
})
