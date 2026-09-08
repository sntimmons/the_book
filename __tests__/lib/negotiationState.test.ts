import {
  acceptedAnEarlierVersion,
  CONFIRM_TRADE_COPY,
  draftPayload,
  MAX_DESCRIPTION,
  negotiationView,
  shouldShowTermsChangedNote,
  NegotiationFacts,
  NegotiationState,
  ProposalDraft,
  sideForRole,
  sideLabel,
  TERMS_CHANGED_NOTE,
  TERMS_EXPIRED_NOTE,
  termsTimingStillValid,
  validateDraft,
} from '@/lib/negotiationState'
import {
  agreementResolution,
  ObligationStatus,
  TerminalOutcome,
} from '@/lib/obligationState'

// Negotiation copy and capability rules. These live in a pure module and are tested here for
// the same reason the Trade Activity rules are: every defect that surface shipped was a copy
// defect, and copy embedded in a component cannot be tested without rendering one.

const STATUSES: NegotiationFacts['interestStatus'][] = [
  'pending',
  'accepted',
  'declined',
  'released',
]

function facts(over: Partial<NegotiationFacts> = {}): NegotiationFacts {
  return {
    interestStatus: 'accepted',
    iAcceptedCurrent: false,
    theyAcceptedCurrent: false,
    bothAccepted: false,
    everBothAccepted: false,
    agreementId: null,
    tradeCancelled: false,
    // Nothing resolved unless a case says otherwise — the same fail-closed default the field
    // documents, so every pre-existing assertion keeps testing the behaviour it was written for.
    resolution: 'none',
    ...over,
  }
}

const futureIso = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
const pastIso = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()
const BOTH_SIDES: ProposalDraft = {
  ownerGives: 'a photo session',
  ownerDueAt: futureIso(7),
  ownerScheduledAt: '',
  responderGives: 'four PT sessions',
  responderDueAt: futureIso(8),
  responderScheduledAt: '',
}

describe('totality', () => {
  it('resolves a view for every status and acceptance combination', () => {
    const seen = new Set<NegotiationState>()
    for (const interestStatus of STATUSES) {
      for (const iAcceptedCurrent of [true, false]) {
        for (const theyAcceptedCurrent of [true, false]) {
          for (const bothAccepted of [true, false]) {
            const v = negotiationView(
              facts({ interestStatus, iAcceptedCurrent, theyAcceptedCurrent, bothAccepted }),
            )
            expect(v.headline.length).toBeGreaterThan(0)
            expect(v.detail.length).toBeGreaterThan(0)
            seen.add(v.state)
          }
        }
      }
    }
    // Every state is reachable, so the assertions below are not vacuous.
    seen.add(negotiationView(facts({ agreementId: 'ag' })).state)
    expect(seen.size).toBe(6)
  })
})

describe('the terms card is named for the state it is in', () => {
  // The title used to be a ternary in the negotiation screen's JSX, total over 'ended' and
  // 'confirmed' only. Every other state — including 'cancelled' — fell through to the
  // pre-agreement label, so a cancelled trade read "On the table now" directly above its own
  // "Cancelled" stamp. Asserted here, exhaustively, because a title chosen in JSX cannot be.
  const ALL_STATES: { state: NegotiationState; f: NegotiationFacts }[] = [
    { state: 'ended', f: facts({ interestStatus: 'released' }) },
    { state: 'cancelled', f: facts({ agreementId: 'ag', tradeCancelled: true }) },
    { state: 'confirmed', f: facts({ agreementId: 'ag' }) },
    { state: 'agreed', f: facts({ bothAccepted: true }) },
    { state: 'awaitingThem', f: facts({ iAcceptedCurrent: true }) },
    { state: 'awaitingYou', f: facts({ theyAcceptedCurrent: true }) },
    { state: 'awaitingBoth', f: facts() },
  ]

  it('covers every state exactly once, so nothing below is vacuous', () => {
    const seen = ALL_STATES.map(({ state, f }) => {
      expect(negotiationView(f).state).toBe(state)
      return state
    })
    expect(new Set(seen).size).toBe(ALL_STATES.length)
  })

  it('always says something', () => {
    for (const { f } of ALL_STATES) {
      expect(negotiationView(f).termsTitle.length).toBeGreaterThan(0)
    }
  })

  it('never calls a dead trade live', () => {
    for (const state of ['ended', 'cancelled', 'confirmed'] as NegotiationState[]) {
      const { f } = ALL_STATES.find((e) => e.state === state)!
      expect(negotiationView(f).termsTitle).not.toBe('On the table now')
    }
  })

  it('does not describe a cancelled trade as still on the table, or as confirmed', () => {
    const title = negotiationView(facts({ agreementId: 'ag', tradeCancelled: true })).termsTitle
    expect(title).not.toContain('on the table')
    expect(title.toLowerCase()).not.toContain('now')
    // And it does not invent an outcome the product has not decided.
    for (const banned of ['fulfilled', 'unfulfilled', 'complete', 'dispute', 'resolved']) {
      expect(title.toLowerCase()).not.toContain(banned)
    }
  })
})

