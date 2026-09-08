// The three terminal OBLIGATION outcomes, on the client side of the boundary.
//
// WHAT THIS FILE IS FOR. The server decides the outcome; these tests pin that the client renders
// the server's answer, lets it DOMINATE every state that means "someone still has to act", and
// never computes an agreement-level verdict out of two obligation-level ones.
//
// Three things are asserted throughout, because each is a way the feature could go wrong while
// still looking finished:
//
//   1. PRECEDENCE. A resolved obligation is not Action needed, not Waiting for confirmation, not
//      Needs Attention and not Under review — and offers no control that would fail if tapped.
//   2. HISTORY IS PRESERVED, NOT CONTRADICTED. The prior participant act (a `not_received`
//      answer, a delivery, a no-show report) still shapes the card's `state` sentence; the
//      outcome is added beside it rather than rewriting it. `Fulfilled` on an obligation the
//      receiver said they did not receive is a REAL, expected combination.
//   3. NO ROLL-UP. Two resolved obligations produce no third, trade-level outcome. There is no
//      Completed, no Partially Fulfilled, no Not Completed in this product.

import {
  ACTION_NEEDED_LABEL,
  NEEDS_ATTENTION_LABEL,
  obligationView,
  ObligationRole,
  ObligationStatus,
  ReceiverWindowState,
  TERMINAL_OUTCOME_LABEL,
  TERMINAL_OUTCOME_NOTE,
  terminalOutcomeLabel,
  TerminalOutcome,
  UNDER_REVIEW_LABEL,
} from '@/lib/obligationState'
import { tradeRowState, TradeRowFacts } from '@/lib/tradeActivity'

const ROLES: ObligationRole[] = ['deliverer', 'receiver']
const STATUSES: ObligationStatus[] = ['pending', 'delivered', 'received', 'not_received']
const WINDOWS: ReceiverWindowState[] = ['none', 'awaiting_receiver', 'needs_attention']
const OUTCOMES: TerminalOutcome[] = ['fulfilled', 'unfulfilled', 'closed_without_resolution']
const BOOLS = [false, true]
const DEADLINE = '2026-10-17T09:00:00.000Z'

// The vocabulary a terminal outcome still may NOT introduce. `fulfilled` and `resolved` are
// legitimate now — that is the whole feature — so this list is what remains forbidden: blame,
// consequence, and the agreement-level roll-up that does not exist.
const FORBIDDEN = [
  'guilty', 'liar', 'lied', 'dishonest', 'penalty', 'penalised', 'penalized', 'refund',
  'banned', 'suspended', 'rating', 'reputation', 'score', 'strike',
  'completed', 'partially fulfilled', 'not completed', 'trade outcome',
]

function assertNoBlame(text: string) {
  const lower = text.toLowerCase()
  for (const word of FORBIDDEN) {
    const hit = new RegExp(`\\b${word.replace(/ /g, '\\s')}`, 'i').test(lower)
    expect([word, hit]).toEqual([word, false])
  }
  // `fault` may appear only as a denial, the same rule `underReview.test.ts` applies.
  if (/\bfault/.test(lower)) {
    expect(lower).toMatch(/does not decide who was at fault|no fault|not .{0,20}fault/)
  }
}

const row = (over: Partial<TradeRowFacts> = {}): TradeRowFacts => ({
  status: 'accepted',
  myRole: 'owner',
  offerIsActive: true,
  releasedAt: null,
  releaseReason: null,
  offerHasAcceptedResponse: false,
  agreementId: 'agreement-1',
  iCancelled: false,
  theyCancelled: false,
  myResponseState: 'none',
  theirResponseState: 'none',
  ...over,
})

describe('the three outcomes are labelled, distinct and free of blame', () => {
  it('gives each outcome its own label and its own sentence for both roles', () => {
    const labels = OUTCOMES.map((o) => TERMINAL_OUTCOME_LABEL[o])
    expect(new Set(labels).size).toBe(3)
    expect(labels).toEqual(['Fulfilled', 'Unfulfilled', 'Closed without resolution'])
    for (const outcome of OUTCOMES) {
      for (const role of ROLES) {
        const note = TERMINAL_OUTCOME_NOTE[outcome][role]
        expect(note.length).toBeGreaterThan(0)
        assertNoBlame(note)
        assertNoBlame(TERMINAL_OUTCOME_LABEL[outcome])
      }
    }
  })

  // `closed_without_resolution` is NOT a softer `unfulfilled`, and must not read as one.
  it('says closed-without-resolution decided neither way, rather than implying a finding', () => {
    for (const role of ROLES) {
      const note = TERMINAL_OUTCOME_NOTE.closed_without_resolution[role]
      expect(note).toMatch(/did not support deciding either way/)
      expect(note).not.toMatch(/\bnot fulfilled\b/)
    }
  })
})

