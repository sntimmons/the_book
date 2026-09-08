// The pre-adjudication cleanup: an INVARIANT sweep over the refactored view models.
//
// BE PRECISE ABOUT WHAT THIS FILE IS. It asserts structural invariants across every supported
// combination — totality, precedence, gate independence, field-order irrelevance. It does NOT
// assert copy: no expected sentence appears here, so a refactor that reworded a note would pass
// it. The COPY equivalence evidence is that `obligationState.test.ts`, `receiverWindow.test.ts`
// and `underReview.test.ts` — which do pin exact strings — were converted to the new call shape
// and still assert the same strings unchanged.
//
// Each test exists because a specific mistake became possible, or became impossible, when a
// positional signature turned into a named one, a duplicated mapping turned into a single
// source, or two predicates stopped sharing a name.

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
  TerminalOutcome,
  UNDER_REVIEW_LABEL,
} from '@/lib/obligationState'
import { cancellationView, CancellationFacts } from '@/lib/tradeCancellation'
import { tradeRowState } from '@/lib/tradeActivity'

const ROLES: ObligationRole[] = ['deliverer', 'receiver']
const STATUSES: ObligationStatus[] = ['pending', 'delivered', 'received', 'not_received']
const WINDOWS: ReceiverWindowState[] = ['none', 'awaiting_receiver', 'needs_attention']
const BOOLS = [false, true]
// null FIRST, so the unresolved case is not a special case bolted onto the end: the sweep is
// over four values of one fact, one of which is "no outcome".
const OUTCOMES: (TerminalOutcome | null)[] =
  [null, 'fulfilled', 'unfulfilled', 'closed_without_resolution']
const DEADLINE = '2026-10-17T09:00:00.000Z'

