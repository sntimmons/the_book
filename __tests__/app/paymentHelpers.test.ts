// book/payment.tsx is a screen; stub its Supabase import so the module can be
// loaded purely to reach the exported pure helpers. Sentry / expo-router /
// AuthContext are mocked globally in jest.setup.js.
jest.mock('@/lib/supabase', () => ({ supabase: {} }))

import { buildAppointmentTime, toIsoDate } from '@/app/book/payment'

// Locks the booking-row integrity helpers: numeric assembly (Hermes cannot parse
// locale date strings) that must return null rather than corrupt a booking.
describe('buildAppointmentTime', () => {
  it('assembles a valid ISO timestamp from a YYYY-MM-DD date and "H:MM AM/PM" time', () => {
    const iso = buildAppointmentTime('2026-06-21', '11:00 AM')
    expect(iso).not.toBeNull()
    const d = new Date(iso as string)
    expect(d.getUTCFullYear()).toBe(2026)
    // Local components used to build the date; assert round-trip parseability.
    expect(Number.isNaN(d.getTime())).toBe(false)
  })

  it('handles the 12-hour PM/AM edges', () => {
    expect(buildAppointmentTime('2026-06-21', '12:00 PM')).not.toBeNull() // noon
    expect(buildAppointmentTime('2026-06-21', '12:30 AM')).not.toBeNull() // after midnight
  })

  it('returns null for missing inputs', () => {
    expect(buildAppointmentTime(null, '11:00 AM')).toBeNull()
    expect(buildAppointmentTime('2026-06-21', null)).toBeNull()
    expect(buildAppointmentTime('2026-06-21', '')).toBeNull()
  })

  it('returns null for unparseable/malformed inputs instead of corrupting data', () => {
    expect(buildAppointmentTime('June 21 2026', '11:00 AM')).toBeNull()
    expect(buildAppointmentTime('2026-06-21', '25:99 XY')).toBeNull()
    expect(buildAppointmentTime('2026-6-1', '11:00 AM')).toBeNull()
  })
})

describe('toIsoDate', () => {
  it('converts a display date to YYYY-MM-DD', () => {
    expect(toIsoDate('May 28, 2026')).toBe('2026-05-28')
  })

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(toIsoDate('not a date')).toBe('not a date')
  })
})
