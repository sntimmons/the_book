import {
  BarterInterestStatus,
  BarterReleaseReason,
  confirmCopy,
  DestructiveAction,
  formatTradeDate,
  RESPONDER_FEED_STATE,
  SECTION_COPY,
  SECTION_ORDER,
  TRADE_ACTIVITY_SECTION,
  TradeActivitySection,
  TradeRole,
  TradeRowFacts,
  tradeRowState,
} from '@/lib/tradeActivity'

// Trade Activity copy rules. These exist as a test because every Trade Activity defect found in
// review has been a COPY defect: a caption contradicting the row beneath it, a note instructing
// an action the screen could not perform, and a claim that another provider had been chosen when
// nobody had been. All three were invisible to typecheck and to the SQL suite.

// DERIVED from the total Records, not hand-listed. A hand-written array accepts a subset, so
// the suite's own coverage would silently stop tracking the union it exists to test — the same
// defect class as SECTION_ORDER being a literal array.
const STATUSES = Object.keys(TRADE_ACTIVITY_SECTION) as BarterInterestStatus[]
const SECTIONS = Object.keys(SECTION_COPY) as TradeActivitySection[]
const ROLES: TradeRole[] = ['owner', 'responder']
const ACTIONS: DestructiveAction[] = ['endNegotiation', 'decline', 'accept', 'closeOffer']

function facts(over: Partial<TradeRowFacts> = {}): TradeRowFacts {
  return {
    status: 'pending',
    myRole: 'owner',
    offerIsActive: true,
    releasedAt: null,
    releaseReason: null,
    offerHasAcceptedResponse: false,
    ...over,
  }
}

describe('totality', () => {
  it('resolves a state for every status in both roles, active and closed', () => {
    for (const status of STATUSES) {
      for (const myRole of ROLES) {
        for (const offerIsActive of [true, false]) {
          for (const offerHasAcceptedResponse of [true, false]) {
            const s = tradeRowState(
              facts({ status, myRole, offerIsActive, offerHasAcceptedResponse }),
            )
            expect(['none', 'end', 'answer', 'declineOnly']).toContain(s.action)
            expect(typeof s.note).toBe('string')
          }
        }
      }
    }
  })

  it('gives every section a title and a caption', () => {
    for (const key of SECTIONS) {
      expect(SECTION_COPY[key].title.length).toBeGreaterThan(0)
      expect(SECTION_COPY[key].caption.length).toBeGreaterThan(0)
    }
  })

  it('routes every status to a section that has copy', () => {
    for (const status of STATUSES) {
      expect(SECTION_COPY[TRADE_ACTIVITY_SECTION[status]]).toBeDefined()
    }
  })
})

describe('section captions are role-neutral', () => {
  // The previous captions were chosen by MAJORITY role within a section, so a mixed-role
  // section made a false statement about its minority rows and contradicted the note printed
  // directly underneath. Role belongs to a row, so no caption may claim one.
  it('names neither party', () => {
    for (const key of SECTIONS) {
      const caption = SECTION_COPY[key].caption.toLowerCase()
      expect(caption).not.toContain('waiting on you')
      expect(caption).not.toContain('you declined')
      expect(caption).not.toContain('the other provider')
      expect(caption).not.toContain('chose')
    }
  })
})

describe('a row never instructs an action it cannot perform', () => {
  // The invariant that ties copy to capability: if the note tells the reader to accept or
  // decline, the row must actually offer accept and decline.
  it('mentions accept/decline only when the answer action is available', () => {
    for (const status of STATUSES) {
      for (const myRole of ROLES) {
        for (const offerIsActive of [true, false]) {
          for (const offerHasAcceptedResponse of [true, false]) {
            const s = tradeRowState(
              facts({ status, myRole, offerIsActive, offerHasAcceptedResponse }),
            )
            const instructs = /waiting on you to accept or decline/i.test(s.note)
            if (instructs) expect(s.action).toBe('answer')
          }
        }
      }
    }
  })
})

