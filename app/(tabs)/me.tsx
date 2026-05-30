import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type MeTab = 'bookings' | 'saved' | 'following'

const SAVED_PROVIDERS = [
  { name: 'Nia L.', type: 'Lash', active: true },
  { name: 'Marcus B.', type: 'Barber', active: false },
  { name: 'Elena R.', type: 'MUA', active: true },
  { name: 'Jade W.', type: 'Braider', active: false },
  { name: 'Camille B.', type: 'Lash', active: false },
  { name: 'Jordan E.', type: 'Nails', active: false },
]

const FOLLOWING = [
  { name: 'Nia Laurent', meta: 'Lash Tech · River Oaks' },
  { name: 'Marcus Blade', meta: 'Barber · Midtown' },
  { name: 'Camille Brooks', meta: 'Lash · Montrose' },
]

const UPCOMING = [
  { who: 'Marcus Blade · Fade', when: 'May 30 · 11:00 AM', price: '$65' },
  { who: 'Camille Brooks · Braids', when: 'Jun 3 · 9:00 AM', price: '$220' },
]

export default function MeScreen() {
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<MeTab>('bookings')

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Me</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() =>
              Share.share({ message: 'Check out my profile on The Book' })
            }
          >
            <Feather name="share" size={15} color="rgba(240,232,213,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/settings' as any)}
          >
            <Feather name="settings" size={15} color="rgba(240,232,213,0.6)" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Profile hero */}
        <View style={styles.hero}>
          <View style={styles.photoWrap}>
            <View style={styles.photo}>
              <Feather name="user" size={32} color="rgba(240,232,213,0.2)" />
            </View>
            <View style={styles.verifiedBadge}>
              <Feather name="check" size={10} color="#080808" />
            </View>
          </View>

          <Text style={styles.name}>Jasmine Turner</Text>
          <Text style={styles.location}>Heights, Houston</Text>
          <View style={styles.memberRow}>
            <Feather name="calendar" size={11} color="rgba(240,232,213,0.45)" />
            <Text style={styles.memberText}>Member since January 2024</Text>
          </View>

          <TouchableOpacity
            style={styles.editBtn}
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert('Edit Profile', 'Profile editing coming soon.', [
                { text: 'OK' },
              ])
            }
          >
            <Feather name="edit-2" size={12} color="rgba(240,232,213,0.5)" />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={styles.statValue}>23</Text>
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statValue}>142</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statValue}>89</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <View style={styles.ratingValueRow}>
              <Text style={styles.statValue}>4.8</Text>
              <Feather name="star" size={13} color="#C8922A" />
            </View>
            <Text style={styles.statLabel}>My Rating</Text>
          </View>
        </View>

        {/* Trust badges */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.badgesScroll}
          contentContainerStyle={styles.badgesContent}
        >
          <View style={[styles.badge, styles.badgeGreen]}>
            <Feather name="check-circle" size={12} color="#4CAF50" />
            <Text style={styles.badgeTextPrimary}>Phone Verified</Text>
          </View>
          <View style={[styles.badge, styles.badgeGreen]}>
            <Feather name="shield" size={12} color="#4CAF50" />
            <Text style={styles.badgeTextPrimary}>ID Verified</Text>
          </View>
          <View style={[styles.badge, styles.badgeNeutral]}>
            <Feather name="credit-card" size={12} color="rgba(240,232,213,0.4)" />
            <Text style={styles.badgeTextNeutral}>Payment Active</Text>
          </View>
          <View style={[styles.badge, styles.badgeAmber]}>
            <Feather name="star" size={12} color="#C8922A" />
            <Text style={styles.badgeTextPrimary}>Trusted Client</Text>
          </View>
        </ScrollView>

        <View style={styles.separator} />

        {/* Content tabs */}
        <View style={styles.tabs}>
          {(['bookings', 'saved', 'following'] as MeTab[]).map((tab) => {
            const active = activeTab === tab
            const label = tab === 'bookings' ? 'Bookings' : tab === 'saved' ? 'Saved' : 'Following'
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, active && styles.tabActive]}
                activeOpacity={0.7}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={active ? styles.tabTextActive : styles.tabTextInactive}>{label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {activeTab === 'bookings' && <BookingsTab />}
        {activeTab === 'saved' && <SavedTab />}
        {activeTab === 'following' && <FollowingTab />}
      </ScrollView>
    </View>
  )
}

