import { readFileSync } from 'fs'
import { join } from 'path'

// GUARDS FOR THE BOOKINGS → THEME MIGRATION.
//
// These are source-level on purpose. They protect properties that are easy to
// regress with an innocent-looking edit — a re-introduced hex, a local status pill,
// a hardcoded progress total — and that a render test would not necessarily catch
// because the wrong value can still render perfectly happily.

const code = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const LIST = 'app/(tabs)/bookings.tsx'
const MESSAGE = 'app/book/message.tsx'
const NAV = 'app/(tabs)/_layout.tsx'

// A raw hex, or an rgba() that is not the one documented exception.
const LITERAL = /(['"])#[0-9A-Fa-f]{3,8}\1|rgba\([^)]*\)/g

describe('the migrated Bookings surfaces carry no undocumented colour', () => {
  it('the bookings list has none at all', () => {
    expect(code(LIST).match(LITERAL)).toBeNull()
  })

  it('the message step has exactly one, and it is the documented photo scrim', () => {
    const found = code(MESSAGE).match(LITERAL) ?? []
    expect(found).toEqual(['rgba(8,8,8,0.7)'])
    // …and it is documented where it sits.
    expect(code(MESSAGE)).toMatch(/EXCEPTIONAL LITERAL \(documented\)/)
  })

  it('the bottom navigation has none', () => {
    expect(code(NAV).match(LITERAL)).toBeNull()
  })
})

describe('status is owned by the shared authorities, not re-implemented', () => {
  const s = code(LIST)

  it('renders the shared StatusBadge rather than a local pill', () => {
    expect(s).toMatch(/<StatusBadge/)
    // The old local pill styles must not come back.
    expect(s).not.toMatch(/pillGreen|pillAmber|pillRed|pillTextRed/)
  })

  it('does not re-implement the status→label or status→tone mapping', () => {
    expect(s).not.toMatch(/case 'no_show'/)
    expect(s).not.toMatch(/case 'cancelled_by_provider'/)
  })

  it('keeps deriving expiry from the column rather than the enum', () => {
    expect(s).toMatch(/expires_at/)
    expect(s).toMatch(/bookingRequestUrgency/)
  })

  it('uses the shared empty state rather than describing absence as failure', () => {
    expect(s).toMatch(/SharedEmptyState/)
    expect(s).not.toMatch(/ErrorState/)
  })
})

describe('booking progress stays derived', () => {
  const s = code(MESSAGE)

  it('asks the progress module for its label', () => {
    expect(s).toMatch(/bookingProgressLabel\('message', contractRequired\)/)
  })

  it('hardcodes no total anywhere in the request flow', () => {
    for (const f of [
      'app/book/service.tsx',
      'app/book/datetime.tsx',
      'app/book/message.tsx',
      'app/book/policy.tsx',
      'app/book/contract.tsx',
      'app/book/payment.tsx',
    ]) {
      // e.g. "Step 3 of 6" typed into a screen — the exact thing
      // lib/bookingProgress.ts exists to prevent.
      expect(code(f)).not.toMatch(/Step \d+ of \d+/)
    }
  })

  it('does not number the confirmation as a step', () => {
    expect(code('app/book/confirmed.tsx')).not.toMatch(/StepProgress/)
  })
})

describe('the bottom navigation stays as approved', () => {
  const s = code(NAV)

  it('shows all five labels', () => {
    for (const label of ['Discover', 'Reels', 'Bookings', 'Messages', 'Me']) {
      expect(s).toContain(`label: '${label}'`)
    }
  })

  it('does not reintroduce the amber active underline', () => {
    expect(s).not.toMatch(/activeBar/)
    expect(s).not.toMatch(/C8922A/i)
  })

  it('still renders exactly five tabs', () => {
    const slots = s.match(/routeName: '/g) ?? []
    expect(slots).toHaveLength(5)
  })
})

// ── THE PER-ROW NOTE ─────────────────────────────────────────────────────
import { bookingListNote } from '@/lib/bookingStatus'

describe('the row explains itself without opening the booking', () => {
  const sent = '2026-09-13T15:00:00.000Z'

  it('names when a request was sent and who it waits on', () => {
    const note = bookingListNote({ status: 'pending', submitted_at: sent }, false, 'Marcus Reed')
    expect(note).toBe('Sent Sep 13. Waiting on Marcus.')
  })

  it('falls back to a neutral phrase when the provider name is unknown', () => {
    expect(bookingListNote({ status: 'pending', submitted_at: sent }, false, undefined)).toBe(
      'Sent Sep 13. Waiting on your provider.',
    )
  })

  it('says the REQUEST expired, never that the provider failed', () => {
    const note = bookingListNote({ status: 'pending', submitted_at: sent }, true, 'Marcus Reed')
    expect(note).toBe('This request expired before it was answered.')
    expect(note).not.toMatch(/didn'?t respond|failed|ignored|never answered/i)
    // The provider is not named in a sentence about something going wrong.
    expect(note).not.toMatch(/Marcus/)
  })

  it('says nothing for a booking that is not waiting on anyone', () => {
    for (const status of ['accepted', 'completed', 'declined', 'cancelled', 'no_show']) {
      expect(bookingListNote({ status, submitted_at: sent }, false, 'Marcus Reed')).toBeNull()
    }
  })

  it('renders nothing rather than guessing when the send time is missing', () => {
    expect(bookingListNote({ status: 'pending', submitted_at: null }, false, 'Marcus Reed')).toBeNull()
  })
})
