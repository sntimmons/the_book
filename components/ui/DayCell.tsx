import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '@/context/ThemeContext'

// ONE DAY IN THE DATE STRIP. Approved node 187:18.
//
// `available={false}` means the provider published NO HOURS that day. It is not a
// live capacity read, and nothing here may be labelled as one — no "full", no
// "taken", no count of remaining slots. Unavailable is dimmed and unpressable,
// which says "not offered" without inventing a reason.

export type DayCellProps = {
  /**
   * Shown above the number in a date STRIP. Omitted in a month GRID, where the
   * column header already names the weekday — the approved frame shows a strip,
   * but the shipped picker is a month grid with month navigation, and one
   * component serves both rather than two that drift apart.
   */
  weekday?: string
  day: string
  selected?: boolean
  today?: boolean
  available?: boolean
  /** The small dot a month grid uses to mark a day with published hours. */
  showAvailabilityDot?: boolean
  /** Fixed square size for grid use; the strip uses the default. */
  size?: number
  onPress?: () => void
  accessibilityLabel?: string
  testID?: string
}

export default function DayCell({
  weekday,
  day,
  selected = false,
  today = false,
  available = true,
  showAvailabilityDot = false,
  size,
  onPress,
  accessibilityLabel,
  testID,
}: DayCellProps) {
  const { colors, radius, type } = useTheme()
  const tint = selected ? colors.textOnAction : colors.textPrimary

  return (
    <TouchableOpacity
      onPress={available ? onPress : undefined}
      disabled={!available}
      activeOpacity={0.7}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${weekday} ${day}`}
      accessibilityState={{ selected, disabled: !available }}
      // The state is also in the accessibility payload, never colour alone.
      accessibilityHint={available ? undefined : 'No hours published for this day'}
      style={[
        s.cell,
        size ? { width: size, height: size, minHeight: size } : null,
        {
          borderRadius: radius.md,
          backgroundColor: selected ? colors.actionPrimary : 'transparent',
          borderColor: today && !selected ? colors.borderSubtle : 'transparent',
          borderWidth: today && !selected ? 1.5 : 0,
        },
        !available && s.unavailable,
      ]}
    >
      {weekday ? (
        <Text
          style={[type.caption, { color: selected ? colors.textOnAction : colors.textSecondary }]}
        >
          {weekday}
        </Text>
      ) : null}
      <Text style={[type.labelMeta, s.day, { color: tint }]}>{day}</Text>
      {showAvailabilityDot && !selected ? (
        <View style={[s.dot, { backgroundColor: colors.statusLocal }]} />
      ) : null}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  cell: { width: 46, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 2 },
  day: { fontFamily: 'Manrope_600SemiBold' },
  unavailable: { opacity: 0.35 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
})
