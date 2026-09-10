import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ReportReason } from '@/lib/safety'

// ── WHY THIS IS A SHEET AND NOT AN `Alert.alert` ──────────────────────────
//
// Every report picker in Session 8 was built as an `Alert.alert` with one
// button per reason. On iOS that renders a long stack; **on Android
// `Alert.alert` displays AT MOST THREE BUTTONS** — it maps them onto the
// dialog's positive / negative / neutral slots and SILENTLY DROPS the rest.
//
// So on Android the provider report sheet showed three of its nine reasons and
// the community post sheet showed three of its five, with `Cancel` — the last
// element of the array — among the casualties. A person trying to report a
// safety concern got a dialog that did not contain "Safety concern" and could
// not be dismissed by any visible control. There was no error and no warning;
// the extra buttons simply did not exist.
//
// A list of choices is a list, so it is drawn as one. This also buys the thing
// the Alert could never have: **a free-text field**, without which "Something
// else" is a category that carries no information to the operator who reads it.

export interface ReportOption {
  label: string
  value: ReportReason
}

interface ReportSheetProps {
  visible: boolean
  /** Names who or what is being reported, e.g. "Report this provider". */
  title: string
  options: readonly ReportOption[]
  submitting?: boolean
  onCancel: () => void
  onSubmit: (reason: ReportReason, notes: string | null) => void
}

export default function ReportSheet({
  visible,
  title,
  options,
  submitting = false,
  onCancel,
  onSubmit,
}: ReportSheetProps) {
  const insets = useSafeAreaInsets()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [notes, setNotes] = useState('')

  // A reopened sheet starts empty. Carrying the previous selection over would
  // put a reason someone chose for one person in front of them for another.
  useEffect(() => {
    if (!visible) {
      setReason(null)
      setNotes('')
    }
  }, [visible])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={s.header}>
            <Text style={s.title}>{title}</Text>
            <TouchableOpacity
              onPress={onCancel}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={22} color="#F0E8D5" />
            </TouchableOpacity>
          </View>

          <Text style={s.prompt}>What is the problem?</Text>

          {/* A ScrollView, not a FlatList. The option list is FIXED and tiny —
              `REPORT_REASONS` is capped at 10 by test — so virtualization buys
              nothing and costs something real: a VirtualizedList measures
              asynchronously and updates state after mount, which inside a
              height-capped sheet with a keyboard is the least predictable place
              to put an async layout pass. It also made this component's own
              test intermittently fail on an update that arrived after teardown.
              A list you can count is a list you can render. */}
          <ScrollView
            style={s.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {options.map((item) => {
              const selected = item.value === reason
              return (
                <Pressable
                  key={item.value}
                  style={[s.row, selected && s.rowSelected]}
                  onPress={() => setReason(item.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[s.rowText, selected && s.rowTextSelected]}>
                    {item.label}
                  </Text>
                  {selected ? <Feather name="check" size={18} color="#C8922A" /> : null}
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Optional for every reason, not only "Something else": the operator
              reads the words, and a sentence of context is usually worth more
              than the label it arrived under. */}
          <TextInput
            style={s.notes}
            placeholder="Add anything that would help (optional)"
            placeholderTextColor="rgba(240,232,213,0.3)"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[s.submit, (!reason || submitting) && s.submitDisabled]}
            disabled={!reason || submitting}
            activeOpacity={0.85}
            onPress={() => reason && onSubmit(reason, notes.trim() || null)}
          >
            {submitting ? (
              <ActivityIndicator color="#080808" />
            ) : (
              <Text style={s.submitText}>Submit report</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 18, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  prompt: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
    marginBottom: 10,
  },
  // `flexShrink: 1` is load-bearing, and its absence is a real bug this
  // component nearly shipped. React Native's Yoga default for `flexShrink` is
  // **0**, unlike the web — so with `flexGrow: 0` and no shrink the list took
  // its full content height and refused to yield. With the nine-reason
  // taxonomy that measures past the sheet's 85% cap, and the overflow is at the
  // BOTTOM: the notes field and the Submit button.
  //
  // Which would have been the same failure this component was written to fix —
  // a report picker whose submit control does not exist on small phones —
  // arriving by a different mechanism. `minHeight` keeps the list from
  // collapsing to nothing when the keyboard is up.
  list: { flexGrow: 0, flexShrink: 1, minHeight: 120 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    marginBottom: 8,
  },
  rowSelected: { borderColor: '#C8922A', backgroundColor: 'rgba(200,146,42,0.08)' },
  rowText: { flex: 1, fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_400Regular' },
  rowTextSelected: { fontFamily: 'Manrope_700Bold' },
  notes: {
    minHeight: 72,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    textAlignVertical: 'top',
    marginTop: 4,
    marginBottom: 14,
  },
  submit: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.35 },
  submitText: { fontSize: 16, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