describe('a dead negotiation offers nothing', () => {
  it('withholds both controls whenever the interest is not accepted', () => {
    for (const interestStatus of STATUSES.filter((s) => s !== 'accepted')) {
      for (const bothAccepted of [true, false]) {
        const v = negotiationView(facts({ interestStatus, bothAccepted }))
        expect(v.state).toBe('ended')
        expect(v.canPropose).toBe(false)
        expect(v.canAccept).toBe(false)
      }
    }
  })

  it('says the terms are kept as history', () => {
    const v = negotiationView(facts({ interestStatus: 'released' }))
    expect(v.detail).toMatch(/history/i)
  })

  it('does not deny an agreement that actually happened', () => {
    // The record most likely to matter in a disagreement is the one this would get wrong: a
    // negotiation where both accepted and one party then ended it.
    const v = negotiationView(facts({ interestStatus: 'released', everBothAccepted: true }))
    expect(v.detail).not.toMatch(/no terms were agreed/i)
    expect(v.detail).toMatch(/both accepted/i)
  })

  it('and still says nothing was agreed when nothing was', () => {
    const v = negotiationView(facts({ interestStatus: 'released', everBothAccepted: false }))
    expect(v.detail).toMatch(/no terms were agreed/i)
  })
})

describe('accepting is once, and only what is on the table', () => {
  it('does not offer accept to someone who already accepted', () => {
    expect(negotiationView(facts({ iAcceptedCurrent: true })).canAccept).toBe(false)
  })

  it('offers accept while the other side is waiting on you', () => {
    const v = negotiationView(facts({ theyAcceptedCurrent: true }))
    expect(v.state).toBe('awaitingYou')
    expect(v.canAccept).toBe(true)
  })

  it('does not offer accept for expired current timing', () => {
    const v = negotiationView(facts({ theyAcceptedCurrent: true, currentTermsStillValid: false }))
    expect(v.state).toBe('awaitingYou')
    expect(v.canAccept).toBe(false)
    expect(v.canPropose).toBe(true)
    expect(v.timingExpired).toBe(true)
    expect(v.detail).toMatch(/updated timing/i)
  })

  it('lets either party send new terms right up until the negotiation ends', () => {
    for (const bothAccepted of [true, false]) {
      expect(negotiationView(facts({ bothAccepted })).canPropose).toBe(true)
    }
  })
})

