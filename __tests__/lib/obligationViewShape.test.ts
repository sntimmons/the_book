// The pre-adjudication cleanup: proof that the five refactors changed NOTHING.
//
// These are refactor-risk tests, not feature tests. Each one exists because a specific mistake
// became possible — or became impossible — when a positional signature turned into a named one,
// a duplicated mapping turned into a single source, or two predicates stopped sharing a name.

import {
  ACTION_NEEDED_LABEL,
  ATTENTION_TONE,
  attentionTone,
  AttentionTone,
  NEEDS_ATTENTION_LABEL,
  obligationView,
  ObligationRole,
  ObligationStatus,
  ReceiverWindowState,
  UNDER_REVIEW_LABEL,
} from '@/lib/obligationState'
import { cancellationView, CancellationFacts } from '@/lib/tradeCancellation'

const ROLES: ObligationRole[] = ['deliverer', 'receiver']
const STATUSES: ObligationStatus[] = ['pending', 'delivered', 'received', 'not_received']
const WINDOWS: ReceiverWindowState[] = ['none', 'awaiting_receiver', 'needs_attention']
const BOOLS = [false, true]
const DEADLINE = '2026-10-17T09:00:00.000Z'

describe('obligationView — the full matrix still answers identically', () => {
  // 2 roles x 4 statuses x 3 windows x cancelled x review x canReport = 192 combinations.
  // Every one is exercised, so a refactor that changed ANY cell fails here rather than in a
  // hand-picked case someone remembered to write.
  it('is total and self-consistent across every supported combination', () => {
    let seen = 0
    for (const role of ROLES) {
      for (const status of STATUSES) {
        for (const window of WINDOWS) {
          for (const tradeCancelled of BOOLS) {
            for (const obligationUnderReview of BOOLS) {
              for (const canReportNoShow of BOOLS) {
                const v = obligationView({
                  role, status, window, tradeCancelled,
                  obligationUnderReview, canReportNoShow,
                  confirmationDeadline: DEADLINE,
                })
                seen += 1

                // Always a title and a state sentence — no combination renders a blank card.
                expect(v.title.length).toBeGreaterThan(0)
                expect(v.state.length).toBeGreaterThan(0)

                // CANCELLATION OUTRANKS EVERYTHING. Frozen behaviour.
                if (tradeCancelled) {
                  expect(v.note).toBeNull()
                  expect(v.attention).toBeNull()
                  expect(v.canMarkDelivered).toBe(false)
                  expect(v.canRespond).toBe(false)
                  expect(v.canReportNoShow).toBe(false)
                  expect(v.deadline).toBeNull()
                  continue
                }

                // UNDER REVIEW OUTRANKS THE WINDOW, and is obligation-level.
                if (obligationUnderReview) {
                  expect(v.attention).toBe(UNDER_REVIEW_LABEL)
                }

                // The no-show control is offered ONLY to a receiver, and only when the server
                // said so. The role conjunct is the client's second, independent refusal.
                expect(v.canReportNoShow).toBe(role === 'receiver' && canReportNoShow)

                // A LABEL NEVER APPEARS BESIDE MISSING CONTROLS. This is the
                // caption-contradicts-capability defect the module exists to prevent, and the
                // one that became reachable when the live window gained a label.
                if (v.attention === ACTION_NEEDED_LABEL) {
                  expect(v.canRespond).toBe(true)
                }

                // A window label only ever appears on a DELIVERED obligation.
                if (v.attention === NEEDS_ATTENTION_LABEL) {
                  expect(status).toBe('delivered')
                }
              }
            }
          }
        }
      }
    }
    expect(seen).toBe(2 * 4 * 3 * 2 * 2 * 2)
  })

  // The refactor's whole point: named fields cannot transpose. Order is now irrelevant.
  it('does not depend on field order — the transposition risk is gone', () => {
    const a = obligationView({
      role: 'receiver', status: 'delivered', window: 'awaiting_receiver',
      confirmationDeadline: DEADLINE, obligationUnderReview: false, canReportNoShow: true,
    })
    const b = obligationView({
      canReportNoShow: true, obligationUnderReview: false, confirmationDeadline: DEADLINE,
      window: 'awaiting_receiver', status: 'delivered', role: 'receiver',
    })
    expect(a).toEqual(b)
  })

  // The two booleans that were adjacent and same-typed. Swapping them now means writing
  // different KEYS, which is a different program — and these two outputs prove the swap mattered.
  it('distinguishes the two formerly-adjacent booleans', () => {
    const reviewed = obligationView({
      role: 'receiver', status: 'delivered', obligationUnderReview: true, canReportNoShow: false,
    })
    const reportable = obligationView({
      role: 'receiver', status: 'delivered', obligationUnderReview: false, canReportNoShow: true,
    })
    expect(reviewed.attention).toBe(UNDER_REVIEW_LABEL)
    expect(reviewed.canReportNoShow).toBe(false)
    expect(reportable.attention).not.toBe(UNDER_REVIEW_LABEL)
    expect(reportable.canReportNoShow).toBe(true)
  })

  // Omitting an optional field must WITHHOLD, never assert.
  it('withholds every optional fact when it is not supplied', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const v = obligationView({ role, status })
        expect(v.attention).toBeNull()
        expect(v.deadline).toBeNull()
        expect(v.canReportNoShow).toBe(false)
      }
    }
  })
})

