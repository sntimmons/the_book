import { useCallback, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import {
  fetchProviderContract,
  fetchProviderSignatures,
  ContractType,
  SignedContractRow,
} from '@/lib/contracts'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export default function ContractsList() {
  const insets = useSafeAreaInsets()
  const { providerId } = useAuth()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hasContract, setHasContract] = useState(false)
  const [contractTitle, setContractTitle] = useState('')
  const [contractType, setContractType] = useState<ContractType>('text')
  const [signatures, setSignatures] = useState<SignedContractRow[]>([])

  const load = useCallback(
    async (refresh = false) => {
      if (!providerId) {
        setLoading(false)
        return
      }
      if (refresh) setRefreshing(true)
      const [contract, sigs] = await Promise.all([
        fetchProviderContract(providerId),
        fetchProviderSignatures(providerId),
      ])
      setHasContract(!!contract)
      setContractTitle(contract?.title ?? '')
      setContractType(contract?.contractType ?? 'text')
      setSignatures(sigs)
      setLoading(false)
      setRefreshing(false)
    },
    [providerId],
  )

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contracts</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="rgba(240,232,213,0.4)"
            />
          }
        >
          {/* Contract template status */}
          <TouchableOpacity
            style={styles.templateCard}
            activeOpacity={0.85}
            onPress={() => router.push('/dashboard/provider/contract' as never)}
          >
            <View style={[styles.templateIcon, hasContract ? styles.iconGreen : styles.iconAmber]}>
              <Feather
                name={hasContract ? 'check-circle' : 'file-text'}
                size={20}
                color={hasContract ? '#4CAF50' : '#C8922A'}
              />
            </View>
            <View style={styles.flex1}>
              <View style={styles.templateTitleRow}>
                <Text style={styles.templateTitle} numberOfLines={1}>
                  {hasContract ? contractTitle || 'Service Agreement' : 'No contract yet'}
                </Text>
                {hasContract ? (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {contractType === 'pdf' ? 'PDF contract' : 'Text contract'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.templateSub}>
                {hasContract
                  ? 'Your default agreement. Tap to edit.'
                  : 'Create one to protect yourself and your clients.'}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(240,232,213,0.3)" />
          </TouchableOpacity>

          {/* Signed contracts */}
          <Text style={styles.sectionLabel}>SIGNED BY CLIENTS</Text>
          {signatures.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="edit-3" size={24} color="rgba(240,232,213,0.15)" />
              <Text style={styles.emptyText}>
                {hasContract
                  ? 'No signed contracts yet. Clients sign when they book you.'
                  : 'Signed contracts will appear here once you have a contract.'}
              </Text>
            </View>
          ) : (
            signatures.map((row) => (
              <TouchableOpacity
                key={row.signature.id}
                style={styles.sigRow}
                activeOpacity={0.7}
                onPress={() => router.push(`/contracts/${row.signature.id}` as never)}
              >
                <View style={styles.flex1}>
                  <Text style={styles.sigClient} numberOfLines={1}>
                    {row.clientName}
                    {row.serviceName ? ` · ${row.serviceName}` : ''}
                  </Text>
                  <Text style={styles.sigMeta}>
                    Signed {formatDate(row.signature.signedAt)}
                    {row.bookingDate ? ` · Booked ${formatDate(row.bookingDate)}` : ''}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="rgba(240,232,213,0.3)" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  flex1: { flex: 1 },
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
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  templateIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconGreen: { backgroundColor: 'rgba(76,175,80,0.12)' },
  iconAmber: { backgroundColor: 'rgba(200,146,42,0.12)' },
  templateTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  templateTitle: { flexShrink: 1, fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  typeBadgeText: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.3,
  },
  templateSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
    lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    lineHeight: 19,
  },
  sigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    marginBottom: 10,
  },
  sigClient: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  sigMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
})
