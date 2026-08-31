// analytics-utils imports `@/lib/supabase` at module load; stub it so the pure
// helpers can be imported with zero network / production access.
jest.mock('@/lib/supabase', () => ({ supabase: {} }))

import {
  isCompletedEarning,
  isBookedForUtilization,
  sumCompleted,
  parseHour,
  BookingRow,
} from '@/app/(tabs)/business/analytics-utils'

const row = (status: string, amount: number): BookingRow =>
  ({
    id: 'b',
    provider_id: 'p',
    user_id: 'u',
    service_name: 's',
    payment_amount: amount,
    status,
    created_at: null,
    requested_date: null,
    requested_time: null,
  }) as BookingRow

// Locks the Batch 4A revenue/utilization split: revenue counts completed only;
// utilization keeps the broader booked set.
describe('isCompletedEarning (revenue = completed only)', () => {
  it('is true only for completed', () => {
    expect(isCompletedEarning('completed')).toBe(true)
    expect(isCompletedEarning('accepted')).toBe(false)
    expect(isCompletedEarning('pending')).toBe(false)
    expect(isCompletedEarning('checked_in')).toBe(false)
    expect(isCompletedEarning('arriving')).toBe(false)
    expect(isCompletedEarning(null)).toBe(false)
  })
})

describe('isBookedForUtilization (broader booked set)', () => {
  it('is true for every capacity-consuming status', () => {
    for (const s of ['completed', 'accepted', 'pending', 'checked_in', 'arriving']) {
      expect(isBookedForUtilization(s)).toBe(true)
    }
  })

  it('is false for terminal/cancelled statuses', () => {
    expect(isBookedForUtilization('cancelled_by_client')).toBe(false)
    expect(isBookedForUtilization('no_show')).toBe(false)
    expect(isBookedForUtilization(null)).toBe(false)
  })
})

describe('sumCompleted', () => {
  it('sums only completed bookings, ignoring non-completed', () => {
    const rows = [
      row('completed', 100),
      row('accepted', 50),
      row('pending', 40),
      row('completed', 25),
      row('no_show', 999),
    ]
    expect(sumCompleted(rows)).toBe(125)
  })

  it('is 0 when nothing is completed', () => {
    expect(sumCompleted([row('accepted', 50), row('pending', 30)])).toBe(0)
  })
})

describe('parseHour (12-hour → 24-hour)', () => {
  it('handles the AM/PM midnight and noon edges', () => {
    expect(parseHour('12:00 AM')).toBe(0)
    expect(parseHour('12:00 PM')).toBe(12)
    expect(parseHour('1:30 PM')).toBe(13)
    expect(parseHour('9:00 AM')).toBe(9)
  })

  it('returns 0 for empty input', () => {
    expect(parseHour('')).toBe(0)
  })
})