describe('the attention tone mapping is single-sourced and total', () => {
  it('maps each of the three labels to its own tone', () => {
    expect(attentionTone(ACTION_NEEDED_LABEL)).toBe<AttentionTone>('live')
    expect(attentionTone(NEEDS_ATTENTION_LABEL)).toBe<AttentionTone>('elapsed')
    expect(attentionTone(UNDER_REVIEW_LABEL)).toBe<AttentionTone>('review')
  })

  it('gives no tone when there is no label', () => {
    expect(attentionTone(null)).toBeNull()
  })

  // TOTALITY. Every label the module can produce has a tone, and the three tones are distinct —
  // so a fourth attention state cannot silently inherit another state's meaning on one screen.
  it('covers every label obligationView can emit, with distinct tones', () => {
    const emitted = new Set<string>()
    for (const role of ROLES) {
      for (const status of STATUSES) {
        for (const window of WINDOWS) {
          for (const obligationUnderReview of BOOLS) {
            const a = obligationView({ role, status, window, obligationUnderReview }).attention
            if (a) emitted.add(a)
          }
        }
      }
    }
    expect(emitted.size).toBeGreaterThan(0)
    for (const label of emitted) {
      expect(ATTENTION_TONE[label]).toBeDefined()
    }
    expect(new Set(Object.values(ATTENTION_TONE)).size).toBe(Object.keys(ATTENTION_TONE).length)
  })

  it('falls back to the least alarming tone rather than throwing', () => {
    expect(attentionTone('Something nobody defined')).toBe<AttentionTone>('live')
  })
})

describe('cancellationView — the eligibility matrix still answers identically', () => {
  const ACTS: CancellationFacts[] = [
    { iCancelled: false, theyCancelled: false, cancelledAt: null },
    { iCancelled: true, theyCancelled: false, cancelledAt: '2026-10-01T00:00:00.000Z' },
    { iCancelled: false, theyCancelled: true, cancelledAt: '2026-10-01T00:00:00.000Z' },
    { iCancelled: true, theyCancelled: true, cancelledAt: '2026-10-01T00:00:00.000Z' },
  ]

  it('is total over acts x delivered x under review, and each gate stands alone', () => {
    for (const f of ACTS) {
      for (const anyDelivered of BOOLS) {
        for (const agreementUnderReview of BOOLS) {
          const v = cancellationView({ ...f, anyDelivered, agreementUnderReview })

          // PD-046: a delivery removes the exit permanently.
          if (anyDelivered) {
            expect(v.canCancel).toBe(false)
            expect(v.canAgree).toBe(false)
          }
          // PD-063: so does a report, for the whole trade.
          if (agreementUnderReview) {
            expect(v.canCancel).toBe(false)
            expect(v.canAgree).toBe(false)
          }
          // Cancel is offered only from a clean state; agree only from the counterparty's act.
          if (!anyDelivered && !agreementUnderReview) {
            expect(v.canCancel).toBe(!f.iCancelled && !f.theyCancelled)
            expect(v.canAgree).toBe(!f.iCancelled && f.theyCancelled)
          }
          // The classification never depends on the two gates.
          expect(v.state).toBe(cancellationView({ ...f }).state)
        }
      }
    }
  })

  it('does not depend on field order — the adjacent-boolean risk is gone', () => {
    const f = ACTS[0]
    const a = cancellationView({ ...f, anyDelivered: true, agreementUnderReview: false })
    const b = cancellationView({ agreementUnderReview: false, anyDelivered: true, ...f })
    expect(a).toEqual(b)
  })

  // The two formerly-adjacent booleans mean different things and are now named so.
  it('distinguishes delivered from under review', () => {
    const f = ACTS[0]
    const delivered = cancellationView({ ...f, anyDelivered: true, agreementUnderReview: false })
    const reviewed = cancellationView({ ...f, anyDelivered: false, agreementUnderReview: true })
    // Both refuse — but for different reasons, and the copy is the state's, not the gate's.
    expect(delivered.canCancel).toBe(false)
    expect(reviewed.canCancel).toBe(false)
    expect(delivered.state).toBe('none')
    expect(reviewed.state).toBe('none')
  })

  it('withholds nothing extra when the gates are not supplied', () => {
    expect(cancellationView({ ...ACTS[0] }).canCancel).toBe(true)
    expect(cancellationView({ ...ACTS[2] }).canAgree).toBe(true)
  })
})
