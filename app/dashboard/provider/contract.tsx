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
import * as DocumentPicker from 'expo-document-picker'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { fetchProviderContract, uploadContractPdf, ContractType } from '@/lib/contracts'

const BODY_MAX = 3000
const DEFAULT_TITLE = 'Service Agreement'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// Last path segment of a stored PDF URL (a fallback label when we did not keep
// the original picked filename, e.g. a contract loaded from the database).
function basename(url: string): string {
  const clean = url.split('?')[0]
  const parts = clean.split('/')
  return parts[parts.length - 1] || 'contract.pdf'
}

export default function ContractEditor() {
  const insets = useSafeAreaInsets()
  const { user, providerId } = useAuth()

  const [mode, setMode] = useState<ContractType>('text')
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [body, setBody] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [pdfDate, setPdfDate] = useState<string | null>(null)
  const [hasContract, setHasContract] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
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
      setMode(contract.contractType)
      setHasContract(true)
      if (contract.contractType === 'pdf' && contract.pdfUrl) {
        setPdfUrl(contract.pdfUrl)
        // Prefer the stored original filename; fall back to the storage basename
        // for PDFs uploaded before the pdf_filename column existed.
        setPdfName(contract.pdfFilename || basename(contract.pdfUrl))
        setPdfDate(contract.updatedAt ?? contract.createdAt)
      }
    }
    setLoading(false)
  }, [providerId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  // Persist the current contract. For text: title + body. For pdf: title + the
  // stored pdf_url with an empty body. `pdf` argument lets the upload flow save
  // immediately with the freshly uploaded URL before state settles.
  const persist = useCallback(
    async (
      nextMode: ContractType,
      nextPdfUrl: string | null,
      nextPdfName: string | null,
    ): Promise<boolean> => {
      if (!user || !providerId) return false
      const { error } = await supabase.from('contracts').upsert(
        {
          provider_id: providerId,
          user_id: user.id,
          title: title.trim() || DEFAULT_TITLE,
          body: nextMode === 'text' ? body.trim() : '',
          contract_type: nextMode,
          pdf_url: nextMode === 'pdf' ? nextPdfUrl : null,
          pdf_filename: nextMode === 'pdf' ? nextPdfName : null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider_id' },
      )
      if (error) {
        console.log('Save contract error:', error)
        return false
      }
      return true
    },
    [user, providerId, title, body],
  )

  const canSave =
    !!providerId &&
    !!user &&
    !saving &&
    title.trim().length > 0 &&
    (mode === 'text' ? body.trim().length > 0 : !!pdfUrl)

  async function save() {
    if (!canSave) return
    setSaving(true)
    const ok = await persist(mode, pdfUrl, pdfName)
    setSaving(false)
    if (!ok) {
      Alert.alert('Could not save', 'Something went wrong. Please try again.', [{ text: 'OK' }])
      return
    }
    setHasContract(true)
    Alert.alert('Saved', 'Your service agreement is ready.', [
      { text: 'OK', onPress: () => router.back() },
    ])
  }

  async function pickAndUpload() {
    if (uploading || !user) return
    setUploadError('')
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]

      setUploading(true)
      const { url, error } = await uploadContractPdf(user.id, asset.uri)
      if (error || !url) {
        setUploading(false)
        setUploadError(error ?? 'Upload failed. Please try again.')
        return
      }

      // Persist immediately so the PDF sticks even if they leave without Save.
      const filename = asset.name || basename(url)
      const ok = await persist('pdf', url, filename)
      setUploading(false)
      if (!ok) {
        setUploadError('Uploaded, but could not save the contract. Please try again.')
        return
      }
      setMode('pdf')
      setPdfUrl(url)
      setPdfName(filename)
      setPdfDate(new Date().toISOString())
      setHasContract(true)
    } catch (err: any) {
      console.log('Pick/upload error:', err)
      setUploading(false)
      setUploadError('Something went wrong picking the file. Please try again.')
    }
  }

  function viewPdf() {
    if (!pdfUrl) return
    router.push({ pathname: '/contracts/pdf-viewer', params: { url: pdfUrl } } as never)
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
          {/* Mode toggle */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'text' && styles.toggleBtnActive]}
              activeOpacity={0.8}
              onPress={() => setMode('text')}
            >
              <Text style={mode === 'text' ? styles.toggleTextActive : styles.toggleTextInactive}>
                Write Terms
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'pdf' && styles.toggleBtnActive]}
              activeOpacity={0.8}
              onPress={() => setMode('pdf')}
            >
              <Text style={mode === 'pdf' ? styles.toggleTextActive : styles.toggleTextInactive}>
                Upload PDF
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>TITLE</Text>
          <TextInput
            style={styles.input}
            placeholder={DEFAULT_TITLE}
            placeholderTextColor="rgba(240,232,213,0.25)"
            maxLength={80}
            value={title}
            onChangeText={setTitle}
          />

          {mode === 'text' ? (
            <>
              {!hasContract ? (
                <View style={styles.hintCard}>
                  <Feather name="file-text" size={18} color="#C8922A" />
                  <Text style={styles.hintText}>
                    You haven&apos;t created a contract yet. Create one to protect yourself and
                    your clients.
                  </Text>
                </View>
              ) : null}

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
                style={styles.secondaryBtn}
                activeOpacity={0.8}
                onPress={() => setPreviewOpen(true)}
                disabled={body.trim().length === 0}
              >
                <Feather name="eye" size={15} color="#C8922A" />
                <Text style={styles.secondaryBtnText}>Preview as client</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.label, styles.labelSpacing]}>PDF CONTRACT</Text>
              {pdfUrl ? (
                <View style={styles.pdfCard}>
                  <View style={styles.pdfIcon}>
                    <Feather name="file-text" size={22} color="#C8922A" />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.pdfName} numberOfLines={1}>
                      {pdfName ?? 'Contract PDF'}
                    </Text>
                    {pdfDate ? (
                      <Text style={styles.pdfMeta}>Uploaded {formatDate(pdfDate)}</Text>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.pdfEmpty}>
                  <Feather name="upload-cloud" size={26} color="rgba(240,232,213,0.2)" />
                  <Text style={styles.pdfEmptyText}>Upload your existing contract PDF</Text>
                </View>
              )}

              {uploadError ? <Text style={styles.errorText}>{uploadError}</Text> : null}

              {pdfUrl ? (
                <View style={styles.pdfActions}>
                  <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8} onPress={viewPdf}>
                    <Feather name="eye" size={15} color="#C8922A" />
                    <Text style={styles.secondaryBtnText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    activeOpacity={0.8}
                    onPress={pickAndUpload}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator color="#C8922A" size="small" />
                    ) : (
                      <>
                        <Feather name="refresh-cw" size={15} color="#C8922A" />
                        <Text style={styles.secondaryBtnText}>Replace PDF</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadBtn}
                  activeOpacity={0.85}
                  onPress={pickAndUpload}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator color="#080808" size="small" />
                  ) : (
                    <>
                      <Feather name="upload" size={16} color="#080808" />
                      <Text style={styles.uploadBtnText}>Upload Contract</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}

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
  flex1: { flex: 1 },
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
  toggle: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    marginBottom: 24,
  },
  toggleBtn: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: '#F0E8D5' },
  toggleTextActive: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_700Bold' },
  toggleTextInactive: { fontSize: 14, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
  hintCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
    marginTop: 24,
  },
  hintText: {
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
  pdfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  pdfIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfName: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  pdfMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  pdfEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(240,232,213,0.03)',
    gap: 12,
  },
  pdfEmptyText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  pdfActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  errorText: {
    fontSize: 13,
    color: '#E5735A',
    fontFamily: 'Manrope_500Medium',
    marginTop: 12,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
    marginTop: 16,
  },
  uploadBtnText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  secondaryBtn: {
    flex: 1,
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
  secondaryBtnText: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 24 },
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
