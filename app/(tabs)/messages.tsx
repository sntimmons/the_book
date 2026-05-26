import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type FilterTab = 'All' | 'Bookings' | 'Requests'

interface Conversation {
  id: string
  name: string
  preview: string
  timestamp: string
  unread: number
  online: boolean
  hasBooking: boolean
  isYou?: boolean
}

const CONVERSATIONS: Conversation[] = [
  {
    id: '1',
    name: 'Nia Laurent',
    preview: 'Your appointment is confirmed...',
    timestamp: '2m ago',
    unread: 2,
    online: true,
    hasBooking: true,
  },
  {
    id: '2',
    name: 'Marcus Blade',
    preview: 'Sounds good, see you Thursday!',
    timestamp: '1h ago',
    unread: 0,
    online: false,
    hasBooking: false,
  },
  {
    id: '3',
    name: 'Camille Brooks',
    preview: 'I can do knotless, no problem.',
    timestamp: 'Yesterday',
    unread: 0,
    online: false,
    hasBooking: true,
  },
  {
    id: '4',
    name: 'Jordan Ellis',
    preview: 'You: Thanks so much!',
    timestamp: 'Mon',
    unread: 0,
    online: false,
    hasBooking: false,
    isYou: true,
  },
]

export default function MessagesInbox() {
  const insets = useSafeAreaInsets()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All')

  const filteredConversations =
    activeFilter === 'All'
      ? CONVERSATIONS
      : activeFilter === 'Bookings'
        ? CONVERSATIONS.filter((c) => c.hasBooking)
        : []

  function handleCompose() {
    Alert.alert(
      'New Message',
      'Search for a provider to message them directly.',
      [
        {
          text: 'Search Providers',
          onPress: () => router.push('/(tabs)/search'),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    )
  }

  function handleRequests() {
    Alert.alert(
      'Message Requests',
      "You have 2 message requests from people you don't follow.",
      [{ text: 'OK' }],
    )
  }

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity
          style={styles.composeBtn}
          activeOpacity={0.7}
          onPress={handleCompose}
        >
          <Feather name="edit" size={16} color="#F0E8D5" />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['All', 'Bookings', 'Requests'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterPill, activeFilter === tab && styles.filterPillActive]}
            activeOpacity={0.7}
            onPress={() => setActiveFilter(tab)}
          >
            <Text style={[styles.filterText, activeFilter === tab && styles.filterTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {/* Message requests banner */}
        <View style={styles.requestsSection}>
          <TouchableOpacity
            style={styles.requestsBanner}
            activeOpacity={0.8}
            onPress={handleRequests}
          >
            <View style={styles.requestsLeft}>
              <View style={styles.requestAvatars}>
                <View style={styles.requestAvatar}>
                  <Feather name="user" size={14} color="rgba(240,232,213,0.4)" />
                </View>
                <View style={[styles.requestAvatar, styles.requestAvatarOverlap]}>
                  <Feather name="user" size={14} color="rgba(240,232,213,0.4)" />
                </View>
              </View>
              <View>
                <Text style={styles.requestsTitle}>2 message requests</Text>
                <Text style={styles.requestsSub}>From people you don't follow</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={14} color="rgba(240,232,213,0.3)" />
          </TouchableOpacity>
        </View>

        {/* Section label */}
        <Text style={styles.sectionLabel}>TODAY</Text>

        {activeFilter === 'Requests' && (
          <View style={styles.emptyRequests}>
            <Feather name="inbox" size={36} color="rgba(240,232,213,0.1)" />
            <Text style={styles.emptyRequestsText}>No message requests</Text>
          </View>
        )}

        {/* Conversation threads */}
        {filteredConversations.map((convo) => (
          <TouchableOpacity
            key={convo.id}
            style={styles.threadRow}
            activeOpacity={0.7}
            onPress={() => router.push(`/messages/${convo.id}` as any)}
          >
            {/* Avatar */}
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}>
                <Feather name="user" size={22} color="rgba(240,232,213,0.2)" />
              </View>
              {convo.online && <View style={styles.onlineDot} />}
              {convo.unread > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{convo.unread}</Text>
                </View>
              )}
            </View>

            {/* Content */}
            <View style={styles.threadContent}>
              <View style={styles.threadTopRow}>
                <Text style={[styles.threadName, convo.unread > 0 && styles.threadNameUnread]}>
                  {convo.name}
                </Text>
                <Text style={styles.threadTimestamp}>{convo.timestamp}</Text>
              </View>
              <View style={styles.threadBottomRow}>
                <Text
                  style={[styles.threadPreview, convo.unread > 0 && styles.threadPreviewUnread]}
                  numberOfLines={1}
                >
                  {convo.preview}
                </Text>
                {convo.hasBooking && (
                  <View style={styles.bookingPill}>
                    <Text style={styles.bookingPillText}>Booking</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  title: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  composeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.08)',
  },
  filterPillActive: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.25)',
  },
  filterText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  filterTextActive: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  scroll: {
    flex: 1,
  },
  requestsSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  requestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(200,146,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.15)',
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 12,
  },
  requestsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requestAvatars: {
    flexDirection: 'row',
    width: 54,
  },
  requestAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAvatarOverlap: {
    marginLeft: -10,
  },
  requestsTitle: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  requestsSub: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  threadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.04)',
  },
  avatarWrap: {
    position: 'relative',
    width: 52,
    height: 52,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#080808',
  },
  unreadBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    fontSize: 10,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  threadContent: {
    flex: 1,
  },
  threadTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  threadName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  threadNameUnread: {
    fontFamily: 'Manrope_700Bold',
  },
  threadTimestamp: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  threadBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threadPreview: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginRight: 8,
  },
  threadPreviewUnread: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  bookingPill: {
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bookingPillText: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  emptyRequests: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyRequestsText: {
    marginTop: 12,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
})
