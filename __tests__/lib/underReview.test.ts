// Under Review and no-show reporting, on the client side of the boundary.
//
// The SERVER decides both facts — whether an obligation is under review, and whether the
// receiver may report a no-show right now. These tests pin that the client CONSUMES those
// answers and never derives one: nothing here compares a date, and nothing invents a review
// from a status.

import {
  ACTION_NEEDED_LABEL,
  NEEDS_ATTENTION_LABEL,
  obligationView,
  ObligationRole,
  ObligationStatus,
  noShowStatement,
  NO_SHOW_REASON_NOTE,
  noShowReasonPayload,
  REPORT_NO_SHOW_COPY,
  RESPOND_LABELS,
  UNDER_REVIEW_LABEL,
} from '@/lib/obligationState'
import { tradeRowState, TradeRowFacts } from '@/lib/tradeActivity'
import { cancellationView } from '@/lib/tradeCancellation'

const ROLES: ObligationRole[] = ['deliverer', 'receiver']
const STATUSES: ObligationStatus[] = ['pending', 'delivered', 'received', 'not_received']

// The vocabulary this product does not have. A review is an UNRESOLVED condition; none of these
// exist, and copy that used one would be announcing an outcome nothing can produce.
const FORBIDDEN = [
  'fulfilled', 'unfulfilled', 'completed', 'complete', 'failed', 'guilty',
  'refund', 'penalty', 'dispute', 'disputed', 'adjudicat', 'won', 'lost',
  'resolved', 'closed without',
]

// `fault` is NOT on that list, and the omission is deliberate rather than an oversight. The
// no-show dialog says "It does not decide who was at fault" — a DENIAL, and the most valuable
// sentence in it, because it uses the word the reporter is actually worried about. Banning the
// string outright would force that reassurance out of the copy. So the word is allowed only in
// the negated form, and asserted to be negated wherever it appears.
function assertFaultOnlyDenied(text: string) {
  const lower = text.toLowerCase()
  if (!/\bfault/.test(lower)) return
  expect(lower).toMatch(/does not decide who was at fault|no fault|not .{0,20}fault/)
}
function assertTruthful(text: string) {
  const lower = text.toLowerCase()
  for (const word of FORBIDDEN) {
    // Word-boundary, so "unresolved" does not trip on "resolved".
    const hit = new RegExp(`\\b${word}`, 'i').test(lower)
    expect([word, hit]).toEqual([word, false])
  }
  assertFaultOnlyDenied(text)
}

describe('obligationView — Under Review', () => {
  it('labels a reviewed obligation for BOTH roles, and accuses neither', () => {
    for (const role of ROLES) {
      const v = obligationView(role, 'not_received', false, 'none', null, true, false)
      expect(v.attention).toBe(UNDER_REVIEW_LABEL)
      expect(v.note).toBeTruthy()
      assertTruthful(v.note!)
      // Says a human is needed, and says nothing has been decided.
      expect(v.note!.toLowerCase()).toContain('needs review')
      expect(v.note!.toLowerCase()).toContain('nothing has been decided')
    }
  })

  it('outranks the receiver window — a review is truer than a missing answer', () => {
    const v = obligationView('receiver', 'delivered', false, 'needs_attention', '2026-10-17T09:00:00.000Z', true, false)
    expect(v.attention).toBe(UNDER_REVIEW_LABEL)
    expect(v.attention).not.toBe(NEEDS_ATTENTION_LABEL)
    expect(v.attention).not.toBe(ACTION_NEEDED_LABEL)
  })

  it('is outranked by cancellation, which ends the trade outright', () => {
    const v = obligationView('receiver', 'not_received', true, 'none', null, true, true)
    expect(v.attention).toBeNull()
    expect(v.note).toBeNull()
    expect(v.canReportNoShow).toBe(false)
  })

  it('asserts nothing when the server sent no review — the fail-closed direction', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        // Defaulted: a caller that forgot to thread it must not manufacture a review.
        expect(obligationView(role, status).attention).not.toBe(UNDER_REVIEW_LABEL)
      }
    }
  })

  it('never derives a review from the status alone', () => {
    // `not_received` is under review ON THE SERVER, but this module must be told, not guess.
    const v = obligationView('receiver', 'not_received', false, 'none', null, false, false)
    expect(v.attention).not.toBe(UNDER_REVIEW_LABEL)
  })
})

