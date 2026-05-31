import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  RefreshControl,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePanelContext } from '@/context/PanelContext'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { getOrCreateConversation } from '@/hooks/useMessaging'

interface ClientAggregate {
  id: string
  name: string
  visitCount: number
  lastVisitDate: string | null
  totalSpent: number
}

const COMPLETED_STATUSES = new Set(['completed'])

function formatDate(iso: string | null): string {
  if (!iso) return 'No visits yet'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function money(n: number): string {
  return '$' + n.toFixed(0)
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?'
}

function Shimmer({ style }: { style: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
      opacity.stopAnimation()
    }
  }, [opacity])
  return <Animated.View style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]} />
}

export default function ProviderClients() {
  const { openPanel } = usePanelContext()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [clients, setClients] = useState<ClientAggregate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [providerDbId, setProviderDbId] = useState<string | null>(null)
  const [openingChatFor, setOpeningChatFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setClients([])
      setLoading(false)
      return
    }
    try {
      const { data: provider } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!provider) {
        setProviderDbId(null)
        setClients([])
        setLoading(false)
        return
      }
      setProviderDbId(provider.id)

      const { data: bookingsRows, error: bErr } = await supabase
        .from('bookings')
        .select('user_id, requested_date, status, payment_amount')
        .eq('provider_id', provider.id)

      if (bErr) {
        console.log('Provider clients booking fetch error:', bErr)
        setClients([])
        setLoading(false)
        return
      }

      type BookingPick = {
        user_id: string
        requested_date: string | null
        status: string
        payment_amount: number | null
      }
      const bookings = (bookingsRows ?? []) as BookingPick[]

      // Derive distinct clients with visit count + last visit + total spent.
      const byId = new Map<
        string,
        { visitCount: number; lastVisitDate: string | null; totalSpent: number }
      >()
      for (const b of bookings) {
        if (!b.user_id) continue
        const isCompleted = COMPLETED_STATUSES.has(b.status)
        const cur = byId.get(b.user_id) ?? {
          visitCount: 0,
          lastVisitDate: null,
          totalSpent: 0,
        }
        if (isCompleted) {
          cur.visitCount += 1
          cur.totalSpent += Number(b.payment_amount ?? 0)
          if (b.requested_date) {
            if (cur.lastVisitDate == null || b.requested_date > cur.lastVisitDate) {
              cur.lastVisitDate = b.requested_date
            }
          }
        }
        byId.set(b.user_id, cur)
      }

      const ids = Array.from(byId.keys())
      if (ids.length === 0) {
        setClients([])
        setLoading(false)
        return
      }

      // Only `name` is confirmed on the clients table. avatar_url and
      // neighborhood are schema gaps flagged for Phase C; omit them gracefully.
      const { data: clientRows } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', ids)

      const nameById = new Map<string, string>()
      for (const c of (clientRows ?? []) as Array<{ id: string; name: string | null }>) {
        nameById.set(c.id, c.name || 'Client')
      }

      const aggregates: ClientAggregate[] = ids.map((cid) => {
        const agg = byId.get(cid)!
        return {
          id: cid,
          name: nameById.get(cid) || 'Client',
          visitCount: agg.visitCount,
          lastVisitDate: agg.lastVisitDate,
          totalSpent: agg.totalSpent,
        }
      })

      // Sort: most-visits first, then most-recent visit, then name.
      aggregates.sort((a, b) => {
        if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount
        const ad = a.lastVisitDate ?? ''
        const bd = b.lastVisitDate ?? ''
        if (bd !== ad) return bd.localeCompare(ad)
        return a.name.localeCompare(b.name)
      })

      setClients(aggregates)
    } catch (err) {
      console.log('Provider clients error:', err)
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function openChat(clientId: string) {
    if (!providerDbId || openingChatFor) return
    setOpeningChatFor(clientId)
    try {
      const convoId = await getOrCreateConversation(clientId, providerDbId)
      if (convoId) {
        router.push(('/messages/' + convoId) as never)
      }
    } finally {
      setOpeningChatFor(null)
    }
  }

  const totalVisits = clients.reduce((s, c) => s + c.visitCount, 0)
  const returningCount = clients.filter((c) => c.visitCount > 1).length

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Clients</Text>
        <View style={styles.menuBtnSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="rgba(240,232,213,0.5)"
          />
        }
      >
        {loading ? (
          <>
            <Shimmer style={styles.skeletonRow} />
            <Shimmer style={styles.skeletonRow} />
            <Shimmer style={styles.skeletonRow} />
            <Shimmer style={styles.skeletonRow} />
          </>
        ) : clients.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={36} color="rgba(240,232,213,0.1)" />
            <Text style={styles.emptyTitle}>No clients yet</Text>
            <Text style={styles.emptyBody}>
              Clients who book you will appear here once they complete an appointment.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryValue}>{clients.length}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCol}>
                <Text style={styles.summaryValue}>{returningCount}</Text>
                <Text style={styles.summaryLabel}>Returning</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCol}>
                <Text style={styles.summaryValue}>{totalVisits}</Text>
                <Text style={styles.summaryLabel}>Visits</Text>
              </View>
            </View>

            {clients.map((c) => {
              const isOpening = openingChatFor === c.id
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => openChat(c.id)}
                  disabled={isOpening || !providerDbId}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(c.name)}</Text>
                  </View>
                  <View style={styles.rowCenter}>
                    <Text style={styles.name} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {c.visitCount === 0
                        ? 'No completed visits'
                        : c.visitCount === 1
                          ? '1 visit · ' + formatDate(c.lastVisitDate)
                          : c.visitCount + ' visits · ' + formatDate(c.lastVisitDate)}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    {c.totalSpent > 0 && (
                      <Text style={styles.spendText}>{money(c.totalSpent)}</Text>
                    )}
                    <Feather
                      name="message-circle"
                      size={16}
                      color="rgba(240,232,213,0.35)"
                      style={{ marginTop: 4 }}
                    />
                  </View>
                </TouchableOpacity>
              )
            })}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnSpacer: { width: 36, height: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  scroll: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(240,232,213,0.07)',
  },
  summaryValue: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 11,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  rowCenter: { flex: 1 },
  name: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  rowRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  spendText: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  skeletonRow: {
    height: 64,
    borderRadius: 12,
    marginBottom: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
})
