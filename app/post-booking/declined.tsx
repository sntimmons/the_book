import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

interface AlternativeProvider {
  id: string
  name: string
  meta: string
  rating: string | null
}

export default function BookingDeclined() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id?: string }>()

  const [alternatives, setAlternatives] = useState<AlternativeProvider[]>([])
  const [loading, setLoading] = useState(false)

  const loadAlternatives = useCallback(async () => {
    if (!id) {
      // No booking context, can't compute "similar" providers. Hide section.
      setAlternatives([])
      return
    }
    setLoading(true)
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('provider_id')
        .eq('id', id)
        .maybeSingle<{ provider_id: string }>()

      if (!booking) {
        setAlternatives([])
        return
      }

      const { data: declinedProvider } = await supabase
        .from('providers')
        .select('id, category_id')
        .eq('id', booking.provider_id)
        .maybeSingle<{ id: string; category_id: number | null }>()

      if (!declinedProvider || declinedProvider.category_id == null) {
        setAlternatives([])
        return
      }

      const { data: similar } = await supabase
        .from('providers')
        .select('id, display_name, neighborhood, average_rating, category_id')
        .eq('category_id', declinedProvider.category_id)
        .eq('is_approved', true)
        .neq('id', declinedProvider.id)
        .order('average_rating', { ascending: false, nullsFirst: false })
        .limit(3)

      let categoryName: string | null = null
      const { data: cat } = await supabase
        .from('categories')
        .select('name')
        .eq('id', declinedProvider.category_id)
        .maybeSingle()
      categoryName = (cat?.name as string) ?? null

      const rows: AlternativeProvider[] = (similar ?? []).map((p) => {
        const metaBits = [categoryName, p.neighborhood].filter(Boolean) as string[]
        return {
          id: p.id as string,
          name: (p.display_name as string) ?? 'Provider',
          meta: metaBits.join(' · '),
          rating:
            p.average_rating != null
              ? Number(p.average_rating).toFixed(1)
              : null,
        }
      })

      setAlternatives(rows)
    } catch (err) {
      console.log('Declined alternatives load error:', err)
      setAlternatives([])
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadAlternatives()
  }, [loadAlternatives])

  const showAlternatives = alternatives.length > 0 || loading

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 180 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusMark}>
          <Feather name="x" size={26} color="rgba(240,232,213,0.35)" />
        </View>

        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>NOT AVAILABLE</Text>
        </View>

        <Text style={styles.headline}>
          Not available{'\n'}for this one.
        </Text>

        <Text style={styles.subtext}>
          No charge was made to your account.{'\n'}
          Let's find you someone just as good.
        </Text>

        <View style={styles.refundBox}>
          <Feather name="check-circle" size={14} color="#4CAF50" />
          <Text style={styles.refundText}>No charge made to your account</Text>
        </View>

        {showAlternatives && (
          <>
            <View style={styles.separator} />
            <View style={styles.altSection}>
              <Text style={styles.sectionLabel}>TRY ONE OF THESE INSTEAD</Text>
              {loading ? (
                <View style={styles.skeletonRow}>
                  <View style={styles.skeletonAvatar} />
                  <View style={styles.skeletonStack}>
                    <View style={styles.skeletonLineWide} />
                    <View style={styles.skeletonLineNarrow} />
                  </View>
                </View>
              ) : (
                alternatives.map((p, i) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.altRow, i > 0 && styles.altRowBorder]}
                    activeOpacity={0.7}
                    onPress={() => router.push(('/providers/' + p.id) as never)}
                  >
                    <View style={styles.altAvatar}>
                      <Feather name="user" size={20} color="rgba(240,232,213,0.4)" />
                    </View>
                    <View style={styles.altCenter}>
                      <Text style={styles.altName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {p.meta.length > 0 && (
                        <Text style={styles.altMeta} numberOfLines={1}>
                          {p.meta}
                        </Text>
                      )}
                    </View>
                    {p.rating != null && (
                      <View style={styles.altRight}>
                        <View style={styles.altStarRow}>
                          <Feather name="star" size={10} color="#C8922A" />
                          <Text style={styles.altRating}>{p.rating}</Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.findBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/search')}
        >
          <Feather name="search" size={18} color="#080808" />
          <Text style={styles.findBtnText}>Find Another Provider</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.homeBtn}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/')}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  scroll: { flex: 1 },
  statusMark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 60,
  },
  statusBadge: {
    marginTop: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
  },
  headline: {
    marginTop: 16,
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    lineHeight: 34,
  },
  subtext: {
    marginTop: 10,
    paddingHorizontal: 40,
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  refundBox: {
    marginTop: 20,
    marginHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: 'rgba(76,175,80,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.15)',
    borderRadius: 12,
  },
  refundText: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 24,
    marginTop: 20,
  },
  altSection: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  altRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  altAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  altCenter: { flex: 1 },
  altName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  altMeta: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  altRight: { alignItems: 'flex-end' },
  altStarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  altRating: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  findBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  findBtnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  homeBtn: {
    height: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  skeletonAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  skeletonStack: { flex: 1, gap: 6 },
  skeletonLineWide: {
    height: 14,
    width: '60%',
    borderRadius: 4,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  skeletonLineNarrow: {
    height: 11,
    width: '40%',
    borderRadius: 4,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
})