describe('pending responses', () => {
  it('lets the owner answer while the post is active, however old', () => {
    const s = tradeRowState(facts({ status: 'pending', myRole: 'owner', offerIsActive: true }))
    expect(s.action).toBe('answer')
    expect(s.note).toBe('Waiting on you to accept or decline.')
  })

  it('does not let the owner answer once the post is closed, and says why', () => {
    const s = tradeRowState(facts({ status: 'pending', myRole: 'owner', offerIsActive: false }))
    expect(s.action).toBe('none')
    expect(s.note).toMatch(/closed this post/i)
    // PD-052 withdraws BOTH. Copy naming only accept explains half the rule and makes the
    // missing Decline control read as a bug.
    expect(s.note).toMatch(/declined/i)
  })

  it('never offers the responder an answer control', () => {
    for (const offerIsActive of [true, false]) {
      expect(
        tradeRowState(facts({ status: 'pending', myRole: 'responder', offerIsActive })).action,
      ).toBe('none')
    }
  })

  it('tells the responder the post is closed rather than leaving them waiting', () => {
    const s = tradeRowState(facts({ status: 'pending', myRole: 'responder', offerIsActive: false }))
    expect(s.note).toMatch(/closed/i)
    expect(s.note).not.toMatch(/waiting on the other provider/i)
  })
})

describe('accepted negotiations survive their post', () => {
  it('keeps the end control after the post comes off the board', () => {
    const s = tradeRowState(facts({ status: 'accepted', offerIsActive: false }))
    expect(s.action).toBe('end')
    expect(s.note).toMatch(/no longer on the board/i)
    // The contradiction found in review: "still open" printed above "Negotiation ended".
    expect(s.note).not.toMatch(/ended/i)
  })

  it('says nothing extra while the post is live', () => {
    expect(tradeRowState(facts({ status: 'accepted', offerIsActive: true })).note).toBe('')
  })
})

describe('declined responses', () => {
  it('does not tell a declined responder that someone else was chosen', () => {
    // Declining requires no acceptance, so asserting a competition is a confident false
    // statement about the counterparty's conduct, made to the party least able to check it.
    const s = tradeRowState(facts({ status: 'declined', myRole: 'responder' }))
    expect(s.note).not.toMatch(/chose|someone else|another provider/i)
    expect(s.note).toMatch(/not selected/i)
  })

  it('attributes the decline to the owner on the owner side', () => {
    expect(tradeRowState(facts({ status: 'declined', myRole: 'owner' })).note).toMatch(
      /you declined/i,
    )
  })
})

describe('ended negotiations say who ended them and when', () => {
  const cases: { reason: BarterReleaseReason; role: TradeRole; mine: boolean }[] = [
    { reason: 'responder_withdrew', role: 'responder', mine: true },
    { reason: 'responder_withdrew', role: 'owner', mine: false },
    { reason: 'owner_ended_negotiation', role: 'owner', mine: true },
    { reason: 'owner_ended_negotiation', role: 'responder', mine: false },
  ]

  it.each(cases)('$reason seen by $role', ({ reason, role, mine }) => {
    const s = tradeRowState(
      facts({ status: 'released', myRole: role, releaseReason: reason, releasedAt: null }),
    )
    expect(s.action).toBe('none')
    if (mine) expect(s.note).toMatch(/^you ended/i)
    else expect(s.note).toMatch(/^the other provider ended/i)
  })

  it('attributes a mutual end to neither party', () => {
    const s = tradeRowState(facts({ status: 'released', releaseReason: 'mutual_end' }))
    expect(s.note).not.toMatch(/you ended|other provider ended/i)
  })

  it('falls back to an unattributed sentence when the server recorded no reason', () => {
    const s = tradeRowState(facts({ status: 'released', releaseReason: null }))
    expect(s.note).toBe('This negotiation ended.')
  })

  it('appends the date when there is one', () => {
    const s = tradeRowState(
      facts({
        status: 'released',
        myRole: 'owner',
        releaseReason: 'owner_ended_negotiation',
        releasedAt: '2026-08-14T17:04:00.000Z',
      }),
    )
    expect(s.note).toMatch(/^You ended this negotiation\. .+\.$/)
  })
})

describe('formatTradeDate', () => {
  it('renders an absolute date, not a relative one that decays', () => {
    expect(formatTradeDate('2026-08-14T17:04:00.000Z')).toMatch(/2026/)
    expect(formatTradeDate('2026-08-14T17:04:00.000Z')).not.toMatch(/ago/)
  })

  it('returns empty rather than "Invalid Date" for absent or unparseable input', () => {
    expect(formatTradeDate(null)).toBe('')
    expect(formatTradeDate('not-a-date')).toBe('')
  })
})

