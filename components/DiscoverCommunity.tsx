import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '@/context/AuthContext'
import {
  CLIENT_INTENTS,
  CommunityPostView,
  fetchDiscoverCommunity,
  intentLabel,
  timeAgo,
} from '@/lib/community'
import { useTheme } from '@/context/ThemeContext'

// ── COMMUNITY, ON DISCOVER ────────────────────────────────────────────────
//
// A DOORWAY, NOT A FEED. Discover is the marketplace and stays the marketplace:
// this module is four capped rows near the bottom of it, and every one of them
// leads out to Community rather than trying to be Community.
//
// THREE RULES IT KEEPS, all of them the same rule from different directions:
//
//   * It shows at most three items per group and never grows. A module that can
//     grow is a feed that has not grown yet.
//   * It never reorders a single provider in the grid above it. Community
//     engagement is not an input to marketplace ranking anywhere in this product
//     — lib/discovery.ts enforces that with a type that carries no content
//     field, and nothing here touches that path.
//   * A provider who never posts loses nothing by it. This module can only ADD a
//     way to be found; it cannot subtract one.
//
// Signed-out viewers see the prompt and not the content: the block filter is
// per-viewer and there is no viewer to filter for, so the read is refused by
// design rather than degraded.

export default function DiscoverCommunity() {
  // Phase 4B: Discover migrated onto the Third theme, and this block sits
  // inside it, so it answers the same appearance.
  const { colors } = useTheme()
  const { user } = useAuth()
  const [data, setData] = useState<{
    openToday: CommunityPostView[]
    updates: CommunityPostView[]
    shoutouts: CommunityPostView[]
    asks: CommunityPostView[]
  } | null>(null)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      ;(async () => {
        if (!user) {
          setData(null)
          return
        }
        const d = await fetchDiscoverCommunity(3)
        if (!cancelled) setData(d)
      })()
      return () => {
        cancelled = true
      }
    }, [user]),
  )

  const openCommunity = (intent?: string) =>
    router.push(
      (intent ? { pathname: '/community', params: { intent } } : '/community') as never,
    )

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={[s.eyebrow, { color: colors.statusLocal }]}>Community</Text>
        <TouchableOpacity onPress={() => openCommunity()} activeOpacity={0.8}>
          <Text style={[s.seeAll, { color: colors.actionText }]}>Open</Text>
        </TouchableOpacity>
      </View>
      <Text style={[s.sub, { color: colors.textSecondary }]}>
        Ask for a recommendation, see who is open today, or tell people about someone good.
      </Text>

      {/* ASK — always present, because it is the thing to do when the rest is
          empty. In a 25-30 person beta that is most days, and a module whose
          only state is "nothing here" teaches people to stop looking. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {CLIENT_INTENTS.map((i) => (
          <TouchableOpacity
            key={i.key}
            style={[s.askCard, { backgroundColor: colors.bgSurface }]}
            activeOpacity={0.85}
            onPress={() =>
              user
                ? router.push({
                    pathname: '/community/compose',
                    params: { intent: i.key },
                  } as never)
                : router.push('/auth/signin' as never)
            }
          >
            <Feather name={i.icon as never} size={15} color={colors.statusLocal} />
            <Text style={[s.askTitle, { color: colors.textPrimary }]}>{i.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!user ? (
        <TouchableOpacity
          style={[s.signedOut, { backgroundColor: colors.bgSurface }]}
          activeOpacity={0.85}
          onPress={() => router.push('/auth/signin' as never)}
        >
          <Text style={[s.signedOutText, { color: colors.textSecondary }]}>Sign in to see what people are asking</Text>
          <Feather name="chevron-right" size={15} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {data?.openToday.length ? (
        <Group
          title="Open today"
          posts={data.openToday}
          onSeeAll={() => openCommunity('open_today')}
        />
      ) : null}
      {data?.asks.length ? (
        <Group title="People are asking" posts={data.asks} onSeeAll={() => openCommunity()} />
      ) : null}
      {data?.shoutouts.length ? (
        <Group
          title="Recommended by clients"
          posts={data.shoutouts}
          onSeeAll={() => openCommunity('shoutout')}
        />
      ) : null}
      {data?.updates.length ? (
        <Group
          title="Provider updates"
          posts={data.updates}
          onSeeAll={() => openCommunity('update')}
        />
      ) : null}
    </View>
  )
}

function Group({
  title,
  posts,
  onSeeAll,
}: {
  title: string
  posts: CommunityPostView[]
  onSeeAll: () => void
}) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <View style={s.groupHead}>
        <Text style={[s.groupTitle, { color: colors.textPrimary }]}>{title}</Text>
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.8}>
          <Feather name="chevron-right" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      {posts.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={[s.item, { backgroundColor: colors.bgSurface }]}
          activeOpacity={0.85}
          onPress={() => router.push(`/community/${p.id}` as never)}
        >
          <Text style={[s.itemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {p.author.name} · {intentLabel(p.intent)} · {timeAgo(p.createdAt)}
          </Text>
          <Text style={[s.itemText, { color: colors.textPrimary }]} numberOfLines={2}>
            {p.content}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 28, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  seeAll: { fontSize: 12, fontWeight: '600' },
  sub: { fontSize: 12, lineHeight: 17 },
  row: { gap: 8, paddingVertical: 4 },
  askCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  askTitle: { fontSize: 12, fontWeight: '600' },
  signedOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  signedOutText: { fontSize: 12 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  groupTitle: { fontSize: 13, fontWeight: '600' },
  item: {
    padding: 11,
    borderRadius: 12,
    gap: 4,
  },
  itemMeta: { fontSize: 11 },
  itemText: { fontSize: 13, lineHeight: 18 },
})
