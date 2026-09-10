import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  CASE_TYPE_LABEL,
  NO_SLA_NOTE,
  listCases,
  type CaseStatus,
  type CaseType,
  type QueueCase,
} from '@/lib/operator'

// The Review Queue (PD-068, Session 8B). The screen that makes PD-068 something
// other than partially satisfied.

const STATUS_FILTERS: { label: string; value: CaseStatus | null }[] = [
  { label: 'Needs work', value: null },
  { label: 'Open', value: 'open' },
  { label: 'Under review', value: 'under_review' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Dismissed', value: 'dismissed' },
]

const TYPE_FILTERS: { label: string; value: CaseType | null }[] = [
  { label: 'All', value: null },
  { label: 'Reports', value: 'user_report' },
  { label: 'Appeals', value: 'provider_appeal' },
  { label: 'Trades', value: 'barter_review' },
]

function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function OperatorQueue() {
  const insets = useSafeAreaInsets()
  const [status, setStatus] = useState<CaseStatus | null>(null)
  const [type, setType] = useState<CaseType | null>(null)
  const [rows, setRows] = useState<QueueCase[] | null>(null)
  const [failed, setFailed] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      ;(async () => {
        setRows(null)
        const list = await listCases(status, type)
        if (cancelled) return
        setFailed(list === null)
        setRows(list ?? [])
      })()
      return () => {
        cancelled = true
      }
    }, [status, type]),
  )

  return (
    <View style={[s.root, { paddingTop: insets.top + 12 }]}>
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.title}>Review Queue</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <Pressable
            key={f.label}
            style={[s.chip, status === f.value && s.chipOn]}
            onPress={() => setStatus(f.value)}
          >
            <Text style={[s.chipText, status === f.value && s.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow}>
        {TYPE_FILTERS.map((f) => (
          <Pressable
            key={f.label}
            style={[s.chip, type === f.value && s.chipOn]}
            onPress={() => setType(f.value)}
          >
            <Text style={[s.chipText, type === f.value && s.chipTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {rows === null ? (
        <View style={s.center}>
          <ActivityIndicator color="#C8922A" />
        </View>
      ) : failed ? (
        // A FAILED LOAD IS NOT AN EMPTY QUEUE. Rendering "nothing waiting" when
        // the read failed would tell an operator there is no work when people
        // are waiting, which is the worst lie this screen could tell.
        <View style={s.center}>
          <Text style={s.empty}>Could not load the queue. Check your connection and try again.</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={s.center}>
          <Text style={s.empty}>Nothing here.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.caseId}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          ListFooterComponent={<Text style={s.footer}>{NO_SLA_NOTE}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={s.row}
              onPress={() => router.push(`/operator/${item.caseId}` as never)}
            >
              <View style={s.rowTop}>
                <Text style={s.kind}>{CASE_TYPE_LABEL[item.caseType]}</Text>
                <Text style={[s.status, item.status === 'open' && s.statusOpen]}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
              <Text style={s.subject} numberOfLines={2}>
                {item.subject}
              </Text>
              <Text style={s.meta}>
                waiting {age(item.createdAt)} · {item.eventCount}{' '}
                {item.eventCount === 1 ? 'entry' : 'entries'}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 17, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  filterRow: { flexGrow: 0, paddingHorizontal: 16, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    marginRight: 8,
  },
  chipOn: { backgroundColor: 'rgba(200,146,42,0.14)', borderColor: '#C8922A' },
  chipText: { fontSize: 12, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_400Regular' },
  chipTextOn: { color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  empty: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  kind: { fontSize: 11, color: '#C8922A', fontFamily: 'Manrope_700Bold', letterSpacing: 0.5 },
  status: { fontSize: 11, color: 'rgba(240,232,213,0.4)', fontFamily: 'Manrope_500Medium' },
  statusOpen: { color: 'rgba(240,232,213,0.75)' },
  subject: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_400Regular', marginBottom: 6 },
  meta: { fontSize: 11, color: 'rgba(240,232,213,0.35)', fontFamily: 'Manrope_400Regular' },
  footer: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    padding: 20,
    lineHeight: 16,
  },
})
