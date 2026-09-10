import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/context/AuthContext'
import { BLOCKED_LIST_COPY, myBlocks, type BlockedPerson } from '@/lib/safety'
import { confirmUnblock } from '@/lib/safetyMenu'

// ── WHY THIS SCREEN EXISTS ────────────────────────────────────────────────
//
// Blocking shipped in Session 8 with no inventory. The only way to unblock
// someone was to find their profile or an existing thread, and Settings →
// Privacy → "Blocked Accounts" called `stub()`, which opens an alert reading
// "Coming soon" — a dead button in front of a LIVE feature, which is exactly
// what Correction 3 refused to ship on the de-approval card and what PD-081
// records as worse than honest silence.
//
// It was also a real dead end, not just an inconvenience. Discovery and search
// filter on `is_approved`, so a client who blocked a provider they had never
// messaged, and who was later de-approved, had no route back to that profile —
// and therefore no way to undo their own block anywhere in the app.

export default function BlockedAccounts() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [rows, setRows] = useState<BlockedPerson[] | null>(null)
  const [failed, setFailed] = useState(false)

  // On focus, not on mount: unblocking from a profile or a thread must be
  // reflected here without a manual reload.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      if (!user) return
      ;(async () => {
        const list = await myBlocks(user.id)
        if (cancelled) return
        setFailed(list === null)
        setRows(list ?? [])
      })()
      return () => {
        cancelled = true
      }
    }, [user]),
  )

  function unblock(person: BlockedPerson) {
    if (!user) return
    confirmUnblock({
      userId: user.id,
      otherUserId: person.userId,
      title: person.name,
      blocked: true,
      onBlockedChange: (blocked) => {
        if (!blocked) setRows((prev) => (prev ?? []).filter((r) => r.userId !== person.userId))
      },
      // Unreachable from this screen — there is no Report control here, because
      // reporting is about a person in a context and this list has none.
      onReport: () => {},
    })
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 12 }]}>
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.title}>{BLOCKED_LIST_COPY.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      {rows === null ? (
        <View style={s.center}>
          <ActivityIndicator color="#C8922A" />
        </View>
      ) : failed ? (
        // A failed load is NOT an empty list. Showing "You haven't blocked
        // anyone" when we could not read would tell someone their safety
        // actions had been undone.
        <View style={s.center}>
          <Text style={s.empty}>{BLOCKED_LIST_COPY.failed}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={s.center}>
          <Text style={s.empty}>{BLOCKED_LIST_COPY.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.userId}
          ListHeaderComponent={<Text style={s.hint}>{BLOCKED_LIST_COPY.hint}</Text>}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={s.row}>
              <Text style={s.name} numberOfLines={1}>
                {item.name}
              </Text>
              <TouchableOpacity onPress={() => unblock(item)} activeOpacity={0.7}>
                <Text style={s.action}>Unblock</Text>
              </TouchableOpacity>
            </View>
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
    paddingBottom: 16,
  },
  title: { fontSize: 17, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  empty: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    paddingHorizontal: 20,
    paddingBottom: 18,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  name: { flex: 1, fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_400Regular' },
  action: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
})
