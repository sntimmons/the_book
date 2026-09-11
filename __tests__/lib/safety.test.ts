import {
  BLOCK_COPY,
  BLOCK_DONE_COPY,
  BLOCKED_PROFILE_COPY,
  MESSAGE_REFUSED_COPY,
  MESSAGE_FAILED_COPY,
  REPORT_LIMITED_COPY,
  BLOCK_FAILED_COPY,
  UNBLOCK_FAILED_COPY,
  SAFETY_UNAVAILABLE_COPY,
  BLOCKED_THREAD_COPY,
  BLOCKED_LIST_COPY,
  UNBLOCK_COPY,
  REPORT_FAILED_COPY,
  REPORT_REASONS,
  REPORT_SUBMITTED_COPY,
  REQUEST_ELIGIBILITY_REVIEW_COPY,
  providerReviewCopy,
  blockUser,
  unblockUser,
  iBlocked,
  submitReport,
} from '@/lib/safety'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }))

// Session 8's client half. Two kinds of assertion here, and the second matters
// as much as the first:
//
//   1. the calls do what they say (a duplicate block is success, a failed
//      lookup is not "no block");
//   2. **the copy promises nothing the product cannot deliver.** There is no
//      SLA (PD-068), no push/email/SMS channel of any kind, and no guaranteed
//      outcome — and safety copy is exactly where a product is most tempted to
//      reassure someone with a sentence it cannot back.

function chain(result: unknown) {
  const c: any = {}
  for (const m of ['select', 'eq', 'insert', 'delete', 'is', 'not']) c[m] = jest.fn(() => c)
  c.maybeSingle = jest.fn(() => Promise.resolve(result))
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return c
}

beforeEach(() => jest.clearAllMocks())

describe('blocking', () => {
  it('blocks', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: null }))
    await expect(blockUser('me', 'them')).resolves.toBe(true)
  })

  it('treats a duplicate block as success, because it is', async () => {
    // The caller asked for the block to exist. It does. Reporting a failure would
    // tell someone their safety action did not take when it had.
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: { code: '23505' } }))
    await expect(blockUser('me', 'them')).resolves.toBe(true)
  })

  it('reports a real failure as failure', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: { code: '42501' } }))
    await expect(blockUser('me', 'them')).resolves.toBe(false)
  })

  it('unblocks, and reports a failed unblock', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: null }))
    await expect(unblockUser('me', 'them')).resolves.toBe(true)
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: { code: '08006' } }))
    await expect(unblockUser('me', 'them')).resolves.toBe(false)
  })

  it('answers null — not false — when it cannot tell', async () => {
    // A failed lookup must not read as "you have not blocked them". That would
    // draw "Block" for someone who already had, and a second block attempt is a
    // confusing no-op at exactly the wrong moment.
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ data: null, error: { code: '08006' } }))
    await expect(iBlocked('me', 'them')).resolves.toBeNull()
  })

  it('answers true/false when it can', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ data: { id: 'x' }, error: null }))
    await expect(iBlocked('me', 'them')).resolves.toBe(true)
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ data: null, error: null }))
    await expect(iBlocked('me', 'them')).resolves.toBe(false)
  })
})

