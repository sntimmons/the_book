import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import {
  REPORT_FAILED_COPY,
  REPORT_LIMITED_COPY,
  submitReport,
  type BookingIssueReason,
} from '@/lib/safety'

// ITEM E (Correction 3): 'Billing issue' is gone. The Book takes no payment in
// this beta (PD-042) — there is no charge, no hold and no refund path — so
// offering the category invited a report about a transaction the product never
// made and had no way to resolve. Payment is arranged directly with the provider,
// and a dispute about it is between those two people. 'Other' still accepts
// anything this list does not name.
// ONE DECLARATION, LABEL AND SLUG TOGETHER.
//
// These were two structures: a `string[]` of labels and a
// `Record<string, BookingIssueReason>` keyed by the label text, with a silent
// `?? 'other'` fallback at the call site. `Record<string, …>` cannot notice a
// key that no longer matches any label — so REWORDING A CHIP, the most ordinary
// edit on this screen and a pure copy change, silently reclassified every report
// filed under it as `other` in the durable record an operator reads.
//
// The slug is the identity and the label is presentation, so they are declared
// on the same line and the label is derived from the list rather than matched
// against it.
const ISSUES: { label: string; slug: BookingIssueReason }[] = [
  { label: 'Provider was late', slug: 'provider_late' },
  { label: 'Provider cancelled last minute', slug: 'provider_cancelled' },
  { label: 'Results were not as expected', slug: 'results_unsatisfactory' },
  { label: 'Provider was unprofessional', slug: 'unprofessional_conduct' },
  { label: 'Location issues', slug: 'location_issue' },
  { label: 'Safety concern', slug: 'safety_concern' },
  { label: 'Other', slug: 'other' },
]

// `billing_dispute` is NOT offered — item E (Correction 3) removed it, because
// The Book takes no payment in this beta (PD-042): there is no charge, no hold
// and no refund path, so the category invited a report about a transaction the
// product never made and had no way to resolve. It survives in
// `BookingIssueReason` because rows filed before item E carry the slug, and a
// type that cannot describe existing data is not describing the column.

