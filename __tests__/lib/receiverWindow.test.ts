// The PD-057 receiver window and PD-059 Needs Attention, on the client side.
//
// The DEADLINE ARITHMETIC is not tested here and must not be: it belongs to the server
// (`public.barter_confirmation_anchor` / `_deadline` / `barter_receiver_window`, pinned by
// supabase/tests/receiver_window.test.sql). What is pinned here is everything the client is
// actually responsible for — that it consumes the server's state instead of recomputing one,
// that the copy for each role × state is truthful and non-final, that the receiver keeps their
// controls after the window passes, and that cancellation still outranks everything.

import {
  NEEDS_ATTENTION_LABEL,
  obligationView,
  ReceiverWindowState,
} from '@/lib/obligationState'
import { ACTION_NEEDED_LABEL, tradeRowState, TradeRowFacts } from '@/lib/tradeActivity'

const WINDOWS: ReceiverWindowState[] = ['none', 'awaiting_receiver', 'needs_attention']
const DEADLINE = '2026-10-17T09:00:00.000Z'

// Vocabulary the product does not have. An elapsed window is a missing answer, not a finding
// about a person, so none of these may appear anywhere in the copy this slice adds.
//
// WORD-BOUNDARY, not substring, and the distinction is load-bearing rather than cosmetic:
// `unresolved` is exactly the honest word for a trade whose window passed with no answer — the
// brief uses it — while `resolved` would be a claim that something was decided. A substring
// sweep bans the first for containing the second. Same for `unfulfilled` vs `fulfilled`, which
// are opposite claims and are BOTH banned here, separately and deliberately.
const FORBIDDEN: RegExp[] = [
  /\bfulfilled\b/,
  /\bunfulfilled\b/,
  /\bfulfilment\b/,
  /\bcomplete/, // complete, completed, completion
  /\bdisputed?\b/,
  /\bunder review\b/,
  /\breview(ing|ed)?\b/,
  /\badjudicat/,
  /\bno[- ]show\b/,
  /\bfailed\b/,
  /\bfailure\b/,
  /\bfault\b/,
  /\bblame\b/,
  /\bpenalty\b/,
  /\bviolation\b/,
  /\bbreach\b/,
  /\bsuspend/,
  /\bterminated\b/,
  /\bresolved\b/,
  /\bguarantee/,
  /\bbooked\b/,
]

function assertTruthful(text: string) {
  const lower = text.toLowerCase()
  for (const pattern of FORBIDDEN) {
    expect(lower).not.toMatch(pattern)
  }
}