describe('a post already in negotiation cannot accept another response', () => {
  // PD-049 allows one accepted response per post. While one is held, Accept on any other
  // pending response can only fail with "Already matched" — so the row must not offer it, and
  // must not tell the owner to accept or decline.
  it('offers decline only, and says why', () => {
    const s = tradeRowState(
      facts({
        status: 'pending',
        myRole: 'owner',
        offerIsActive: true,
        offerHasAcceptedResponse: true,
      }),
    )
    expect(s.action).toBe('declineOnly')
    expect(s.note).toMatch(/already in negotiation/i)
    expect(s.note).not.toMatch(/accept or decline/i)
  })

  it('still lets the accepted row itself be ended', () => {
    const s = tradeRowState(
      facts({ status: 'accepted', myRole: 'owner', offerHasAcceptedResponse: true }),
    )
    expect(s.action).toBe('end')
  })

  it('a closed post beats an open slot: still no accept', () => {
    const s = tradeRowState(
      facts({
        status: 'pending',
        myRole: 'owner',
        offerIsActive: false,
        offerHasAcceptedResponse: false,
      }),
    )
    expect(s.action).toBe('none')
  })
})

describe('SECTION_ORDER is derived, not hand-listed', () => {
  it('renders every section that has copy', () => {
    expect([...SECTION_ORDER].sort()).toEqual([...SECTIONS].sort())
  })

  it('puts active work before history', () => {
    expect(SECTION_ORDER.indexOf('active')).toBeLessThan(SECTION_ORDER.indexOf('ended'))
    expect(SECTION_ORDER.indexOf('pending')).toBeLessThan(SECTION_ORDER.indexOf('notSelected'))
  })
})

describe('the responder feed accounts for every status', () => {
  it('has a label for each, and never calls a finished state an outstanding one', () => {
    for (const status of STATUSES) {
      const state = RESPONDER_FEED_STATE[status]
      expect(state.label.length).toBeGreaterThan(0)
      if (status !== 'pending') expect(state.label).not.toMatch(/interest sent/i)
    }
  })

  it('offers the end control only on an accepted response', () => {
    for (const status of STATUSES) {
      expect(RESPONDER_FEED_STATE[status].action === 'end').toBe(status === 'accepted')
    }
  })

  it('carries its own icon, so none is chosen by a ternary beside it', () => {
    for (const status of STATUSES) {
      expect(RESPONDER_FEED_STATE[status].icon.length).toBeGreaterThan(0)
    }
    // A finished-looking glyph must not be the silent default for a future status.
    expect(RESPONDER_FEED_STATE.pending.icon).toBe('check')
  })
})

describe('destructive confirmations disclose irreversibility', () => {
  // The disclosure a provider gets before an irreversible act must not depend on the route
  // they took to it. Three screens previously authored these separately and diverged.
  it.each(ACTIONS)('%s discloses that it cannot be undone', (action) => {
    for (const role of ROLES) {
      const c = confirmCopy(action, role, 'Alex')
      expect(c.body).toMatch(/cannot be undone/i)
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.confirmLabel.length).toBeGreaterThan(0)
      expect(c.cancelLabel.length).toBeGreaterThan(0)
    }
  })

  it('names the counterparty where the action is about one person', () => {
    expect(confirmCopy('decline', 'owner', 'Alex').body).toContain('Alex')
    expect(confirmCopy('accept', 'owner', 'Alex').body).toContain('Alex')
  })

  it('does not imply a post spends its only acceptance', () => {
    // PD-049 frees the slot when a negotiation ends before an agreement, so the owner may
    // accept another pending response while the post is active. No confirmation may suggest
    // otherwise — close-and-repost, discarding every responder, is the workaround PD-049
    // exists to remove.
    expect(confirmCopy('endNegotiation', 'owner', 'Alex').body).toMatch(
      /you can accept another response/i,
    )
  })

  it('tells each side of an ending what it means for them', () => {
    expect(confirmCopy('endNegotiation', 'owner', 'Alex').body).toMatch(/re-accept/i)
    expect(confirmCopy('endNegotiation', 'responder', 'Alex').body).toMatch(
      /you will not be able to respond/i,
    )
  })
})

