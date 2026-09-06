import {
  AGREE_TO_CANCEL_COPY,
  CANCEL_REASON_NOTE,
  CANCEL_TRADE_COPY,
  cancellationReasons,
  CancellationFacts,
  CancellationState,
  cancellationState,
  cancellationView,
  cancelReasonPayload,
  isCancelled,
  MAX_CANCEL_REASON,
  validateCancelReason,
} from '@/lib/tradeCancellation'
import { obligationView } from '@/lib/obligationState'
import {
  SECTION_COPY,
  tradeActivitySection,
  tradeRowState,
  responderFeedState,
} from '@/lib/tradeActivity'
import { barterWriteFailure } from '@/lib/barterErrors'

// Pre-delivery cancellation rules and copy. Pure, and tested here for the same reason the rest
// of the barter rules are: this is an irreversible act whose copy must not overstate what the
// product decided, and copy inside a component cannot be tested without rendering one.

const ALL: CancellationFacts[] = [
  { iCancelled: false, theyCancelled: false, cancelledAt: null },
  { iCancelled: true, theyCancelled: false, cancelledAt: 't' },
  { iCancelled: false, theyCancelled: true, cancelledAt: 't' },
  { iCancelled: true, theyCancelled: true, cancelledAt: 't' },
]
const STATES: CancellationState[] = ['none', 'byYou', 'byThem', 'mutual']

describe('cancellationState', () => {
  it('reaches mutual only when BOTH participants have acted', () => {
    expect(cancellationState({ iCancelled: true, theyCancelled: true })).toBe('mutual')
    // Everything short of two acts is not mutual. Silence, one act and no act are all
    // different from agreement, and PD-046 makes mutual a claim about what both parties did.
    expect(cancellationState({ iCancelled: true, theyCancelled: false })).toBe('byYou')
    expect(cancellationState({ iCancelled: false, theyCancelled: true })).toBe('byThem')
    expect(cancellationState({ iCancelled: false, theyCancelled: false })).toBe('none')
  })

  it('treats one act as cancelled', () => {
    expect(isCancelled(ALL[0])).toBe(false)
    for (const f of ALL.slice(1)) expect(isCancelled(f)).toBe(true)
  })

  it('covers every combination of the two acts', () => {
    expect(new Set(ALL.map(cancellationState)).size).toBe(STATES.length)
  })
})

describe('cancellationView capability', () => {
  it('offers Cancel only before any delivery and only when nothing is cancelled', () => {
    for (const f of ALL) {
      expect(cancellationView(f, false).canCancel).toBe(cancellationState(f) === 'none')
    }
  })

  it('withdraws Cancel permanently once anything has been delivered', () => {
    for (const f of ALL) {
      const v = cancellationView(f, true)
      expect(v.canCancel).toBe(false)
      expect(v.canAgree).toBe(false)
    }
  })

  it('offers Agree only to the participant who has not yet acted', () => {
    for (const f of ALL) {
      expect(cancellationView(f, false).canAgree).toBe(cancellationState(f) === 'byThem')
    }
  })

  it('never offers both controls at once', () => {
    for (const f of ALL) {
      for (const delivered of [false, true]) {
        const v = cancellationView(f, delivered)
        expect(v.canCancel && v.canAgree).toBe(false)
      }
    }
  })

  it('says nothing at all when the trade is not cancelled', () => {
    const v = cancellationView(ALL[0], false)
    expect(v.headline).toBe('')
    expect(v.detail).toBe('')
  })
})