describe('obligationView — the client never derives the window itself', () => {
  it('defaults to no window, so a caller that forgot to pass one asserts nothing', () => {
    const v = obligationView('receiver', 'delivered')
    expect(v.attention).toBeNull()
    expect(v.deadline).toBeNull()
  })

  it('escalates to Needs attention only when the SERVER said the window passed', () => {
    // The receiver's own live obligation asks for the action it needs (Founder ruling
    // 2026-09-07); only the SERVER's `needs_attention` escalates it. The client never decides
    // which of the two applies — it is handed the state.
    expect(obligationView('receiver', 'delivered', false, 'awaiting_receiver').attention).toBe(
      ACTION_NEEDED_LABEL,
    )
    expect(obligationView('receiver', 'delivered', false, 'needs_attention').attention).toBe(
      NEEDS_ATTENTION_LABEL,
    )
  })

  it('never asks the DELIVERER to act — they are not the one being awaited', () => {
    expect(obligationView('deliverer', 'delivered', false, 'awaiting_receiver').attention)
      .toBeNull()
    // Once elapsed the deliverer sees the trade-level state, but still no action of their own.
    expect(obligationView('deliverer', 'delivered', false, 'needs_attention').attention).toBe(
      NEEDS_ATTENTION_LABEL,
    )
  })

  // FOUNDER RULING 2026-09-07, at the level it actually binds: `obligationView` is per
  // obligation and is never told about the counterparty's, so no escalation over there can
  // reach in and silence this one. The receiver keeps their label, their deadline AND both
  // controls whatever the other obligation is doing.
  it('keeps the receiver’s own action, deadline and controls regardless of the other side', () => {
    const v = obligationView('receiver', 'delivered', false, 'awaiting_receiver', DEADLINE)
    expect(v.attention).toBe(ACTION_NEEDED_LABEL)
    expect(v.deadline).toEqual({ label: 'Please respond by', at: DEADLINE })
    expect(v.canRespond).toBe(true)
    // The signature carries no counterparty parameter at all — the isolation is structural.
    expect(obligationView).toHaveLength(2)
  })

  it('shows no deadline line when the server sent no deadline', () => {
    expect(obligationView('receiver', 'delivered', false, 'awaiting_receiver', null).deadline)
      .toBeNull()
  })

  it('passes the server deadline through untouched — the client only formats it', () => {
    const v = obligationView('receiver', 'delivered', false, 'awaiting_receiver', DEADLINE)
    expect(v.deadline).toEqual({ label: 'Please respond by', at: DEADLINE })
  })

  it('labels the deadline for the viewer, not generically', () => {
    expect(
      obligationView('deliverer', 'delivered', false, 'awaiting_receiver', DEADLINE).deadline?.label,
    ).toBe('They have until')
    expect(
      obligationView('receiver', 'delivered', false, 'awaiting_receiver', DEADLINE).deadline?.label,
    ).toBe('Please respond by')
  })
})

describe('obligationView — the receiver keeps their controls after the deadline', () => {
  // The whole point of the Founder ruling: the deadline means "this needs attention", not
  // "you lost your right to answer". The server agrees — no RPC consults it — so withdrawing
  // the control here would hide an action that still works.
  it('still offers the answer after the window passes', () => {
    const v = obligationView('receiver', 'delivered', false, 'needs_attention', DEADLINE)
    expect(v.canRespond).toBe(true)
    expect(v.attention).toBe(NEEDS_ATTENTION_LABEL)
  })

  it('and says so, rather than announcing a closed window beside two working buttons', () => {
    const v = obligationView('receiver', 'delivered', false, 'needs_attention', DEADLINE)
    expect(v.note).toContain('You can still say whether you received it')
  })

  it('never offers the receiver the delivery control, in any window state', () => {
    for (const w of WINDOWS) {
      expect(obligationView('receiver', 'delivered', false, w).canMarkDelivered).toBe(false)
    }
  })

  it('never lets the deliverer answer for their own delivery, in any window state', () => {
    for (const w of WINDOWS) {
      expect(obligationView('deliverer', 'delivered', false, w).canRespond).toBe(false)
    }
  })
})

describe('obligationView — cancellation outranks the window', () => {
  it('shows no attention state on a cancelled trade even if the server sent one', () => {
    const v = obligationView('receiver', 'delivered', true, 'needs_attention', DEADLINE)
    expect(v.attention).toBeNull()
    expect(v.deadline).toBeNull()
    expect(v.note).toBeNull()
    expect(v.canRespond).toBe(false)
  })

  it('for both roles and every window state', () => {
    for (const role of ['deliverer', 'receiver'] as const) {
      for (const w of WINDOWS) {
        const v = obligationView(role, 'delivered', true, w, DEADLINE)
        expect(v.attention).toBeNull()
        expect(v.deadline).toBeNull()
      }
    }
  })
})