describe('a terminal outcome dominates the obligation card', () => {
  // THE MATRIX, swept rather than sampled: 2 roles x 4 statuses x 3 windows x under-review x
  // can-report x 3 outcomes. Every combination must obey precedence, so a regression cannot
  // hide in the one cell nobody wrote a case for.
  it('suppresses every attention state and every control, in every combination', () => {
    let seen = 0
    for (const role of ROLES) {
      for (const status of STATUSES) {
        for (const window of WINDOWS) {
          for (const obligationUnderReview of BOOLS) {
            for (const canReportNoShow of BOOLS) {
              for (const terminalOutcome of OUTCOMES) {
                const v = obligationView({
                  role, status, window, obligationUnderReview, canReportNoShow, terminalOutcome,
                  tradeCancelled: false, confirmationDeadline: DEADLINE,
                })
                seen += 1
                expect(v.terminalOutcome).toBe(terminalOutcome)
                // 1. No attention state survives — not Action needed, not Needs attention, not
                // Under review. The card carries exactly one answer, and this is it.
                expect(v.attention).toBeNull()
                // 2. No control that would fail if tapped.
                expect(v.canMarkDelivered).toBe(false)
                expect(v.canRespond).toBe(false)
                expect(v.canReportNoShow).toBe(false)
                // 3. No countdown. The viewer's answer is not what settles it, and never will
                // be again.
                expect(v.deadline).toBeNull()
                // 4. The note is the outcome's, and says nothing about a person.
                expect(v.note).toBe(TERMINAL_OUTCOME_NOTE[terminalOutcome][role])
                assertNoBlame(v.note!)
                // 5. The state sentence still describes what actually happened.
                expect(v.state.length).toBeGreaterThan(0)
              }
            }
          }
        }
      }
    }
    expect(seen).toBe(2 * 4 * 3 * 2 * 2 * 3)
  })

  // The same sweep WITHOUT an outcome, to prove the assertions above are testing dominance
  // rather than a view that is inert for other reasons: these states really are reachable.
  it('leaves those states intact when there is no outcome', () => {
    const live = obligationView({
      role: 'receiver', status: 'delivered', window: 'awaiting_receiver',
      confirmationDeadline: DEADLINE, canReportNoShow: true,
    })
    expect(live.attention).toBe(ACTION_NEEDED_LABEL)
    expect(live.canRespond).toBe(true)
    expect(live.canReportNoShow).toBe(true)
    expect(live.deadline).not.toBeNull()
    expect(live.terminalOutcome).toBeNull()

    const elapsed = obligationView({
      role: 'receiver', status: 'delivered', window: 'needs_attention',
      confirmationDeadline: DEADLINE,
    })
    expect(elapsed.attention).toBe(NEEDS_ATTENTION_LABEL)

    const reviewed = obligationView({
      role: 'receiver', status: 'not_received', obligationUnderReview: true,
    })
    expect(reviewed.attention).toBe(UNDER_REVIEW_LABEL)
  })

  // THE THREE COMBINATIONS THE PRODUCT TURNS ON. Each pairs an outcome with a participant act
  // that appears to contradict it. Both must be readable at once: the outcome is what an
  // operator concluded, the status sentence is what a participant reported, and neither is
  // rewritten to agree with the other.
  it('renders Fulfilled beside a receiver who said they did not receive it', () => {
    for (const role of ROLES) {
      const v = obligationView({
        role, status: 'not_received', obligationUnderReview: true, terminalOutcome: 'fulfilled',
      })
      expect(v.terminalOutcome).toBe('fulfilled')
      expect(v.note).toBe(TERMINAL_OUTCOME_NOTE.fulfilled[role])
      expect(v.attention).toBeNull()
      // The receiver's own answer is STILL what the card says happened.
      expect(v.state).toBe(obligationView({ role, status: 'not_received' }).state)
    }
  })

  it('renders Unfulfilled beside an obligation its deliverer marked delivered', () => {
    for (const role of ROLES) {
      const v = obligationView({
        role, status: 'delivered', window: 'awaiting_receiver', confirmationDeadline: DEADLINE,
        terminalOutcome: 'unfulfilled',
      })
      expect(v.terminalOutcome).toBe('unfulfilled')
      expect(v.attention).toBeNull()
      expect(v.deadline).toBeNull()
      expect(v.canRespond).toBe(false)
      // The delivery is not erased: the card still says it was marked delivered.
      expect(v.state).toBe(obligationView({ role, status: 'delivered' }).state)
    }
  })

  it('renders Closed without resolution beside a reported no-show', () => {
    const v = obligationView({
      role: 'receiver', status: 'pending', obligationUnderReview: true, canReportNoShow: true,
      terminalOutcome: 'closed_without_resolution',
    })
    expect(v.terminalOutcome).toBe('closed_without_resolution')
    expect(v.attention).toBeNull()
    // No second report can be filed against something already closed.
    expect(v.canReportNoShow).toBe(false)
    expect(v.note).toBe(TERMINAL_OUTCOME_NOTE.closed_without_resolution.receiver)
  })

  // CANCELLATION STILL OUTRANKS. The server refuses to adjudicate a cancelled trade, so the two
  // can never both be true — and where the client is handed both anyway it must prefer the one
  // the database would have allowed rather than asserting a resolution.
  it('yields to cancellation, which the server would never have let coexist with it', () => {
    for (const role of ROLES) {
      for (const terminalOutcome of OUTCOMES) {
        const v = obligationView({
          role, status: 'delivered', window: 'awaiting_receiver', tradeCancelled: true,
          confirmationDeadline: DEADLINE, obligationUnderReview: true, terminalOutcome,
        })
        expect(v.terminalOutcome).toBeNull()
        expect(v.note).toBeNull()
        expect(v.attention).toBeNull()
        expect(v.canMarkDelivered).toBe(false)
        expect(v.canRespond).toBe(false)
        expect(v.canReportNoShow).toBe(false)
        expect(v.deadline).toBeNull()
      }
    }
  })

  // Omitting the field WITHHOLDS. An outcome is never inferred from a status, a window or a
  // review — the client has exactly one source for it, and that source is the server.
  it('never invents an outcome from anything else it knows', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        for (const window of WINDOWS) {
          for (const obligationUnderReview of BOOLS) {
            expect(
              obligationView({ role, status, window, obligationUnderReview }).terminalOutcome,
            ).toBeNull()
          }
        }
      }
    }
  })
})

