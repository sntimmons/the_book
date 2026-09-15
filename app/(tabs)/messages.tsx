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
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Conversation, useConversations } from '../../hooks/useMessaging'
import { inboxSection } from '@/lib/messageRequests'
import { useTheme } from '@/context/ThemeContext'
import { FONT, type Theme } from '@/lib/theme/tokens'

// THE FILTER KEY IS STILL 'all'. Only its LABEL changed, to "Conversations".
// Renaming the key would have been a bigger diff for no gain and would have
// invited the reading that the filter's behaviour changed with its name. It did
// not: this is `inboxSection(...) === 'active'` before and after.
type Filter = 'all' | 'requests' | 'bookings'

// "All" was not all. The filter excludes pending requests, which live under
// Requests, and declined ones, which are hidden from the active lists — so the
// label promised a complete view and showed a partial one. A viewer whose only
// conversation was a pending request saw an empty "All" and was told there was
// nothing here. "Conversations" describes what the list actually holds.
const FILTER_LABEL: Record<Filter, string> = {
  all: 'Conversations',
  requests: 'Requests',
  bookings: 'Bookings',
}

// Each empty state describes ITS OWN filter and instructs nothing. The previous
// copy for this list read "Message a provider to get started" — an instruction
// this screen cannot carry out, because the compose control was deliberately
// removed when conversation creation was found to be unwired. Telling someone to
// do something and giving them no way to do it is worse than saying less.
const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: 'No conversations yet',
    body: 'Ongoing conversations will appear here.',
  },
  requests: {
    title: 'No message requests',
    body: 'New message requests will appear here.',
  },
  bookings: {
    title: 'No booking conversations',
    body: 'Conversations connected to bookings will appear here.',
  },
}

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

function Shimmer({ style, color }: { style: any; color: string }) {
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
    <Animated.View style={[{ backgroundColor: color, opacity }, style]} />
  )
}

