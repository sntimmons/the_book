import {
  badgeColors,
  badgeRoles,
  badgeToneFor,
  rolesUsedByStatusTones,
} from '@/lib/theme/statusTone'
import { DARK_COLORS, LIGHT_COLORS } from '@/lib/theme/tokens'

// THE RULE THIS FILE EXISTS TO PROTECT: a booking outcome is never styled as an
// error. PM restricted danger/600 to genuine error/destructive contexts, and Expired
// in particular must stay neutral because a lapsed request is not the provider's
// fault and the app must not editorialise about it.

describe('badgeToneFor', () => {
  it('maps the live states to their own tones', () => {
    expect(badgeToneFor('pending')).toBe('pending')
    expect(badgeToneFor('accepted')).toBe('confirmed')
    expect(badgeToneFor('rescheduled')).toBe('confirmed')
    expect(badgeToneFor('completed')).toBe('completed')
  })

  it('treats every ending as a neutral outcome, not a failure', () => {
    for (const status of [
      'declined',
      'cancelled',
      'canceled',
      'cancelled_by_client',
      'cancelled_by_provider',
      'late_cancelled',
      'no_show',
    ]) {
      expect(badgeToneFor(status)).toBe('outcome')
    }
  })

  it('makes an expired request neutral whatever the server status says', () => {
    expect(badgeToneFor('pending', true)).toBe('outcome')
    expect(badgeToneFor('accepted', true)).toBe('outcome')
  })

  it('falls back to outcome for an unknown status rather than throwing', () => {
    expect(badgeToneFor('something_new_from_the_server')).toBe('outcome')
  })
})

describe('danger is unreachable from any status tone', () => {
  it('uses no role that resolves to the danger colour', () => {
    expect(rolesUsedByStatusTones()).not.toContain('statusDanger')
  })

  it('never renders a danger value in either scheme', () => {
    const danger = new Set([LIGHT_COLORS.statusDanger, DARK_COLORS.statusDanger])
    for (const tone of ['pending', 'confirmed', 'completed', 'outcome'] as const) {
      for (const palette of [LIGHT_COLORS, DARK_COLORS]) {
        const { border, text } = badgeColors(tone, palette)
        expect(danger.has(border)).toBe(false)
        expect(danger.has(text)).toBe(false)
      }
    }
  })
})

describe('badgeColors', () => {
  it('resolves both roles in both schemes', () => {
    for (const palette of [LIGHT_COLORS, DARK_COLORS]) {
      const { border, text } = badgeColors('confirmed', palette)
      expect(border).toBe(palette.statusLocal)
      expect(text).toBe(palette.statusLocal)
    }
  })

  it('gives an outcome the neutral text role', () => {
    expect(badgeColors('outcome', LIGHT_COLORS).text).toBe(LIGHT_COLORS.statusOutcome)
    expect(badgeColors('outcome', DARK_COLORS).text).toBe(DARK_COLORS.statusOutcome)
  })

  it('keeps a pending badge at full-strength text so it is noticed', () => {
    expect(badgeRoles('pending').text).toBe('textPrimary')
  })
})
