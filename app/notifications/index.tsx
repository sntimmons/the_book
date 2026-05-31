import { useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AppNotification,
  NotificationType,
  useNotifications,
} from '../../hooks/useNotifications'

interface IconConfig {
  name: keyof typeof Ionicons.glyphMap
  color: string
  bg: string
}

function getIcon(type: NotificationType): IconConfig {
  switch (type) {
    case 'booking_accepted':
      return {
        name: 'checkmark-circle',
        color: '#4CAF50',
        bg: 'rgba(76,175,80,0.1)',
      }
    case 'booking_declined':
    case 'booking_cancelled':
      return {
        name: 'close-circle',
        color: 'rgba(240,232,213,0.4)',
        bg: 'rgba(240,232,213,0.06)',
      }
    case 'new_booking_request':
      return {
        name: 'calendar',
        color: '#C8922A',
        bg: 'rgba(200,146,42,0.1)',
      }
    case 'booking_completed':
      return {
        name: 'star',
        color: '#C8922A',
        bg: 'rgba(200,146,42,0.1)',
      }
    case 'new_message':
      return {
        name: 'chatbubble',
        color: '#F0E8D5',
        bg: 'rgba(240,232,213,0.08)',
      }
    default:
      return {
        name: 'notifications',
        color: 'rgba(240,232,213,0.4)',
        bg: 'rgba(240,232,213,0.06)',
      }
  }
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const { notifications, unreadCount, loading, refetch, markAllRead } =
    useNotifications()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  function handleNotificationTap(notif: AppNotification) {
    // For new_message, bookingId is repurposed to carry the conversation id.
    if (notif.type === 'new_message') {
      router.push(`/messages/${notif.bookingId}` as never)
      return
    }
    // Decision-phase handoffs land on the post-booking confirmation/decline
    // screens, which already accept ?id= and load real booking data.
    if (notif.type === 'booking_accepted') {
      router.push(`/post-booking/accepted?id=${notif.bookingId}` as never)
      return
    }
    if (notif.type === 'booking_declined') {
      router.push(`/post-booking/declined?id=${notif.bookingId}` as never)
      return
    }
    router.push(`/bookings/${notif.bookingId}` as never)
  }

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={markAllRead}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Text style={styles.markReadText}>Mark read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {loading && notifications.length === 0 ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color="#C8922A" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="notifications-outline"
            size={48}
            color="rgba(240,232,213,0.15)"
            style={{ marginBottom: 16 }}
          />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptySub}>
            You will be notified when your bookings are confirmed, completed, or
            cancelled.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#C8922A"
            />
          }
        >
          {notifications.map((notif) => {
            const icon = getIcon(notif.type)
            return (
              <TouchableOpacity
                key={notif.id}
                style={[styles.row, !notif.isRead && styles.rowUnread]}
                activeOpacity={0.7}
                onPress={() => handleNotificationTap(notif)}
              >
                <View style={[styles.iconCircle, { backgroundColor: icon.bg }]}>
                  <Ionicons name={icon.name} size={24} color={icon.color} />
                </View>
                <View style={styles.center}>
                  <Text style={styles.title}>{notif.title}</Text>
                  <Text style={styles.body} numberOfLines={2}>
                    {notif.body}
                  </Text>
                </View>
                <Text style={styles.timeText}>{timeAgo(notif.createdAt)}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  markReadText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
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
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  rowUnread: {
    backgroundColor: 'rgba(200,146,42,0.025)',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  center: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 3,
  },
  body: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  timeText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginLeft: 8,
    marginTop: 2,
  },
})
