import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTheme } from '@/context/ThemeContext'

// ONE ACKNOWLEDGE SHAPE FOR POLICY AND CONTRACT. Approved node 186:17.
//
// Both ask the client the same thing — read this, then say you have read it — so
// they share one control rather than two visual systems.
//
// ══ THIS IS NOT A SIGNATURE ═══════════════════════════════════════════════
//
// Checking it records an acknowledgement in the UI. Contract acceptance, version
// binding, stale-version refusal and the durable record are unchanged and live in
// the flow and the database, not here. Nothing about this component may be read as
// changing what acceptance means.

export type AcknowledgeRowProps = {
  label: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  testID?: string
}

export default function AcknowledgeRow({
  label,
  checked,
  onToggle,
  disabled = false,
  testID,
}: AcknowledgeRowProps) {
  const { colors, radius, type } = useTheme()

  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      activeOpacity={0.7}
      testID={testID}
      // Checkbox role + state, so the control is not communicated by tick alone.
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      style={[s.row, disabled && s.disabled]}
    >
      <View
        style={[
          s.box,
          {
            borderRadius: radius.sm - 2,
            backgroundColor: checked ? colors.actionPrimary : 'transparent',
            borderColor: checked ? colors.actionPrimary : colors.borderSubtle,
            borderWidth: checked ? 0 : 1.5,
          },
        ]}
      >
        {checked ? <Feather name="check" size={14} color={colors.textOnAction} /> : null}
      </View>
      <Text style={[type.bodyDefault, s.label, { color: colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    paddingVertical: 16,
    minHeight: 48, // touch target
  },
  box: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  // Long policy wording wraps rather than clipping.
  label: { flex: 1 },
  disabled: { opacity: 0.45 },
})