export default function MessagesInboxScreen() {
  const insets = useSafeAreaInsets()
  const { colors, type, scheme } = useTheme()
  const { conversations, loading, refetch } = useConversations()
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<Filter>('all')

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  // 'all' shows open conversations only (pending requests live under Requests;
  // declined requests are hidden from the active lists). 'requests' shows pending
  // requests (incoming for a provider, sent for a client). 'bookings' unchanged.
  // UNCHANGED BY THIS MIGRATION — the label moved, the predicate did not.
  const filtered =
    activeFilter === 'requests'
      ? conversations.filter((c) => inboxSection(c.request_status) === 'requests')
      : activeFilter === 'bookings'
        ? conversations.filter(
            (c) => c.booking_id !== null && inboxSection(c.request_status) !== 'hidden',
          )
        : conversations.filter((c) => inboxSection(c.request_status) === 'active')

  const requestCount = conversations.filter(
    (c) => inboxSection(c.request_status) === 'requests',
  ).length

  const empty = EMPTY_COPY[activeFilter]

  return (
    <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
      {/* The bar follows the SCHEME, not a hardcoded 'light'. This screen used
          to force light status-bar content because it was permanently dark;
          on a Porch canvas that is invisible text on a pale ground. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={[type.titleLarge, { color: colors.textPrimary }]}>Messages</Text>
        {/* Compose entry stays hidden: it was a no-op. Restore only when new-message
            conversation creation is wired from here. */}
      </View>

      {/* Text + underline, deliberately NOT segmented pills. These are three real
          controls with real states, so the selected-tab affordance is truthful
          here — unlike the inert one Reels carried. */}
      <View style={styles.tabs}>
        {(['all', 'requests', 'bookings'] as Filter[]).map((tab) => {
          const active = activeFilter === tab
          return (
            <TouchableOpacity
              key={tab}
              activeOpacity={0.7}
              style={styles.tab}
              onPress={() => setActiveFilter(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  type.labelAction,
                  { color: active ? colors.textPrimary : colors.textSecondary },
                ]}
              >
                {FILTER_LABEL[tab]}
                {/* A truthful count, inside the filter and nowhere else. It is a
                    count of things waiting, not an alert, so it reads as part of
                    the label rather than as a badge. The Messages TAB carries no
                    badge — that would be new unread semantics. */}
                {tab === 'requests' && requestCount > 0 ? ` (${requestCount})` : ''}
              </Text>
              {active && (
                <View style={[styles.tabUnderline, { backgroundColor: colors.textPrimary }]} />
              )}
            </TouchableOpacity>
          )
        })}
      </View>
      <View style={[styles.tabsSeparator, { backgroundColor: colors.borderSubtle }]} />

      {loading && conversations.length === 0 ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} colors={colors} />
          ))}
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          {/* Type-led and quiet. No decorative icon: a 48pt chat glyph at 15%
              opacity was the loudest thing on an empty screen. */}
          <Text style={[styles.emptyTitle, type.titleCard, { color: colors.textPrimary }]}>
            {empty.title}
          </Text>
          <Text style={[styles.emptySub, type.bodyDefault, { color: colors.textSecondary }]}>
            {empty.body}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textSecondary}
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
  const { colors, type } = useTheme()
  const initial = (convo.other_party_name || 'C').charAt(0).toUpperCase()
  const unread = convo.unread_count > 0
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
      onPress={() => router.push(`/messages/${convo.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={
        unread
          ? `${convo.other_party_name}, unread conversation`
          : convo.other_party_name
      }
    >
      {/* A HAIRLINE-SEPARATED ROW, NOT A CARD. The visual system names
          hairline-separated rows as the reference pattern for lists of facts,
          and a card per conversation would put a container around every one of
          them for no gain. */}
      <View style={styles.avatarWrap}>
        {/* A monogram, not a photograph. There is no photo to show: the
            messaging data layer carries no avatar URL for either party, so this
            is the honest representation rather than a placeholder standing in
            for something we have. */}
        <View style={[styles.avatar, { backgroundColor: colors.bgSubtle }]}>
          <Text style={[type.titleCard, { color: colors.textSecondary }]}>{initial}</Text>
        </View>
        {/* Unread is carried by the NAME'S WEIGHT first and this dot second.
            Colour is never the only carrier of a state, and no number is shown —
            a count would be new unread semantics. */}
        {unread && (
          <View
            style={[
              styles.unreadDot,
              { backgroundColor: colors.statusLocal, borderColor: colors.bgCanvas },
            ]}
          />
        )}
      </View>

      <View style={styles.center}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.name,
              type.bodyLarge,
              // WEIGHT, NOT SIZE. Swapping the ramp entry would change the name's
              // size between read and unread and shift every row below it as
              // messages arrive. Only the face changes.
              { color: colors.textPrimary, fontFamily: unread ? FONT.extrabold : FONT.semibold },
            ]}
            numberOfLines={1}
          >
            {convo.other_party_name}
          </Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {timeAgo(convo.last_message_at)}
          </Text>
        </View>

        {/* Booking context is a LINE, not a pill. It is a fact about this
            conversation, and a bordered chip makes a fact look like a filter.
            Cypress is the colour of place and truthful status in this system —
            used here as a screen-specific treatment for context, not as a new
            universal rule. */}
        {convo.booking_service ? (
          <Text
            style={[styles.context, type.labelMeta, { color: colors.statusLocal }]}
            numberOfLines={1}
          >
            {convo.booking_service}
          </Text>
        ) : null}

        <Text
          style={[styles.preview, type.bodySmall, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {convo.last_message_preview || 'No messages yet'}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

function SkeletonRow({ colors }: { colors: Theme['colors'] }) {
  return (
    <View style={[styles.row, { borderBottomWidth: 0 }]}>
      <Shimmer
        color={colors.bgSubtle}
        style={{ width: 44, height: 44, borderRadius: 22, marginRight: 14 }}
      />
      <View style={{ flex: 1 }}>
        <Shimmer color={colors.bgSubtle} style={{ width: '60%', height: 13, borderRadius: 4 }} />
        <Shimmer
          color={colors.bgSubtle}
          style={{ width: '85%', height: 12, borderRadius: 4, marginTop: 8 }}
        />
      </View>
    </View>
  )
}

// STRUCTURE ONLY — every colour resolves from the theme at render time. A
// StyleSheet is built once at module load, so a colour baked in here cannot
// follow a Light/Dark/System change; this screen previously held 22 literals
// from the retired The Book palette and could not respond to the setting at all.
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabs: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  tab: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  tabUnderline: {
    marginTop: 4,
    width: '100%',
    height: 2,
    borderRadius: 1,
  },
  tabsSeparator: {
    height: StyleSheet.hairlineWidth,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    marginRight: 14,
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  center: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
  },
  context: {
    marginTop: 2,
  },
  preview: {
    marginTop: 2,
  },
})
