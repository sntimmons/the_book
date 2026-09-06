import {
  CONFIRM_RECEIVED_COPY,
  MARK_DELIVERED_COPY,
  NOT_RECEIVED_COPY,
  obligationRole,
  ObligationRole,
  ObligationStatus,
  obligationTimeline,
  obligationView,
  RESPOND_LABELS,
} from '@/lib/obligationState'
import { sideForRole } from '@/lib/negotiationState'
import type { ProposalSide, TradeRole } from '@/lib/negotiationState'
import { barterWriteFailure } from '@/lib/barterErrors'

// Obligation delivery / receipt capability rules and copy. Pure, and tested here for the same
// reason the negotiation rules are: every defect this surface has shipped was a copy or
// capability defect, and neither can be tested while it lives inside a component.

const STATUSES: ObligationStatus[] = ['pending', 'delivered', 'received', 'not_received']
const ROLES: ObligationRole[] = ['deliverer', 'receiver']
const SIDES: ProposalSide[] = ['offer_owner', 'responder']
const TRADE_ROLES: TradeRole[] = ['owner', 'responder']

describe('obligationRole', () => {
  it('makes the viewer the deliverer of their own side and the receiver of the other', () => {
    for (const myRole of TRADE_ROLES) {
      for (const side of SIDES) {
        const expected = side === sideForRole(myRole) ? 'deliverer' : 'receiver'
        expect(obligationRole(side, myRole)).toBe(expected)
      }
    }
  })

  it('gives the two participants opposite roles on the same obligation', () => {
    for (const side of SIDES) {
      expect(obligationRole(side, 'owner')).not.toBe(obligationRole(side, 'responder'))
    }
  })
})

describe('obligationView capability', () => {
  it('offers Mark delivered only to the deliverer, and only before delivery', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const v = obligationView(role, status)
        expect(v.canMarkDelivered).toBe(role === 'deliverer' && status === 'pending')
      }
    }
  })

  it('offers the receiver answer only to the receiver, and only after delivery', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const v = obligationView(role, status)
        expect(v.canRespond).toBe(role === 'receiver' && status === 'delivered')
      }
    }
  })

  it('never offers both controls at once', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const v = obligationView(role, status)
        expect(v.canMarkDelivered && v.canRespond).toBe(false)
      }
    }
  })

  it('offers nothing once an answer is recorded', () => {
    for (const role of ROLES) {
      for (const status of ['received', 'not_received'] as ObligationStatus[]) {
        const v = obligationView(role, status)
        expect(v.canMarkDelivered).toBe(false)
        expect(v.canRespond).toBe(false)
      }
    }
  })

  it('titles each obligation by the viewer’s end of it', () => {
    expect(obligationView('deliverer', 'pending').title).toBe('You agreed to provide')
    expect(obligationView('receiver', 'pending').title).toBe('You will receive')
  })
})

