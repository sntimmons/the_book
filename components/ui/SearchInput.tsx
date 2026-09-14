import { StyleSheet, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { useTheme } from '@/context/ThemeContext'

// SEARCH IS INTENT. Typed intent outranks popularity in results (PD-116), so the
// field is a real control and never decorative.

export type SearchInputProps = {
  value: string
  onChangeText: (next: string) => void
  placeholder?: string
  onSubmitEditing?: () => void
  accessibilityLabel?: string
  testID?: string
}

export default function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search providers and services',
  onSubmitEditing,
  accessibilityLabel,
  testID,
}: SearchInputProps) {
  const { colors, radius, type } = useTheme()
  const [focused, setFocused] = useState(false)

  return (
    <View
      style={[
        s.wrap,
        {
          backgroundColor: colors.bgSurface,
          borderRadius: radius.md,
          borderColor: focused ? colors.actionPrimary : colors.borderSubtle,
          borderWidth: focused ? 1.5 : 1,
        },
      ]}
    >
      <Ionicons name="search" size={18} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        testID={testID}
        style={[type.bodyDefault, s.input, { color: colors.textPrimary }]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, minHeight: 48 },
  input: { flex: 1, paddingVertical: 13 },
})
