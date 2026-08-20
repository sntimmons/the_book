import { useCallback, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { fetchProviderContract } from '@/lib/contracts'

const BODY_MAX = 3000
const DEFAULT_TITLE = 'Service Agreement'

export default function ContractEditor() {
  const insets = useSafeAreaInsets()
  const { user, providerId } = useAuth()

  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [body, setBody] = useState('')
  const [hasContract, setHasContract] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const load = useCallback(async () => {
    if (!providerId) {
      setLoading(false)
      return
    }
    const contract = await fetchProviderContract(providerId)
    if (contract) {
      setTitle(contract.title || DEFAULT_TITLE)
      setBody(contract.body || '')
      setHasContract(true)
    }
    setLoading(false)
  }, [providerId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const canSave = title.trim().length > 0 && body.trim().length > 0 && !!providerId && !!user && !saving

  async function save() {
    if (!canSave || !user || !providerId) return
    setSaving(true)
    const { error } = await supabase.from('contracts').upsert(
      {
        provider_id: providerId,
        user_id: user.id,
        title: title.trim(),
        body: body.trim(),
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider_id' },
    )
    setSaving(false)
    if (error) {
      console.log('Save contract error:', error)
      Alert.alert('Could not save', 'Something went wrong. Please try again.', [{ text: 'OK' }])
      return
    }
    setHasContract(true)
    Alert.alert('Saved', 'Your service agreement is ready.', [
      { text: 'OK', onPress: () => router.back() },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contract</Text>
        <TouchableOpacity onPress={save} disabled={!canSave} activeOpacity={0.7}>
          {saving ? (
            <ActivityIndicator color="#C8922A" size="small" />
          ) : (
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
        >
          {!hasContract ? (
            <View style={styles.emptyHint}>
              <Feather name="file-text" size={20} color="#C8922A" />
              <Text style={styles.emptyHintText}>
                You haven&apos;t created a contract yet. Create one to protect yourself and
                your clients.
              </Text>
            </View>
          ) : null}

          <Text style={styles.label}>TITLE</Text>
          <TextInput
            style={styles.input}
            placeholder={DEFAULT_TITLE}
            placeholderTextColor="rgba(240,232,213,0.25)"
            maxLength={80}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.label, styles.labelSpacing]}>AGREEMENT</Text>
          <TextInput
            style={styles.bodyInput}
            placeholder="Your terms, cancellation policy, what's included, and payment terms…"
            placeholderTextColor="rgba(240,232,213,0.25)"
            multiline
            maxLength={BODY_MAX}
            value={body}
            onChangeText={setBody}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>
            {body.length}/{BODY_MAX}
          </Text>

          <TouchableOpacity
            style={styles.previewBtn}
            activeOpacity={0.8}
            onPress={() => setPreviewOpen(true)}
            disabled={body.trim().length === 0}
          >
            <Feather name="eye" size={15} color="#C8922A" />
            <Text style={styles.previewBtnText}>Preview as client</Text>
          </TouchableOpacity>

          <View style={styles.privacyRow}>
            <Feather name="info" size={12} color="rgba(240,232,213,0.35)" />
            <Text style={styles.privacyText}>
              Clients read and sign this when they book you.
            </Text>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={previewOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.modalCard, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Client preview</Text>
              <TouchableOpacity onPress={() => setPreviewOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color="#F0E8D5" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 16 }}>
              <Text style={styles.previewTitle}>{title.trim() || DEFAULT_TITLE}</Text>
              <Text style={styles.previewBody}>{body.trim()}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  emptyHint: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
    marginBottom: 24,
  },
  emptyHintText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
  },
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
  bodyInput: {
    minHeight: 260,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
    paddingVertical: 14,
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
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.4)',
    marginTop: 16,
  },
  previewBtnText: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20 },
  privacyText: { fontSize: 11, color: 'rgba(240,232,213,0.35)', fontFamily: 'Manrope_400Regular' },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    maxHeight: '86%',
    backgroundColor: '#141210',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  modalHeaderTitle: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  previewTitle: { fontSize: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 14 },
  previewBody: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
  },
})
