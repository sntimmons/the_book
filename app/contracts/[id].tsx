import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fetchSignedContract, SignedContractDetail } from '@/lib/contracts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Format an ISO timestamp as "Aug 20, 2026 at 3:04 PM".
function formatDateTime(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${h}:${m} ${ampm}`
}

export default function SignedContractViewer() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()

  const [detail, setDetail] = useState<SignedContractDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }
    const d = await fetchSignedContract(id)
    setDetail(d)
    setLoading(false)
  }, [id])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const sig = detail?.signature

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signed Contract</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : !detail ? (
        <View style={styles.centerBody}>
          <Feather name="file-text" size={36} color="rgba(240,232,213,0.12)" />
          <Text style={styles.emptyText}>This contract could not be found.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        >
          {/* Signed status */}
          <View style={styles.statusRow}>
            <Feather
              name={sig?.status === 'signed' ? 'check-circle' : 'x-circle'}
              size={16}
              color={sig?.status === 'signed' ? '#4CAF50' : 'rgba(240,232,213,0.5)'}
            />
            <Text style={[styles.statusText, sig?.status === 'signed' && styles.statusSigned]}>
              {sig?.status === 'signed' ? 'Signed' : sig?.status === 'declined' ? 'Declined' : 'Pending'}
            </Text>
          </View>

          <Text style={styles.title}>{detail.contract?.title ?? 'Service Agreement'}</Text>
          <Text style={styles.provider}>with {detail.providerName}</Text>

          {/* Parties + timestamp */}
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Accepted by</Text>
              <Text style={styles.metaValue}>{detail.clientName}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Accepted at</Text>
              <Text style={styles.metaValue}>{formatDateTime(sig?.signedAt ?? null) || '—'}</Text>
            </View>
          </View>

          {/* WHAT THIS RECORD IS — and the word "signature" is not in it.
              This section used to read "Signature on file (image pending
              development build)". No image was ever on file: `signature_url` has
              always been null, and the canvas that might one day have produced
              one was removed from the flow in this same change — so the claim
              went from usually false to permanently false.

              What the record actually holds is stated instead, with its limits,
              because this is the screen someone would open if they ever had to
              rely on it. */}
          <Text style={styles.sectionLabel}>WHAT WAS RECORDED</Text>
          <View style={styles.sigPlaceholder}>
            <Feather name="file-text" size={18} color="rgba(240,232,213,0.25)" />
            <Text style={styles.sigPlaceholderText}>
              {detail.contract?.currentVersionNo
                ? `Accepted version ${detail.contract.currentVersionNo} of this agreement.`
                : 'Accepted version of this agreement.'}
              {' '}The Book records who accepted it, which version, and when. It is not a
              witnessed or legally certified signature.
            </Text>
          </View>

          {/* AUDITABILITY. If the provider has edited their agreement since,
              both parties are told here rather than being left to compare two
              documents and notice. The text below is still the ACCEPTED one. */}
          {detail.providerChangedSince ? (
            <View style={styles.changedNotice}>
              <Feather name="alert-circle" size={15} color="#C8922A" />
              <Text style={styles.changedNoticeText}>
                This provider has changed their agreement since this was accepted. The
                version below is the one that was accepted, and it has not changed.
              </Text>
            </View>
          ) : null}

          {/* Agreement text — THE ACCEPTED VERSION, from booking_contract_record. */}
          <Text style={styles.sectionLabel}>AGREEMENT</Text>
          <Text style={styles.bodyText}>{detail.contract?.body ?? 'Contract text unavailable.'}</Text>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText: { fontSize: 14, color: 'rgba(240,232,213,0.4)', fontFamily: 'Manrope_500Medium' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  statusText: { fontSize: 13, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_700Bold' },
  statusSigned: { color: '#4CAF50' },
  title: { fontSize: 24, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  provider: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  metaCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaLabel: { fontSize: 13, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_500Medium' },
  metaValue: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  metaDivider: { height: 1, backgroundColor: 'rgba(240,232,213,0.06)', marginVertical: 12 },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  sigImage: {
    height: 140,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  changedNotice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(200,146,42,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.25)',
    marginBottom: 16,
  },
  changedNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(240,232,213,0.75)',
    fontFamily: 'Manrope_400Regular',
  },
  sigPlaceholder: {
    minHeight: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(240,232,213,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  sigPlaceholderText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
  },
})
