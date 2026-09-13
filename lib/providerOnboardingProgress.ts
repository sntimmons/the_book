// PROVIDER ONBOARDING'S OWN COUNT OF ITSELF. Pure logic, no I/O — same split and
// same reason as lib/bookingProgress.ts: a step count is a claim about how much
// work is left, and it must match what the provider will actually be asked to do.
//
// ══ WHAT WAS WRONG ════════════════════════════════════════════════════════
//
// The sequence was index → **portfolio** → **reels** → services → availability →
// policy → review → golive, labelled "Step 1 of 7", "Step 2 of 7", "Step 3 of 7",
// "Step 4 of 7", nothing, nothing, "Step 7 of 7".
//
// Two problems, and the first is the serious one:
//
//   * **THE TWO OPTIONAL STEPS CAME FIRST.** Go Live requires profile basics, a
//     profile photo and one active service. Portfolio and Reels are NOT Go Live
//     blockers — yet they occupied steps 2 and 3, ahead of the one thing that is.
//     A provider asked to produce VIDEO at "Step 3 of 7" reasonably reads it as
//     required, and one who abandons there never reaches the service that would
//     have let them go live. Both screens had a "Skip for now" link, which softens
//     the signal without removing it: position is the stronger claim.
//
//   * **THE COUNT WAS WRONG ANYWAY.** Two of the seven screens carried no label at
//     all, so the provider went 4 → (blank) → (blank) → 7.
//
// ══ WHAT THIS IS ══════════════════════════════════════════════════════════
//
// The primary path, in order, counting only screens the provider actually passes
// through on the way to going live. Portfolio and Reels are NOT in it — they are
// growth work, offered after the readiness review and from the Business dashboard
// afterwards, and counting them would be exactly the manufactured progress the
// product principles forbid.
//
// Availability and policy ARE in it. Both are skippable, and that is not a
// contradiction: the count describes the screens on the path, while each screen
// says for itself whether it is required. What would be dishonest is a count that
// included work the provider will never be shown.
//
// ══ WHAT IS REQUIRED, STATED ONCE ═════════════════════════════════════════
//
// Go Live blockers, and the only ones: profile basics, profile photo, at least one
// active service. Availability is NOT required to have a visible profile — it is
// required for normal booking capability, which is a different claim and is said
// that way on the screen. This module does not decide any of that; it reflects it.

export type ProviderOnboardingStepKey =
  | 'basics'
  | 'services'
  | 'availability'
  | 'policy'
  | 'review'

/** The primary path to Go Live, in order. */
export const PROVIDER_ONBOARDING_STEPS: ProviderOnboardingStepKey[] = [
  'basics',
  'services',
  'availability',
  'policy',
  'review',
]

/**
 * Which steps block Go Live.
 *
 * Kept as data rather than prose so a screen can ask instead of restating it, and
 * so `__tests__` can assert that Portfolio and Reels are not among them.
 */
export const GO_LIVE_REQUIRED: ProviderOnboardingStepKey[] = ['basics', 'services']

/** Screens that are offered but never block going live. */
export const OPTIONAL_GROWTH = ['portfolio', 'reels'] as const
export type OptionalGrowthKey = (typeof OPTIONAL_GROWTH)[number]

export function isGoLiveRequired(step: ProviderOnboardingStepKey): boolean {
  return GO_LIVE_REQUIRED.includes(step)
}

/** 1-based position on the primary path, or null if the step is not on it. */
export function providerStepNumber(step: ProviderOnboardingStepKey): number | null {
  const i = PROVIDER_ONBOARDING_STEPS.indexOf(step)
  return i === -1 ? null : i + 1
}

export function providerStepTotal(): number {
  return PROVIDER_ONBOARDING_STEPS.length
}

/** "Step 2 of 5". Same shape as the rest of the app's progress labels. */
export function providerProgressLabel(step: ProviderOnboardingStepKey): string | null {
  const n = providerStepNumber(step)
  if (n === null) return null
  return `Step ${n} of ${providerStepTotal()}`
}

/**
 * The one-line requirement note a step shows about itself.
 *
 * Truthful about consequence rather than about importance — "you can add this
 * later" is a fact, and it is what stops a skippable screen reading as a gate. No
 * guilt, no urgency, no warning about what they will lose.
 */
export function providerStepRequirementNote(step: ProviderOnboardingStepKey): string | null {
  switch (step) {
    case 'basics':
      return 'Required to go live.'
    case 'services':
      return 'Required to go live — clients book a service, so you need at least one.'
    case 'availability':
      // Deliberately precise: this is not a Go Live blocker, but without it nobody
      // can book a time. Saying "optional" alone would be true and unhelpful.
      return 'You can go live without this, but clients cannot book a time until you set hours.'
    case 'policy':
      return 'Optional — we use sensible defaults until you change them.'
    case 'review':
      return null
    default:
      return null
  }
}
