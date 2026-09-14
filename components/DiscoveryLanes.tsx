import { View, Text, ScrollView, StyleSheet } from 'react-native'
import type { Provider, Category } from '@/hooks/useProviders'
import { buildDiscoveryLanes, DiscoveryProvider } from '@/lib/discovery'
import { displayRating } from '@/lib/reputationLabel'
import { useTheme } from '@/context/ThemeContext'
import ProviderCard from '@/components/ui/ProviderCard'

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
  /** For resolving a provider's trade name on the card. */
  categories?: Category[]
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
    // `displayRating`, NOT `average_rating ?? rating`. Both columns are
    // `NOT NULL DEFAULT 0`, so the nullish coalescing never yields null and an
    // UNRATED provider arrived here as `averageRating: 0` — while
    // `DiscoveryProvider` documents that field as "their revealed review average,
    // or **null** when they have no revealed reviews".
    //
    // 0 is not a rating. The scale starts at 1, and `lib/reputationLabel.ts`
    // exists because six screens were each answering "does this provider have a
    // rating yet" differently; this mapping was a seventh. Feeding 0 into
    // `byBookingsThenRating` ranks an unrated provider below a one-star one in
    // Popular — treating an absence as the worst possible verdict.
    averageRating: displayRating(p),
    availableToday: openToday === null ? null : openToday.has(p.id),
  }
}

const LANE_CARD_WIDTH = 148

function tradeName(p: Provider, categories: Category[]): string | null {
  return categories.find((c) => c.id === p.category_id)?.name ?? p.custom_category ?? null
}

export default function DiscoveryLanes({
  providers,
  openTodayIds = null,
  viewerNeighborhood = null,
  viewerLocation = null,
  categories = [],
}: DiscoveryLanesProps) {
  const { colors, type } = useTheme()
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
          <Text style={[type.titleCard, s.laneTitle, { color: colors.textPrimary }]}>
            {lane.title}
          </Text>
          {/* THE SUBTITLE IS THE RULE, and it stays visible. A provider whose
              living depends on this feed is entitled to know why they are in a
              row — or why they are not. */}
          <Text style={[type.bodySmall, s.laneSubtitle, { color: colors.textSecondary }]}>
            {lane.subtitle}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.laneRow}
          >
            {lane.providers.map((lp) => {
              const provider = byId.get(lp.id)
              if (!provider) return null
              return (
                <ProviderCard
                  key={lp.id}
                  variant="lane"
                  width={LANE_CARD_WIDTH}
                  testID={`lane-card-${lane.key}`}
                  provider={{
                    id: provider.id,
                    displayName: provider.display_name,
                    businessName: provider.business_name,
                    trade: tradeName(provider, categories),
                    neighborhood: provider.neighborhood,
                    image: provider.heroImage ?? provider.profile_photo_url,
                    averageRating: provider.average_rating,
                    rating: provider.rating,
                    // Deliberately NOT passed: the lane itself is the open-today
                    // statement, so a chip on every card inside it repeats one
                    // fact twelve times.
                  }}
                />
              )
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  lane: { marginTop: 28 },
  laneTitle: { paddingHorizontal: 20 },
  laneSubtitle: { paddingHorizontal: 20, marginTop: 2 },
  laneRow: { paddingHorizontal: 20, paddingTop: 14, gap: 12 },
})
