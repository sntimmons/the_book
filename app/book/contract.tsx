import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'
import { fetchProviderContract, Contract } from '@/lib/contracts'

export default function BookContract() {
  const insets = useSafeAreaInsets()
  const { providerId, setContractSigned } = useBookingStore()

  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [agreed, setAgreed] = useState(false)
  const [signed, setSigned] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const c = providerId ? await fetchProviderContract(providerId) : null
      if (cancelled) return
      // No contract for this provider — skip the step entirely.
      if (!c) {
        router.replace('/book/payment')
        return
      }
      setContract(c)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [providerId])

  function signAndContinue() {
    if (!agreed || !contract) return
    // Capture the signing intent; the contract_signatures row is written in
    // book/payment.tsx once the booking (and its id) exists.
    setContractSigned(contract.id)
    router.push('/book/payment')
  }

  function decline() {
    // Pre-booking, there is no signature row to mark declined; simply back out
    // to reconsider. The booking has not been created yet.
    router.back()
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Agreement</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
      >
        <Text style={styles.title}>{contract?.title}</Text>

        {contract?.contractType === 'pdf' ? (
          <View style={styles.pdfBlock}>
            <Text style={styles.pdfHint}>You must read the full contract before signing.</Text>
            <TouchableOpacity
              style={styles.readBtn}
              activeOpacity={0.85}
              onPress={() => {
                if (contract?.pdfUrl) {
                  router.push({
                    pathname: '/contracts/pdf-viewer',
                    params: { url: contract.pdfUrl },
                  } as never)
                }
              }}
            >
              <Feather name="file-text" size={16} color="#080808" />
              <Text style={styles.readBtnText}>Read Contract</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.bodyText}>{contract?.body}</Text>
        )}

        {/* Signature placeholder — the real finger-drawn canvas (react-native-skia)
            requires an EAS development build and is swapped in later. */}
        <Text style={styles.sigLabel}>YOUR SIGNATURE</Text>
        <View style={styles.sigBox}>
          {signed ? (
            <View style={styles.sigSignedRow}>
              <Feather name="check-circle" size={18} color="#4CAF50" />
              <Text style={styles.sigSignedText}>Signed</Text>
            </View>
          ) : (
            <>
              <Feather name="edit-3" size={20} color="rgba(240,232,213,0.25)" />
              <Text style={styles.sigPlaceholderText}>
                Signature canvas — requires development build
              </Text>
              <TouchableOpacity style={styles.sigSimBtn} activeOpacity={0.85} onPress={() => setSigned(true)}>
                <Text style={styles.sigSimBtnText}>Sign</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Pressable style={styles.checkboxRow} onPress={() => setAgreed((v) => !v)}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed ? <Feather name="check" size={13} color="#080808" /> : null}
          </View>
          <Text style={styles.checkboxText}>
            {contract?.contractType === 'pdf'
              ? 'I have read and agree to the terms in this PDF contract.'
              : 'I have read and agree to this service agreement.'}
          </Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.declineBtn} activeOpacity={0.8} onPress={decline}>
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueBtn, (!agreed || !signed) && styles.continueBtnInactive]}
          activeOpacity={0.85}
          onPress={signAndContinue}
          disabled={!agreed || !signed}
        >
          <Text style={[styles.continueText, (!agreed || !signed) && styles.continueTextInactive]}>
            Sign and Continue
          </Text>
        </TouchableOpacity>
      </View>
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
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 14 },
  bodyText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
  },
  pdfBlock: { marginTop: 4 },
  pdfHint: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 16,
  },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
  },
  readBtnText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  sigLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
  },
  sigBox: {
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(240,232,213,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  sigPlaceholderText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  sigSimBtn: {
    paddingHorizontal: 24,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  sigSimBtnText: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_700Bold' },
  sigSignedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sigSignedText: { fontSize: 15, color: '#4CAF50', fontFamily: 'Manrope_700Bold' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: '#C8922A', borderColor: '#C8922A' },
  checkboxText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(240,232,213,0.8)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  cta: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  declineBtn: {
    paddingHorizontal: 24,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
  },
  declineText: { fontSize: 15, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_600SemiBold' },
  continueBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  continueBtnInactive: { backgroundColor: 'rgba(240,232,213,0.1)' },
  continueText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  continueTextInactive: { color: 'rgba(240,232,213,0.3)' },
})
