import {
  MAX_TERMS,
  negotiationView,
  shouldShowTermsChangedNote,
  NegotiationFacts,
  NegotiationState,
  sideLabel,
  TermInput,
  TERMS_CHANGED_NOTE,
  termsPayload,
  validateTerms,
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
    iAuthoredCurrent: false,
    everBothAccepted: false,
    ...over,
  }
}

function term(over: Partial<TermInput> = {}): TermInput {
  return { providedBy: 'owner', serviceDescription: 'a photo session', estimatedValue: null, ...over }
}

const BOTH_SIDES: TermInput[] = [
  term({ providedBy: 'owner' }),
  term({ providedBy: 'responder', serviceDescription: 'four PT sessions' }),
]

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
    expect(seen.size).toBe(5)
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

  it('lets either party send new terms right up until the negotiation ends', () => {
    for (const bothAccepted of [true, false]) {
      expect(negotiationView(facts({ bothAccepted })).canPropose).toBe(true)
    }
  })
})

describe('agreement copy promises nothing the app cannot do', () => {
  // No agreement, obligation or fulfilment model exists. Copy that called a trade booked, owed
  // or complete would be a promise with no schema behind it.
  const v = negotiationView(facts({ bothAccepted: true, iAcceptedCurrent: true, theyAcceptedCurrent: true }))

  it('reports that both accepted', () => {
    expect(v.state).toBe('agreed')
    expect(v.headline).toMatch(/both accepted/i)
  })

  it('does not claim the trade is booked, owed, confirmed or complete', () => {
    const text = `${v.headline} ${v.detail}`.toLowerCase()
    for (const word of ['booked', 'owed', 'confirmed', 'complete', 'guaranteed', 'official']) {
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
    ).concat(TERMS_CHANGED_NOTE)
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

describe('validateTerms mirrors the server rules', () => {
  it('accepts a two-sided proposal', () => {
    expect(validateTerms(BOTH_SIDES)).toBeNull()
  })

  it('refuses a one-sided trade', () => {
    const oneSided = [term({ providedBy: 'owner' }), term({ providedBy: 'owner' })]
    expect(validateTerms(oneSided)).toMatch(/responding provider/i)
  })

  it('refuses a single item', () => {
    expect(validateTerms([term()])).toMatch(/each of you/i)
  })

  it('ignores blank lines rather than sending them', () => {
    const withBlank = [...BOTH_SIDES, term({ serviceDescription: '   ' })]
    expect(validateTerms(withBlank)).toBeNull()
    expect(termsPayload(withBlank)).toHaveLength(2)
  })

  it('refuses more items than the server will store', () => {
    const many = Array.from({ length: MAX_TERMS + 1 }, (_, i) =>
      term({ providedBy: i % 2 === 0 ? 'owner' : 'responder', serviceDescription: `item ${i}` }),
    )
    expect(validateTerms(many)).toMatch(/at most/i)
  })

  it('refuses an over-long description', () => {
    const long = [BOTH_SIDES[0], term({ providedBy: 'responder', serviceDescription: 'x'.repeat(201) })]
    expect(validateTerms(long)).toMatch(/200/)
  })

  it('refuses a non-integer or negative value', () => {
    expect(validateTerms([BOTH_SIDES[0], term({ providedBy: 'responder', estimatedValue: -5 })]))
      .toMatch(/whole number/i)
    expect(validateTerms([BOTH_SIDES[0], term({ providedBy: 'responder', estimatedValue: 1.5 })]))
      .toMatch(/whole number/i)
  })

  it('trims what it sends, so the stored term is what the reader saw', () => {
    const padded = [
      term({ serviceDescription: '  a photo session  ' }),
      term({ providedBy: 'responder', serviceDescription: ' four PT sessions ' }),
    ]
    expect(termsPayload(padded)[0].service_description).toBe('a photo session')
  })
})

describe('sideLabel speaks from the viewer', () => {
  it('names the viewer as the giver on their own side', () => {
    expect(sideLabel('owner', 'owner')).toMatch(/you/i)
    expect(sideLabel('responder', 'owner')).toMatch(/they/i)
    expect(sideLabel('responder', 'responder')).toMatch(/you/i)
    expect(sideLabel('owner', 'responder')).toMatch(/they/i)
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

  it('is shown even when the other provider has already accepted the new terms', () => {
    // The suppressed case. Their acceptance says nothing about whether mine lapsed.
    expect(
      shouldShowTermsChangedNote({
        ...base,
        iAcceptedAnEarlierVersion: true,
        iAcceptedCurrent: false,
      }),
    ).toBe(true)
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