describe('obligationView — an answered obligation is never dragged into attention', () => {
  // PD-058: an explicit statement and an unanswered expiry are different facts. The server
  // returns `none` for an answered row, and nothing here can override that into attention.
  it('reports no attention for received or not_received', () => {
    for (const status of ['received', 'not_received'] as const) {
      for (const role of ['deliverer', 'receiver'] as const) {
        const v = obligationView(role, status, false, 'none', DEADLINE)
        expect(v.attention).toBeNull()
        expect(v.canRespond).toBe(false)
      }
    }
  })

  it("keeps PD-058's 'Nothing has been decided.' on a receiver's not_received", () => {
    expect(obligationView('receiver', 'not_received', false, 'none').note).toBe(
      'Nothing has been decided.',
    )
  })
})

describe('obligationView — copy is truthful for every role × status × window', () => {
  it('claims no outcome anywhere in the matrix', () => {
    for (const role of ['deliverer', 'receiver'] as const) {
      for (const status of ['pending', 'delivered', 'received', 'not_received'] as const) {
        for (const w of WINDOWS) {
          for (const cancelled of [false, true]) {
            const v = obligationView(role, status, cancelled, w, DEADLINE)
            assertTruthful(v.state)
            assertTruthful(v.title)
            if (v.note) assertTruthful(v.note)
            if (v.attention) assertTruthful(v.attention)
            if (v.deadline) assertTruthful(v.deadline.label)
          }
        }
      }
    }
  })

  it('says the window passed without blaming anyone, for both roles', () => {
    const receiver = obligationView('receiver', 'delivered', false, 'needs_attention').note ?? ''
    const deliverer = obligationView('deliverer', 'delivered', false, 'needs_attention').note ?? ''
    expect(receiver).toContain('window has passed')
    expect(deliverer).toContain('window has passed')
    // The deliverer is told the trade is unresolved and that nothing follows from it yet.
    expect(deliverer).toContain('Nothing has been decided')
    assertTruthful(receiver)
    assertTruthful(deliverer)
  })

  it('uses one label for the elapsed state, shared with Trade Activity', () => {
    expect(NEEDS_ATTENTION_LABEL).toBe('Needs attention')
    for (const role of ['deliverer', 'receiver'] as const) {
      expect(obligationView(role, 'delivered', false, 'needs_attention').attention).toBe(
        NEEDS_ATTENTION_LABEL,
      )
    }
  })
})

// ── Trade Activity ──────────────────────────────────────────────────────────

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

describe('tradeRowState — role-relative attention (PD-059)', () => {
  it('asks the RECEIVER to act while the window is live', () => {
    const s = tradeRowState(facts({ myResponseState: 'awaiting_receiver' }))
    expect(s.attention).toBe(ACTION_NEEDED_LABEL)
    expect(s.note).toContain('Action needed')
    expect(s.note).toContain('marked their side delivered')
    // Reported, never offered: the answer is given on the trade's own screen.
    expect(s.action).toBe('none')
  })

  it('tells the DELIVERER they are waiting, and does not demand action from them', () => {
    const s = tradeRowState(facts({ theirResponseState: 'awaiting_receiver' }))
    expect(s.attention).toBeNull()
    expect(s.note).toContain('Waiting for confirmation')
    expect(s.note).not.toContain('Action needed')
  })

  it('surfaces Needs attention once the window passes, for the receiver', () => {
    const s = tradeRowState(facts({ myResponseState: 'needs_attention' }))
    expect(s.attention).toBe(NEEDS_ATTENTION_LABEL)
    expect(s.note).toContain('window has passed')
    expect(s.note).toContain('You still can')
  })

  it('and for the deliverer, whose trade is equally unresolved', () => {
    const s = tradeRowState(facts({ theirResponseState: 'needs_attention' }))
    expect(s.attention).toBe(NEEDS_ATTENTION_LABEL)
    expect(s.note).toContain('Nothing has been decided')
  })

  it('reverts to the plain confirmed note when nothing is awaited', () => {
    const s = tradeRowState(facts({ myResponseState: 'none', theirResponseState: 'none' }))
    expect(s.attention).toBeNull()
    expect(s.note).toBe('Trade confirmed. The agreed terms can no longer change.')
  })

  it('says nothing about a window when the fields are absent — fail closed', () => {
    const s = tradeRowState(facts())
    expect(s.attention).toBeNull()
    expect(s.note).toBe('Trade confirmed. The agreed terms can no longer change.')
  })
})