describe('reporting', () => {
  it('files a report bound to the reporter', async () => {
    const c = chain({ error: null })
    ;(supabase.from as jest.Mock).mockReturnValue(c)
    await expect(
      submitReport({
        reporterUserId: 'me',
        type: 'provider',
        reason: 'safety_concern',
        reportedProviderId: 'p1',
      }),
    ).resolves.toEqual({ ok: true, limited: false })
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reporter_user_id: 'me', report_type: 'provider' }),
    )
  })

  it('never sends a status or an operator field', async () => {
    // Those columns are not in the INSERT grant (20261052000000), so sending them
    // would fail — but the client should not be trying. A reporter does not get to
    // open their report as "resolved" or write the operator's notes for them.
    const c = chain({ error: null })
    ;(supabase.from as jest.Mock).mockReturnValue(c)
    await submitReport({ reporterUserId: 'me', type: 'client', reason: 'harassment' })
    const payload = c.insert.mock.calls[0][0]
    for (const forbidden of ['report_status', 'admin_notes', 'resolved_at', 'resolved_by']) {
      expect([forbidden, forbidden in payload]).toEqual([forbidden, false])
    }
  })

  it('offers no payment or billing category', async () => {
    // The Book processes no payment (PD-042), and Correction 3 removed exactly
    // this category from the post-booking issue flow. Offering it invites a report
    // about a transaction the product never made and cannot resolve.
    const text = REPORT_REASONS.map((r) => `${r.value} ${r.label}`).join(' ').toLowerCase()
    for (const banned of ['billing', 'payment', 'charge', 'refund', 'invoice']) {
      expect([banned, text.includes(banned)]).toEqual([banned, false])
    }
  })

  it('keeps the taxonomy small enough to choose from', () => {
    // A list a reporter has to study is a list that gets the wrong answer.
    expect(REPORT_REASONS.length).toBeLessThanOrEqual(10)
    expect(REPORT_REASONS.some((r) => r.value === 'other')).toBe(true)
  })
})

describe('safety copy promises nothing it cannot deliver', () => {
  // DERIVED, NOT LISTED. This was a hand-maintained array, and by the time it
  // was reviewed it had already fallen behind by three exports — a guard you
  // have to remember to extend is a guard that will be forgotten. Every string
  // this module exports is now covered automatically, so a new constant is
  // inside the guard the moment it exists.
  const EVERY_STRING: string[] = []
  ;(function collect(v: unknown) {
    if (typeof v === 'string') EVERY_STRING.push(v)
    else if (Array.isArray(v)) v.forEach(collect)
    else if (v && typeof v === 'object') Object.values(v).forEach(collect)
  })([
    BLOCK_COPY, BLOCK_DONE_COPY, BLOCK_FAILED_COPY, UNBLOCK_COPY, UNBLOCK_FAILED_COPY,
    SAFETY_UNAVAILABLE_COPY, BLOCKED_PROFILE_COPY, BLOCKED_THREAD_COPY, BLOCKED_LIST_COPY,
    REPORT_SUBMITTED_COPY, REPORT_FAILED_COPY, REPORT_REASONS,
    REQUEST_ELIGIBILITY_REVIEW_COPY, MESSAGE_REFUSED_COPY, MESSAGE_FAILED_COPY,
    providerReviewCopy('open'), providerReviewCopy('under_review'),
    providerReviewCopy('resolved'), providerReviewCopy('dismissed'),
  ])

  const ALL = EVERY_STRING.join(' ').toLowerCase()

  it('covers every string this module exports', () => {
    // If this number falls, something stopped being checked.
    expect(EVERY_STRING.length).toBeGreaterThan(30)
  })

  it('names no timeframe', () => {
    // PD-068: there is no SLA, and no copy may imply one.
    for (const p of ['within', ' hours', ' days', 'shortly', 'soon', '24 ', '48 ', 'business day']) {
      expect([p, ALL.includes(p)]).toEqual([p, false])
    }
  })

  it('promises no notification, because no channel exists', () => {
    for (const p of ['notify', 'notified', 'email', 'text you', 'sms', 'push', 'alert you']) {
      expect([p, ALL.includes(p)]).toEqual([p, false])
    }
  })

  it('guarantees no outcome and no safety', () => {
    for (const p of ['guarantee', 'we will remove', 'will be removed', 'ensure your safety',
      'keep you safe', 'action will be taken']) {
      expect([p, ALL.includes(p)]).toEqual([p, false])
    }
  })

  it('tells someone blocking what a block does NOT do', () => {
    // The most important sentence in the block dialog. A client blocking a
    // provider with an appointment tomorrow must learn from the dialog — not by
    // discovering it afterwards — that history stays and a live thread stays open.
    const body = BLOCK_COPY.body.toLowerCase()
    expect(body).toContain('existing bookings')
    expect(body).toContain('history')
    expect(body).toContain('stays open')
  })

  it('does not use operator vocabulary on a provider', () => {
    // A provider should not have to learn the internal case system to understand
    // what is happening to their business.
    for (const s of ['open', 'under_review', 'dismissed', 'case', 'queue', 'ticket']) {
      const shown = [providerReviewCopy('open'), providerReviewCopy('resolved')].join(' ').toLowerCase()
      expect([s, shown.includes(s)]).toEqual([s, false])
    }
  })

  it('says the same thing whether a review was resolved or dismissed', () => {
    // "Dismissed" is a word chosen for an operator's filing system. Telling a
    // provider their appeal was *dismissed* reports an internal disposition; what
    // they actually need to know — whether their business is available again — is
    // shown by the availability state itself.
    expect(providerReviewCopy('resolved')).toBe(providerReviewCopy('dismissed'))
  })
})

