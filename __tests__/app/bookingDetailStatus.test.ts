// bookings/[id].tsx is a screen; stub its Supabase import so the module loads to
// reach the exported pure helpers. expo-router / AuthContext / useMessaging are
// mocked globally in jest.setup.js.
jest.mock('@/lib/supabase', () => ({ supabase: {} }))

import { readFileSync } from 'fs'
import { join } from 'path'
import { statusBucket } from '@/app/bookings/[id]'
import { badgeToneFor, rolesUsedByStatusTones } from '@/lib/theme/statusTone'

// Locks the finer-grained action-state bucket used to drive the per-status
// ActionButtons, including the Batch 4A fix that rescheduled stays action-active.
describe('statusBucket (action-state)', () => {
  it('keeps rescheduled action-active (accepted) — Batch 4A regression', () => {
    expect(statusBucket('rescheduled')).toBe('accepted')
  })

  it('passes through the operational states', () => {
    expect(statusBucket('pending')).toBe('pending')
    expect(statusBucket('accepted')).toBe('accepted')
    expect(statusBucket('completed')).toBe('completed')
    expect(statusBucket('no_show')).toBe('no_show')
    expect(statusBucket('arriving')).toBe('arriving')
    expect(statusBucket('checked_in')).toBe('checked_in')
  })

  it('buckets client/provider cancellations (and unknowns) as cancelled', () => {
    expect(statusBucket('cancelled_by_client')).toBe('cancelled')
    expect(statusBucket('cancelled_by_provider')).toBe('cancelled')
    expect(statusBucket('declined')).toBe('cancelled')
    expect(statusBucket('late_cancelled')).toBe('cancelled')
    expect(statusBucket('anything_else')).toBe('cancelled')
  })
})

// The detail screen used to carry its own `getStatusStyle` colour table — a second
// place where "what colour is a no-show" got decided, and it decided RED. The rule
// now lives once, in lib/theme/statusTone.ts, and the screen renders <StatusBadge>.
// These tests exist so that consolidation cannot be quietly undone.
describe('the detail screen does not own status colour', () => {
  const source = readFileSync(join(process.cwd(), 'app/bookings/[id].tsx'), 'utf8')

  it('exports no private status colour table', () => {
    const mod = require('@/app/bookings/[id]')
    expect(mod.getStatusStyle).toBeUndefined()
  })

  it('renders the shared StatusBadge rather than a hand-rolled pill', () => {
    expect(source).toContain('<StatusBadge')
    expect(source).not.toContain('statusPillText')
  })

  it('holds no colour literal at all', () => {
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/)
    expect(source).not.toMatch(/rgba?\(/)
  })
})

// The reason the table had to go, stated as a test rather than a comment.
describe('shared tones, applied to the statuses this screen shows', () => {
  it('gives rescheduled the same tone as accepted', () => {
    expect(badgeToneFor('rescheduled')).toBe(badgeToneFor('accepted'))
  })

  it('returns a tone for every status this screen can receive', () => {
    for (const s of [
      'pending',
      'accepted',
      'arriving',
      'checked_in',
      'completed',
      'no_show',
      'cancelled_by_client',
      'cancelled_by_provider',
      'declined',
    ]) {
      expect(typeof badgeToneFor(s)).toBe('string')
    }
  })

  it('never paints an outcome with the danger role', () => {
    // no_show, declined and cancelled are OUTCOMES of a transaction, not errors,
    // and neither party is at fault in the UI's telling.
    expect(rolesUsedByStatusTones()).not.toContain('statusDanger')
    for (const s of ['no_show', 'declined', 'cancelled_by_provider']) {
      expect(badgeToneFor(s)).toBe('outcome')
    }
  })
})
