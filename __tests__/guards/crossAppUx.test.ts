import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  GO_LIVE_REQUIRED,
  OPTIONAL_GROWTH,
  PROVIDER_ONBOARDING_STEPS,
  isGoLiveRequired,
  providerProgressLabel,
  providerStepRequirementNote,
} from '@/lib/providerOnboardingProgress'
import { BETA_CITY } from '@/lib/areas'

// ── CROSS-APP UX CORRECTIONS ──────────────────────────────────────────────
//
// Source-level guards for the structural UX changes, in the same style as
// `betaClaimsAbsent.test.ts` and for the same reason: every one of these is a
// one-line change to make and a one-line change to undo, and none of them would
// fail a typecheck. A misleading CTA is not a type error.
//
// Comments are stripped before matching, because several of these files
// deliberately CONTAIN the wording being forbidden, in a note explaining why the
// code no longer says it.

const ROOT = join(__dirname, '..', '..')
const code = (rel: string): string =>
  readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

// ══ BOOKING: THE CTA THAT CLAIMED TO SEND, AND DELETED PHOTOS ═════════════
//
// `app/book/message.tsx` read "Skip, send request without a message" three screens
// before anything was sent — and `handleSkip` cleared `bookingPhotos` on the way,
// silently discarding reference photos the client had attached.
//
// The message and the photos are SEPARATE booking inputs. "I have nothing to say"
// is not "throw away the pictures of what I want", and the photos are often the
// more useful half for the provider.
describe('the booking message step no longer claims to send the request', () => {
  const src = code('app/book/message.tsx')

  it('does not say the request is being sent', () => {
    expect(src).not.toMatch(/send request/i)
    expect(src).toContain('Continue without a message')
  })

  it('SKIPPING DOES NOT DISCARD REFERENCE PHOTOS — the behaviour rule', () => {
    // The precise regression. `setBookingPhotos([])` inside the skip handler is the
    // destructive line; it must not come back.
    const skip = /function handleSkip\(\)\s*\{([\s\S]*?)\n  \}/.exec(src)
    expect(skip).not.toBeNull()
    expect(skip![1]).not.toMatch(/setBookingPhotos/)
    // It still clears the message, which is the one thing the control is about.
    expect(skip![1]).toMatch(/setBookingMessage\(''\)/)
  })

  it('still advances the flow rather than submitting', () => {
    expect(code('app/book/message.tsx')).toMatch(/router\.push\('\/book\/policy'\)/)
  })
})