describe('a closed post is terminal for BOTH parties (PD-050, PD-052)', () => {
  // The responses screen now derives its capability from this same function, so these
  // assertions cover both surfaces. Previously that screen had its own JSX ternary chain and
  // the two had already drifted on exactly this question.
  it('offers the owner no action at all on a closed post, whatever the slot state', () => {
    for (const offerHasAcceptedResponse of [true, false]) {
      const s = tradeRowState(
        facts({
          status: 'pending',
          myRole: 'owner',
          offerIsActive: false,
          offerHasAcceptedResponse,
        }),
      )
      expect(s.action).toBe('none')
    }
  })

  it('tells the responder the post is closed rather than that they were not selected', () => {
    const s = tradeRowState(
      facts({ status: 'pending', myRole: 'responder', offerIsActive: false }),
    )
    expect(s.note).toMatch(/closed/i)
    expect(s.note).not.toMatch(/not selected/i)
  })

  it('never yields an accept-capable action for ANY row on a closed post', () => {
    // The invariant the server now also holds (barter_interests_zy_answer_open_offer): a
    // closed post's responses cannot be answered. If this ever yields 'answer', a screen
    // renders an Accept the database will refuse.
    for (const status of STATUSES) {
      for (const myRole of ROLES) {
        for (const offerHasAcceptedResponse of [true, false]) {
          const s = tradeRowState(
            facts({ status, myRole, offerIsActive: false, offerHasAcceptedResponse }),
          )
          expect(s.action).not.toBe('answer')
        }
      }
    }
  })
})

describe('accept is reachable ONLY through the answer action', () => {
  // Guards the defect the responses screen shipped with: a non-total chain whose final else
  // rendered a live Accept, so an unknown future status fell through to it. Capability is a
  // closed set now — every status resolves to one of four actions, and only one permits accept.
  it('resolves every status to a known action, on active and closed posts', () => {
    const seen = new Set<string>()
    for (const status of STATUSES) {
      for (const myRole of ROLES) {
        for (const offerIsActive of [true, false]) {
          for (const offerHasAcceptedResponse of [true, false]) {
            seen.add(
              tradeRowState(
                facts({ status, myRole, offerIsActive, offerHasAcceptedResponse }),
              ).action,
            )
          }
        }
      }
    }
    for (const action of seen) {
      expect(['none', 'end', 'answer', 'declineOnly']).toContain(action)
    }
    // And 'answer' is genuinely reachable, so the assertion above is not vacuous.
    expect(seen.has('answer')).toBe(true)
  })

  it('grants answer only to an owner, on an active post, with a free slot', () => {
    for (const status of STATUSES) {
      for (const myRole of ROLES) {
        for (const offerIsActive of [true, false]) {
          for (const offerHasAcceptedResponse of [true, false]) {
            const s = tradeRowState(
              facts({ status, myRole, offerIsActive, offerHasAcceptedResponse }),
            )
            if (s.action === 'answer') {
              expect(status).toBe('pending')
              expect(myRole).toBe('owner')
              expect(offerIsActive).toBe(true)
              expect(offerHasAcceptedResponse).toBe(false)
            }
          }
        }
      }
    }
  })
})

describe('closing a post discloses that it is permanent', () => {
  // PD-051 made closing irreversible and PD-052 withdrew decline as well as accept. The inline
  // copy this replaced said the owner could not reopen it "from here" — scoping a permanent
  // loss to one screen — and mentioned only accept.
  const c = confirmCopy('closeOffer', 'owner', '')

  it('does not scope the loss to one screen', () => {
    expect(c.body).not.toMatch(/from here/i)
  })

  it('states that it cannot be undone and that the post cannot be reopened', () => {
    expect(c.body).toMatch(/cannot be undone/i)
    expect(c.body).toMatch(/cannot be reopened/i)
  })

  it('names BOTH withdrawn actions, not only accept', () => {
    expect(c.body).toMatch(/accepted/i)
    expect(c.body).toMatch(/declined/i)
  })

  it('says an accepted negotiation is not ended by closing', () => {
    expect(c.body).toMatch(/not ended by closing/i)
  })
})
