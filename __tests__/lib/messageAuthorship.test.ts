import {
  addressedToMeFilter,
  countsAsUnread,
  isNotMine,
  isSystemMessage,
  notMineFilter,
} from '@/lib/messageAuthorship'

// These pin the agreement between the JS form and the PostgREST form. Their DISAGREEMENT about
// a null sender was the defect: the count treated a platform notice as unread, while the
// mark-read write used `.neq`, which compiles to `sender_id <> uid` — NULL for a null sender —
// so the row was never in the update set. Counted, never clearable, on every release.
describe('message authorship', () => {
  const UID = '11111111-1111-4111-8111-111111111111'
  const OTHER = '22222222-2222-4222-8222-222222222222'

  it('counts a platform notice as not-mine, so it is both counted and clearable', () => {
    expect(isNotMine(null, UID)).toBe(true)
  })

  it('does not count my own message', () => {
    expect(isNotMine(UID, UID)).toBe(false)
  })

  it('counts the counterparty', () => {
    expect(isNotMine(OTHER, UID)).toBe(true)
  })

  it('identifies a platform notice by its absent author, not by content', () => {
    expect(isSystemMessage(null)).toBe(true)
    expect(isSystemMessage(UID)).toBe(false)
    expect(isSystemMessage(OTHER)).toBe(false)
  })

  it('the PostgREST form includes null senders — `.neq` alone silently drops them', () => {
    const f = notMineFilter(UID)
    expect(f).toContain('sender_id.is.null')
    expect(f).toContain(`sender_id.neq.${UID}`)
  })

  it('the two forms agree on all three cases', () => {
    const f = notMineFilter(UID)
    // null: JS true, filter includes via is.null
    expect(isNotMine(null, UID)).toBe(true)
    expect(f).toContain('is.null')
    // own: JS false, filter excludes (neither disjunct matches)
    expect(isNotMine(UID, UID)).toBe(false)
    // other: JS true, filter includes via neq
    expect(isNotMine(OTHER, UID)).toBe(true)
  })
})

// Ruling: the actor who ended a negotiation must not be badged for their own action. The
// counterparty is. `system_recipient_id` names who a platform notice is FOR; NULL means both,
// which is every ordinary message, so their behaviour is unchanged.
describe('addressed platform notices', () => {
  const ACTOR = '11111111-1111-4111-8111-111111111111'
  const COUNTERPARTY = '22222222-2222-4222-8222-222222222222'

  it('does not count a notice addressed to the counterparty as unread for the actor', () => {
    expect(countsAsUnread(null, COUNTERPARTY, ACTOR)).toBe(false)
  })

  it('counts it as unread for the counterparty it is addressed to', () => {
    expect(countsAsUnread(null, COUNTERPARTY, COUNTERPARTY)).toBe(true)
  })

  it('leaves ordinary messages unchanged — NULL recipient means addressed to both', () => {
    expect(countsAsUnread(COUNTERPARTY, null, ACTOR)).toBe(true)
    expect(countsAsUnread(ACTOR, null, ACTOR)).toBe(false)
  })

  it('never counts my own message, however it is addressed', () => {
    expect(countsAsUnread(ACTOR, ACTOR, ACTOR)).toBe(false)
    expect(countsAsUnread(ACTOR, null, ACTOR)).toBe(false)
  })

  it('the PostgREST addressing filter admits both NULL and me', () => {
    const f = addressedToMeFilter(ACTOR)
    expect(f).toContain('system_recipient_id.is.null')
    expect(f).toContain(`system_recipient_id.eq.${ACTOR}`)
  })
})
