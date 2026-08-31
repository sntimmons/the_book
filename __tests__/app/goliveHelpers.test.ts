// golive.tsx is the heaviest screen (9-stage handler, uploads, ProviderProfile).
// We ONLY test the pure parseDurationMinutes helper, so we stub the heavy
// imports to keep the module load cheap and isolated. Supabase is stubbed;
// Sentry / expo-router / AuthContext are mocked globally in jest.setup.js.
jest.mock('@/lib/supabase', () => ({ supabase: {} }))
jest.mock('@/components/ProviderProfile', () => 'ProviderProfile')
jest.mock('@/components/AvailabilityEditor', () => ({ buildAvailabilityRows: jest.fn() }))
jest.mock('@/lib/storage', () => ({ uploadMedia: jest.fn(), uploadMultiple: jest.fn() }))

import { parseDurationMinutes } from '@/app/onboarding/provider/golive'

// Feeds the go-live provider_services write; a wrong parse writes a wrong
// service duration. (The 9-stage handleGoLive itself is intentionally NOT tested.)
describe('parseDurationMinutes', () => {
  it('parses hours (incl. fractional) to minutes', () => {
    expect(parseDurationMinutes('1 hr')).toBe(60)
    expect(parseDurationMinutes('1.5 hr')).toBe(90)
    expect(parseDurationMinutes('2 hrs')).toBe(120)
  })

  it('parses explicit minutes', () => {
    expect(parseDurationMinutes('45 min')).toBe(45)
    expect(parseDurationMinutes('90 mins')).toBe(90)
  })

  it('falls back to a bare number as minutes', () => {
    expect(parseDurationMinutes('30')).toBe(30)
  })

  it('defaults to 60 for empty or unrecognized input', () => {
    expect(parseDurationMinutes('')).toBe(60)
    expect(parseDurationMinutes('whenever')).toBe(60)
  })
})
