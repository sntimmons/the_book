import { barterWriteFailure, BarterWriteOp, interpretWrite } from '../../lib/barterErrors'

// The classifier exists because SQLSTATE alone is ambiguous: 23514 is the class code for
// many distinct barter rules. These tests pin the property that actually matters — that the
// SAME code means different things for different operations, and that anything unrecognised
// stays retryable rather than being force-fitted to a terminal message.

// DRIVEN FROM THE UNION, not hand-listed. Both safety suites below previously enumerated five
// operations by hand, so the two added by the negotiation slice were silently excluded — and
// the most consequential mappings in that slice (40001 must be NON-terminal or a provider is
// stranded on a live negotiation; 54000 must be terminal-for-today or they loop for a day) had
// no client test at all. A hand-written list cannot fail when the union grows.
const ALL_OPS: BarterWriteOp[] = [
  'respond',
  'accept',
  'decline',
  'release',
  'closeOffer',
  'deleteOffer',
  'proposeTerms',
  'acceptTerms',
]

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
  it.each<[BarterWriteOp]>(ALL_OPS.map((op) => [op]))(
    'treats an unmapped code as retryable for %s', (op) => {
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

    it.each<[BarterWriteOp]>(ALL_OPS.map((op) => [op]))(
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

describe('interpretWrite — a filtered write is not a success', () => {
  // RLS USING clauses FILTER rather than reject, so a blocked write returns no error and no
  // rows. This rule was hand-written at three call sites; a fourth barter write added without
  // it would look like every other Supabase call in the app and would report success for a
  // write that never happened.
  it('treats zero rows as a failure, not a success', () => {
    const r = interpretWrite(null, [])
    expect(r.ok).toBe(false)
    expect(r.error).toEqual({ barterClientCode: 'no_rows' })
  })

  it('treats a null payload as a failure too', () => {
    expect(interpretWrite(null, null).ok).toBe(false)
  })

  it('passes a real server error through untouched, so SQLSTATE survives', () => {
    const err = pgErr('23514')
    const r = interpretWrite(err, null)
    expect(r.ok).toBe(false)
    expect(r.error).toBe(err)
  })

  it('prefers the server error over the zero-row discriminator', () => {
    // Both conditions can hold at once; the server's reason is the more specific one, and it
    // is what barterWriteFailure keys on.
    const err = pgErr('42501')
    expect(interpretWrite(err, []).error).toBe(err)
  })

  it('reports success when rows came back', () => {
    expect(interpretWrite(null, [{ id: 'x' }])).toEqual({ ok: true, error: null })
  })

  it('feeds barterWriteFailure a zero-row outcome it can classify', () => {
    // The discriminator must not borrow a server SQLSTATE: reporting no_rows as 42501 made the
    // UI assert "Not your offer", which is false in two of the three causes.
    const { error } = interpretWrite(null, [])
    const f = barterWriteFailure('decline', error)
    expect(f.terminal).toBe(true)
    expect(f.title).not.toMatch(/not your/i)
  })
})

describe('negotiation refusals advise the right next action', () => {
  it('a replaced-terms refusal is recoverable, not terminal', () => {
    // The user must read the new terms and accept again. Calling this permanent would strand
    // them on a live negotiation.
    const f = barterWriteFailure('acceptTerms', pgErr('40001'))
    expect(f.terminal).toBe(false)
    expect(f.title).toMatch(/changed/i)
    expect(f.body).not.toMatch(/ended|no longer/i)
  })

  it('a spent daily budget is terminal for today, and says when to come back', () => {
    const f = barterWriteFailure('proposeTerms', pgErr('54000'))
    expect(f.terminal).toBe(true)
    expect(f.body).toMatch(/tomorrow/i)
    expect(f.body).not.toMatch(/try again/i)
  })

  it('losing the race to open a negotiation is not "this has ended"', () => {
    // Two providers open Trade terms at once; one wins. The loser's negotiation is alive and
    // now has terms on it.
    const f = barterWriteFailure('proposeTerms', pgErr('23505'))
    expect(f.terminal).toBe(false)
    expect(f.title).not.toMatch(/ended/i)
    expect(f.body).toMatch(/changes back|take a look/i)
  })

  it('malformed terms are fix-and-resend, and are not confused with a dead negotiation', () => {
    const malformed = barterWriteFailure('proposeTerms', pgErr('22023'))
    expect(malformed.terminal).toBe(false)
    expect(malformed.title).toMatch(/check these terms/i)
    // Two directed sides, not a list.
    expect(malformed.body).not.toMatch(/\b(item|items|list|at least one)\b/i)
    expect(malformed.body).toMatch(/one line per side/i)

    const gone = barterWriteFailure('proposeTerms', pgErr('23514'))
    expect(gone.terminal).toBe(true)
    expect(gone).not.toEqual(malformed)
  })

  it('a non-participant is told that, not that the negotiation is over', () => {
    for (const op of ['proposeTerms', 'acceptTerms'] as const) {
      const f = barterWriteFailure(op, pgErr('42501'))
      expect(f.terminal).toBe(true)
      expect(f.title).toMatch(/not your/i)
    }
  })
})
