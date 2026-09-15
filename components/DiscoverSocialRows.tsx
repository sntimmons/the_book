import { useEffect, useState } from 'react'
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useTheme } from '@/context/ThemeContext'
import { cacheBustedPhoto } from '@/lib/image'
import {
  DiscoverReelItem,
  FollowedActivityItem,
  activitySource,
  fetchDiscoverReels,
  fetchFollowedActivity,
} from '@/lib/discoverSocial'

// DISCOVER'S TWO SOCIAL / CONTENT ENTRY POINTS (Phase 4C).
//
// Both draw from `lib/discoverSocial.ts`, which is a SEPARATE path from
// `lib/discovery.ts` on purpose. Nothing in this file can influence lane
// membership, grid order or search: it never sees a `DiscoveryProvider` and
// never returns one.
//
// ── WHY THEY LOOK LIKE LANES BUT ARE NOT LANES ────────────────────────────
//
// They reuse the marketplace lanes' chrome — a title, a rule underneath, a
// horizontal row — because inventing a second visual language for two rows on
// the same screen would be noise. What keeps them honest is the rule line: the
// marketplace lanes say why a PROVIDER is in them, and these say where the
// CONTENT came from. Neither row is a ranking of people, and neither says it is.

function SectionHead({ title, rule }: { title: string; rule: string }) {
  const { colors, type } = useTheme()
  return (
    <>
      <Text style={[type.titleCard, s.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[type.bodySmall, s.rule, { color: colors.textSecondary }]}>{rule}</Text>
    </>
  )
}

function MediaTile({
  uri,
  width,
  height,
  label,
  onPress,
  video,
}: {
  uri: string | null
  width: number
  height: number
  label: string
  onPress: () => void
  video?: boolean
}) {
  const { colors } = useTheme()
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View
        style={[
          s.tile,
          { width, height, backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
        ]}
      >
        {uri ? (
          <Image source={{ uri: cacheBustedPhoto(uri) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={s.blank}>
            <Feather name="image" size={16} color={colors.textSecondary} />
          </View>
        )}
        {video ? (
          <View style={[s.playDot, { backgroundColor: colors.mediaScrim }]}>
            <Feather name="play" size={10} color={colors.textOnAction} />
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

/**
 * FROM PEOPLE YOU FOLLOW.
 *
 * Viewer-specific by construction: the follow set is queried first and bounds
 * everything after it, so a provider the viewer does not follow has no path into
 * this row. Hidden entirely when there is nothing — no placeholder, no filler,
 * and explicitly no fallback to popular or nearby providers, because a row with
 * this title showing strangers would be a lie about a relationship.
 */
export function FollowedActivityRow({ userId }: { userId: string | null | undefined }) {
  const { colors, type } = useTheme()
  const [items, setItems] = useState<FollowedActivityItem[]>([])

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setItems([])
      return
    }
    ;(async () => {
      const rows = await fetchFollowedActivity(userId)
      if (!cancelled) setItems(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (items.length === 0) return null

  return (
    <View style={s.section} testID="discover-followed-activity">
      <SectionHead title="From people you follow" rule="Recent work from providers you follow." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {items.map((item) => (
          <View key={item.postId} style={s.card}>
            <MediaTile
              uri={item.media}
              width={132}
              height={132}
              video={item.isVideo}
              label={`Work by ${item.providerName}. Open their profile.`}
              onPress={() =>
                router.push({ pathname: '/providers/[id]', params: { id: item.providerId } })
              }
            />
            {/* THE SOURCE, ON EVERY CARD (PD-120). Who it came from and when.
                Media with no attribution is indistinguishable from a
                recommendation, which is the one thing this row must not be. */}
            <Text numberOfLines={1} style={[type.caption, s.source, { color: colors.textSecondary }]}>
              {activitySource(item.providerName, item.createdAt)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

/**
 * THE REELS ENTRY.
 *
 * One doorway into the Reels experience that already exists — it builds no
 * second Reels infrastructure and owns no playback. Ordered by recency alone:
 * no like count, no view count, no engagement, no provider signal. "See the
 * work", not "these are the best providers".
 */
export function ReelsEntryRow() {
  const { colors, type } = useTheme()
  const [items, setItems] = useState<DiscoverReelItem[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await fetchDiscoverReels()
      if (!cancelled) setItems(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (items.length === 0) return null

  return (
    <View style={s.section} testID="discover-reels-entry">
      <View style={s.headRow}>
        <View style={s.headText}>
          <SectionHead title="See the work" rule="Recent reels from Houston providers." />
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/reels' as never)}
          accessibilityRole="button"
          accessibilityLabel="Open Reels"
          testID="discover-reels-open"
        >
          <Text style={[type.labelAction, { color: colors.actionText }]}>Open Reels</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {items.map((item, i) => (
          <MediaTile
            key={item.postId}
            uri={item.media}
            width={104}
            height={168}
            video
            label={`Reel ${i + 1} of ${items.length}. Open Reels.`}
            onPress={() => router.push('/(tabs)/reels' as never)}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  section: { marginTop: 32 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 20 },
  headText: { flex: 1 },
  title: { paddingHorizontal: 20 },
  rule: { paddingHorizontal: 20, marginTop: 2 },
  row: { paddingHorizontal: 20, paddingTop: 14, gap: 12 },
  card: { width: 132, gap: 6 },
  tile: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  blank: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playDot: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  source: { paddingHorizontal: 2 },
})