describe('tradeRowState — priority across the two obligations', () => {
  // The brief's order: Needs Attention outranks Action needed, and within a rank the viewer's
  // OWN side outranks the counterparty's. One truthful label is enough even when both need it.
  it('is total over all nine combinations and always yields one label', () => {
    for (const mine of WINDOWS) {
      for (const theirs of WINDOWS) {
        const s = tradeRowState(facts({ myResponseState: mine, theirResponseState: theirs }))
        expect(typeof s.note).toBe('string')
        expect(s.note.length).toBeGreaterThan(0)
        assertTruthful(s.note)
        if (s.attention) assertTruthful(s.attention)
      }
    }
  })

  // The badge is derived by a separate expression from the note, so assert it over the SAME
  // nine cells rather than the five that happened to have a named case. A tenth window state
  // must not be able to give a truthful sentence a missing badge.
  it('yields an expected badge — never an unrecognised one — in all nine combinations', () => {
    const allowed = [null, ACTION_NEEDED_LABEL, NEEDS_ATTENTION_LABEL]
    for (const mine of WINDOWS) {
      for (const theirs of WINDOWS) {
        const s = tradeRowState(facts({ myResponseState: mine, theirResponseState: theirs }))
        expect(allowed).toContain(s.attention)
        // Either side elapsed is always Needs Attention; nothing elapsed and the viewer awaited
        // is always Action needed; anything else carries no badge.
        const expected =
          mine === 'needs_attention' || theirs === 'needs_attention'
            ? NEEDS_ATTENTION_LABEL
            : mine === 'awaiting_receiver'
              ? ACTION_NEEDED_LABEL
              : null
        expect(s.attention).toBe(expected)
      }
    }
  })

  it('prefers the viewer OWN elapsed window over the counterparty’s', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'needs_attention', theirResponseState: 'needs_attention' }),
    )
    expect(s.attention).toBe(NEEDS_ATTENTION_LABEL)
    // Names what THIS provider can still do rather than the other side's silence.
    expect(s.note).toContain('You still can')
  })

  it('lets an elapsed counterparty window outrank the viewer’s still-live one', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'awaiting_receiver', theirResponseState: 'needs_attention' }),
    )
    expect(s.attention).toBe(NEEDS_ATTENTION_LABEL)
  })

  it('asks the viewer to act when only their own side is awaited', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'awaiting_receiver', theirResponseState: 'none' }),
    )
    expect(s.attention).toBe(ACTION_NEEDED_LABEL)
  })

  it('still asks them to act when both sides are merely awaited', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'awaiting_receiver', theirResponseState: 'awaiting_receiver' }),
    )
    expect(s.attention).toBe(ACTION_NEEDED_LABEL)
  })
})

describe('tradeRowState — cancellation stays dominant', () => {
  it('reports the cancellation, not a window, whoever cancelled', () => {
    const cases: [Partial<TradeRowFacts>, string][] = [
      [{ iCancelled: true }, 'You cancelled this trade.'],
      [{ theyCancelled: true }, 'The other provider cancelled this trade.'],
      [{ iCancelled: true, theyCancelled: true }, 'Trade cancelled by both of you.'],
    ]
    for (const [who, expected] of cases) {
      for (const mine of WINDOWS) {
        for (const theirs of WINDOWS) {
          const s = tradeRowState(
            facts({ ...who, myResponseState: mine, theirResponseState: theirs }),
          )
          expect(s.note).toContain(expected)
          expect(s.attention).toBeNull()
        }
      }
    }
  })
})

