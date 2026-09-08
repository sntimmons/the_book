import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rateLimit'

const OFFER_MAX = 200
const NOTES_MAX = 500

export default function BarterCompose() {
  const insets = useSafeAreaInsets()
  const { user, providerId } = useAuth()

  const [offering, setOffering] = useState('')
  const [seeking, setSeeking] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const canPost =
    offering.trim().length > 0 &&
    seeking.trim().length > 0 &&
    !!providerId &&
    !!user &&
    !submitting

  async function submit() {
    const offeringText = offering.trim()
    const seekingText = seeking.trim()
    if (!offeringText || !seekingText || !user || !providerId || submitting) return
    setSubmitting(true)

    // Server-side rate limit (max 5 new offers/day/provider). Not an error.
    const rl = await checkRateLimit(user.id, 'barter_offer')
    if (!rl.allowed) {
      setSubmitting(false)
      Alert.alert('Please wait', rl.message ?? 'Please wait before trying again.')
      return
    }

    try {
      const { error } = await supabase.from('barter_offers').insert({
        provider_id: providerId,
        user_id: user.id,
        offering_service: offeringText,
        seeking_service: seekingText,
        // NO `offering_value` (PD-069). The Book does not ask a provider to price their own
        // barter offer, and the server nulls the column on insert regardless.
        notes: notes.trim() || null,
      })
      if (error) throw error
      router.back()
    } catch (err) {
      console.log('Barter offer create error:', err)
      Sentry.captureException(err)
      Alert.alert('Could not post', 'Could not post offer. Please try again.', [{ text: 'OK' }])
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post Offer</Text>
        <TouchableOpacity onPress={submit} disabled={!canPost} activeOpacity={0.7}>
          {submitting ? (
            <ActivityIndicator color="#C8922A" size="small" />
          ) : (
            <Text style={[styles.postText, !canPost && styles.postTextDisabled]}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <Text style={styles.label}>WHAT ARE YOU OFFERING?</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Full set of lashes"
          placeholderTextColor="rgba(240,232,213,0.25)"
          maxLength={OFFER_MAX}
          value={offering}
          onChangeText={setOffering}
          autoFocus
        />
        <Text style={styles.counter}>
          {offering.length}/{OFFER_MAX}
        </Text>

        <Text style={[styles.label, styles.labelSpacing]}>WHAT ARE YOU LOOKING FOR?</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Haircut or fitness session"
          placeholderTextColor="rgba(240,232,213,0.25)"
          maxLength={OFFER_MAX}
          value={seeking}
          onChangeText={setSeeking}
        />
        <Text style={styles.counter}>
          {seeking.length}/{OFFER_MAX}
        </Text>

        {/* NO ESTIMATED VALUE FIELD (PD-069). The Book does not appraise, equalize or compare
            the value of a trade — providers decide for themselves whether an exchange is worth
            accepting. Asking for a dollar figure here, even optionally, teaches that parity is
            the standard and makes a deliberately unequal-looking trade feel like a mistake. Do
            not reintroduce this, or a "normal price", "market value" or equivalency field. */}
        <Text style={[styles.label, styles.labelSpacing]}>NOTES (OPTIONAL)</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Add any details about the swap…"
          placeholderTextColor="rgba(240,232,213,0.25)"
          multiline
          maxLength={NOTES_MAX}
          value={notes}
          onChangeText={setNotes}
          textAlignVertical="top"
        />
        <Text style={styles.counter}>
          {notes.length}/{NOTES_MAX}
        </Text>

        <View style={styles.privacyRow}>
          <Feather name="repeat" size={12} color="rgba(240,232,213,0.35)" />
          <Text style={styles.privacyText}>
            No money changes hands here. Barter connects you to work out a swap.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  cancelText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  headerTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  postText: { fontSize: 15, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  postTextDisabled: { color: 'rgba(240,232,213,0.3)' },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  label: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  labelSpacing: { marginTop: 20 },
  input: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  notesInput: {
    minHeight: 100,
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 24,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  counter: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'right',
    marginTop: 8,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
  },
  privacyText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
  },
})
