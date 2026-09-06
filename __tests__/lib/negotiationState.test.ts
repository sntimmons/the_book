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

  it('the confirm dialog discloses the current post-agreement beta limit', () => {
    const text = `${CONFIRM_TRADE_COPY.title} ${CONFIRM_TRADE_COPY.body}`.toLowerCase()
    expect(text).toMatch(/official/i)
    expect(text).toMatch(/can no longer be changed/i)
    expect(text).toMatch(/does not yet include an in-app way to cancel or end/i)
    for (const word of ['booked', 'complete', 'fulfilled', 'delivered', 'guaranteed']) {
      expect(text).not.toContain(word)
    }
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