describe('the block confirmation agrees with the block dialog (QA-TRUTH-001)', () => {
  // The confirmation used to read "They can no longer message you or send you
  // booking requests." — which contradicted, two taps later, the dialog the
  // person had just agreed to. And it contradicted it in the DANGEROUS
  // direction: it overstated the protection. Someone who blocks a provider
  // mid-booking and reads that sentence believes the thread is closed. It is
  // not, deliberately, because closing it would strand them both inside an
  // obligation neither could finish.
  it('does not deny the exception the dialog promised', () => {
    const body = BLOCK_DONE_COPY.body.toLowerCase()
    expect(body).toContain('in progress')
    expect(body).toContain('stays open')
  })

  it('repeats what a block leaves untouched', () => {
    const body = BLOCK_DONE_COPY.body.toLowerCase()
    expect(body).toContain('bookings')
    expect(body).toContain('history')
    expect(body).toContain('unchanged')
  })

  it('makes no unqualified claim that contact has stopped', () => {
    // The specific sentence that was wrong. Any absolute phrasing is the same
    // defect wearing different words.
    for (const p of ['no longer message you', 'cannot contact you', 'will not be able to reach you']) {
      expect([p, BLOCK_DONE_COPY.body.toLowerCase().includes(p)]).toEqual([p, false])
    }
  })
})

describe('a blocked provider profile (QA-JOURNEY-002)', () => {
  it('names the viewer\'s own action, not the provider\'s availability', () => {
    // Reusing the de-approval line — "Not currently available for new bookings"
    // — would tell someone a business had been removed from the marketplace
    // because THEY blocked it, and would leave Unblock looking unrelated.
    expect(BLOCKED_PROFILE_COPY.bookBar.toLowerCase()).toContain('you blocked')
    expect(BLOCKED_PROFILE_COPY.bookBar.toLowerCase()).not.toContain('available for new bookings')
  })

  it('says what to do about it', () => {
    expect(BLOCKED_PROFILE_COPY.hint.toLowerCase()).toContain('unblock')
  })
})

describe('a refused message (QA-UX-001)', () => {
  it('does not invite a retry that cannot work', () => {
    // A refusal the server STATED — a block above all — is permanent. Telling
    // that person to try again is telling them to do a thing that will fail
    // every time, forever.
    expect(MESSAGE_REFUSED_COPY.body.toLowerCase()).not.toContain('try again')
  })

  it('never names a block, or the other person at all', () => {
    // PD-082: a blocked person is never told they were blocked.
    const all = `${MESSAGE_REFUSED_COPY.title} ${MESSAGE_REFUSED_COPY.body}`.toLowerCase()
    for (const p of ['block', 'blocked', 'they ', 'this person']) {
      expect([p, all.includes(p)]).toEqual([p, false])
    }
  })

  it('keeps a transient failure retryable, which is the whole point of having two', () => {
    expect(MESSAGE_FAILED_COPY.body.toLowerCase()).toContain('try again')
    expect(MESSAGE_REFUSED_COPY.body).not.toBe(MESSAGE_FAILED_COPY.body)
  })
})

