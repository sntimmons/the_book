import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/context/ThemeContext'

// A STATEMENT ABOUT AN OUTCOME. Approved nodes 191:68 and 191:94.
//
// Shared by the request-sent screen and the verification notice, because both do
// the same job: say plainly where things now stand, and offer the one or two things
// the person can do next.
//
// ══ WHY THERE IS NO STEP LABEL AND NO BACK CONTROL ════════════════════════
//
// A terminal statement is an OUTCOME, not a stage. Numbering it would make the
// booking indicator read "6 of 6" before the request was even sent, and then need a
// seventh to describe success — exactly the manufactured progress
// `lib/bookingProgress.ts` exists to prevent. There is deliberately no back
// affordance either: a completed irreversible step is not somewhere to return to.
//
// The verification screen passes `onBack` because it is a notice BEFORE the flow
// rather than after an irreversible step, and backing out of it is legitimate.

export type TerminalStatementProps = {
  /** Small caps line above the headline, e.g. BOOKING REQUEST SENT. */
  eyebrow?: string
  title: string
  /** Paragraphs, rendered in order. */
  body?: string[]
  /** Numbered "what happens next" rows. */
  steps?: { title: string; detail: string }[]
  /** Sticky actions, usually a primary and a tertiary Button. */
  actions?: ReactNode
  /** Only for a notice shown BEFORE an irreversible step. */
  onBack?: () => void
  /** Extra content between the body and the steps, e.g. a request summary. */
  children?: ReactNode
  testID?: string
}

export default function TerminalStatement({
  eyebrow,
  title,
  body = [],
  steps = [],
  actions,
  onBack,
  children,
  testID,
}: TerminalStatementProps) {
  const insets = useSafeAreaInsets()
  const { colors, type, scheme } = useTheme()

  return (
    <View style={[s.root, { backgroundColor: colors.bgCanvas }]} testID={testID}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* A back control ONLY when the caller supplies one. A statement that follows
          an irreversible step has nothing to go back to, so it offers none; a notice
          that precedes the flow does. `onBack` used to set only the top padding,
          which meant a caller could ask for a back control and silently not get
          one — the padding still moved, so it looked deliberate. */}
      {onBack ? (
        <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]}
          >
            <Feather name="chevron-left" size={22} color={colors.iconPrimary} />
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingTop: onBack ? 8 : insets.top + 96, paddingBottom: 24 },
        ]}
      >
        {eyebrow ? (
          <Text style={[type.caption, { color: colors.statusLocal }]} accessibilityRole="header">
            {eyebrow}
          </Text>
        ) : null}
        <Text style={[type.displayHero, { color: colors.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        {body.map((p, i) => (
          <Text key={i} style={[type.bodyDefault, { color: colors.textSecondary }]}>
            {p}
          </Text>
        ))}

        {children}

        {steps.length > 0 ? (
          <View style={s.steps}>
            {steps.map((step, i) => (
              <View
                key={step.title}
                style={[
                  s.step,
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
                ]}
              >
                <Text style={[type.labelMeta, { color: colors.statusLocal }]}>
                  {String(i + 1).padStart(2, '0')}
                </Text>
                <View style={s.stepText}>
                  <Text style={[type.titleCard, { color: colors.textPrimary }]}>{step.title}</Text>
                  <Text style={[type.bodySmall, { color: colors.textSecondary }]}>
                    {step.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {actions ? (
        <View
          style={[
            s.actions,
            { paddingBottom: insets.bottom + 16, backgroundColor: colors.bgSurface },
          ]}
        >
          {actions}
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  topBar: { paddingHorizontal: 20, paddingBottom: 4 },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 16, flexGrow: 1 },
  steps: { marginTop: 8 },
  step: { flexDirection: 'row', gap: 14, paddingVertical: 16, alignItems: 'flex-start' },
  stepText: { flex: 1, gap: 3 },
  actions: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
})
