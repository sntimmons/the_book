import { useEffect, useState } from 'react'
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
import { INTERVAL_OPTIONS } from '@/lib/care'

interface SavedChip {
  id: string
  name: string
}

const DEFAULT_INTERVAL = 28

export default function AddReminder() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [service, setService] = useState('')
  const [providerId, setProviderId] = useState<string | null>(null)
  const [intervalDays, setIntervalDays] = useState<number>(DEFAULT_INTERVAL)
  const [savedProviders, setSavedProviders] = useState<SavedChip[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      // The saved-list error was previously destructured away entirely, so a
      // failed read rendered as "you have saved nobody" with nothing captured.
      const { data, error: savedError } = await supabase
        .from('saved_providers')
        .select('provider_id, created_at, providers(id, display_name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (savedError) {
        Sentry.captureException(savedError, { extra: { where: 'add-reminder saved list' } })
        setSavedProviders([])
        return
      }
      // Through `unknown`: destructuring `error` alongside `data` narrows the
      // inferred row type, and supabase-js types the embed as an array even
      // where the FK makes it single-valued. Same shape the rest of the repo
      // uses for an embedded read.
      const rows =
        (data as unknown as
          | { providers: { id: string; display_name: string | null } | null }[]
          | null) ?? []
      // PD-089: the same gate the two saved-provider LISTS carry
      // (CODE-DRIFT-008). Without it a provider the viewer is blocked with is
      // offered here as a selectable chip — and worse than being merely visible,
      // they can be named as the subject of a NEW care reminder, which is a
      // forward-looking artefact rather than preserved history.
      const savedIds = rows.map((r) => r.providers?.id).filter(Boolean) as string[]
      let visible = new Set<string>()
      if (savedIds.length > 0) {
        const { data: vis, error: visError } = await supabase
          .from('providers_visible')
          .select('id')
          .in('id', savedIds)
        if (cancelled) return
        if (visError) {
          // Fail closed: offer no one rather than risk offering a blocked person.
          Sentry.captureException(visError, { extra: { where: 'add-reminder saved visibility' } })
        } else {
          visible = new Set(((vis as { id: string }[] | null) ?? []).map((v) => v.id))
        }
      }

      setSavedProviders(
        rows
          .map((r) => r.providers)
          .filter((p): p is NonNullable<typeof p> => !!p)
          .filter((p) => visible.has(p.id))
          .map((p) => ({ id: p.id, name: p.display_name ?? 'Provider' })),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const canSave = service.trim().length > 0 && !!user && !submitting

  async function save() {
    const serviceName = service.trim()
    if (!serviceName || !user || submitting) return
    setSubmitting(true)
    const nextReminderAt = new Date(Date.now() + intervalDays * 86400000).toISOString()
    const { error } = await supabase.from('care_reminders').insert({
      client_user_id: user.id,
      provider_id: providerId,
      service_name: serviceName,
      interval_days: intervalDays,
      last_booked_at: null,
      next_reminder_at: nextReminderAt,
      is_active: true,
    })
    if (error) {
      console.log('Add reminder error:', error)
      Sentry.captureException(error)
      Alert.alert('Could not save', 'Could not save reminder. Please try again.', [{ text: 'OK' }])
      setSubmitting(false)
      return
    }
    router.back()
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
        <Text style={styles.headerTitle}>Add Reminder</Text>
        <TouchableOpacity onPress={save} disabled={!canSave} activeOpacity={0.7}>
          {submitting ? (
            <ActivityIndicator color="#C8922A" size="small" />
          ) : (
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <Text style={styles.label}>SERVICE</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Lash fills, Haircut, Massage"
          placeholderTextColor="rgba(240,232,213,0.25)"
          maxLength={80}
          value={service}
          onChangeText={setService}
          autoFocus
        />

        <Text style={[styles.label, styles.labelSpacing]}>PROVIDER (OPTIONAL)</Text>
        {savedProviders.length === 0 ? (
          <Text style={styles.helper}>
            Save providers to link a reminder. This one will be a general reminder.
          </Text>
        ) : (
          <View style={styles.chipWrap}>
            {savedProviders.map((p) => {
              const active = providerId === p.id
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                  activeOpacity={0.8}
                  onPress={() => setProviderId(active ? null : p.id)}
                >
                  <Text style={active ? styles.chipTextActive : styles.chipTextInactive}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        <Text style={[styles.label, styles.labelSpacing]}>REMIND ME</Text>
        <View style={styles.intervalWrap}>
          {INTERVAL_OPTIONS.map((opt) => {
            const active = intervalDays === opt.days
            return (
              <TouchableOpacity
                key={opt.days}
                style={[styles.intervalRow, active ? styles.intervalActive : styles.intervalInactive]}
                activeOpacity={0.85}
                onPress={() => setIntervalDays(opt.days)}
              >
                <Text style={active ? styles.intervalTextActive : styles.intervalTextInactive}>
                  {opt.label}
                </Text>
                {active ? <Feather name="check" size={16} color="#C8922A" /> : null}
              </TouchableOpacity>
            )
          })}
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
  cancelText: { fontSize: 15, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_500Medium' },
  headerTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  saveText: { fontSize: 15, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  saveTextDisabled: { color: 'rgba(240,232,213,0.3)' },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  label: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  labelSpacing: { marginTop: 24 },
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
  helper: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  chipActive: { backgroundColor: '#F0E8D5' },
  chipInactive: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  chipTextActive: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  chipTextInactive: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
  intervalWrap: { gap: 8 },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 12,
  },
  intervalActive: {
    backgroundColor: 'rgba(200,146,42,0.12)',
    borderWidth: 1,
    borderColor: '#C8922A',
  },
  intervalInactive: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  intervalTextActive: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  intervalTextInactive: { fontSize: 15, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
})
