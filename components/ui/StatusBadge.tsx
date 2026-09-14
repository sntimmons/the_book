import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/context/ThemeContext'
import { badgeColors, badgeToneFor, type BadgeTone } from '@/lib/theme/statusTone'
import { bookingStatusLabel } from '@/lib/bookingStatus'

// THE STATUS PILL. An outline, never a filled blob, and never the danger family.
//
// The tone rules live in lib/theme/statusTone.ts so "Expired is not an error" is a
// tested guarantee rather than a styling habit. Pass `expired` when the LIST has
// derived that an unanswered request lapsed — this component does no time maths and
// the label then reads "Expired" rather than a stale "Pending".

export type StatusBadgeProps = {
  /** Raw booking status from the server. */
  status: string
  /** Did the caller derive that this pending request has lapsed? */
  expired?: boolean
  /** Override the label. The status is still what decides the tone. */
  label?: string
  testID?: string
}

export default function StatusBadge({ status, expired = false, label, testID }: StatusBadgeProps) {
  const { colors, radius, type } = useTheme()
  const tone: BadgeTone = badgeToneFor(status, expired)
  const { border, text } = badgeColors(tone, colors)
  const shown = label ?? (expired ? 'Expired' : bookingStatusLabel(status))

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={shown}
      style={[s.pill, { borderColor: border, borderRadius: radius.full }]}
    >
      <Text style={[type.caption, { color: text }]} numberOfLines={1}>
        {shown}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  pill: {
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
})