describe('the two block dialogs agree in BOTH directions', () => {
  // QA-TRUTH-001 fixed one clause of this sentence; the other was still wrong.
  // BLOCK_COPY says "and you won't be able to do those things with them" —
  // PD-082 restricts the pair, not just the person blocked. BLOCK_DONE_COPY
  // stated only the one-directional half, so the sentence someone actually
  // remembers implied the restriction ran one way. Combined with a cause-free
  // refusal on their own next message, that reads as the product being broken.
  it('the confirmation states the reciprocal restriction too', () => {
    const body = BLOCK_DONE_COPY.body.toLowerCase()
    expect(body).toMatch(/you can't do those things with them|you (also )?can't/)
  })

  it('and the dialog it confirms says the same', () => {
    expect(BLOCK_COPY.body.toLowerCase()).toContain("you won't be able to do those things")
  })
})

describe('the report confirmation states a fact, not a commitment', () => {
  // The constant and its own docstring disagreed: the doc said it does NOT say
  // "we'll review it", and the string said "will be reviewed by The Book". A
  // case row is created, which is a fact — but there is no operator UI, the
  // operator RPCs are service_role-only, and PD-068 promises no SLA.
  it('does not promise a review', () => {
    const body = REPORT_SUBMITTED_COPY.body.toLowerCase()
    for (const p of ['will be reviewed', "we'll review", 'we will review', 'will look at']) {
      expect([p, body.includes(p)]).toEqual([p, false])
    }
  })

  it('says what actually happened, and that nothing is promised', () => {
    const body = REPORT_SUBMITTED_COPY.body.toLowerCase()
    expect(body).toContain('recorded')
    expect(body).toContain('no set response time')
  })
})

describe('the blocked-thread notice', () => {
  it('is written for the blocker, and offers the remedy', () => {
    expect(BLOCKED_THREAD_COPY.notice.toLowerCase()).toContain('you blocked')
    expect(BLOCKED_THREAD_COPY.action.toLowerCase()).toContain('unblock')
  })

  it('does not claim the conversation is closed, because sometimes it is not', () => {
    // A pair with a live booking keeps a working thread by design, and the
    // client cannot evaluate that condition. Saying "you can no longer message
    // them" would be wrong half the time.
    const n = BLOCKED_THREAD_COPY.notice.toLowerCase()
    for (const p of ['can no longer', 'cannot message', 'closed', 'ended']) {
      expect([p, n.includes(p)]).toEqual([p, false])
    }
  })
})

describe('a report the backstop refused (PD-088)', () => {
  it('is reported as LIMITED, not as a failure', async () => {
    // The two need opposite handling: a limited report keeps the text on screen
    // and must not be retried immediately; a failure may be retried at once.
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: { code: 'PT428' } }))
    await expect(
      submitReport({ reporterUserId: 'me', type: 'client', reason: 'harassment' }),
    ).resolves.toEqual({ ok: false, limited: true })
  })

  it('keeps an ordinary failure distinguishable from it', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(chain({ error: { code: '08006' } }))
    await expect(
      submitReport({ reporterUserId: 'me', type: 'client', reason: 'harassment' }),
    ).resolves.toEqual({ ok: false, limited: false })
  })

  it('says the text is kept, and names no number', () => {
    // PD-088: say the limit was reached in plain words, keep what they wrote,
    // never discard it silently. A number invites someone to count and wait,
    // and anyone hitting these limits is not in a situation arithmetic solves.
    const body = REPORT_LIMITED_COPY.body.toLowerCase()
    expect(body).toContain('still here')
    for (const n of ['5 ', 'five', '20 ', 'twenty', 'per hour', 'per day']) {
      expect([n, body.includes(n)]).toEqual([n, false])
    }
  })

  it('points somewhere real for an emergency, since we are refusing them', () => {
    // The one moment this product turns away a safety report is the one moment
    // it owes the person a route that is not this product.
    expect(REPORT_LIMITED_COPY.body.toLowerCase()).toContain('emergency services')
  })
})