describe('cancellation copy is truthful', () => {
  // None of these exist: cancelling ends the trade and decides nothing about performance.
  const FORBIDDEN = [
    'fulfilled',
    'unfulfilled',
    'dispute',
    'disputed',
    'no-show',
    'no show',
    'resolved',
    'under review',
    'needs attention',
    'completed',
    'refund',
    'penalt',
    'reported',
  ]

  it('claims no outcome, verdict or process that does not exist', () => {
    const texts = [
      ...ALL.map((f) => {
        const v = cancellationView(f, false)
        return `${v.headline} ${v.detail}`
      }),
      `${CANCEL_TRADE_COPY.title} ${CANCEL_TRADE_COPY.body}`,
      `${AGREE_TO_CANCEL_COPY.title} ${AGREE_TO_CANCEL_COPY.body}`,
    ]
    for (const text of texts) {
      for (const word of FORBIDDEN) expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('distinguishes who cancelled, and never calls one act mutual', () => {
    expect(cancellationView(ALL[1], false).detail).toContain('You cancelled this trade')
    expect(cancellationView(ALL[2], false).detail).toContain('The other provider cancelled')
    expect(cancellationView(ALL[3], false).detail).toContain('mutually cancelled')
    expect(cancellationView(ALL[1], false).detail.toLowerCase()).not.toContain('mutual')
    expect(cancellationView(ALL[2], false).detail.toLowerCase()).not.toContain('mutual')
  })

  it('tells the counterparty that agreeing is still available', () => {
    expect(cancellationView(ALL[2], false).detail).toContain('record that you agree')
  })

  it('warns both actions cannot be undone, and does not claim anyone is notified', () => {
    for (const c of [CANCEL_TRADE_COPY, AGREE_TO_CANCEL_COPY]) {
      expect(c.body).toContain('cannot be undone')
      expect(c.body.toLowerCase()).not.toContain('notif')
      expect(c.body.toLowerCase()).not.toContain('will be told')
    }
  })

  it('says history is kept rather than implying the trade is erased', () => {
    expect(CANCEL_TRADE_COPY.body).toContain('history are kept')
  })
})

describe('the cancellation timestamp', () => {
  it('names nothing when the trade is not cancelled', () => {
    const v = cancellationView(ALL[0], false)
    expect(v.cancelledAt).toBeNull()
    expect(v.timeLabel).toBeNull()
  })

  it('reports the recorded time for a one-sided cancellation', () => {
    for (const f of [ALL[1], ALL[2]]) {
      const v = cancellationView(f, false)
      expect(v.cancelledAt).toBe('t')
      expect(v.timeLabel).toBe('Cancelled')
    }
  })

  it('says which of the two acts the time refers to when both cancelled', () => {
    // The server stamps `min(created_at)`, so on a mutual cancellation the timestamp is the act
    // that ENDED the trade, not the later assent. "Cancelled <t>" would be ambiguous about
    // whose act it names.
    const v = cancellationView(ALL[3], false)
    expect(v.timeLabel).toBe('First cancelled')
  })
})

describe('reason handling', () => {
  it('accepts an empty reason — it is optional', () => {
    expect(validateCancelReason('')).toBeNull()
    expect(cancelReasonPayload('')).toBeNull()
    expect(cancelReasonPayload('   ')).toBeNull()
  })

  it('trims so what is stored is what the writer saw', () => {
    expect(cancelReasonPayload('  scheduling clash  ')).toBe('scheduling clash')
  })

  it('refuses only an over-long reason, mirroring the server bound', () => {
    expect(validateCancelReason('x'.repeat(MAX_CANCEL_REASON))).toBeNull()
    expect(validateCancelReason('x'.repeat(MAX_CANCEL_REASON + 1))).toContain('200')
  })

  it('imposes no taxonomy — any free text under the bound is acceptable', () => {
    for (const r of ['ill', 'Cannot make the date', '???', 'reason with punctuation, ok']) {
      expect(validateCancelReason(r)).toBeNull()
    }
  })
})

describe('a cancelled trade freezes the obligation controls', () => {
  it('offers neither Mark delivered nor a receiver answer once cancelled', () => {
    for (const role of ['deliverer', 'receiver'] as const) {
      for (const status of ['pending', 'delivered', 'received', 'not_received'] as const) {
        const v = obligationView(role, status, true)
        expect(v.canMarkDelivered).toBe(false)
        expect(v.canRespond).toBe(false)
      }
    }
  })

  it('drops every what-happens-next note once cancelled', () => {
    // Freezing the controls but keeping "Waiting for the other provider to mark this
    // delivered" told a receiver to wait for a delivery the banner above had just said could
    // never arrive.
    for (const role of ['deliverer', 'receiver'] as const) {
      for (const status of ['pending', 'delivered', 'received', 'not_received'] as const) {
        expect(obligationView(role, status, true).note).toBeNull()
      }
    }
  })

  it('keeps the state sentence, which is still true', () => {
    expect(obligationView('deliverer', 'pending', true).state).toContain(
      'not marked this delivered',
    )
  })

  it('leaves the notes alone when the trade is not cancelled', () => {
    expect(obligationView('receiver', 'pending', false).note).toContain('Waiting for')
  })

  it('leaves the controls alone when the trade is not cancelled', () => {
    expect(obligationView('deliverer', 'pending', false).canMarkDelivered).toBe(true)
    expect(obligationView('receiver', 'delivered', false).canRespond).toBe(true)
    // The default must be the uncancelled behaviour, so no existing call site changed meaning.
    expect(obligationView('deliverer', 'pending').canMarkDelivered).toBe(true)
  })
})

describe('Trade Activity no longer calls a cancelled trade confirmed', () => {
  const base = {
    status: 'accepted' as const,
    myRole: 'owner' as const,
    offerIsActive: true,
    releasedAt: null,
    releaseReason: null,
    offerHasAcceptedResponse: true,
    agreementId: 'ag',
    iCancelled: false,
    theyCancelled: false,
  }

  it('still says confirmed while nothing is cancelled', () => {
    expect(tradeRowState(base).note).toContain('Trade confirmed')
  })

  it('says who cancelled, and never offers an action on a cancelled row', () => {
    const mine = tradeRowState({ ...base, iCancelled: true })
    expect(mine.note).toContain('You cancelled this trade')
    expect(mine.note).not.toContain('Trade confirmed')
    expect(mine.action).toBe('none')

    const theirs = tradeRowState({ ...base, theyCancelled: true })
    expect(theirs.note).toContain('The other provider cancelled')
    expect(theirs.note).not.toContain('Trade confirmed')

    const both = tradeRowState({ ...base, iCancelled: true, theyCancelled: true })
    expect(both.note).toContain('cancelled by both of you')
    expect(both.note).not.toContain('Trade confirmed')
  })

  it('carries the same truth into the community feed label', () => {
    const none = { iCancelled: false, theyCancelled: false }
    expect(responderFeedState('accepted', 'ag', none).label).toContain('Trade confirmed')
    expect(
      responderFeedState('accepted', 'ag', { iCancelled: true, theyCancelled: false }).label,
    ).toContain('You cancelled this trade')
    expect(
      responderFeedState('accepted', 'ag', { iCancelled: false, theyCancelled: true }).label,
    ).toContain('The other provider cancelled')
    expect(
      responderFeedState('accepted', 'ag', { iCancelled: true, theyCancelled: true }).label,
    ).toContain('cancelled by both of you')
  })

  it('does not put an affirmative glyph next to a cancelled trade', () => {
    // On a feed card the glyph is read before the sentence, so a check mark beside
    // "Trade cancelled" says the opposite of the label it sits next to.
    expect(responderFeedState('accepted', 'ag', { iCancelled: false, theyCancelled: false }).icon)
      .toBe('check')
    for (const c of [
      { iCancelled: true, theyCancelled: false },
      { iCancelled: false, theyCancelled: true },
      { iCancelled: true, theyCancelled: true },
    ]) {
      expect(responderFeedState('accepted', 'ag', c).icon).toBe('x-circle')
    }
  })
})

describe('cancellation write failures', () => {
  const err = (code: string) => ({ code })

  it('reports an already-delivered trade as permanently uncancellable', () => {
    const f = barterWriteFailure('cancelTrade', err('55000'))
    expect(f.terminal).toBe(true)
    expect(f.stale).toBe(true)
    expect(f.body).toContain('already been delivered')
  })

  it('reports an over-long reason as fixable, not terminal', () => {
    const f = barterWriteFailure('cancelTrade', err('22023'))
    expect(f.terminal).toBe(false)
    expect(f.title).toBe('Check that reason')
  })

  it('tells each obligation action that the trade was cancelled', () => {
    for (const op of ['markDelivered', 'confirmReceived', 'reportNotReceived'] as const) {
      const f = barterWriteFailure(op, err('PT409'))
      expect(f.terminal).toBe(true)
      expect(f.stale).toBe(true)
      expect(f.title).toBe('This trade was cancelled')
    }
  })

  it('falls back to a retryable message for an unmapped cancellation failure', () => {
    const f = barterWriteFailure('cancelTrade', err('08006'))
    expect(f.terminal).toBe(false)
    expect(f.body).toBe('Please try again.')
  })

  it('never describes a cancellation refusal in terms that do not exist', () => {
    for (const code of ['55000', '22023', '23514', 'XX000', '08006']) {
      const f = barterWriteFailure('cancelTrade', err(code))
      const text = `${f.title} ${f.body}`.toLowerCase()
      for (const word of ['dispute', 'under review', 'unfulfilled', 'no-show', 'adjudic']) {
        expect(text).not.toContain(word)
      }
    }
  })
})

// ── Founder rulings on PR #58 ─────────────────────────────────────────────
describe('the cancellation reason is disclosed as shared BEFORE it is written', () => {
  // Ruling 2: the reason is participant-visible context. The composer must say so before the
  // provider commits to an irreversible act — a disclosure read only afterwards is not one.
  it('tells the writer the other provider will see it', () => {
    expect(CANCEL_REASON_NOTE.toLowerCase()).toContain('shared with the other provider')
  })

  it('never promises the opposite', () => {
    // The earlier copy said "The other provider is not shown this", which the agreement-scoped
    // read policy never backed. Pinned so it cannot come back.
    expect(CANCEL_REASON_NOTE.toLowerCase()).not.toContain('not shown')
    expect(CANCEL_REASON_NOTE.toLowerCase()).not.toContain('private')
  })

  it('does not turn the reason into a verdict', () => {
    for (const banned of ['fault', 'blame', 'no-show', 'dispute', 'review', 'penalty']) {
      expect(CANCEL_REASON_NOTE.toLowerCase()).not.toContain(banned)
    }
  })
})

describe('cancellationReasons — both participants see both, attributed to who said it', () => {
  const both = { iCancelled: true, theyCancelled: true }
  const mineOnly = { iCancelled: true, theyCancelled: false }
  const theirsOnly = { iCancelled: false, theyCancelled: true }

  it('shows each participant their own reason', () => {
    const r = cancellationReasons(mineOnly, 'ran out of time', null)
    expect(r).toHaveLength(1)
    expect(r[0].key).toBe('mine')
    expect(r[0].reason).toBe('ran out of time')
  })

  it('shows the counterparty the same reason, attributed to them', () => {
    const r = cancellationReasons(theirsOnly, null, 'ran out of time')
    expect(r).toHaveLength(1)
    expect(r[0].key).toBe('theirs')
    expect(r[0].reason).toBe('ran out of time')
    expect(r[0].label).toBe('The other provider said')
  })

  it('shows both on a mutual cancellation, without swapping them', () => {
    const r = cancellationReasons(both, 'mine', 'theirs')
    expect(r.map((x) => [x.key, x.reason])).toEqual([
      ['mine', 'mine'],
      ['theirs', 'theirs'],
    ])
  })

  it('shows nothing when the reason was omitted — it is optional', () => {
    expect(cancellationReasons(both, null, null)).toEqual([])
    expect(cancellationReasons(both, '   ', '')).toEqual([])
  })

  it('never attributes a reason to someone who did not act', () => {
    // A reason without its act would be a row the server should never produce; rendering it
    // would put a statement in the mouth of a provider who never made one.
    expect(cancellationReasons({ iCancelled: false, theyCancelled: false }, 'x', 'y')).toEqual([])
    expect(cancellationReasons(mineOnly, 'mine', 'leaked')).toEqual([
      { key: 'mine', label: 'You said', reason: 'mine' },
    ])
  })

  it('labels who SAID it, never who was right', () => {
    for (const r of cancellationReasons(both, 'a', 'b')) {
      expect(r.label.toLowerCase()).toContain('said')
      for (const banned of ['fault', 'blame', 'wrong', 'failed', 'no-show']) {
        expect(r.label.toLowerCase()).not.toContain(banned)
      }
    }
  })
})

describe('a cancelled trade is grouped truthfully', () => {
  // Ruling 3: cancelled trades stay visible as durable history, but must not sit under a
  // heading that calls them confirmed. A heading is read before the rows beneath it.
  const facts = (over: Record<string, unknown> = {}) => ({
    status: 'accepted' as const,
    offerIsActive: true,
    releasedAt: null,
    releaseReason: null,
    offerHasAcceptedResponse: true,
    agreementId: 'ag',
    myRole: 'owner' as const,
    iCancelled: false,
    theyCancelled: false,
    ...over,
  })

  it('puts confirmed and cancelled trades in the same durable group', () => {
    expect(tradeActivitySection('accepted', 'ag')).toBe('confirmed')
  })

  it('does not title that group "Confirmed trades"', () => {
    expect(SECTION_COPY.confirmed.title).toBe('Trades')
    expect(SECTION_COPY.confirmed.title).not.toContain('Confirmed')
  })

  it('keeps the caption true of every member, cancelled ones included', () => {
    const caption = SECTION_COPY.confirmed.caption.toLowerCase()
    for (const banned of ['confirmed', 'active', 'live', 'upcoming']) {
      expect(caption).not.toContain(banned)
    }
  })

  it('still shows an uncancelled trade as confirmed on its own row', () => {
    expect(tradeRowState(facts()).note).toContain('Trade confirmed')
  })

  it('and says cancelled on the row when it is', () => {
    expect(tradeRowState(facts({ iCancelled: true })).note).toContain('Trade cancelled')
    expect(tradeRowState(facts({ iCancelled: true, theyCancelled: true })).note)
      .toContain('cancelled by both of you')
  })
})
