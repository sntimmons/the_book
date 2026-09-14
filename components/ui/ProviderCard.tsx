import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useTheme } from '@/context/ThemeContext'
import { cacheBustedPhoto } from '@/lib/image'
import { displayRating } from '@/lib/reputationLabel'

// ONE PROVIDER CARD, TWO VARIANTS.
//
// Discover used to draw a provider twice — a lane card in DiscoveryLanes and a
// masonry tile in the feed — each deciding for itself what a rating is, what to
// do with no photo, and what may be claimed. Truth logic duplicated across two
// components drifts, and it drifted: one showed a "Featured" badge the other did
// not, and only one used `displayRating`. The facts a client may be shown before
// they tap are a product rule, so they live in one place.
//
// ── WHAT THIS CARD MAY NEVER SHOW ─────────────────────────────────────────
//
// No completed-booking count (PD-126: context on a profile, never a browse
// signal), no follower count, no likes or engagement, no verification mark
// (PD-004 — no such capability exists), no Featured or Trending, no single
// provider-level price, and no availability beyond the one fact the server can
// answer. A field that is not in `ProviderCardData` cannot be rendered by
// accident.

export type ProviderCardVariant = 'lane' | 'grid'

export interface ProviderCardData {
  id: string
  displayName: string
  businessName?: string | null
  /** Resolved trade/category name, already fallen back to custom_category. */
  trade?: string | null
  neighborhood?: string | null
  /** Best portfolio photo, else profile photo. Null renders the neutral tile. */
  image?: string | null
  /** Canonical rating columns; `displayRating` decides whether one exists. */
  averageRating?: number | null
  rating?: number | null
  /**
   * The SERVER's answer to "open today". Rendered ONLY when exactly true —
   * null means nobody asked, and an unanswered question is not a fact.
   */
  openToday?: boolean | null
}

/** The label under the name: business when it differs from the person, else trade. */
export function providerSubtitle(p: ProviderCardData): string | null {
  const parts = [p.trade, p.neighborhood].filter(
    (v): v is string => !!v && v.trim().length > 0,
  )
  return parts.length > 0 ? parts.join('  ·  ') : null
}

/** The rating to draw, or null. Never 0.0, and "New" is never styled as a score. */
export function cardRating(p: ProviderCardData): string | null {
  const r = displayRating({ average_rating: p.averageRating ?? null, rating: p.rating ?? null })
  return r == null ? null : r.toFixed(1)
}

export default function ProviderCard({
  provider,
  variant,
  width,
  testID,
}: {
  provider: ProviderCardData
  variant: ProviderCardVariant
  /** Explicit width so a grid column and a lane row can size their own cards. */
  width: number
  testID?: string
}) {
  const { colors, type } = useTheme()
  const lane = variant === 'lane'
  const mediaHeight = lane ? Math.round(width * 1.0) : Math.round(width * 0.92)
  const rating = cardRating(provider)
  const subtitle = providerSubtitle(provider)
  const name = provider.businessName?.trim() || provider.displayName

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${subtitle ? `, ${subtitle}` : ''}${rating ? `, rated ${rating}` : ''}`}
      testID={testID}
      style={[styles.root, { width }]}
      onPress={() => router.push({ pathname: '/providers/[id]', params: { id: provider.id } })}
    >
      <View
        style={[
          styles.media,
          { height: mediaHeight, backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
        ]}
      >
        {provider.image ? (
          <Image
            source={{ uri: cacheBustedPhoto(provider.image) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Work by ${name}`}
          />
        ) : (
          // A NEUTRAL TILE, NOT A PERSON-SHAPED ONE. The old fallback was a human
          // silhouette, which draws the absence of a photo as the absence of a
          // PERSON — and a provider with no portfolio yet is not a missing
          // provider. This says only that there is no picture.
          <View
            accessible
            accessibilityLabel={`${name}, no photo yet`}
            style={[styles.blank, { backgroundColor: colors.bgSubtle }]}
          >
            <Feather name="image" size={lane ? 18 : 22} color={colors.textSecondary} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={[lane ? type.labelAction : type.titleCard, { color: colors.textPrimary }]}
        >
          {name}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={[lane ? type.caption : type.bodySmall, styles.subtitle, { color: colors.textSecondary }]}
          >
            {subtitle}
          </Text>
        ) : null}

        {/* Rating and the open-today fact share a row so neither becomes a
            badge stack. Both are omitted rather than shown empty. */}
        {rating || provider.openToday === true ? (
          <View style={styles.factRow}>
            {rating ? (
              <View style={styles.rating}>
                <Feather name="star" size={lane ? 10 : 12} color={colors.textPrimary} />
                <Text style={[type.caption, styles.ratingText, { color: colors.textPrimary }]}>
                  {rating}
                </Text>
              </View>
            ) : null}
            {/* GRID ONLY, and only when the server said true. "Open today" means
                published hours include today — not a free slot, not "available
                now". The lane rows already carry this as a whole row, so
                repeating it on a lane card would say it twice. */}
            {!lane && provider.openToday === true ? (
              <Text style={[type.caption, { color: colors.statusLocal }]}>Open today</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  media: {
    width: '100%',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  blank: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 2 },
  subtitle: { marginTop: 1 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { marginTop: 1 },
})
