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
})
