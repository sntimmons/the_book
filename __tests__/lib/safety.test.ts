import {
  BLOCK_COPY,
  REPORT_REASONS,
  REPORT_SUBMITTED_COPY,
  REQUEST_REVIEW_COPY,
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
    ).resolves.toBe(true)
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
  const ALL = [
    BLOCK_COPY.title, BLOCK_COPY.body,
    REPORT_SUBMITTED_COPY.title, REPORT_SUBMITTED_COPY.body,
    REQUEST_REVIEW_COPY.title, REQUEST_REVIEW_COPY.body,
    providerReviewCopy('open') ?? '',
    providerReviewCopy('under_review') ?? '',
    providerReviewCopy('resolved') ?? '',
    providerReviewCopy('dismissed') ?? '',
  ].join(' ').toLowerCase()

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