export default function IssueReport() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const { user } = useAuth()
  const [selectedIssues, setSelectedIssues] = useState<BookingIssueReason[]>([])
  const [description, setDescription] = useState('')
  const [focused, setFocused] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function toggleIssue(issue: BookingIssueReason) {
    setSelectedIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue],
    )
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    // Guard: the reports target constraint needs a booking_id (or another
    // target). Without it (e.g. reached from the dev launcher) we never attempt
    // an insert that would fail.
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to submit a report.')
      return
    }
    if (!id) {
      Alert.alert(
        'Missing booking',
        'Open this from a booking to submit a report.',
      )
      return
    }

    setSubmitting(true)
    // The selection IS the slug now, so there is no lookup to fall out of and no
    // silent `?? 'other'`. The operator still reads the labels in the notes.
    const reason: BookingIssueReason = selectedIssues[0] ?? 'other'
    const labels = ISSUES.filter((i) => selectedIssues.includes(i.slug)).map((i) => i.label)
    const notes =
      [labels.join(', '), description.trim()]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 2000) || null

    // Goes through the shared write in lib/safety.ts rather than its own
    // INSERT. This screen hand-rolled the statement, so it was a SECOND client
    // path into `reports` — and the one that did not know about the column
    // boundary added in 20261052000000, or about the trigger that opens the
    // operator case. Its TAXONOMY stays its own (see BOOKING_ISSUE_REASONS);
    // only the write is shared.
    const res = await submitReport({
      reporterUserId: user.id,
      type: 'booking',
      reason,
      notes,
      bookingId: id,
    })

    if (!res.ok) {
      // Do NOT show success on failure — surface an error, keep the user here.
      // The selections and the description are untouched either way, which is
      // what PD-088 requires of a rate-limited report and what an honest failure
      // deserves regardless.
      setSubmitting(false)
      const copy = res.limited ? REPORT_LIMITED_COPY : REPORT_FAILED_COPY
      Alert.alert(copy.title, copy.body)
      return
    }

    // Success state only after the insert actually persisted.
    setSubmitting(false)
    setSubmitted(true)
    timer.current = setTimeout(() => {
      router.push('/(tabs)/')
    }, 2000)
  }

  // Require a real booking context + auth so we never fake a submit.
  const canSubmit = selectedIssues.length > 0 && !!id && !!user && !submitting

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>We're sorry to hear that</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Headline */}
        <Text style={styles.headline}>What went wrong?</Text>
        <Text style={styles.subtext}>
          Your experience matters. Tell us what happened.
        </Text>

        {/* Issue categories */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SELECT ALL THAT APPLY</Text>
          <View style={styles.chipWrap}>
            {ISSUES.map((issue) => {
              const selected = selectedIssues.includes(issue.slug)
              return (
                <TouchableOpacity
                  key={issue.slug}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                  activeOpacity={0.7}
                  onPress={() => toggleIssue(issue.slug)}
                >
                  <Text style={selected ? styles.chipTextSelected : styles.chipTextUnselected}>
                    {issue.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Written description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TELL US MORE</Text>
          <View style={[styles.inputContainer, focused && styles.inputContainerFocused]}>
            <TextInput
              style={styles.input}
              multiline
              maxLength={500}
              placeholder="Describe what happened..."
              placeholderTextColor="rgba(240,232,213,0.25)"
              textAlignVertical="top"
              value={description}
              onChangeText={setDescription}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <Text style={styles.counter}>{description.length} / 500</Text>
          </View>
        </View>

        {/* PRODUCT TRUTH: a refund note used to sit here promising that "our
            team will review and process any eligible refunds within 48 hours".
            The Book takes no payment, so there is nothing to refund, and no
            48-hour operational commitment exists. Removed outright rather than
            restated with a different window. */}

        {/* Safety note. PRODUCT TRUTH: previously "our team responds within 2
            hours. All reports are reviewed by a real person." Neither an
            SLA nor a staffed review process exists. What IS true is that the
            report is recorded and reaches The Book — and that emergencies do
            not belong in an in-app form. */}
        <View style={styles.safetyNote}>
          <Feather
            name="shield"
            size={13}
            color="rgba(240,232,213,0.25)"
            style={styles.safetyIcon}
          />
          <Text style={styles.safetyText}>
            Your report is recorded and sent to The Book. If you are in immediate danger, contact local emergency services.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {submitted ? (
          <View style={styles.successState}>
            <Feather name="check-circle" size={20} color="#4CAF50" />
            {/* PRODUCT TRUTH: promised follow-up "within 24 hours". No such
                commitment exists and no operator queue is staffed. */}
            <Text style={styles.successText}>
              Report submitted. Thank you for telling us.
            </Text>
          </View>
        ) : (
          <>
            {!id && (
              <Text style={styles.noBookingNote}>
                Open this from a booking to submit a report.
              </Text>
            )}
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnInactive]}
              activeOpacity={canSubmit ? 0.85 : 1}
              disabled={!canSubmit}
              onPress={handleSubmit}
            >
              <Text style={[styles.submitBtnText, !canSubmit && styles.submitBtnTextInactive]}>
                {submitting ? 'Submitting…' : 'Submit Report'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.homeLink}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/')}
            >
              <Text style={styles.homeLinkText}>Go back to home</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  topBarSpacer: {
    width: 36,
  },
  scroll: {
    flex: 1,
  },
  headline: {
    paddingHorizontal: 24,
    marginTop: 24,
    marginBottom: 8,
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  subtext: {
    paddingHorizontal: 24,
    marginBottom: 28,
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.3)',
  },
  chipUnselected: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.08)',
  },
  chipTextSelected: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  chipTextUnselected: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  inputContainer: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 14,
    padding: 16,
    minHeight: 120,
  },
  inputContainerFocused: {
    borderColor: 'rgba(240,232,213,0.2)',
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
    minHeight: 80,
  },
  counter: {
    marginTop: 8,
    textAlign: 'right',
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  safetyNote: {
    paddingHorizontal: 24,
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  safetyIcon: {
    marginTop: 2,
  },
  safetyText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  noBookingNote: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginBottom: 10,
  },
  submitBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  submitBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  submitBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
  homeLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  homeLinkText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  successState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  successText: {
    marginTop: 8,
    fontSize: 13,
    color: '#4CAF50',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
})
