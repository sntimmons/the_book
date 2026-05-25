import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ISSUES = [
  'Provider was late',
  'Provider cancelled last minute',
  'Results were not as expected',
  'Provider was unprofessional',
  'Location issues',
  'Safety concern',
  'Billing issue',
  'Other',
]

export default function IssueReport() {
  const insets = useSafeAreaInsets()
  const [selectedIssues, setSelectedIssues] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [focused, setFocused] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function toggleIssue(issue: string) {
    setSelectedIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue],
    )
  }

  function handleSubmit() {
    setSubmitted(true)
    timer.current = setTimeout(() => {
      router.push('/(tabs)/')
    }, 2000)
  }

  const canSubmit = selectedIssues.length > 0

  return (
    <View style={styles.root}>
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
      >
        {/* Headline */}
        <Text style={styles.headline}>What went wrong?</Text>
        <Text style={styles.subtext}>
          Your experience matters. Tell us what happened and we will make it right.
        </Text>

        {/* Issue categories */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SELECT ALL THAT APPLY</Text>
          <View style={styles.chipWrap}>
            {ISSUES.map((issue) => {
              const selected = selectedIssues.includes(issue)
              return (
                <TouchableOpacity
                  key={issue}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                  activeOpacity={0.7}
                  onPress={() => toggleIssue(issue)}
                >
                  <Text style={selected ? styles.chipTextSelected : styles.chipTextUnselected}>
                    {issue}
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
              placeholder="Describe what happened so we can help resolve this..."
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

        {/* Refund note */}
        <View style={styles.refundNote}>
          <Feather name="info" size={14} color="#C8922A" style={styles.refundIcon} />
          <Text style={styles.refundText}>
            If your issue involves a charge our team will review and process any eligible refunds within 48 hours.
          </Text>
        </View>

        {/* Safety note */}
        <View style={styles.safetyNote}>
          <Feather
            name="shield"
            size={13}
            color="rgba(240,232,213,0.25)"
            style={styles.safetyIcon}
          />
          <Text style={styles.safetyText}>
            For safety concerns our team responds within 2 hours. All reports are reviewed by a real person.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {submitted ? (
          <View style={styles.successState}>
            <Feather name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.successText}>
              Report submitted. We will follow up within 24 hours.
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnInactive]}
              activeOpacity={canSubmit ? 0.85 : 1}
              disabled={!canSubmit}
              onPress={handleSubmit}
            >
              <Text style={[styles.submitBtnText, !canSubmit && styles.submitBtnTextInactive]}>
                Submit Report
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
    </View>
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
  refundNote: {
    marginHorizontal: 24,
    marginTop: 20,
    padding: 14,
    backgroundColor: 'rgba(200,146,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.15)',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  refundIcon: {
    marginTop: 2,
  },
  refundText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
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
