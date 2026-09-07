import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'

/**
 * ONE optional free-text reason box, with its disclosure above the input and its submit beneath.
 *
 * WHY THIS COMPONENT EXISTS. The no-show composer and the cancellation composer were two
 * near-identical JSX blocks in `app/community/negotiation/[id].tsx`, differing only in four bound
 * values. That is a maintenance hazard rather than a bug: the rule PD-060/PD-062 actually set is
 * about STRUCTURE — the disclosure must sit ABOVE the input, before the writer commits — and a
 * rule about layout enforced by two hand-authored copies and a reviewer's eye is a rule that
 * drifts. A third composer is likely when adjudication lands.
 *
 * SHARED IMPLEMENTATION, NOT SHARED MEANING. The two reasons are DIFFERENT products and must
 * stay so: a cancellation reason explains why someone is ending a trade, a no-show reason is one
 * participant's account of an appointment that did not happen. Their copy, their length rules and
 * their readership are supplied by the caller and are NOT unified here. This component owns the
 * SHAPE — disclosure, input, submit — and nothing about what any particular reason means.
 *
 * IT DECIDES NOTHING. No validation, no payload shaping, no visibility rule: the caller owns all
 * three, because those are the parts that differ and the parts a test can reach in `lib/`.
 */
export interface ReasonComposerProps {
  /**
   * The disclosure, rendered ABOVE the input. Required, not optional: every reason in this
   * product is shared with the other provider, and a composer that could be rendered without
   * saying so is the one shape PD-060/PD-062 rule out.
   */
  note: string
  placeholder: string
  value: string
  onChangeText: (text: string) => void
  /** The same bound the server enforces. Supplied per reason; they are not required to match. */
  maxLength: number
  submitLabel: string
  onSubmit: () => void
  /** Disables the control while a write is in flight. The caller owns the busy state. */
  busy?: boolean
}

export default function ReasonComposer({
  note,
  placeholder,
  value,
  onChangeText,
  maxLength,
  submitLabel,
  onSubmit,
  busy = false,
}: ReasonComposerProps) {
  return (
    <View style={styles.block}>
      {/* ABOVE the input, and that ordering is the point rather than an aesthetic: someone
          writing about a counterparty must be told who reads it BEFORE they write, not after. */}
      <Text style={styles.note}>{note}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="rgba(240,232,213,0.35)"
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        multiline
      />
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={onSubmit}
        >
          <Text style={styles.btnText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// LIFTED VERBATIM from the two blocks this replaces — `cancelBlock`, `cancelDetail`, `input`,
// `actions`, `secondaryBtn`, `btnDisabled` and `secondaryText` in
// app/community/negotiation/[id].tsx. Copied value-for-value rather than re-authored, because
// this cleanup is behaviour-preserving and a "tidier" style here would be a visual change
// smuggled in under a refactor.
const styles = StyleSheet.create({
  block: { marginTop: 16 },
  note: {
    color: 'rgba(240,232,213,0.75)',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  input: {
    marginTop: 4,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.18)',
    color: '#F0E8D5',
    fontSize: 14,
    minHeight: 44,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.25)',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'rgba(240,232,213,0.8)', fontSize: 13, fontWeight: '500' },
})