describe('tradeRowState — no window state leaks onto a non-confirmed row', () => {
  it('never badges a pre-agreement, pending, released or declined row', () => {
    const rows: TradeRowFacts[] = [
      facts({ agreementId: null, myResponseState: 'needs_attention' }),
      facts({ status: 'pending', agreementId: null, myResponseState: 'needs_attention' }),
      facts({ status: 'released', agreementId: null, myResponseState: 'needs_attention' }),
      facts({ status: 'declined', agreementId: null, myResponseState: 'needs_attention' }),
      facts({ status: 'pending', myRole: 'responder', myResponseState: 'awaiting_receiver' }),
    ]
    for (const f of rows) {
      expect(tradeRowState(f).attention).toBeNull()
    }
  })
})

describe('tradeRowState — the response deadline (PD-057)', () => {
  const AT = '2026-10-17T09:00:00.000Z'

  it('states the viewer’s own deadline while their answer is still live', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'awaiting_receiver', myResponseDeadline: AT }),
    )
    expect(s.deadline).toEqual({ label: 'Please respond by', at: AT })
    // The RAW server timestamp is handed back, never a preformatted string: one formatter
    // renders it, so the list and the trade's own screen cannot describe one instant two ways.
    expect(s.deadline?.at).toBe(AT)
    assertTruthful(s.deadline!.label)
  })

  it('shows no deadline once the window has elapsed — the note already says so', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'needs_attention', myResponseDeadline: AT }),
    )
    expect(s.deadline).toBeNull()
  })

  it('shows no deadline to the DELIVERER, who is not the one being asked', () => {
    const s = tradeRowState(
      facts({ theirResponseState: 'awaiting_receiver', myResponseDeadline: AT }),
    )
    expect(s.deadline).toBeNull()
  })

  it('shows no deadline on a cancelled trade, however live the window looked', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'awaiting_receiver', myResponseDeadline: AT, iCancelled: true }),
    )
    expect(s.attention).toBeNull()
    expect(s.deadline).toBeNull()
  })

  it('never renders a dangling label when the server sent no timestamp', () => {
    const s = tradeRowState(
      facts({ myResponseState: 'awaiting_receiver', myResponseDeadline: null }),
    )
    expect(s.deadline).toBeNull()
  })

  it('shows a deadline exactly when the VIEWER’S OWN answer is still live', () => {
    for (const mine of WINDOWS) {
      for (const theirs of WINDOWS) {
        const s = tradeRowState(
          facts({ myResponseState: mine, theirResponseState: theirs, myResponseDeadline: AT }),
        )
        // The rule, stated once, and keyed on the viewer's OWN state — NOT on the row badge.
        // Founder ruling 2026-09-07: the counterparty escalating must not delete this.
        expect(s.deadline !== null).toBe(mine === 'awaiting_receiver')
      }
    }
  })

  // The mixed case the ruling was issued about, pinned end to end.
  it('keeps the viewer’s live deadline when the COUNTERPARTY’S window has elapsed', () => {
    const s = tradeRowState(
      facts({
        myResponseState: 'awaiting_receiver',
        theirResponseState: 'needs_attention',
        myResponseDeadline: AT,
      }),
    )
    // Agreement-level headline: the higher-severity trade state still leads.
    expect(s.attention).toBe(NEEDS_ATTENTION_LABEL)
    // Obligation-level action: NOT suppressed by it.
    expect(s.deadline).toEqual({ label: 'Please respond by', at: AT })
    // And the sentence states BOTH facts, not just the counterparty's.
    expect(s.note).toContain('the other provider has not said')
    expect(s.note).toContain('You have not yet said whether you received theirs')
    assertTruthful(s.note)
  })

  it('is null on every row that is not a confirmed trade', () => {
    for (const status of ['pending', 'declined', 'released'] as const) {
      expect(tradeRowState(facts({ status })).deadline).toBeNull()
    }
    expect(tradeRowState(facts({ agreementId: null })).deadline).toBeNull()
  })
})
