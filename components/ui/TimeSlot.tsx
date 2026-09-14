import { StyleSheet, Text, TouchableOpacity } from 'react-native'
import { useTheme } from '@/context/ThemeContext'

// A REQUESTABLE TIME. Approved node 187:25.
//
// `available={false}` means the time sits outside the hours the provider published.
// It is dimmed — never struck through, never "taken", never counted. The product
// knows published hours, not who booked what, and this control must not imply
// otherwise. No scarcity or urgency language belongs here either.

export type TimeSlotProps = {
  time: string
  selected?: boolean
  available?: boolean
  onPress?: () => void
  testID?: string
}

export default function TimeSlot({
  time,
  selected = false,
  available = true,
  onPress,
  testID,
}: TimeSlotProps) {
  const { colors, radius, type } = useTheme()

  return (
    <TouchableOpacity
      onPress={available ? onPress : undefined}
      disabled={!available}
      activeOpacity={0.7}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={time}
      accessibilityState={{ selected, disabled: !available }}
      accessibilityHint={available ? undefined : 'Outside published hours'}
      style={[
        s.slot,
        {
          borderRadius: radius.full,
          backgroundColor: selected ? colors.actionPrimary : 'transparent',
          borderColor: selected ? colors.actionPrimary : colors.borderSubtle,
          borderWidth: selected ? 0 : 1,
        },
        !available && s.unavailable,
      ]}
    >
      <Text
        style={[type.labelAction, { color: selected ? colors.textOnAction : colors.textPrimary }]}
        numberOfLines={1}
      >
        {time}
      </Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  slot: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailable: { opacity: 0.35 },
})
