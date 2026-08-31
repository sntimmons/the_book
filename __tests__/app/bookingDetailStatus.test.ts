// bookings/[id].tsx is a screen; stub its Supabase import so the module loads to
// reach the exported pure helpers. expo-router / AuthContext / useMessaging are
// mocked globally in jest.setup.js.
jest.mock('@/lib/supabase', () => ({ supabase: {} }))

import { statusBucket, getStatusStyle } from '@/app/bookings/[id]'

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

describe('getStatusStyle', () => {
  it('gives rescheduled the same confirmed-green as accepted', () => {
    expect(getStatusStyle('rescheduled')).toEqual(getStatusStyle('accepted'))
  })

  it('returns a style object for every branch', () => {
    for (const s of ['pending', 'completed', 'no_show', 'cancelled_by_client']) {
      const style = getStatusStyle(s)
      expect(style).toEqual(
        expect.objectContaining({
          fg: expect.any(String),
          bg: expect.any(String),
          border: expect.any(String),
        }),
      )
    }
  })
})