describe('obligationView copy is truthful and non-final', () => {
  // The words this slice may not say. There is no timeout, no automatic fulfilment, no
  // cancellation, no-show, Needs Attention, Under Review or adjudication — so copy claiming any
  // of them would describe a product that does not exist.
  const FORBIDDEN = [
    'complete',
    'completed',
    'fulfilled',
    'unfulfilled',
    'cancelled',
    'canceled',
    'dispute',
    'disputed',
    'resolved',
    'under review',
    'needs attention',
    'no-show',
    'booked',
    'guaranteed',
    'closed without resolution',
  ]

  it('says none of the states that do not exist yet', () => {
    const labels = obligationTimeline('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')
      .map((t) => t.label)
      .join(' ')
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const v = obligationView(role, status)
        // The timeline labels are card copy too, and were the one string on the card
        // authored in the screen and therefore outside this sweep.
        const text = `${v.title} ${v.state} ${v.note ?? ''} ${labels}`.toLowerCase()
        for (const word of FORBIDDEN) {
          expect(text).not.toContain(word)
        }
      }
    }
  })

  it('never claims a delivery is confirmed on the deliverer’s say-so', () => {
    const v = obligationView('deliverer', 'delivered')
    expect(v.state).toContain('You marked this delivered')
    expect(v.note).toContain('Waiting for the other provider to confirm')
  })

  it('reports a denial as the receiver’s statement, and decides nothing', () => {
    expect(obligationView('receiver', 'not_received').state).toBe(
      "We've recorded that you didn't receive this.",
    )
    expect(obligationView('deliverer', 'not_received').state).toContain(
      'recorded that they did not receive this',
    )
    for (const role of ROLES) {
      expect(obligationView(role, 'not_received').note).toContain('Nothing has been decided')
    }
  })

  it('does not send the reader anywhere this screen cannot take them', () => {
    // The negotiation screen has no control that opens the conversation, so no copy here may
    // instruct someone to go and use it.
    for (const role of ROLES) {
      for (const status of STATUSES) {
        const v = obligationView(role, status)
        expect(`${v.state} ${v.note ?? ''}`.toLowerCase()).not.toContain('conversation')
      }
    }
  })

  it('tells each side who they are waiting on before delivery', () => {
    expect(obligationView('receiver', 'pending').note).toContain(
      'Waiting for the other provider to mark this delivered',
    )
    expect(obligationView('deliverer', 'pending').state).toContain('not marked this delivered')
  })

  it('gives every role and status a non-empty state sentence', () => {
    for (const role of ROLES) {
      for (const status of STATUSES) {
        expect(obligationView(role, status).state.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('obligationTimeline', () => {
  it('shows nothing before anything has happened', () => {
    expect(obligationTimeline(null, null)).toEqual([])
  })

  it('shows the delivery time once it exists', () => {
    const t = obligationTimeline('2026-01-01T00:00:00Z', null)
    expect(t).toHaveLength(1)
    expect(t[0]).toEqual({ key: 'delivered', label: 'Marked delivered', at: '2026-01-01T00:00:00Z' })
  })

  it('shows the answer time too, in the order the two happened', () => {
    // The answer time was fetched and mapped but never rendered. It is the fact most likely to
    // matter if the two providers later disagree, so it must reach the card.
    const t = obligationTimeline('2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z')
    expect(t.map((x) => x.key)).toEqual(['delivered', 'answered'])
    expect(t[1].at).toBe('2026-01-03T00:00:00Z')
  })

  it('returns raw values so the caller uses one formatter for the whole card', () => {
    for (const entry of obligationTimeline('2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z')) {
      expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})

describe('confirmation copy', () => {
  it('warns that each action cannot be undone', () => {
    expect(MARK_DELIVERED_COPY.body).toContain('cannot be undone')
    expect(CONFIRM_RECEIVED_COPY.body).toContain('cannot be changed')
    expect(NOT_RECEIVED_COPY.body).toContain('cannot be changed')
  })

  it('does not claim the other provider is told anything', () => {
    // Nothing in the app notifies the counterparty — no push, no email, no message written
    // into their conversation. Copy that says otherwise is the deliverer's reason to stop
    // following up.
    const all = [MARK_DELIVERED_COPY, CONFIRM_RECEIVED_COPY, NOT_RECEIVED_COPY]
    for (const c of all) {
      const text = `${c.title} ${c.body}`.toLowerCase()
      expect(text).not.toContain('tells the other')
      expect(text).not.toContain('notif')
      expect(text).not.toContain('will be told')
    }
  })

  it('sources each button label from the dialog it opens', () => {
    // Spelled twice they can diverge, and then a button says one thing while the confirmation
    // it opens says another — on an action that cannot be undone.
    expect(RESPOND_LABELS.received).toBe(CONFIRM_RECEIVED_COPY.confirmLabel)
    expect(RESPOND_LABELS.notReceived).toBe(NOT_RECEIVED_COPY.confirmLabel)
  })

  it('does not promise that "didn’t receive" ends or cancels anything', () => {
    expect(NOT_RECEIVED_COPY.body).toContain('does not end or cancel the trade')
    expect(NOT_RECEIVED_COPY.body.toLowerCase()).not.toContain('review')
    expect(NOT_RECEIVED_COPY.body.toLowerCase()).not.toContain('dispute')
  })

  it('labels the only two receiver answers that exist', () => {
    expect(RESPOND_LABELS.received).toBe('Confirm received')
    expect(RESPOND_LABELS.notReceived).toBe("Didn't receive")
  })
})

describe('delivery write failures', () => {
  const err = (code: string) => ({ code })

  it('tells the receiver that only the deliverer may mark delivered', () => {
    const f = barterWriteFailure('markDelivered', err('42501'))
    expect(f.terminal).toBe(true)
    expect(f.body).toContain('Only the provider who agreed to provide this')
  })

  it('tells the deliverer that only the receiver may answer', () => {
    for (const op of ['confirmReceived', 'reportNotReceived'] as const) {
      const f = barterWriteFailure(op, err('42501'))
      expect(f.terminal).toBe(true)
      expect(f.body).toContain('Only the provider receiving this')
    }
  })

  it('treats answering before delivery as recoverable but stale', () => {
    for (const op of ['confirmReceived', 'reportNotReceived'] as const) {
      const f = barterWriteFailure(op, err('55000'))
      expect(f.terminal).toBe(false)
      expect(f.stale).toBe(true)
      expect(f.title).toBe('Not delivered yet')
    }
  })

  it('says a recorded answer stands rather than reporting a permission problem', () => {
    for (const op of ['confirmReceived', 'reportNotReceived'] as const) {
      const f = barterWriteFailure(op, err('PT412'))
      expect(f.terminal).toBe(true)
      // `stale` as well: the screen offered a control the server will never accept again, so
      // it must re-read rather than leave both answers on screen.
      expect(f.stale).toBe(true)
      expect(f.title).toBe('You already answered this')
      expect(f.body).toContain('cannot be changed')
    }
  })

  it('falls back to a retryable message for an unmapped failure', () => {
    for (const op of ['markDelivered', 'confirmReceived', 'reportNotReceived'] as const) {
      const f = barterWriteFailure(op, err('08006'))
      expect(f.terminal).toBe(false)
      expect(f.body).toBe('Please try again.')
    }
  })

  it('never describes a delivery refusal in terms that do not exist yet', () => {
    for (const op of ['markDelivered', 'confirmReceived', 'reportNotReceived'] as const) {
      for (const code of ['42501', '55000', 'PT412', '23514', '08006']) {
        const f = barterWriteFailure(op, err(code))
        const text = `${f.title} ${f.body}`.toLowerCase()
        for (const word of ['dispute', 'under review', 'unfulfilled', 'cancelled', 'adjudic']) {
          expect(text).not.toContain(word)
        }
      }
    }
  })
})
