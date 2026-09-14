import { Text } from 'react-native'
import { useTheme } from '@/context/ThemeContext'

// ── ONE PROGRESS LABEL, SO THE APP COUNTS ITSELF THE SAME WAY EVERYWHERE ──
//
// Provider onboarding and client onboarding both showed progress by typing
// `Step 2 of 7` into a `<Text>` on each screen. That worked and it is the pattern
// this component preserves — same typography, same position in the top bar — but a
// literal on every screen has two failure modes that both appeared in this app:
//
//   * IT DRIFTS. The count lives in seven places, so inserting or reordering a
//     step means editing all of them, and a missed one is a silent lie.
//   * IT CANNOT EXPRESS "NOT YET KNOWN". The booking flow has a conditional step,
//     so its total genuinely varies — see lib/bookingProgress.ts. A literal has to
//     guess, and guessing is how an indicator overstates remaining work.
//
// So the label is passed in, computed by the flow that owns the count, and this
// component only renders it. A null label renders nothing rather than an empty gap,
// which is what lets a caller say "I do not know the total yet" honestly.
//
// ── WHAT THIS IS DELIBERATELY NOT ────────────────────────────────────────
//
// Not a progress BAR, and not a percentage. A bar implies a proportion of work
// done, which invites the fake-progress problem the product principles forbid: a
// half-filled bar on a step the user might skip is a claim nobody can support. A
// count says exactly what is true — which step this is, and how many there are.
//
// It also never says "done", "complete" or "finished". In the booking flow the last
// step is SENDING, and the user still has to do it.
// ── NOW THEMED, AND DELIBERATELY THE SAME WEIGHT ─────────────────────────
//
// The literal was `rgba(240,232,213,0.45)` on the `#080808` top bars every caller
// still draws — an effective `#706D64`, about 4.1:1. The `textSecondary` role is
// `#72766D` on light and `#D8CEC2` on dark, which is ~4.3:1 and far higher
// respectively against that same background. So this swap is equal-or-better
// contrast under both appearances on screens that have NOT been migrated yet, which
// is what made it safe to theme this component ahead of its hosts.
export function StepProgress({ label }: { label: string | null }) {
  const { colors, type } = useTheme()
  if (!label) return null
  return <Text style={[type.bodySmall, { color: colors.textSecondary }]}>{label}</Text>
}

export default StepProgress
