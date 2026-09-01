import {
  composerState,
  isActiveRequest,
  inboxSection,
  messageEntryAction,
  REQUEST_PENDING_CLIENT_COPY,
  REQUEST_DECLINED_CLIENT_COPY,
} from '@/lib/messageRequests'

describe('composerState', () => {
  it('pending + client: no composer, pending notice, no accept/decline', () => {
    expect(composerState('pending', 'client')).toEqual({
      canCompose: false,
      showAcceptDecline: false,
      notice: REQUEST_PENDING_CLIENT_COPY,
    })
  })

  it('pending + provider: accept/decline shown, no composer', () => {
    const s = composerState('pending', 'provider')
    expect(s.canCompose).toBe(false)
    expect(s.showAcceptDecline).toBe(true)
    expect(s.notice).toBeNull()
  })

  it('declined + client: soft closed copy, no composer', () => {
    expect(composerState('declined', 'client')).toEqual({
      canCompose: false,
      showAcceptDecline: false,
      notice: REQUEST_DECLINED_CLIENT_COPY,
    })
  })

  it('declined + provider: no composer', () => {
    expect(composerState('declined', 'provider').canCompose).toBe(false)
  })

  it('accepted or null: normal composer, no controls/notice', () => {
    for (const s of ['accepted', null, undefined] as const) {
      expect(composerState(s, 'client')).toEqual({
        canCompose: true,
        showAcceptDecline: false,
        notice: null,
      })
    }
  })
})

describe('isActiveRequest', () => {
  it('only pending is an active request', () => {
    expect(isActiveRequest('pending')).toBe(true)
    expect(isActiveRequest('accepted')).toBe(false)
    expect(isActiveRequest('declined')).toBe(false)
    expect(isActiveRequest(null)).toBe(false)
  })
})

describe('inboxSection', () => {
  it('pending→requests, declined→hidden, null/accepted→active', () => {
    expect(inboxSection('pending')).toBe('requests')
    expect(inboxSection('declined')).toBe('hidden')
    expect(inboxSection('accepted')).toBe('active')
    expect(inboxSection(null)).toBe('active')
  })
})

describe('messageEntryAction (shared by provider-profile AND no-availability entry)', () => {
  // Both client pre-booking entry points (app/providers/[id].tsx and
  // app/book/datetime.tsx) route through openMessageEntry, which uses THIS
  // decision — so the no-availability "Message them directly" path can never
  // create a free open chat; it composes a request or opens the existing thread.
  it('composes when none exists or previously declined; opens otherwise', () => {
    expect(messageEntryAction(null, false)).toBe('compose') // no conversation -> new request
    expect(messageEntryAction('declined', true)).toBe('compose') // re-request
    expect(messageEntryAction(null, true)).toBe('open') // legacy/open conversation
    expect(messageEntryAction('accepted', true)).toBe('open') // accepted conversation
    expect(messageEntryAction('pending', true)).toBe('open') // pending thread
  })
})

describe('live request-status transition (drives the thread composer on realtime)', () => {
  // The thread subscribes to its conversation's request_status; composerState is
  // the pure state applied on each change. A pending client thread must unlock on
  // accept and show the soft notice on decline — without reopening.
  it('pending → accepted unlocks the composer for the client', () => {
    expect(composerState('pending', 'client').canCompose).toBe(false)
    expect(composerState('accepted', 'client').canCompose).toBe(true)
  })

  it('pending → declined keeps the composer closed and shows the soft notice', () => {
    const declined = composerState('declined', 'client')
    expect(declined.canCompose).toBe(false)
    expect(declined.notice).toBe(REQUEST_DECLINED_CLIENT_COPY)
  })

  it('provider pending → accepted moves from accept/decline controls to composer', () => {
    expect(composerState('pending', 'provider').showAcceptDecline).toBe(true)
    expect(composerState('accepted', 'provider').canCompose).toBe(true)
  })
})