describe('Trade Activity reports each obligation, and never rolls them up', () => {
  // ATTRIBUTION IS THE POINT OF THIS BLOCK, and it is the one thing that shipped wrong.
  //
  // The view's `my_` / `their_` prefixes mean whose RESPONSE is due, not whose PERFORMANCE it
  // was: `my_terminal_outcome` comes from the lateral where `receiver_user_id = auth.uid()`, so
  // it is the outcome of what the viewer was PROMISED. The first cut of this file called that
  // "Your side", which told the provider who had performed that their side was the one ruled
  // unfulfilled — permanent, and about the wrong person.
  //
  // So these tests assert WHICH obligation each phrase refers to, from BOTH participants' point
  // of view on one fixture. A symmetric assertion would pass an inversion; this cannot.
  const PROVIDED = 'What you agreed to provide'
  const PROMISED = 'What you were promised'

  it('names the obligation each outcome belongs to, for both participants', () => {
    // One trade, one operator decision each way: the obligation A delivers is `fulfilled`, the
    // obligation A receives is `unfulfilled`. From B's seat the two facts are swapped.
    const seenByDeliverer = tradeRowState(row({
      deliveredTerminalOutcome: 'fulfilled',
      receivedTerminalOutcome: 'unfulfilled',
    }))
    const seenByCounterparty = tradeRowState(row({
      deliveredTerminalOutcome: 'unfulfilled',
      receivedTerminalOutcome: 'fulfilled',
    }))
    expect(seenByDeliverer.note).toContain(`${PROVIDED}: fulfilled.`)
    expect(seenByDeliverer.note).toContain(`${PROMISED}: unfulfilled.`)
    // The provider who performed is NEVER told their own obligation was the unfulfilled one.
    expect(seenByDeliverer.note).not.toContain(`${PROVIDED}: unfulfilled.`)
    expect(seenByCounterparty.note).toContain(`${PROVIDED}: unfulfilled.`)
    expect(seenByCounterparty.note).toContain(`${PROMISED}: fulfilled.`)
    // NO AGREEMENT-LEVEL LABEL. Nothing is waiting on anyone, so there is no badge — and the
    // absence of a badge is the absence of outstanding work, not a trade verdict.
    expect(seenByDeliverer.attention).toBeNull()
    expect(seenByDeliverer.deadline).toBeNull()
    assertNoBlame(seenByDeliverer.note)
    assertNoBlame(seenByCounterparty.note)
  })

  it('names it the same way when only one obligation is resolved', () => {
    const mine = tradeRowState(row({ deliveredTerminalOutcome: 'unfulfilled' }))
    const theirs = tradeRowState(row({ receivedTerminalOutcome: 'unfulfilled' }))
    expect(mine.note).toContain(`${PROVIDED} was reviewed: unfulfilled.`)
    expect(theirs.note).toContain(`${PROMISED} was reviewed: unfulfilled.`)
    expect(mine.note).not.toContain(PROMISED)
    expect(theirs.note).not.toContain(PROVIDED)
  })

  it('produces no roll-up even when both obligations carry the SAME outcome', () => {
    for (const outcome of OUTCOMES) {
      const s = tradeRowState(row({
        receivedTerminalOutcome: outcome, deliveredTerminalOutcome: outcome,
      }))
      expect(s.attention).toBeNull()
      assertNoBlame(s.note)
      // The tempting shortcut, asserted absent: two `fulfilled` obligations do not become a
      // "Completed" trade.
      expect(s.note.toLowerCase()).not.toMatch(/\bcompleted\b|\bthis trade was\b/)
    }
  })

  // ONE OBLIGATION RESOLVED, THE OTHER NOT. The agreement headline may legitimately still say
  // Under review — the trade genuinely has work outstanding — and the resolved half must be
  // stated rather than hidden behind it.
  it('keeps the agreement under review while one obligation is resolved', () => {
    const s = tradeRowState(row({
      receivedTerminalOutcome: 'fulfilled',
      deliveredTerminalOutcome: null,
      agreementUnderReview: true,
    }))
    expect(s.attention).toBe(UNDER_REVIEW_LABEL)
    expect(s.note).toContain(`${PROMISED} was reviewed: fulfilled.`)
    expect(s.note).toContain('needs review')
    assertNoBlame(s.note)
  })

  // THE FOUNDER RULING OF 2026-09-07, AT THIS PRECEDENCE RANK. An agreement-level statement may
  // LEAD, but must never suppress the viewer's own live obligation-level action. The first cut
  // of the one-resolved branch returned a bespoke second clause and dropped the instruction —
  // leaving a row that showed "Action needed" and a countdown above a sentence about the other
  // obligation, with nothing telling the viewer what to do.
  it('never deletes the viewer’s own outstanding instruction', () => {
    const s = tradeRowState(row({
      receivedTerminalOutcome: null,
      deliveredTerminalOutcome: 'unfulfilled',
      myResponseState: 'awaiting_receiver',
      myResponseDeadline: DEADLINE,
    }))
    expect(s.note).toContain(`${PROVIDED} was reviewed: unfulfilled.`)
    // The viewer still owes an answer, so their badge, countdown AND instruction all survive.
    expect(s.attention).toBe(ACTION_NEEDED_LABEL)
    expect(s.deadline).not.toBeNull()
    expect(s.note).toContain('open this')
  })

  // BADGE, DEADLINE AND SENTENCE MUST AGREE, over every combination the row can reach. This is
  // the structural version of the assertion above: any row that asks for something says so.
  it('agrees with itself across every window pair and either resolved obligation', () => {
    const WINDOWS_ALL = ['none', 'awaiting_receiver', 'needs_attention'] as const
    for (const mine of WINDOWS_ALL) {
      for (const theirs of WINDOWS_ALL) {
        for (const which of ['received', 'delivered'] as const) {
          for (const review of BOOLS) {
            const s = tradeRowState(row({
              myResponseState: mine,
              theirResponseState: theirs,
              agreementUnderReview: review,
              receivedTerminalOutcome: which === 'received' ? 'fulfilled' : null,
              deliveredTerminalOutcome: which === 'delivered' ? 'fulfilled' : null,
            }))
            // A row that shows a countdown is asking this viewer for something, so it must say
            // what — in the same imperative every other asking row uses.
            if (s.deadline) expect(s.note).toContain('open this')
            // And it never claims a pending determination on an obligation nobody reported.
            expect(s.note.toLowerCase()).not.toContain('not resolved yet')
            assertNoBlame(s.note)
          }
        }
      }
    }
  })

  it('drops the viewer’s countdown once the obligation they answer for is resolved', () => {
    const s = tradeRowState(row({
      receivedTerminalOutcome: 'fulfilled',
      deliveredTerminalOutcome: null,
      myResponseState: 'awaiting_receiver',
      myResponseDeadline: DEADLINE,
    }))
    expect(s.deadline).toBeNull()
  })

  // A CANCELLED TRADE reports its cancellation and nothing else, whatever outcome columns are
  // present — the same dominance the obligation card applies.
  it('reports a cancellation rather than an outcome', () => {
    const s = tradeRowState(row({
      iCancelled: true,
      theyCancelled: false,
      receivedTerminalOutcome: 'fulfilled',
      deliveredTerminalOutcome: 'fulfilled',
    }))
    expect(s.attention).toBeNull()
    expect(s.deadline).toBeNull()
    expect(s.note.toLowerCase()).not.toContain('reviewed')
    assertNoBlame(s.note)
  })

  // A ROW WITH NO AGREEMENT is a negotiation, not a trade. Nothing about outcomes may leak into
  // one — this is the shape an unrelated or not-yet-confirmed viewer sees.
  it('says nothing about outcomes on a row that has no agreement', () => {
    const s = tradeRowState(row({ agreementId: null }))
    expect(s.attention).toBeNull()
    expect(s.deadline).toBeNull()
    expect(s.note.toLowerCase()).not.toContain('reviewed')
    expect(s.note.toLowerCase()).not.toContain('fulfilled')
  })

  // WITHHOLDING, again at the row level: absent columns must never be read as a resolution.
  it('treats missing outcome columns as no outcome, not as fulfilled', () => {
    for (const mine of ['none', 'awaiting_receiver', 'needs_attention'] as const) {
      for (const theirs of ['none', 'awaiting_receiver', 'needs_attention'] as const) {
        const s = tradeRowState(row({ myResponseState: mine, theirResponseState: theirs }))
        expect(s.note.toLowerCase()).not.toContain('reviewed:')
        expect(s.note.toLowerCase()).not.toContain('was reviewed')
      }
    }
  })
})

