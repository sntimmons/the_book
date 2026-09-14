import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppearance } from '@/context/ThemeContext'
import { APPEARANCES, type Appearance } from '@/lib/theme/tokens'
import Avatar from '@/components/ui/Avatar'

// ME → SETTINGS → APPEARANCE. PD-119.
//
// This screen is also the proof surface for the theme layer: every colour on it is
// a semantic role, so switching the option restyles the screen you are standing on.
// If something here is hardcoded, the switch visibly fails to reach it.
//
// ══ WHAT THIS SETTING IS NOT ══════════════════════════════════════════════
//
// It changes appearance and nothing else. The closing line says so in the UI rather
// than only in a decision document, because a settings row that silently changed
// visibility or privacy would be exactly the kind of thing users assume it might.

const OPTIONS: { key: Appearance; label: string; note: string }[] = [
  { key: 'system', label: 'System', note: 'Follows your device setting.' },
  { key: 'light', label: 'Light', note: 'Always the warm light appearance.' },
  { key: 'dark', label: 'Dark', note: 'Always the matte dark appearance.' },
]

export default function AppearanceScreen() {
  const insets = useSafeAreaInsets()
  const { theme, appearance, setAppearance, hydrated } = useAppearance()
  const { colors, radius, type } = theme

  return (
    <View style={[s.root, { backgroundColor: colors.bgCanvas }]}>
      <View
        style={[
          s.header,
          { paddingTop: insets.top + 4, backgroundColor: colors.bgSurface },
        ]}
      >
        <TouchableOpacity
          style={s.headerSide}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
        >
          <Ionicons name="chevron-back" size={22} color={colors.iconPrimary} />
        </TouchableOpacity>
        <Text style={[type.labelMeta, { color: colors.textSecondary }]}>Settings</Text>
        <View style={s.headerSide} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 26 }}
      >
        <View style={s.head}>
          <Text style={[type.displayScreen, { color: colors.textPrimary }]}>Appearance</Text>
          <Text style={[type.bodyDefault, { color: colors.textSecondary }]}>
            Choose how Third looks on this device.
          </Text>
        </View>

        <View
          accessibilityRole="radiogroup"
          style={[
            s.group,
            {
              backgroundColor: colors.bgSurface,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
          ]}
        >
          {OPTIONS.map((opt, i) => {
            // Until the stored value is read, nothing is drawn as selected — better
            // than showing a choice we are about to correct a frame later.
            const selected = hydrated && appearance === opt.key
            return (
              <TouchableOpacity
                key={opt.key}
                activeOpacity={0.7}
                onPress={() => setAppearance(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={`${opt.label}. ${opt.note}`}
                testID={`appearance-option-${opt.key}`}
                style={[
                  s.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
                ]}
              >
                <View style={s.rowText}>
                  <Text style={[type.titleCard, { color: colors.textPrimary }]}>{opt.label}</Text>
                  <Text style={[type.caption, { color: colors.textSecondary }]}>{opt.note}</Text>
                </View>
                <View
                  style={[
                    s.radio,
                    {
                      borderColor: selected ? colors.actionPrimary : colors.borderSubtle,
                      borderWidth: selected ? 6.5 : 1.5,
                    },
                  ]}
                />
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={[type.bodySmall, { color: colors.textSecondary }]}>
          This changes how Third looks. It does not change what you can see or do.
        </Text>

        {/* A live sample, so the choice is legible before leaving the screen. */}
        <View
          style={[
            s.preview,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.borderSubtle,
              borderRadius: radius.lg,
            },
          ]}
        >
          <Text style={[type.caption, { color: colors.statusLocal }]}>PREVIEW</Text>
          <View style={s.previewRow}>
            <Avatar name="Marcus Reed" size="large" />
            <View style={s.previewText}>
              <Text style={[type.titleCard, { color: colors.textPrimary }]}>Marcus Reed</Text>
              <Text style={[type.caption, { color: colors.textSecondary }]}>
                Barber · Third Ward
              </Text>
              {/* PD-112: published hours, never a free-slot claim. */}
              <Text style={[type.caption, { color: colors.statusLocal }]}>
                Open today · 9am – 7pm
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export { OPTIONS as APPEARANCE_OPTIONS, APPEARANCES }

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerSide: { width: 40 },
  head: { gap: 8 },
  group: { borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 17,
    minHeight: 64,
  },
  rowText: { flex: 1, gap: 3 },
  radio: { width: 22, height: 22, borderRadius: 11 },
  preview: { borderWidth: 1, padding: 18, gap: 12 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewText: { flex: 1, gap: 3 },
})