describe('obligationView — the no-show control', () => {
  it('offers it to the RECEIVER when the server says the moment has come', () => {
    const v = obligationView('receiver', 'pending', false, 'none', null, false, true)
    expect(v.canReportNoShow).toBe(true)
  })

  it('never offers it to the deliverer, whatever the server said', () => {
    // A second, independent refusal: the RPC already refuses a deliverer with 42501, and a
    // button that can only fail must never be drawn.
    const v = obligationView('deliverer', 'pending', false, 'none', null, false, true)
    expect(v.canReportNoShow).toBe(false)
  })

  it('withholds it when the server did not offer it, at every role and status', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        expect(obligationView(role, status, false, 'none', null, false, false).canReportNoShow)
          .toBe(false)
      }
    }
  })

  it('withholds it on a cancelled trade', () => {
    expect(obligationView('receiver', 'pending', true, 'none', null, false, true).canReportNoShow)
      .toBe(false)
  })

  it('states what it records and refuses to promise an outcome', () => {
    assertTruthful(REPORT_NO_SHOW_COPY.title)
    assertTruthful(REPORT_NO_SHOW_COPY.body)
    assertTruthful(REPORT_NO_SHOW_COPY.confirmLabel)
    // The three true things: what it records, that it decides nothing, what happens next.
    expect(REPORT_NO_SHOW_COPY.body.toLowerCase()).toContain('did not take place')
    expect(REPORT_NO_SHOW_COPY.body.toLowerCase()).toContain('does not decide')
    expect(REPORT_NO_SHOW_COPY.body.toLowerCase()).toContain('review')
    // The button and its dialog cannot drift apart.
    expect(RESPOND_LABELS.noShow).toBe(REPORT_NO_SHOW_COPY.confirmLabel)
  })
})

function facts(over: Partial<TradeRowFacts> = {}): TradeRowFacts {
  return {
    status: 'accepted',
    myRole: 'owner',
    offerIsActive: true,
    releasedAt: null,
    releaseReason: null,
    offerHasAcceptedResponse: false,
    agreementId: 'agreement-1',
    iCancelled: false,
    theyCancelled: false,
    ...over,
  }
}

describe('tradeRowState — Under Review outranks every window state', () => {
  const WINDOWS = ['none', 'awaiting_receiver', 'needs_attention'] as const

  it('takes the headline in all nine window combinations', () => {
    for (const mine of WINDOWS) {
      for (const theirs of WINDOWS) {
        const s = tradeRowState(
          facts({
            myResponseState: mine,
            theirResponseState: theirs,
            agreementUnderReview: true,
            myUnderReview: true,
            myResponseDeadline: '2026-10-17T09:00:00.000Z',
          }),
        )
        expect(s.attention).toBe(UNDER_REVIEW_LABEL)
        assertTruthful(s.note)
        // The viewer's OWN obligation is the one under review, so their answer genuinely is no
        // longer what settles it and a countdown would say otherwise.
        expect(s.deadline).toBeNull()
      }
    }
  })

  // FOUNDER RULING 2026-09-07, applied to Under Review. The ruling is about SCOPE, not about the
  // Needs Attention label: an agreement-level headline may lead, but it must never delete the
  // viewer's own live obligation-level action. This is the case the first cut got wrong.
  it('does NOT suppress the viewer’s own live answer when the review is on the other side', () => {
    const s = tradeRowState(
      facts({
        myResponseState: 'awaiting_receiver',
        theirResponseState: 'none',
        agreementUnderReview: true,
        myUnderReview: false,
        myResponseDeadline: '2026-10-17T09:00:00.000Z',
      }),
    )
    // Agreement-level headline still leads — the higher-severity trade state.
    expect(s.attention).toBe(UNDER_REVIEW_LABEL)
    // But the viewer's own action and deadline survive it.
    expect(s.deadline).toEqual({ label: 'Please respond by', at: '2026-10-17T09:00:00.000Z' })
    expect(s.note.toLowerCase()).toContain('needs review')
    expect(s.note.toLowerCase()).toContain('you still need to say')
    expect(s.note).toMatch(/open this to/)
    assertTruthful(s.note)
  })

  it('says only the review sentence when the viewer owes nothing', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'none', agreementUnderReview: true, myUnderReview: false }),
    )
    expect(s.note).not.toMatch(/open this to/)
    expect(s.deadline).toBeNull()
  })

  it('says a human is needed and that nothing has been decided', () => {
    const s = tradeRowState(facts({ agreementUnderReview: true }))
    expect(s.note.toLowerCase()).toContain('needs review')
    expect(s.note.toLowerCase()).toContain('nothing has been decided')
    assertTruthful(s.note)
  })

  it('is still outranked by cancellation', () => {
    for (const c of [{ iCancelled: true }, { theyCancelled: true },
      { iCancelled: true, theyCancelled: true }]) {
      const s = tradeRowState(facts({ agreementUnderReview: true, myUnderReview: true, ...c }))
      expect(s.attention).toBeNull()
      expect(s.note.toLowerCase()).toContain('cancelled')
      expect(s.deadline).toBeNull()
    }
  })

  it('asserts no review when the caller did not select the column', () => {
    const s = tradeRowState(facts({ myResponseState: 'awaiting_receiver' }))
    expect(s.attention).toBe(ACTION_NEEDED_LABEL)
    expect(s.note).not.toContain('needs review')
  })

  it('never badges a non-confirmed row as under review', () => {
    for (const status of ['pending', 'declined', 'released'] as const) {
      expect(tradeRowState(facts({ status, agreementUnderReview: true })).attention)
        .not.toBe(UNDER_REVIEW_LABEL)
    }
    expect(tradeRowState(facts({ agreementId: null, agreementUnderReview: true })).attention)
      .not.toBe(UNDER_REVIEW_LABEL)
  })
})