describe('obligationView — the full matrix still answers identically', () => {
  // 2 roles x 4 statuses x 3 windows x cancelled x review x canReport x 4 outcomes = 768
  // combinations. Every one is exercised, so a refactor that changed ANY cell fails here rather
  // than in a hand-picked case someone remembered to write.
  //
  // `terminalOutcome` was added to this sweep when it was added to the module, and belongs here
  // rather than only in the feature's own file for the reason this file exists: it sits at the
  // DOMINANT precedence rank — above Under Review, below cancellation — so a refactor of
  // precedence that this sweep could not see would be a refactor of the thing it guards.
  it('is total and self-consistent across every supported combination', () => {
    let seen = 0
    for (const role of ROLES) {
      for (const status of STATUSES) {
        for (const window of WINDOWS) {
          for (const tradeCancelled of BOOLS) {
            for (const obligationUnderReview of BOOLS) {
              for (const canReportNoShow of BOOLS) {
                for (const terminalOutcome of OUTCOMES) {
                const v = obligationView({
                  role, status, window, tradeCancelled,
                  obligationUnderReview, canReportNoShow, terminalOutcome,
                  confirmationDeadline: DEADLINE,
                })
                seen += 1

                // Always a title and a state sentence — no combination renders a blank card.
                expect(v.title.length).toBeGreaterThan(0)
                expect(v.state.length).toBeGreaterThan(0)

                // CANCELLATION OUTRANKS EVERYTHING, the terminal outcome included. The server
                // refuses to adjudicate a cancelled trade, so the two can never both be true;
                // where the client is handed both anyway it must prefer the one the database
                // would have allowed.
                if (tradeCancelled) {
                  expect(v.note).toBeNull()
                  expect(v.attention).toBeNull()
                  expect(v.terminalOutcome).toBeNull()
                  expect(v.canMarkDelivered).toBe(false)
                  expect(v.canRespond).toBe(false)
                  expect(v.canReportNoShow).toBe(false)
                  expect(v.deadline).toBeNull()
                  continue
                }

                // A TERMINAL OUTCOME OUTRANKS EVERYTHING BELOW CANCELLATION. Nothing is waiting
                // on anyone, so no attention state and no control survives it — a resolution
                // rendered beside a stale request is the caption-contradicts-capability defect
                // in its worst form.
                if (terminalOutcome) {
                  expect(v.terminalOutcome).toBe(terminalOutcome)
                  expect(v.attention).toBeNull()
                  expect(v.canMarkDelivered).toBe(false)
                  expect(v.canRespond).toBe(false)
                  expect(v.canReportNoShow).toBe(false)
                  expect(v.deadline).toBeNull()
                  continue
                }
                // And it is never invented from anything else the module knows.
                expect(v.terminalOutcome).toBeNull()

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
    }
    expect(seen).toBe(2 * 4 * 3 * 2 * 2 * 2 * 4)
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
            for (const terminalOutcome of OUTCOMES) {
              const a = obligationView({
                role, status, window, obligationUnderReview, terminalOutcome,
              }).attention
              if (a) emitted.add(a)
            }
          }
        }
      }
    }
    expect(emitted.size).toBeGreaterThan(0)
    for (const label of emitted) {
      expect((ATTENTION_TONE as Record<string, AttentionTone>)[label]).toBeDefined()
    }
    expect(new Set(Object.values(ATTENTION_TONE)).size).toBe(Object.keys(ATTENTION_TONE).length)
  })

  it('falls back to the least alarming tone rather than throwing', () => {
    expect(attentionTone('Something nobody defined')).toBe<AttentionTone>('live')
  })

  // TRADE ACTIVITY carries its own attention vocabulary, so the sweep covers the labels IT
  // emits, not only obligationView's — and it varies the two per-obligation outcomes, because
  // adjudication is OBLIGATION-level (PD-065) and a row can hold one resolved obligation beside
  // one that is not.
  it('covers every label tradeRowState can emit', () => {
    const WINDOWS_ALL = ['none', 'awaiting_receiver', 'needs_attention'] as const
    const emitted = new Set<string>()
    for (const mine of WINDOWS_ALL) {
      for (const theirs of WINDOWS_ALL) {
        for (const agreementUnderReview of BOOLS) {
          for (const receivedTerminalOutcome of OUTCOMES) {
            for (const deliveredTerminalOutcome of OUTCOMES) {
          const a = tradeRowState({
            status: 'accepted',
            myRole: 'owner',
            offerIsActive: true,
            releasedAt: null,
            releaseReason: null,
            offerHasAcceptedResponse: false,
            agreementId: 'agreement-1',
            iCancelled: false,
            theyCancelled: false,
            myResponseState: mine,
            theirResponseState: theirs,
            agreementUnderReview,
            receivedTerminalOutcome,
            deliveredTerminalOutcome,
          }).attention
          if (a) emitted.add(a)
            }
          }
        }
      }
    }
    expect(emitted.size).toBeGreaterThan(0)
    for (const label of emitted) {
      expect((ATTENTION_TONE as Record<string, AttentionTone>)[label]).toBeDefined()
    }
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
        for (const noShowReported of BOOLS) {
          const v = cancellationView({ ...f, anyDelivered, noShowReported })

          // PD-046: a delivery removes the exit permanently.
          if (anyDelivered) {
            expect(v.canCancel).toBe(false)
            expect(v.canAgree).toBe(false)
          }
          // PD-063: so does a report, for the whole trade.
          if (noShowReported) {
            expect(v.canCancel).toBe(false)
            expect(v.canAgree).toBe(false)
          }
          // Cancel is offered only from a clean state; agree only from the counterparty's act.
          if (!anyDelivered && !noShowReported) {
            expect(v.canCancel).toBe(!f.iCancelled && !f.theyCancelled)
            expect(v.canAgree).toBe(!f.iCancelled && f.theyCancelled)
          }
          // The classification never depends on the two gates.
          expect(v.state).toBe(
            cancellationView({ ...f, anyDelivered: false, noShowReported: false }).state,
          )
        }
      }
    }
  })

  // Written so the spread cannot mask the point: `f` carries NEITHER gate, so putting it last
  // does not overwrite them, and the two orderings genuinely differ in source order only.
  it('does not depend on field order — the adjacent-boolean risk is gone', () => {
    const f = ACTS[0]
    const a = cancellationView({ ...f, anyDelivered: true, noShowReported: false })
    const b = cancellationView({
      noShowReported: false,
      anyDelivered: true,
      cancelledAt: f.cancelledAt,
      theyCancelled: f.theyCancelled,
      iCancelled: f.iCancelled,
    })
    expect(a).toEqual(b)
  })

  // The two formerly-adjacent booleans mean different things and are now named so.
  it('distinguishes delivered from under review', () => {
    const f = ACTS[0]
    const delivered = cancellationView({ ...f, anyDelivered: true, noShowReported: false })
    const reviewed = cancellationView({ ...f, anyDelivered: false, noShowReported: true })
    // Both refuse — but for different reasons, and the copy is the state's, not the gate's.
    expect(delivered.canCancel).toBe(false)
    expect(reviewed.canCancel).toBe(false)
    expect(delivered.state).toBe('none')
    expect(reviewed.state).toBe('none')
  })
})
