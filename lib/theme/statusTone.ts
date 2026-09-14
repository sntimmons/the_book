// HOW A BOOKING STATUS LOOKS. Pure logic, NO React — so the one rule that matters
// here is assertable in a unit test rather than trusted to a component.
//
// ══ THE RULE ══════════════════════════════════════════════════════════════
//
// **A booking outcome is never styled as an error.** Declined, Cancelled, No show
// and Expired are things that HAPPENED, not failures of the app and not faults of
// the provider. PM ruled `danger/600` a semantic utility for genuine
// error/destructive contexts only, so no status tone in this file may reach it —
// and `statusDangerIsUnused` exists to prove that, not merely to claim it.
//
// Expired is the sharpest case. A request that lapsed before it was answered says
// nothing about the provider, and colouring it red would be the app editorialising
// about someone's responsiveness.

import { bookingStatusTone, type BookingTone } from '@/lib/bookingStatus'
import type { ThemeColors, ThemeRole } from '@/lib/theme/tokens'

/** The visual families a status badge can take. There is no `danger` member. */
export type BadgeTone = 'pending' | 'confirmed' | 'completed' | 'outcome'

export type BadgeRoles = Readonly<{ border: ThemeRole; text: ThemeRole }>

const TONE_ROLES: Readonly<Record<BadgeTone, BadgeRoles>> = Object.freeze({
  // Waiting on someone. Quiet, but the label keeps full-strength text because the
  // client is meant to notice it.
  pending: { border: 'borderSubtle', text: 'textPrimary' },
  // Accepted. Cypress is the truthful-status role.
  confirmed: { border: 'statusLocal', text: 'statusLocal' },
  // Done. Same family as confirmed, quieter border — it is history now.
  completed: { border: 'borderSubtle', text: 'statusLocal' },
  // Declined, Cancelled, No show, Expired. Neutral on purpose.
  outcome: { border: 'borderSubtle', text: 'statusOutcome' },
})

/**
 * The tone for a booking, given the server status and whether the LIST derived
 * that an unanswered request has lapsed.
 *
 * `expired` is passed in rather than inferred because expiry is a client-side
 * derivation from `expires_at` (see `app/(tabs)/bookings.tsx`) and this module
 * does no time maths.
 */
export function badgeToneFor(status: string, expired = false): BadgeTone {
  if (expired) return 'outcome'
  const tone: BookingTone = bookingStatusTone(status)
  switch (tone) {
    case 'pending':
      return 'pending'
    case 'confirmed':
      return 'confirmed'
    case 'completed':
      return 'completed'
    default:
      // `cancelled` covers declined, cancelled, late_cancelled and no_show.
      return 'outcome'
  }
}

/** The two roles a badge paints, for a tone. */
export function badgeRoles(tone: BadgeTone): BadgeRoles {
  return TONE_ROLES[tone] ?? TONE_ROLES.outcome
}

/** Resolve a tone against a palette. */
export function badgeColors(
  tone: BadgeTone,
  colors: ThemeColors,
): Readonly<{ border: string; text: string }> {
  const roles = badgeRoles(tone)
  return { border: colors[roles.border], text: colors[roles.text] }
}

/**
 * Every role any status tone can use. Exported so a test can assert that
 * `statusDanger` is not among them — the guarantee, not the intention.
 */
export function rolesUsedByStatusTones(): ThemeRole[] {
  const seen = new Set<ThemeRole>()
  for (const tone of Object.keys(TONE_ROLES) as BadgeTone[]) {
    const { border, text } = TONE_ROLES[tone]
    seen.add(border)
    seen.add(text)
  }
  return [...seen]
}
