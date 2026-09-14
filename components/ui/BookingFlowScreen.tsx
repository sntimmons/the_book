import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/context/ThemeContext'
import { StepProgress } from '@/components/StepProgress'

// ONE SHELL FOR EVERY REMAINING BOOKING STEP.
//
// Choose service, date and time, policy, contract and review-and-send all share the
// same chrome: a top bar carrying the derived step label, a scrolling body, and a
// sticky footer that holds the primary action. Approved frame 188:2.
//
// ══ WHY A COMPONENT AND NOT A COPIED BLOCK ════════════════════════════════
//
// The chrome was duplicated across six routes, which is how the old flow ended up
// with six slightly different top bars and two of them silently missing their step
// label. One shell means the safe-area maths, the back control and the progress
// slot exist once.
//
// ══ THE TITLE MOVED INTO THE BODY ═════════════════════════════════════════
//
// Each screen used to put its name in the top bar — "Select a Service", "Review
// Policy". The approved frames put it in the body as a display headline instead, so
// the bar carries only navigation and progress. That is a deliberate change, not an
// omission: it gives the step label a stable, uncrowded position on every screen.

export type BookingFlowScreenProps = {
  /**
   * Already derived by `lib/bookingProgress.ts`. Passing null renders nothing —
   * never an empty gap, and never a guessed total.
   */
  progressLabel: string | null
  onBack?: () => void
  /** Sticky footer content, usually a primary Button. */
  footer?: ReactNode
  children: ReactNode
  /** Extra bottom padding inside the scroll area, e.g. for a tall footer. */
  scrollPaddingBottom?: number
  /**
   * Set false when the body owns its own ScrollView. The contract step does:
   * its scroll position drives the open-before-accept gate, and nesting that
   * inside another scroll view would break both the gesture and the gate.
   */
  scrollable?: boolean
  testID?: string
}

export default function BookingFlowScreen({
  progressLabel,
  onBack,
  footer,
  children,
  scrollPaddingBottom = 24,
  scrollable = true,
  testID,
}: BookingFlowScreenProps) {
  const insets = useSafeAreaInsets()
  const { colors, scheme } = useTheme()

  return (
    <View style={[s.root, { backgroundColor: colors.bgCanvas }]} testID={testID}>
      {/* The bar follows the appearance rather than being pinned to one. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <View
        style={[
          s.topBar,
          { paddingTop: insets.top + 12, backgroundColor: colors.bgSurface },
        ]}
      >
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={s.back}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="booking-flow-back"
          >
            <Feather name="chevron-left" size={22} color={colors.iconPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={s.back} />
        )}

        <View style={s.progressSlot}>
          <StepProgress label={progressLabel} />
        </View>

        {/* Balances the back control so the label stays optically centred. */}
        <View style={s.back} />
      </View>

      {scrollable ? (
        <ScrollView
          style={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scrollContent, { paddingBottom: scrollPaddingBottom }]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.scroll, s.scrollContent]}>{children}</View>
      )}

      {footer ? (
        <View
          style={[
            s.footer,
            {
              // The sticky action clears the home indicator on every device.
              paddingBottom: insets.bottom + 16,
              backgroundColor: colors.bgSurface,
              borderTopColor: colors.borderSubtle,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  )
}

/** The display headline each step opens with. */
export function BookingFlowHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors, type } = useTheme()
  return (
    <View style={s.heading}>
      <Text style={[type.displayScreen, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle ? (
        <Text style={[type.bodyDefault, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

/**
 * The Cypress-edged note the approved frames use to state what a step actually
 * means — published hours, what sending does, who settles payment. It is a rule,
 * not decoration, so it is a named component rather than an ad-hoc View.
 */
export function BookingFlowNote({ title, body }: { title: string; body?: string }) {
  const { colors, type } = useTheme()
  return (
    <View style={[s.note, { borderLeftColor: colors.statusLocal }]}>
      <Text style={[type.titleCard, { color: colors.textPrimary }]}>{title}</Text>
      {body ? (
        <Text style={[type.bodySmall, { color: colors.textSecondary }]}>{body}</Text>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  back: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  progressSlot: { flex: 1, alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 26, gap: 22 },
  footer: { paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, gap: 10 },
  heading: { gap: 8 },
  note: { borderLeftWidth: 3, paddingLeft: 14, gap: 6 },
})