// ── AN OUTCOME THIS BUILD DOES NOT KNOW ───────────────────────────────────
//
// The type system makes a fourth outcome a COMPILE error, and that is the primary guard. It is
// not the whole guard: `terminal_outcome` arrives off a server column, and a React Native app
// ships on its own cadence while the database migrates on another. A migration that widens
// `barter_obligation_adjudications_outcome_check` reaches installed clients BEFORE the matching
// build does.
//
// Unguarded, `TERMINAL_OUTCOME_NOTE[x][role]` and `TERMINAL_OUTCOME_LABEL[x].toLowerCase()` both
// throw on that value — inside a render, on the trade card and on the Trade Activity list. A
// hard crash on both barter surfaces is strictly worse than degraded copy, and `attentionTone`
// already defends this exact boundary and documents why. These casts are how the runtime edge is
// reached at all; that is the point of the test, not a gap in it.
describe('an unrecognised terminal outcome degrades instead of crashing', () => {
  const UNKNOWN = 'partially_fulfilled' as unknown as TerminalOutcome

  it('renders a non-blaming note rather than throwing, for both roles', () => {
    for (const role of ['deliverer', 'receiver'] as const) {
      const v = obligationView({ role, status: 'delivered', terminalOutcome: UNKNOWN })
      expect(v.note).toBe('This was reviewed and resolved.')
      expect(v.note?.toLowerCase()).not.toContain('fulfilled')
      assertNoBlame(v.note ?? '')
    }
  })

  it('still lets the unknown outcome DOMINATE, so no dead control is drawn', () => {
    // The precedence must not depend on recognising the value. An outcome we cannot describe is
    // still an outcome, and the server will refuse every participant write with PT424.
    const v = obligationView({ role: 'receiver', status: 'delivered', terminalOutcome: UNKNOWN })
    expect(v.canRespond).toBe(false)
    expect(v.attention).toBeNull()
  })

  it('omits the chip rather than drawing one that reads "undefined"', () => {
    expect(terminalOutcomeLabel('partially_fulfilled')).toBeNull()
    expect(terminalOutcomeLabel('fulfilled')).toBe('Fulfilled')
  })

  it('words the row note without naming an outcome it cannot describe', () => {
    const s = tradeRowState(row({ receivedTerminalOutcome: UNKNOWN }))
    expect(s.note.toLowerCase()).toContain('reviewed')
    expect(s.note.toLowerCase()).not.toContain('undefined')
    assertNoBlame(s.note)
  })
})
