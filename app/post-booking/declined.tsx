import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ALTERNATIVES = [
  {
    name: 'Camille Brooks',
    meta: 'Lash Tech · Montrose',
    rating: '4.9',
    availability: 'Available today',
  },
  {
    name: 'Jade Williams',
    meta: 'Lash & Brows · Midtown',
    rating: '4.8',
    availability: 'Available Thu',
  },
]

export default function BookingDeclined() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 180 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status mark */}
        <View style={styles.statusMark}>
          <Feather name="x" size={26} color="rgba(240,232,213,0.35)" />
        </View>

        {/* Status badge */}
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>NOT AVAILABLE</Text>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>
          She isn't available{'\n'}for this one.
        </Text>

        {/* Subtext */}
        <Text style={styles.subtext}>
          No charge was made to your account.{'\n'}
          Let's find you someone just as good.
        </Text>

        {/* Refund confirmation */}
        <View style={styles.refundBox}>
          <Feather name="check-circle" size={14} color="#4CAF50" />
          <Text style={styles.refundText}>No charge made to your account</Text>
        </View>

        <View style={styles.separator} />

        {/* Alternative providers */}
        <View style={styles.altSection}>
          <Text style={styles.sectionLabel}>TRY ONE OF THESE INSTEAD</Text>

          {ALTERNATIVES.map((p, i) => (
            <TouchableOpacity
              key={p.name}
              style={[styles.altRow, i > 0 && styles.altRowBorder]}
              activeOpacity={0.7}
              onPress={() => router.push('/providers/1')}
            >
              <View style={styles.altAvatar}>
                <Feather name="user" size={20} color="rgba(240,232,213,0.4)" />
              </View>
              <View style={styles.altCenter}>
                <Text style={styles.altName}>{p.name}</Text>
                <Text style={styles.altMeta}>{p.meta}</Text>
              </View>
              <View style={styles.altRight}>
                <View style={styles.altStarRow}>
                  <Feather name="star" size={10} color="#C8922A" />
                  <Text style={styles.altRating}>{p.rating}</Text>
                </View>
                <Text style={styles.altAvailability}>{p.availability}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Bottom buttons */}
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
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scroll: {
    flex: 1,
  },
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
  altCenter: {
    flex: 1,
  },
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
  altRight: {
    alignItems: 'flex-end',
  },
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
  altAvailability: {
    marginTop: 3,
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_400Regular',
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
})