describe('PD-063 — the ordinary exit is gone once a report exists', () => {
  const facts = { iCancelled: false, theyCancelled: false, cancelledAt: null }

  it('offers cancellation on a live, unreported, undelivered trade', () => {
    const v = cancellationView(facts, false, false)
    expect(v.canCancel).toBe(true)
  })

  it('withdraws it once the trade is under review', () => {
    const v = cancellationView(facts, false, true)
    expect(v.canCancel).toBe(false)
    expect(v.canAgree).toBe(false)
  })

  it('withdraws "agree to cancel" too, whoever started it', () => {
    const started = { iCancelled: false, theyCancelled: true, cancelledAt: '2026-10-01T00:00Z' }
    expect(cancellationView(started, false, false).canAgree).toBe(true)
    expect(cancellationView(started, false, true).canAgree).toBe(false)
  })

  it('is still withdrawn by a delivery, independently of review', () => {
    expect(cancellationView(facts, true, false).canCancel).toBe(false)
    expect(cancellationView(facts, true, true).canCancel).toBe(false)
  })
})

describe('PD-062 — the reason is a participant STATEMENT, never a finding', () => {
  it('attributes it to the receiver as their own words', () => {
    const s = noShowStatement('receiver', 'Waited an hour, nobody came.')
    expect(s).toEqual({ label: 'You said', reason: 'Waited an hour, nobody came.' })
  })

  it('attributes it to the counterparty for the deliverer — who SAID it, never who was right', () => {
    const s = noShowStatement('deliverer', 'Waited an hour, nobody came.')
    expect(s?.label).toBe('The other provider said')
    assertTruthful(s!.label)
  })

  it('renders nothing when there is no reason, so no label dangles', () => {
    expect(noShowStatement('receiver', null)).toBeNull()
    expect(noShowStatement('receiver', '')).toBeNull()
    expect(noShowStatement('receiver', '   ')).toBeNull()
    expect(noShowStatement('deliverer', null)).toBeNull()
  })

  it('discloses the sharing BEFORE the writer commits, and says what it is not', () => {
    assertTruthful(NO_SHOW_REASON_NOTE)
    expect(NO_SHOW_REASON_NOTE.toLowerCase()).toContain('shared with the other provider')
    // It must not read as filing a case.
    expect(NO_SHOW_REASON_NOTE.toLowerCase()).toContain('not a decision')
  })

  it('sends NO reason rather than an empty one — the column is null-or-content', () => {
    expect(noShowReasonPayload('')).toBeNull()
    expect(noShowReasonPayload('   ')).toBeNull()
    expect(noShowReasonPayload('  they never came  ')).toBe('they never came')
  })
})