describe('every booking screen shows where the client is', () => {
  const SCREENS = [
    'app/book/service.tsx',
    'app/book/datetime.tsx',
    'app/book/message.tsx',
    'app/book/policy.tsx',
    'app/book/contract.tsx',
    'app/book/payment.tsx',
  ] as const

  // Every step still shows where the client is. Since the flow shell landed, a
  // screen may render StepProgress directly OR hand its derived label to
  // BookingFlowScreen, which renders it. Both are checked, and so is the shell —
  // otherwise "uses the shell" could become a way to show nothing at all.
  it.each(SCREENS)('%s renders the shared progress label', (rel) => {
    const s = code(rel)
    const direct = s.includes('StepProgress')
    const viaShell = s.includes('BookingFlowScreen') && /progressLabel=\{/.test(s)
    expect(direct || viaShell).toBe(true)
    expect(s).toMatch(/bookingProgressLabel\('(service|datetime|message|policy|contract|send)'/)
  })

  it('the shared flow shell actually renders the progress label', () => {
    const shell = code('components/ui/BookingFlowScreen.tsx')
    expect(shell).toContain('StepProgress')
    expect(shell).toMatch(/label=\{progressLabel\}/)
  })

  it('a null label renders nothing rather than an invented total', () => {
    // StepProgress owns this; the shell must pass the value straight through.
    expect(code('components/StepProgress.tsx')).toMatch(/if \(!label\) return null/)
  })

  it('no booking screen hard-codes a step count', () => {
    // The whole point: one conditional step means a literal is a lie on one path.
    for (const rel of SCREENS) {
      expect(code(rel)).not.toMatch(/Step \d+ of \d+/)
    }
  })
})

// ══ PROVIDER ONBOARDING: REQUIRED BEFORE OPTIONAL ════════════════════════
//
// The sequence was index → portfolio → reels → services. Portfolio and Reels are
// not Go Live blockers; the service is. So the two optional screens occupied steps
// 2 and 3, ahead of the only required one, and a provider who stopped at the video
// step never reached it.
describe('provider onboarding puts required setup before optional growth work', () => {
  it('the required path does not contain portfolio or reels', () => {
    for (const optional of OPTIONAL_GROWTH) {
      expect(PROVIDER_ONBOARDING_STEPS).not.toContain(optional as never)
    }
  })

  it('service comes immediately after basics', () => {
    expect(PROVIDER_ONBOARDING_STEPS[0]).toBe('basics')
    expect(PROVIDER_ONBOARDING_STEPS[1]).toBe('services')
  })

  it('basics and a service are the Go Live blockers, and nothing else is', () => {
    expect(GO_LIVE_REQUIRED).toEqual(['basics', 'services'])
    expect(isGoLiveRequired('availability')).toBe(false)
    expect(isGoLiveRequired('policy')).toBe(false)
  })

  it('the first screen now hands off to the service step', () => {
    const s = code('app/onboarding/provider/index.tsx')
    expect(s).toMatch(/router\.push\('\/onboarding\/provider\/services'\)/)
    expect(s).not.toMatch(/router\.push\('\/onboarding\/provider\/portfolio'\)/)
  })

  it('portfolio and reels are no longer steps and no longer chain forward', () => {
    for (const rel of ['app/onboarding/provider/portfolio.tsx', 'app/onboarding/provider/reels.tsx']) {
      const s = code(rel)
      // No step number: they are not stages on the way to going live.
      expect(s).not.toMatch(/Step \d+ of \d+/)
      // And they return to where they were opened from rather than pushing deeper
      // into steps the provider has already completed.
      expect(s).not.toMatch(/router\.push\('\/onboarding\/provider\//)
      expect(s).toMatch(/router\.back\(\)/)
    }
  })

  it('they remain reachable — offered from the readiness review', () => {
    // Moving them out of the sequence is only safe if it stays obvious where they
    // can be done later.
    const s = code('app/onboarding/provider/review.tsx')
    expect(s).toMatch(/onboarding\/provider\/portfolio/)
    expect(s).toMatch(/onboarding\/provider\/reels/)
    expect(s).toMatch(/[Oo]ptional/)
  })

  it('progress counts the real path and nothing more', () => {
    expect(providerProgressLabel('basics')).toBe('Step 1 of 5')
    expect(providerProgressLabel('services')).toBe('Step 2 of 5')
    expect(providerProgressLabel('review')).toBe('Step 5 of 5')
  })

  it('each step states its own requirement rather than relying on position', () => {
    expect(providerStepRequirementNote('services')).toMatch(/required/i)
    // Availability is NOT a Go Live blocker, and the note says the consequence
    // instead of calling it optional and leaving it there.
    const availability = providerStepRequirementNote('availability') ?? ''
    expect(availability).toMatch(/cannot book/i)
    expect(providerStepRequirementNote('policy')).toMatch(/optional/i)
  })

  it('no requirement note pressures, shames or invents urgency', () => {
    for (const step of PROVIDER_ONBOARDING_STEPS) {
      const note = providerStepRequirementNote(step) ?? ''
      expect(note).not.toMatch(/\b(hurry|now or|don't miss|lose|losing|warning|must act)\b/i)
      expect(note).not.toMatch(/!$/)
    }
  })
})

// ══ NEIGHBOURHOOD: TWO FIELDS, TWO MEANINGS ══════════════════════════════
//
// `golive` wrote the same value into `location` and `neighborhood`. lib/discovery.ts
// reads them as different granularities — `neighborhood` for an exact match,
// `location` through `cityOf()` for a city fallback — and `lib/areas.ts` yields bare
// area names, so `cityOf('Midtown')` returned 'Midtown' and the city tier could
// never match. The fallback existed and did nothing.
describe('provider location and neighbourhood are different concepts', () => {
  const s = code('app/onboarding/provider/golive.tsx')

  it('the city constant is stated once and carries a comma for cityOf()', () => {
    expect(BETA_CITY).toBe('Houston, TX')
    expect(BETA_CITY).toContain(',')
  })

  it('location gets the city and neighbourhood gets the picked area', () => {
    expect(s).toMatch(/location:\s*cityValue/)
    expect(s).toMatch(/neighborhood:\s*neighborhoodValue/)
  })

  it('the two columns are no longer written from one value', () => {
    expect(s).not.toMatch(/location:\s*locationValue,\s*\n\s*neighborhood:\s*locationValue/)
  })

  it('a neighbourhood is required to finish the profile step', () => {
    expect(code('app/onboarding/provider/index.tsx')).toMatch(/location\.trim\(\)\.length > 0/)
  })

  it('NO PRECISE LOCATION IS COLLECTED OR DERIVED', () => {
    // The guardrail on this whole item: a fixed list of areas, and nothing else.
    for (const rel of ['app/onboarding/provider/golive.tsx', 'app/onboarding/provider/index.tsx']) {
      const src = code(rel)
      expect(src).not.toMatch(/\blatitude\b|\blongitude\b|\blat\b\s*[:,]|geocod/i)
      expect(src).not.toMatch(/street_address|postal_code|\bzip\b/i)
    }
  })
})

// ══ SETTINGS: CONTROLS THAT DID NOTHING ══════════════════════════════════
//
// Ten rows were `Alert.alert(title, 'Coming soon')`. Two of them were Privacy
// Policy and Terms of Service; two more were Contact Support and Report an Issue.
describe('Settings shows no control that does nothing', () => {
  const s = code('app/settings/index.tsx')

  it('the stub helper is gone along with its callers', () => {
    // It was one line, and that cheapness is why there were ten of these.
    expect(s).not.toMatch(/function stub\(/)
    expect(s).not.toMatch(/'Coming soon'/)
  })

  const REMOVED = [
    'Phone Number',
    'Email',
    'Payment Methods',
    'Profile Visibility',
    'Identity Verification',
    'Help Center',
    'Contact Support',
    'Report an Issue',
    'Terms of Service',
    'Privacy Policy',
  ] as const

  it.each(REMOVED)('the "%s" row is absent', (label) => {
    expect(s).not.toContain(`label="${label}"`)
  })

  it('NO FAKE DESTINATION was invented for support or legal', () => {
    // Removing them is the point; a mailto to an unmonitored inbox or a placeholder
    // document would keep the same lie behind better wording.
    expect(s).not.toMatch(/mailto:/i)
    expect(s).not.toMatch(/placeholder/i)
    expect(s).not.toMatch(/terms-of-service|privacy-policy/i)
  })

  it('what is real stays: Personal Information, Blocked Accounts, Delete Account', () => {
    expect(s).toContain('label="Personal Information"')
    expect(s).toContain('label="Blocked Accounts"')
    expect(s).toContain('label="Delete Account"')
  })
})

// ══ PAYOUTS ══════════════════════════════════════════════════════════════
describe('the provider dashboard implies no payout capability', () => {
  const s = code('app/(tabs)/business/index.tsx')

  it('the "View payouts" control is gone', () => {
    expect(s).not.toContain('View payouts')
    expect(s).not.toMatch(/business\/payouts/)
  })

  it('COMPLETED SERVICE VALUE stays, and is not renamed to money language', () => {
    expect(s).toContain('COMPLETED SERVICE VALUE')
    for (const banned of ['Earnings', 'EARNINGS', 'Balance', 'BALANCE', 'Payout', 'Wallet']) {
      expect(s).not.toContain(`>${banned}<`)
    }
  })
})

// ══ BOOKINGS LIST: EXPIRED ═══════════════════════════════════════════════
describe('the bookings list distinguishes an expired request from a live one', () => {
  const s = code('app/(tabs)/bookings.tsx')

  it('selects the column expiry is derived from', () => {
    expect(s).toMatch(/expires_at/)
  })

  it('derives expiry rather than reading it from the status enum', () => {
    expect(s).toMatch(/bookingRequestUrgency/)
  })

  // The "Expired" LABEL moved into the shared StatusBadge when the list was
  // migrated onto the theme system. The guarantee is unchanged and is now asserted
  // in two halves: the list still derives expiry and hands the answer to the badge,
  // and the badge is what says the word.
  it('hands the derived answer to the shared badge', () => {
    expect(s).toMatch(/<StatusBadge[\s\S]*expired=\{expired\}/)
  })

  it('says "Expired" where the badge now owns the label', () => {
    const badge = code('components/ui/StatusBadge.tsx')
    expect(badge).toMatch(/'Expired'/)
  })

  it('shows no raw enum value to the user', () => {
    // Labels come from bookingStatusLabel; the badge must not print `status` itself.
    expect(s).not.toMatch(/<Text[^>]*>\{status\}<\/Text>/)
    const badge = code('components/ui/StatusBadge.tsx')
    expect(badge).toMatch(/bookingStatusLabel/)
    expect(badge).not.toMatch(/<Text[^>]*>\{status\}<\/Text>/)
  })

  it('keeps an expired request out of the danger family', () => {
    // The tone rules are pure and separately tested; this guard exists so a future
    // edit to the BADGE cannot quietly reintroduce a red Expired.
    const tone = code('lib/theme/statusTone.ts')
    expect(tone).not.toMatch(/statusDanger/)
  })

  it('does not blame the provider for a deadline passing', () => {
    expect(s).not.toMatch(/didn'?t respond|failed to respond|ignored/i)
  })
})

// ══ MESSAGING ════════════════════════════════════════════════════════════
describe('an unavailable conversation is explained without leaking why', () => {
  // Read from SOURCE rather than imported: `lib/safety.ts` pulls in the Supabase
  // client, which refuses to construct without public env config — the same reason
  // betaClaimsAbsent.test.ts is source-level.
  const refused = (() => {
    const src = code('lib/safety.ts')
    const m = /export const MESSAGE_REFUSED_COPY = \{([\s\S]*?)\n\}/.exec(src)
    if (m === null) throw new Error('MESSAGE_REFUSED_COPY not found in lib/safety.ts')
    return m[1]
  })()

  it('states that messaging is unavailable, in plain language', () => {
    expect(refused).toMatch(/not available/i)
  })

  it('does not invite a retry that will never succeed', () => {
    // Shown only for refusals the SERVER stated, which a retry cannot change.
    // "right now" implied otherwise.
    expect(refused).not.toMatch(/right now/i)
    expect(refused).not.toMatch(/try again/i)
  })

  it('NAMES NO CAUSE — PD-082: a blocked person is never told they were blocked', () => {
    expect(refused).not.toMatch(/\b(block|report|deactiv|delet|suspend|restrict)/i)
  })
})

// ══ REVIEWS: THE BLIND WINDOW ════════════════════════════════════════════
describe('the review confirmation explains why the review is not visible yet', () => {
  const s = code('app/post-booking/submitted.tsx')

  it('confirms the submission succeeded', () => {
    expect(s).toMatch(/Review submitted/)
  })

  it('says when it becomes visible, including the 7 days', () => {
    expect(s).toMatch(/7 days/)
    expect(s).toMatch(/becomes visible/i)
  })

  it('reveals nothing about whether the other person has reviewed', () => {
    // "once they review you too" is a CONDITION. A report of their activity — "they
    // have not reviewed you yet" — would be the leak.
    expect(s).not.toMatch(/has not (yet )?review|hasn'?t review|is waiting to review/i)
  })

  it('exposes no reputation internals', () => {
    expect(s).not.toMatch(/rating_client_count|canonical|distinct client|recompute/i)
  })
})

// ══ PROVIDER PROFILE: SOCIAL IS NOT QUALITY ══════════════════════════════
describe('the provider profile does not present followers as a trust stat', () => {
  const s = code('components/ProviderProfile.tsx')

  // Phase 3B rebuilt this screen from the approved Figma composition, so the
  // old `<StatCol label="Bookings" />` row is gone. These assertions moved from
  // the MARKUP to the BEHAVIOUR, which is what the rule was ever about — and
  // they got stricter: there is now no stat row for a follower count to sit in,
  // so the count must not be rendered anywhere on the profile at all.
  it('renders no follower or following count anywhere', () => {
    expect(s).not.toMatch(/label="Followers"/)
    expect(s).not.toMatch(/label="Following"/)
    // The count is never read into the tree, under any casing.
    expect(s).not.toMatch(/\{\s*provider\.follow(er|ing)Count/)
    expect(s).not.toMatch(/>\s*\{?\s*follow(er|ing)Count/i)
  })

  it('it still carries the marketplace facts', () => {
    // Completed bookings and the rating, each through the one helper that owns
    // how it may be phrased.
    expect(s).toMatch(/completedBookingsLine/)
    expect(s).toMatch(/reputationLine/)
    expect(s).toMatch(/ratingClientLabel/)
  })

  it('the follow feature itself is untouched', () => {
    // Demotion, not deletion. The profile still reads the live count.
    expect(code('app/providers/[id].tsx')).toMatch(/provider_follower_count/)
  })
})

// ══ REELS ════════════════════════════════════════════════════════════════
describe('Reels shows no unreachable or misleading state', () => {
  const s = code('app/(tabs)/reels.tsx')

  it('the "Available" badge and its dead flag are gone', () => {
    expect(s).not.toMatch(/providerAvailable/)
    expect(s).not.toMatch(/availText/)
  })

  it('a built feature no longer reports itself unbuilt', () => {
    expect(s).not.toMatch(/'Coming soon'/)
    // The honest distinction is about the ITEM, not the feature.
    expect(s).toMatch(/sample/i)
  })
})

// ══ COMMUNITY: PROGRESSIVE DISCLOSURE ════════════════════════════════════
//
// This was already implemented before this pass — the fields are gated per intent
// in both the render and the payload. Pinned because it is exactly the kind of
// conditional that a later "simplify the composer" edit would flatten.
describe('the Community composer shows only the fields the chosen intent needs', () => {
  const s = code('app/community/compose.tsx')

  it('gates each secondary field on the intent', () => {
    expect(s).toMatch(/const wantsService = intent !== 'shoutout'/)
    expect(s).toMatch(/const wantsArea = intent === 'looking_for'/)
    expect(s).toMatch(/const wantsTiming = intent === 'looking_for'/)
  })

  it('applies the gates in the render, not only in the payload', () => {
    expect(s).toMatch(/\{wantsService \?/)
    expect(s).toMatch(/\{wantsArea \?/)
    expect(s).toMatch(/\{wantsTiming \?/)
  })

  it('does not send a field the chosen intent never showed', () => {
    expect(s).toMatch(/serviceTag: wantsService \?/)
    expect(s).toMatch(/area: wantsArea \?/)
    expect(s).toMatch(/timing: wantsTiming \?/)
  })
})

// ══ BARTER: ONE NAME PER ACT ═════════════════════════════════════════════
//
// Four names for expressing interest, three for proposing terms. No state name
// changed — this is vocabulary only.
describe('barter uses one phrase per concept', () => {
  const FILES = [
    'app/community/barter.tsx',
    'app/community/negotiation/[id].tsx',
    'app/community/barter-interests.tsx',
    'lib/negotiationState.ts',
  ] as const

  it.each(FILES)('%s uses no retired synonym', (rel) => {
    if (!existsSync(join(ROOT, rel))) return
    const s = code(rel)
    expect(s).not.toMatch(/Express interest/)
    expect(s).not.toMatch(/Send interest/)
    expect(s).not.toMatch(/Send terms/)
    expect(s).not.toMatch(/Send different terms/)
    expect(s).not.toMatch(/express interest in/)
  })

  it('interest is offered under one name', () => {
    expect(code('app/community/barter.tsx')).toMatch(/I&apos;m interested/)
  })

  it('proposing terms is called proposing, first time and after', () => {
    const s = code('app/community/negotiation/[id].tsx')
    expect(s).toMatch(/Propose terms/)
    expect(s).toMatch(/Propose different terms/)
  })
})

// ══ NO NEW FALSE CAPABILITY CLAIM ════════════════════════════════════════
//
// The whole pass removed claims; this is the check that it did not add one while
// rewriting copy.
describe('this pass introduced no new beta capability claim', () => {
  const TOUCHED = [
    'app/book/message.tsx',
    'app/book/service.tsx',
    'app/settings/index.tsx',
    'app/(tabs)/business/index.tsx',
    'app/(tabs)/bookings.tsx',
    'app/(tabs)/reels.tsx',
    'app/post-booking/submitted.tsx',
    'components/ProviderProfile.tsx',
    'components/StepProgress.tsx',
    'app/onboarding/provider/index.tsx',
    'app/onboarding/provider/golive.tsx',
    'app/onboarding/provider/review.tsx',
  ] as const

  it.each(TOUCHED)('%s claims no payment, verification, payout or SLA', (rel) => {
    const s = code(rel)
    expect(s).not.toMatch(/\bverified ID|ID verified\b/i)
    expect(s).not.toMatch(/payment method|payout|refund/i)
    expect(s).not.toMatch(/within \d+ (hours?|days?)[^.]{0,40}(respond|review|support)/i)
    expect(s).not.toMatch(/\bguaranteed\b/i)
    expect(s).not.toMatch(/\bAvailable Now\b/)
  })
})
