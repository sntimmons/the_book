import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'

// Beta identity-verification trust notice, shown once near the start of the
// booking journey for unverified users. This is an EDUCATION screen only — there
// is no real verification here (no form, no upload, no scan, no vendor). It never
// changes any verification state. In beta, "Continue Booking" proceeds normally.
export default function BookVerification() {
  const insets = useSafeAreaInsets()
  const { setVerificationNoticeAcknowledged } = useBookingStore()

  function continueBooking() {
    // Acknowledged for this booking attempt so it is not shown again on re-entry.
    // This does NOT mark the user verified and writes nothing to the database.
    setVerificationNoticeAcknowledged(true)
    // Replace so the notice is not re-entered when the user backs out of service.
    router.replace('/book/service')
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 24, paddingBottom: 24, flexGrow: 1, justifyContent: 'center' }}
      >
        <View style={styles.badge}>
          <Feather name="shield" size={16} color="#C8922A" />
          <Text style={styles.badgeText}>Identity verification coming soon</Text>
        </View>

        <Text style={styles.title}>Built on real people.</Text>

        <Text style={styles.body}>
          The Book is being built around trust.
        </Text>
        <Text style={styles.body}>
          Before real transactions go live, both clients and providers will verify
          their identity so everyone knows they{'’'}re connecting with a real
          person.
        </Text>
        <Text style={styles.body}>
          For beta, identity verification is still being finalized, so you can
          continue booking for now.
        </Text>
        <Text style={styles.bodyMuted}>
          Thanks for helping us build a safer community from day one.
        </Text>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.continueBtn} activeOpacity={0.85} onPress={continueBooking}>
          <Text style={styles.continueText}>Continue Booking</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(200,146,42,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.35)',
    marginBottom: 20,
  },
  badgeText: { fontSize: 12, color: '#C8922A', fontFamily: 'Manrope_600SemiBold', letterSpacing: 0.3 },
  title: { fontSize: 28, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 18 },
  body: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
    marginBottom: 14,
  },
  bodyMuted: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    lineHeight: 21,
    marginTop: 2,
  },
  cta: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    gap: 10,
  },
  continueBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  continueText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  secondaryBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_600SemiBold' },
})