describe('ready to confirm is not confirmed', () => {
  // Both accepting the same current terms makes the trade READY; only finalization makes it
  // official. The two states must never be described the same way.
  const ready = negotiationView(facts({ bothAccepted: true, iAcceptedCurrent: true, theyAcceptedCurrent: true }))
  const confirmed = negotiationView(
    facts({ bothAccepted: true, iAcceptedCurrent: true, theyAcceptedCurrent: true, agreementId: 'ag' }),
  )

  it('offers confirm only when both accepted and nothing is official yet', () => {
    expect(ready.state).toBe('agreed')
    expect(ready.canConfirm).toBe(true)
    expect(ready.headline).toMatch(/ready to confirm/i)
    for (const f of [
      facts({ iAcceptedCurrent: true }),
      facts({ theyAcceptedCurrent: true }),
      facts({ interestStatus: 'released', bothAccepted: true }),
    ]) {
      expect(negotiationView(f).canConfirm).toBe(false)
    }
  })

  it('does not offer confirm for expired current timing after both accepted', () => {
    const v = negotiationView(
      facts({
        bothAccepted: true,
        iAcceptedCurrent: true,
        theyAcceptedCurrent: true,
        currentTermsStillValid: false,
      }),
    )
    expect(v.state).toBe('agreed')
    expect(v.canConfirm).toBe(false)
    expect(v.canPropose).toBe(true)
    expect(v.timingExpired).toBe(true)
    expect(v.detail).toMatch(/updated timing/i)
  })

  it('freezes everything once confirmed', () => {
    expect(confirmed.state).toBe('confirmed')
    expect(confirmed.headline).toMatch(/trade confirmed/i)
    expect(confirmed.canPropose).toBe(false)
    expect(confirmed.canAccept).toBe(false)
    expect(confirmed.canConfirm).toBe(false)
  })

  it('uses beta-safe language in both states', () => {
    for (const v of [ready, confirmed]) {
      const text = `${v.headline} ${v.detail}`.toLowerCase()
      for (const word of ['booked', 'complete', 'fulfilled', 'delivered', 'guaranteed']) {
        expect(text).not.toContain(word)
      }
    }
  })

  it('the confirm dialog discloses the current post-agreement limit', () => {
    const text = `${CONFIRM_TRADE_COPY.title} ${CONFIRM_TRADE_COPY.body}`.toLowerCase()
    expect(text).toMatch(/official/i)
    expect(text).toMatch(/can no longer be changed/i)
    // It must state the exit that EXISTS and where it stops. This assertion previously pinned
    // the sentence "does not yet include an in-app way to cancel or end", which pre-delivery
    // cancellation made false — so the test was not merely failing to catch a stale claim, it
    // was enforcing one, and CI stayed green on it.
    expect(text).toMatch(/can still cancel the trade/i)
    expect(text).toMatch(/marks something delivered/i)
    expect(text).not.toMatch(/does not yet include an in-app way to cancel or end/i)
    for (const word of ['booked', 'complete', 'fulfilled', 'guaranteed']) {
      expect(text).not.toContain(word)
    }
  })

  it('never reports a cancelled trade as confirmed', () => {
    // The defect this state exists to prevent: the list surfaces were taught that a cancelled
    // trade is not a confirmed one, and the trade's own screen was not.
    const v = negotiationView(facts({ agreementId: 'ag', tradeCancelled: true }))
    expect(v.state).toBe('cancelled')
    expect(v.headline).toBe('Trade cancelled')
    expect(v.headline).not.toContain('confirmed')
    // The per-viewer sentence belongs to lib/tradeCancellation.ts, so this module says nothing.
    expect(v.detail).toBe('')
    // And nothing is actionable on it.
    expect(v.canPropose).toBe(false)
    expect(v.canAccept).toBe(false)
    expect(v.canConfirm).toBe(false)
  })

  it('still reports an uncancelled confirmed trade as confirmed', () => {
    const v = negotiationView(facts({ agreementId: 'ag', tradeCancelled: false }))
    expect(v.state).toBe('confirmed')
    expect(v.headline).toBe('Trade confirmed')
  })

  it('does not call an unconfirmed negotiation cancelled', () => {
    // Cancellation is an AGREEMENT-level act; there is nothing to cancel before one exists.
    const v = negotiationView(facts({ agreementId: null, tradeCancelled: true }))
    expect(v.state).not.toBe('cancelled')
  })
})

