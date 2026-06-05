import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Conversation, useConversations } from '../../hooks/useMessaging'

type Filter = 'all' | 'bookings'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Shimmer({ style }: { style: any }) {
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
  return (
    <Animated.View
      style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]}
    />
  )
}

export default function MessagesInboxScreen() {
  const insets = useSafeAreaInsets()
  const { conversations, loading, refetch } = useConversations()
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<Filter>('all')

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const filtered =
    activeFilter === 'all'
      ? conversations
      : conversations.filter((c) => c.booking_id !== null)

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Messages</Text>
        {/* Compose entry hidden: it was a no-op. Restore when new-message
            conversation creation is wired. */}
      </View>

      <View style={styles.tabs}>
        {(['all', 'bookings'] as Filter[]).map((tab) => {
          const active = activeFilter === tab
          return (
            <TouchableOpacity
              key={tab}
              activeOpacity={0.7}
              style={styles.tab}
              onPress={() => setActiveFilter(tab)}
            >
              <Text style={active ? styles.tabTextActive : styles.tabTextInactive}>
                {tab === 'all' ? 'All' : 'Bookings'}
              </Text>
              {active && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          )
        })}
      </View>
      <View style={styles.tabsSeparator} />

      {loading && conversations.length === 0 ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="chatbubbles-outline"
            size={48}
            color="rgba(240,232,213,0.15)"
            style={{ marginBottom: 16 }}
          />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>
            {activeFilter === 'bookings'
              ? 'Messages from bookings will appear here.'
              : 'Message a provider to get started.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#C8922A"
            />
          }
        >
          {filtered.map((c) => (
            <ConversationRow key={c.id} convo={c} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function ConversationRow({ convo }: { convo: Conversation }) {
  const initial = (convo.other_party_name || 'C').charAt(0).toUpperCase()
  const unread = convo.unread_count > 0
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.row}
      onPress={() => router.push(`/messages/${convo.id}` as never)}
    >
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        {unread && <View style={styles.unreadDot} />}
      </View>

      <View style={styles.center}>
        <View style={styles.topRow}>
          <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
            {convo.other_party_name}
          </Text>
          <Text style={styles.timeText}>{timeAgo(convo.last_message_at)}</Text>
        </View>
        <View style={styles.bottomRow}>
          {convo.booking_service ? (
            <View style={styles.bookingPill}>
              <Text style={styles.bookingPillText} numberOfLines={1}>
                {convo.booking_service}
              </Text>
            </View>
          ) : null}
          {convo.last_message_preview ? (
            <Text style={styles.preview} numberOfLines={1}>
              {convo.last_message_preview}
            </Text>
          ) : (
            <Text style={styles.previewEmpty}>Start a conversation</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

function SkeletonRow() {
  return (
    <View style={[styles.row, { borderBottomWidth: 0 }]}>
      <Shimmer style={{ width: 48, height: 48, borderRadius: 24, marginRight: 14 }} />
      <View style={{ flex: 1 }}>
        <Shimmer style={{ width: '60%', height: 13, borderRadius: 4 }} />
        <Shimmer style={{ width: '85%', height: 12, borderRadius: 4, marginTop: 8 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 24,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  tabs: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  tab: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  tabTextActive: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  tabTextInactive: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
  },
  tabUnderline: {
    marginTop: 4,
    width: '100%',
    height: 2,
    borderRadius: 1,
    backgroundColor: '#C8922A',
  },
  tabsSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  avatarWrap: {
    width: 48,
    height: 48,
    marginRight: 14,
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
  },
  center: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginRight: 8,
  },
  nameUnread: {
    fontFamily: 'Manrope_700Bold',
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  bookingPill: {
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
    maxWidth: 110,
  },
  bookingPillText: {
    fontSize: 11,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  preview: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  previewEmpty: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    fontStyle: 'italic',
  },
})
