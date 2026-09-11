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
        <Text style={s.eyebrow}>Community</Text>
        <TouchableOpacity onPress={() => openCommunity()} activeOpacity={0.8}>
          <Text style={s.seeAll}>Open</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.sub}>
        Ask for a recommendation, see who is open today, or tell people about someone good.
      </Text>

      {/* ASK — always present, because it is the thing to do when the rest is
          empty. In a 25-30 person beta that is most days, and a module whose
          only state is "nothing here" teaches people to stop looking. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {CLIENT_INTENTS.map((i) => (
          <TouchableOpacity
            key={i.key}
            style={s.askCard}
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
            <Feather name={i.icon as never} size={15} color="#C8922A" />
            <Text style={s.askTitle}>{i.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!user ? (
        <TouchableOpacity
          style={s.signedOut}
          activeOpacity={0.85}
          onPress={() => router.push('/auth/signin' as never)}
        >
          <Text style={s.signedOutText}>Sign in to see what people are asking</Text>
          <Feather name="chevron-right" size={15} color="rgba(240,232,213,0.4)" />
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
  return (
    <View style={{ gap: 8 }}>
      <View style={s.groupHead}>
        <Text style={s.groupTitle}>{title}</Text>
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.8}>
          <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.35)" />
        </TouchableOpacity>
      </View>
      {posts.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={s.item}
          activeOpacity={0.85}
          onPress={() => router.push(`/community/${p.id}` as never)}
        >
          <Text style={s.itemMeta} numberOfLines={1}>
            {p.author.name} · {intentLabel(p.intent)} · {timeAgo(p.createdAt)}
          </Text>
          <Text style={s.itemText} numberOfLines={2}>
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
    color: 'rgba(240,232,213,0.45)',
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  seeAll: { color: '#C8922A', fontSize: 12, fontWeight: '600' },
  sub: { color: 'rgba(240,232,213,0.4)', fontSize: 12, lineHeight: 17 },
  row: { gap: 8, paddingVertical: 4 },
  askCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  askTitle: { color: 'rgba(240,232,213,0.8)', fontSize: 12, fontWeight: '600' },
  signedOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  signedOutText: { color: 'rgba(240,232,213,0.55)', fontSize: 12 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  groupTitle: { color: 'rgba(240,232,213,0.7)', fontSize: 13, fontWeight: '600' },
  item: {
    padding: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
    gap: 4,
  },
  itemMeta: { color: 'rgba(240,232,213,0.35)', fontSize: 11 },
  itemText: { color: 'rgba(240,232,213,0.82)', fontSize: 13, lineHeight: 18 },
})
