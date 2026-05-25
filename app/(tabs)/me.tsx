import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function MeScreen() {
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={styles.root}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
    >
      {/* Profile circle */}
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Feather name="user" size={28} color="rgba(240,232,213,0.2)" />
        </View>
      </View>

      {/* Name */}
      <Text style={styles.name}>Jasmine Turner</Text>
      <Text style={styles.location}>Heights, Houston</Text>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>New</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
      </View>

      {/* Edit Profile button */}
      <TouchableOpacity style={styles.editBtn} activeOpacity={0.8}>
        <Text style={styles.editBtnText}>Edit Profile</Text>
      </TouchableOpacity>

      {/* My Bookings section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MY BOOKINGS</Text>

        <View style={styles.emptyState}>
          <Feather name="calendar" size={28} color="rgba(240,232,213,0.12)" />
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptySub}>
            Find a provider to book your{'\n'}first appointment.
          </Text>
          <TouchableOpacity
            style={styles.exploreBtn}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/')}
          >
            <Text style={styles.exploreBtnText}>Explore Providers</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  avatarWrap: {
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginTop: 14,
    textAlign: 'center',
  },
  location: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  editBtn: {
    marginTop: 24,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  section: {
    width: '100%',
    marginTop: 32,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 18,
  },
  exploreBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 12,
    borderCurve: 'continuous',
    height: 44,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreBtnText: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
})