function BookingsTab() {
  return (
    <>
      {/* Next appointment */}
      <View style={styles.nextSection}>
        <Text style={styles.sectionLabel}>NEXT UP</Text>
        <View style={styles.nextCard}>
          <View style={styles.nextImage}>
            <Feather name="camera" size={24} color="rgba(240,232,213,0.1)" />
            <View style={styles.nextPill}>
              <Text style={styles.nextPillText}>NEXT UP</Text>
            </View>
          </View>
          <View style={styles.nextInfo}>
            <View style={styles.nextProviderRow}>
              <View style={styles.avatar36}>
                <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.nextProviderName}>Elena Ross · Silk Press</Text>
                <Text style={styles.nextProviderMeta}>Today · 2:30 PM · Midtown</Text>
              </View>
              <Text style={styles.nextPrice}>$130</Text>
            </View>
            <View style={styles.nextActions}>
              <TouchableOpacity
                style={styles.nextActionBtn}
                activeOpacity={0.7}
                onPress={() => router.push('/messages/1')}
              >
                <Feather name="message-circle" size={14} color="#F0E8D5" />
                <Text style={styles.nextActionText}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextActionBtn}
                activeOpacity={0.7}
                onPress={() => router.push('/(tabs)/bookings')}
              >
                <Text style={styles.nextActionText}>View Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Upcoming */}
      <View style={styles.upcomingSection}>
        <View style={styles.upcomingHeader}>
          <Text style={styles.upcomingTitle}>Upcoming</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/(tabs)/bookings')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {UPCOMING.map((appt) => (
          <View key={appt.who} style={styles.apptRow}>
            <View style={styles.avatar40}>
              <Feather name="user" size={18} color="rgba(240,232,213,0.4)" />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.apptWho}>{appt.who}</Text>
              <Text style={styles.apptWhen}>{appt.when}</Text>
            </View>
            <Text style={styles.apptPrice}>{appt.price}</Text>
          </View>
        ))}
      </View>
    </>
  )
}

function SavedTab() {
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLabel}>SAVED PROVIDERS</Text>
      {SAVED_PROVIDERS.length === 0 ? (
        <View style={styles.tabEmpty}>
          <Feather name="bookmark" size={28} color="rgba(240,232,213,0.1)" />
          <Text style={styles.tabEmptyText}>No saved providers yet</Text>
        </View>
      ) : (
        <View style={styles.savedGrid}>
          {SAVED_PROVIDERS.map((p) => (
            <View key={p.name} style={styles.savedItem}>
              <View style={[styles.savedCircle, p.active && styles.savedCircleActive]}>
                <Feather name="user" size={26} color="rgba(240,232,213,0.2)" />
              </View>
              <Text style={styles.savedName}>{p.name}</Text>
              <Text style={styles.savedType}>{p.type}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function FollowingTab() {
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLabel}>FOLLOWING</Text>
      {FOLLOWING.length === 0 ? (
        <View style={styles.tabEmpty}>
          <Feather name="users" size={28} color="rgba(240,232,213,0.1)" />
          <Text style={styles.tabEmptyText}>Not following anyone yet</Text>
        </View>
      ) : (
        FOLLOWING.map((p) => (
          <View key={p.name} style={styles.followRow}>
            <View style={styles.avatar44}>
              <Feather name="user" size={18} color="rgba(240,232,213,0.4)" />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.followName}>{p.name}</Text>
              <Text style={styles.followMeta}>{p.meta}</Text>
            </View>
            <View style={styles.followingPill}>
              <Text style={styles.followingPillText}>Following</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  photoWrap: {
    width: 80,
    height: 80,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 14,
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  location: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  memberRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  memberText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  editBtn: {
    marginTop: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  editBtnText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
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
  ratingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statLabel: {
    marginTop: 3,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  badgesScroll: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  badgesContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeGreen: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.2)',
  },
  badgeNeutral: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderColor: 'rgba(240,232,213,0.1)',
  },
  badgeAmber: {
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderColor: 'rgba(200,146,42,0.2)',
  },
  badgeTextPrimary: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  badgeTextNeutral: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_500Medium',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 20,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#F0E8D5',
  },
  tabTextActive: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  tabTextInactive: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  flex1: {
    flex: 1,
  },
  // Next appointment
  nextSection: {
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  nextCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
  },
  nextImage: {
    height: 110,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextPill: {
    position: 'absolute',
    top: 0,
    left: 0,
    margin: 10,
    backgroundColor: '#C8922A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nextPillText: {
    fontSize: 9,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  nextInfo: {
    padding: 14,
  },
  nextProviderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar36: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextProviderName: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  nextProviderMeta: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  nextPrice: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  nextActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  nextActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nextActionText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  // Upcoming
  upcomingSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upcomingTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  apptRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  avatar40: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptWho: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  apptWhen: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  apptPrice: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  // Tab content shared
  tabContent: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  tabEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  tabEmptyText: {
    marginTop: 10,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  // Saved grid
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  savedItem: {
    width: '30%',
    alignItems: 'center',
  },
  savedCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCircleActive: {
    borderWidth: 2,
    borderColor: '#C8922A',
    padding: 2,
  },
  savedName: {
    marginTop: 6,
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  savedType: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  // Following rows
  followRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  avatar44: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  followMeta: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  followingPill: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  followingPillText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
})
