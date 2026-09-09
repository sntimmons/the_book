import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import type { Provider } from '@/hooks/useProviders'
import { buildDiscoveryLanes, DiscoveryProvider } from '@/lib/discovery'
import { cacheBustedPhoto } from '@/lib/image'

// The visible half of the beta discovery model (Correction 3, items S and T).
//
// The RULES live in lib/discovery.ts, which is pure and tested; this file only
// draws them. That split is deliberate: who gets seen is a product decision that
// has to be readable and arguable on its own, and it should not be buried inside
// a component alongside gradient stops.
//
// ── THE SUBTITLES ARE NOT DECORATION ──────────────────────────────────────
//
// Every row renders its rule underneath its name. A provider whose living
// depends on this feed is entitled to know why they are in a row, or why they
// are not, and a lane whose rule is invisible is one they cannot argue with. It
// also keeps the product honest: a row called "Available Soon" that quietly
// meant something else would be caught by its own caption.
//
// ── THESE ROWS DO NOT REPLACE THE FEED ────────────────────────────────────
//
// They sit ABOVE the complete grid, never instead of it. The lanes are an
// ordering of attention; the grid below is still every approved provider, so a
// provider who does not fit into a capped row is not thereby hidden. Rendering
// these alone would turn the lanes into a filter on who exists — see
// `providersWithNoLane` in lib/discovery.ts.

export interface DiscoveryLanesProps {
  providers: Provider[]
  /**
   * The ids the SERVER says are open today, or null when that is not known yet
   * (or could not be fetched).
   *
   * NULL IS NOT "NOBODY". It is passed through as `availableToday: null`, which
   * `lib/discovery.ts` treats as unknown — so the Available Soon lane is simply
   * absent rather than rendered empty or, far worse, rendered with providers
   * whose availability nobody established.
   */
  openTodayIds?: Set<string> | null
  viewerNeighborhood?: string | null
  viewerLocation?: string | null
}

// The mapping from the fetched row to the ONLY facts the rules are allowed to
// see. It is the narrow point: a content or engagement signal would have to be
// added here, to `DiscoveryProvider`, and to the module — three deliberate edits,
// none of them accidental.
function toDiscoveryProvider(p: Provider, openToday: Set<string> | null): DiscoveryProvider {
  return {
    id: p.id,
    neighborhood: p.neighborhood,
    location: p.location,
    createdAt: p.created_at,
    totalBookings: p.total_bookings,
    averageRating: p.average_rating ?? p.rating,
    availableToday: openToday === null ? null : openToday.has(p.id),
  }
}

function LaneCard({ provider }: { provider: Provider }) {
  const image = provider.heroImage ?? provider.profile_photo_url
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={s.card}
      onPress={() => router.push({ pathname: '/providers/[id]', params: { id: provider.id } })}
    >
      {image ? (
        <Image
          source={{ uri: cacheBustedPhoto(image) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        // NO PENALTY FOR HAVING NO PHOTOS. A provider with no portfolio still
        // appears in the row, in their proper place — they get a plain card, not
        // a worse position. Placement is decided in lib/discovery.ts, which
        // cannot see content at all.
        <View style={s.cardBlank} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(8,8,8,0.92)']}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.cardInfo}>
        <Text style={s.cardName} numberOfLines={1}>
          {provider.display_name}
        </Text>
        {provider.neighborhood ? (
          <Text style={s.cardMeta} numberOfLines={1}>
            {provider.neighborhood}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

export default function DiscoveryLanes({
  providers,
  openTodayIds = null,
  viewerNeighborhood = null,
  viewerLocation = null,
}: DiscoveryLanesProps) {
  const byId = new Map(providers.map((p) => [p.id, p]))
  const lanes = buildDiscoveryLanes({
    providers: providers.map((p) => toDiscoveryProvider(p, openTodayIds)),
    viewerNeighborhood,
    viewerLocation,
  })
  if (lanes.length === 0) return null

  return (
    <View>
      {lanes.map((lane) => (
        <View key={lane.key} style={s.lane}>
          <Text style={s.laneTitle}>{lane.title}</Text>
          <Text style={s.laneSubtitle}>{lane.subtitle}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.laneRow}
          >
            {lane.providers.map((lp) => {
              const provider = byId.get(lp.id)
              return provider ? <LaneCard key={lp.id} provider={provider} /> : null
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  lane: { marginTop: 22 },
  laneTitle: {
    paddingHorizontal: 24,
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  laneSubtitle: {
    paddingHorizontal: 24,
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  laneRow: { paddingHorizontal: 24, paddingTop: 12, gap: 12 },
  card: {
    width: 132,
    height: 176,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  cardBlank: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(240,232,213,0.05)' },
  cardInfo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  cardName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  cardMeta: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
  },
})