describe('agreement copy promises nothing the app cannot do', () => {
  // The agreement and its obligations exist; no fulfilment or completion model does. Copy that called a trade booked, owed
  // or complete would be a promise with no schema behind it.
  const v = negotiationView(facts({ bothAccepted: true, iAcceptedCurrent: true, theyAcceptedCurrent: true }))

  it('reports that both accepted, and names the next step', () => {
    expect(v.state).toBe('agreed')
    expect(v.detail).toMatch(/both accepted/i)
    expect(v.headline).toMatch(/ready to confirm/i)
  })

  it('does not claim the trade is booked, owed, complete or already official', () => {
    // "Confirm" may appear as the ACTION on offer; "confirmed" as a state may not, and neither
    // may anything implying fulfilment.
    const text = `${v.headline} ${v.detail}`.toLowerCase()
    for (const word of ['booked', 'owed', 'confirmed', 'complete', 'guaranteed', 'is official']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('copy is negotiation language, not database language', () => {
  it('never leaks implementation vocabulary', () => {
    const all = STATUSES.flatMap((interestStatus) =>
      [true, false].flatMap((b) => {
        const v = negotiationView(facts({ interestStatus, bothAccepted: b }))
        return [v.headline, v.detail]
      }),
    ).concat(TERMS_CHANGED_NOTE, TERMS_EXPIRED_NOTE)
    for (const line of all) {
      const l = line.toLowerCase()
      for (const word of ['version', 'row', 'rpc', 'superseded', 'record id', 'null']) {
        expect(l).not.toContain(word)
      }
    }
  })

  it('explains a lost acceptance in terms of what the other person did', () => {
    expect(TERMS_CHANGED_NOTE).toMatch(/terms changed/i)
    expect(TERMS_CHANGED_NOTE).toMatch(/accept again/i)
  })
})

describe('current term timing display guard', () => {
  it('treats future due and scheduled timing as still valid', () => {
    expect(
      termsTimingStillValid([
        { dueAt: futureIso(7), scheduledAt: null },
        { dueAt: futureIso(8), scheduledAt: futureIso(3) },
      ]),
    ).toBe(true)
  })

  it('treats expired due or scheduled timing as stale', () => {
    expect(termsTimingStillValid([{ dueAt: pastIso(), scheduledAt: null }])).toBe(false)
    expect(
      termsTimingStillValid([{ dueAt: futureIso(8), scheduledAt: pastIso() }]),
    ).toBe(false)
  })

  it('treats malformed timing as stale', () => {
    expect(termsTimingStillValid([{ dueAt: 'not a date', scheduledAt: null }])).toBe(false)
    expect(
      termsTimingStillValid([{ dueAt: futureIso(8), scheduledAt: 'not a date' }]),
    ).toBe(false)
  })
})

describe('validateDraft mirrors the server rules', () => {
  // Exactly two directed terms, content only. There is no side, provider or value field for
  // the client to get wrong — the server binds each side to its participant.
  it('accepts a draft with both sides filled', () => {
    expect(validateDraft(BOTH_SIDES)).toBeNull()
  })

  it('names the missing side', () => {
    expect(validateDraft({ ...BOTH_SIDES, ownerGives: 'x', responderGives: '' })).toMatch(
      /responding provider/i,
    )
    expect(validateDraft({ ...BOTH_SIDES, ownerGives: '', responderGives: 'y' })).toMatch(
      /provider who posted/i,
    )
  })

  it('asks for both when both are blank', () => {
    expect(validateDraft({ ...BOTH_SIDES, ownerGives: '  ', responderGives: '' })).toMatch(
      /each of you/i,
    )
  })

  it('refuses an over-long side', () => {
    expect(validateDraft({ ...BOTH_SIDES, ownerGives: 'x'.repeat(MAX_DESCRIPTION + 1) })).toMatch(
      /200/,
    )
  })

  it('requires a due date for each side', () => {
    expect(validateDraft({ ...BOTH_SIDES, ownerDueAt: '' })).toMatch(/due date/i)
    expect(validateDraft({ ...BOTH_SIDES, responderDueAt: '' })).toMatch(/due date/i)
  })

  it('refuses past due dates', () => {
    expect(validateDraft({ ...BOTH_SIDES, ownerDueAt: pastIso() })).toMatch(/future/i)
  })

  it('allows scheduled times to be omitted', () => {
    expect(validateDraft({ ...BOTH_SIDES, ownerScheduledAt: '', responderScheduledAt: '' })).toBeNull()
  })

  it('refuses past scheduled times', () => {
    expect(validateDraft({ ...BOTH_SIDES, ownerScheduledAt: pastIso() })).toMatch(/future/i)
  })

  it('refuses scheduled times after the due date', () => {
    expect(
      validateDraft({
        ...BOTH_SIDES,
        ownerDueAt: futureIso(3),
        ownerScheduledAt: futureIso(4),
      }),
    ).toMatch(/on or before/i)
  })

  it('sends content and timing only, trimmed, under the names the server expects', () => {
    const p = draftPayload({
      ...BOTH_SIDES,
      ownerGives: '  a photo session  ',
      ownerDueAt: '2026-10-15T22:00:00.000Z',
      ownerScheduledAt: '2026-10-10T19:00:00.000Z',
      responderGives: ' four PT ',
      responderDueAt: '2026-10-16T22:00:00.000Z',
    })
    expect(p).toEqual({
      p_owner_gives: 'a photo session',
      p_owner_due_at: '2026-10-15T22:00:00.000Z',
      p_owner_scheduled_at: '2026-10-10T19:00:00.000Z',
      p_responder_gives: 'four PT',
      p_responder_due_at: '2026-10-16T22:00:00.000Z',
      p_responder_scheduled_at: null,
    })
    // No side, provider id, participant id, value or version number crosses the boundary.
    expect(Object.keys(p).sort()).toEqual([
      'p_owner_due_at',
      'p_owner_gives',
      'p_owner_scheduled_at',
      'p_responder_due_at',
      'p_responder_gives',
      'p_responder_scheduled_at',
    ])
  })
})

describe('sideLabel speaks from the viewer', () => {
  it('names the viewer as the giver on their own side', () => {
    expect(sideLabel('offer_owner', 'owner')).toMatch(/you/i)
    expect(sideLabel('responder', 'owner')).toMatch(/they/i)
    expect(sideLabel('responder', 'responder')).toMatch(/you/i)
    expect(sideLabel('offer_owner', 'responder')).toMatch(/they/i)
  })

  it('maps a role to its fixed side', () => {
    expect(sideForRole('owner')).toBe('offer_owner')
    expect(sideForRole('responder')).toBe('responder')
  })
})

describe('the lapsed-acceptance note addresses the right person', () => {
  // Wrong in both directions before: it fired for anyone whenever ANY earlier version had ANY
  // acceptance, and was suppressed exactly when the other provider had accepted the new terms
  // — which is the person whose acceptance actually lapsed.
  const base = { interestStatus: 'accepted' as const }

  it('is shown to someone whose earlier acceptance no longer counts', () => {
    expect(
      shouldShowTermsChangedNote({
        ...base,
        iAcceptedAnEarlierVersion: true,
        iAcceptedCurrent: false,
      }),
    ).toBe(true)
  })

  it('does not depend on what the counterparty accepted', () => {
    // The false negative was caused by keying on the counterparty's acceptance, which
    // suppressed the note for the one person whose acceptance had actually lapsed. The rule
    // takes no such input now, and this asserts that structurally: the visible signature has
    // three fields and none of them is theirs.
    expect(Object.keys({ ...base, iAcceptedAnEarlierVersion: true, iAcceptedCurrent: false }))
      .toEqual(['interestStatus', 'iAcceptedAnEarlierVersion', 'iAcceptedCurrent'])
  })

  it('is NOT shown to someone who never accepted anything', () => {
    expect(
      shouldShowTermsChangedNote({
        ...base,
        iAcceptedAnEarlierVersion: false,
        iAcceptedCurrent: false,
      }),
    ).toBe(false)
  })

  it('is NOT shown once they have accepted the current terms', () => {
    expect(
      shouldShowTermsChangedNote({
        ...base,
        iAcceptedAnEarlierVersion: true,
        iAcceptedCurrent: true,
      }),
    ).toBe(false)
  })

  it('is never shown on a dead negotiation', () => {
    for (const interestStatus of ['released', 'declined', 'pending'] as const) {
      expect(
        shouldShowTermsChangedNote({
          interestStatus,
          iAcceptedAnEarlierVersion: true,
          iAcceptedCurrent: false,
        }),
      ).toBe(false)
    }
  })
})

describe('the agreed state does not overstate what has happened', () => {
  const v = negotiationView(
    facts({ bothAccepted: true, iAcceptedCurrent: true, theyAcceptedCurrent: true }),
  )

  it('says either side can still change or end it', () => {
    // Without this a provider reads "nothing left to confirm" and starts work, while the
    // counterparty can still supersede or end the negotiation the same day.
    expect(v.detail).toMatch(/still send different terms|end this/i)
    expect(v.detail).toMatch(/withdraws/i)
  })
})

describe('acceptedAnEarlierVersion', () => {
  // The derivation the whole lapsed-acceptance rule rests on. It lived inline in the screen,
  // where nothing could assert it.
  const me = 'me'
  const them = 'them'

  it('is true when I accepted a version that is no longer current', () => {
    expect(
      acceptedAnEarlierVersion(
        [{ id: 'v1', acceptedBy: [me] }, { id: 'v2', acceptedBy: [] }],
        'v2',
        me,
      ),
    ).toBe(true)
  })

  it('ignores my acceptance of the CURRENT version', () => {
    expect(acceptedAnEarlierVersion([{ id: 'v1', acceptedBy: [me] }], 'v1', me)).toBe(false)
  })

  it('ignores the counterparty accepting an earlier version', () => {
    expect(
      acceptedAnEarlierVersion(
        [{ id: 'v1', acceptedBy: [them] }, { id: 'v2', acceptedBy: [] }],
        'v2',
        me,
      ),
    ).toBe(false)
  })

  it('is false when the viewer is unknown, rather than guessing', () => {
    expect(acceptedAnEarlierVersion([{ id: 'v1', acceptedBy: [me] }], 'v2', null)).toBe(false)
  })
})

describe('term copy describes two sides, not a list', () => {
  // The 2-6-term list model was removed by ruling. Copy that still said "item" or "at least
  // one" would invite exactly the input the server now refuses.
  const drafts: ProposalDraft[] = [
    { ...BOTH_SIDES, ownerGives: '', responderGives: '' },
    { ...BOTH_SIDES, ownerGives: 'x', responderGives: '' },
    { ...BOTH_SIDES, ownerGives: '', responderGives: 'y' },
    { ...BOTH_SIDES, ownerGives: 'x'.repeat(MAX_DESCRIPTION + 1), responderGives: 'y' },
  ]
  it('never uses list-model words', () => {
    for (const d of drafts) {
      const msg = validateDraft(d) ?? ''
      expect(msg).not.toMatch(/\b(item|items|list|at least one)\b/i)
    }
  })
})

// ── THE DERIVED AGREEMENT PRESENTATION (PD-070) ───────────────────────────
//
// The agreement has NO stored terminal outcome and never gains one. What the banner says about a
// confirmed trade is derived from how far its two obligations are SETTLED, and these tests pin
// the four things that derivation must never do: instruct when nothing remains, promise
// outstanding work that is not there, invent a trade-level verdict, or turn a *closed without
// resolution* into a finding of fault.
describe('agreementResolution', () => {
  const F = 'fulfilled' as const
  const U = 'unfulfilled' as const
  const C = 'closed_without_resolution' as const

  /** An obligation with no operator involvement, at some point in its ordinary lifecycle. */
  const at = (status: ObligationStatus) => ({ status, terminalOutcome: null })
  /** An obligation an operator resolved. Status is whatever it was when they did. */
  const judged = (o: TerminalOutcome, status: ObligationStatus = 'delivered') =>
    ({ status, terminalOutcome: o })

  it('reports nothing settled while both sides are still in flight', () => {
    for (const st of ['pending', 'delivered', 'not_received'] as const) {
      expect(agreementResolution([at(st), at(st)])).toBe('none')
    }
  })

  // `not_received` is NOT settled: it is the receiver saying something went wrong, which routes
  // to Under Review and waits for a human. Treating it as an ending would close a trade that has
  // an open complaint on it.
  it('does not treat a "did not receive" answer as settled', () => {
    expect(agreementResolution([at('received'), at('not_received')])).toBe('partial')
  })

  // THE ORDINARY HAPPY PATH, and the case an outcome-only derivation could not see at all.
  it('reports BOTH SETTLED when both receivers confirmed, with no operator involved', () => {
    expect(agreementResolution([at('received'), at('received')])).toBe('allSettled')
  })

  it('reports partial only when the other side genuinely still owes something', () => {
    for (const st of ['pending', 'delivered', 'not_received'] as const) {
      expect(agreementResolution([judged(F), at(st)])).toBe('partial')
      expect(agreementResolution([at(st), judged(C)])).toBe('partial')
    }
  })

  // THE MIRROR DEFECT. One side adjudicated, the other already confirmed received — nothing is
  // outstanding, so this must NOT be `partial`, which promises outstanding work on the card below.
  it('does NOT report partial when the unadjudicated side is already confirmed received', () => {
    expect(agreementResolution([judged(F), at('received')])).toBe('allSettled')
    expect(agreementResolution([at('received'), judged(F)])).toBe('allSettled')
    expect(agreementResolution([judged(U), at('received')])).toBe('allSettledMixed')
    expect(agreementResolution([at('received'), judged(C)])).toBe('allSettledMixed')
  })

  it('lets an adjudication OUTRANK the participants own record', () => {
    // A receiver confirmed it, and an operator then found it unfulfilled. That is not a good
    // ending, whatever the status column says.
    expect(agreementResolution([judged(U, 'received'), at('received')])).toBe('allSettledMixed')
    expect(agreementResolution([judged(F, 'not_received'), at('received')])).toBe('allSettled')
  })

  it('reports allSettled when both were found fulfilled', () => {
    expect(agreementResolution([judged(F), judged(F)])).toBe('allSettled')
  })

  // THE COMBINATIONS THE FOUNDER RULING NAMES. Each must land on `allSettledMixed`, which asserts
  // only that both sides are settled — never a verdict, never a fault.
  it.each([
    [F, U],
    [U, F],
    [U, U],
    [F, C],
    [C, F],
    [U, C],
    [C, U],
    [C, C],
  ])('reports allSettledMixed for %s + %s, claiming nothing about what was found', (a, b) => {
    expect(agreementResolution([judged(a), judged(b)])).toBe('allSettledMixed')
  })

  it('FAILS CLOSED on a list that is not two obligations', () => {
    // A trade has exactly two by database construction, so any other length means the read did
    // not land. Reporting 'none' keeps the screen from announcing a settlement it cannot see.
    expect(agreementResolution([])).toBe('none')
    expect(agreementResolution([judged(F)])).toBe('none')
    expect(agreementResolution([judged(F), judged(F), judged(F)])).toBe('none')
  })

  it('treats a MISSING outcome field as no outcome, not as a settlement', () => {
    expect(agreementResolution([{ status: 'delivered' }, { status: 'delivered' }])).toBe('none')
  })

  it('does not report an UNRECOGNISED outcome as a good ending', () => {
    // Same server-column boundary the outcome label and note defend: a widened CHECK constraint
    // reaches installed clients before the matching build does. An unknown value is settled —
    // an operator decided something — but must never be summarised as nothing-adverse.
    const unknown = 'partially_fulfilled' as unknown as TerminalOutcome
    expect(agreementResolution([judged(F), judged(unknown)])).toBe('allSettledMixed')
    expect(agreementResolution([judged(unknown), judged(unknown)])).toBe('allSettledMixed')
  })
})

describe('the confirmed-trade banner follows what is settled, not the clock', () => {
  const confirmed = (resolution: NegotiationFacts['resolution']) =>
    negotiationView(facts({ agreementId: 'a1', resolution }))
  const ALL = ['none', 'partial', 'allSettled', 'allSettledMixed'] as const

  it('still tells providers to arrange the details while nothing is settled', () => {
    expect(confirmed('none').detail).toContain('Arrange the details')
  })

  // THE DEFECT THIS FIXES, in both directions.
  it.each(['allSettled', 'allSettledMixed'] as const)(
    'never instructs anyone to arrange anything once both sides are settled (%s)',
    (r) => {
      expect(confirmed(r).detail.toLowerCase()).not.toContain('arrange')
    },
  )

  it('claims something is outstanding ONLY in partial', () => {
    expect(confirmed('partial').detail.toLowerCase()).toContain('outstanding')
    for (const r of ['none', 'allSettled', 'allSettledMixed'] as const) {
      expect(confirmed(r).detail.toLowerCase()).not.toContain('outstanding')
    }
  })

  it('says nothing further is needed ONLY when nothing adverse was found', () => {
    expect(confirmed('allSettled').detail.toLowerCase()).toContain('nothing further is needed')
    for (const r of ['none', 'partial', 'allSettledMixed'] as const) {
      expect(confirmed(r).detail.toLowerCase()).not.toContain('nothing further is needed')
    }
  })

  // NEVER SAYS "REVIEWED". `allSettled` covers the ordinary path where nobody reviewed anything,
  // so claiming a review would be false on the commonest successful trade in the product.
  it.each(ALL)('never claims a review happened in %s', (r) => {
    expect(confirmed(r).detail.toLowerCase()).not.toContain('review')
  })

  // NO TRADE-LEVEL VERDICT, in any state. These words do not exist in the product (PD-065,
  // PD-070) and the banner is the most likely place to invent one.
  it.each(ALL)('invents no agreement-level verdict in %s', (r) => {
    const d = confirmed(r).detail.toLowerCase()
    for (const word of ['completed', 'partially fulfilled', 'not completed', 'incomplete']) {
      expect(d).not.toContain(word)
    }
  })

  // A *closed without resolution* pair reaches `allSettledMixed`. That sentence must not read as
  // a finding about anybody, or the honest third answer becomes a soft accusation.
  it('never assigns fault or names an outcome for a mixed or closed pair', () => {
    const d = confirmed('allSettledMixed').detail.toLowerCase()
    for (const w of ['unfulfilled', 'fault', 'failed', 'did not', 'blame', 'closed without']) {
      expect(d).not.toContain(w)
    }
  })

  // The state itself is unchanged: an agreement stays "Trade confirmed" for its whole life,
  // because renaming it would BE the agreement-level verdict PD-070 refuses to create.
  it.each(ALL)('keeps the agreement state and headline stable in %s', (r) => {
    expect(confirmed(r).state).toBe('confirmed')
    expect(confirmed(r).headline).toBe('Trade confirmed')
  })

  it('lets CANCELLATION outrank every settlement state', () => {
    for (const r of ALL) {
      const v = negotiationView(facts({ agreementId: 'a1', tradeCancelled: true, resolution: r }))
      expect(v.state).toBe('cancelled')
      expect(v.detail).not.toContain('Arrange the details')
      expect(v.detail.toLowerCase()).not.toContain('nothing further is needed')
    }
  })

  it('uses no state-machine vocabulary a provider should never read', () => {
    for (const r of ALL) {
      const d = confirmed(r).detail.toLowerCase()
      for (const jargon of [
        'proposal version', 'terminal', 'adjudicat', 'suppress', 'immutable', 'derived',
        'read model', 'obligation',
      ]) {
        expect(d).not.toContain(jargon)
      }
    }
  })
})
