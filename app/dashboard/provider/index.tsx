import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePanelContext } from '@/context/PanelContext'

const MOCK_REQUESTS = [
  {
    id: '1',
    client: 'Darius W.',
    service: 'Classic Fade',
    date: 'Tue, Jun 3',
    time: '11:00 AM',
    price: '$45',
  },
  {
    id: '2',
    client: 'Jordan M.',
    service: 'Full Cut + Beard',
    date: 'Tue, Jun 3',
    time: '2:30 PM',
    price: '$65',
  },
  {
    id: '3',
    client: 'Chris T.',
    service: 'Lineup',
    date: 'Wed, Jun 4',
    time: '10:00 AM',
    price: '$25',
  },
]

const QUICK_ACTIONS = [
  { icon: 'plus-circle', label: 'Add Service',    route: '/onboarding/provider/services'     },
  { icon: 'clock',       label: 'Set Hours',       route: '/onboarding/provider/availability' },
  { icon: 'image',       label: 'Add Photos',      route: '/onboarding/provider/portfolio'    },
  { icon: 'share-2',     label: 'Share Profile',   route: null                                },
]

export default function ProviderDashboard() {
  const insets = useSafeAreaInsets()
  const { openPanel } = usePanelContext()
  const pendingCount = MOCK_REQUESTS.length

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity style={styles.menuBtn} activeOpacity={0.8}>
          <Feather name="bell" size={18} color="#F0E8D5" />
          {/* Notification dot */}
          <View style={styles.notifDot} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>Good morning, Marcus.</Text>
          <Text style={styles.greetingSubtext}>
            {pendingCount > 0
              ? `You have ${pendingCount} pending requests.`
              : 'Your schedule is clear today.'}
          </Text>
        </View>

        {/* Earnings card */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>THIS WEEK</Text>
          <Text style={styles.earningsAmount}>$0.00</Text>
          <View style={styles.earningsStats}>
            <View style={styles.earningStat}>
              <Text style={styles.earningStatValue}>0</Text>
              <Text style={styles.earningStatLabel}>appointments</Text>
            </View>
            <View style={styles.earningStat}>
              <Text style={styles.earningStatValue}>0</Text>
              <Text style={styles.earningStatLabel}>pending</Text>
            </View>
            <View style={styles.earningStat}>
              <Text style={styles.earningStatValue}>$0</Text>
              <Text style={styles.earningStatLabel}>this month</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.payoutsLink}
            onPress={() => router.push('/dashboard/provider/payouts' as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.payoutsLinkText}>View payouts</Text>
            <Feather name="chevron-right" size={11} color="#C8922A" />
          </TouchableOpacity>
        </View>

        {/* Pending requests */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.pendingHeaderLeft}>
              <View style={styles.pulseDot} />
              <Text style={styles.sectionTitle}>Pending Requests</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {MOCK_REQUESTS.map((req, i) => (
            <View
              key={req.id}
              style={[styles.requestCard, i < MOCK_REQUESTS.length - 1 && styles.requestCardBorder]}
            >
              <View style={styles.requestAvatar}>
                <Text style={styles.requestAvatarText}>
                  {req.client.charAt(0)}
                </Text>
              </View>
              <View style={styles.requestInfo}>
                <Text style={styles.requestClient}>{req.client}</Text>
                <Text style={styles.requestService}>{req.service}</Text>
                <Text style={styles.requestTime}>{req.date} · {req.time}</Text>
              </View>
              <View style={styles.requestRight}>
                <Text style={styles.requestPrice}>{req.price}</Text>
                <View style={styles.requestActions}>
                  <Pressable style={[styles.requestBtn, styles.requestBtnDecline]}>
                    <Feather name="x" size={14} color="rgba(240,232,213,0.5)" />
                  </Pressable>
                  <Pressable style={[styles.requestBtn, styles.requestBtnAccept]}>
                    <Feather name="check" size={14} color="#080808" />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.quickTile}
                activeOpacity={0.75}
                onPress={() => action.route && router.push(action.route as any)}
              >
                <View style={styles.quickIconBox}>
                  <Feather name={action.icon as any} size={20} color="rgba(240,232,213,0.55)" />
                </View>
                <Text style={styles.quickLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Today's schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          <View style={styles.emptySchedule}>
            <Feather name="calendar" size={28} color="rgba(240,232,213,0.1)" />
            <Text style={styles.emptyScheduleText}>No appointments today</Text>
            <Text style={styles.emptyScheduleSub}>
              Accepted bookings will appear here.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  headerTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },

  // Greeting
  greeting: {
    marginTop: 20,
    marginBottom: 24,
  },
  greetingText: {
    fontSize: 26,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  greetingSubtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },

  // Earnings card
  earningsCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 20,
    marginBottom: 24,
  },
  earningsLabel: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  earningsAmount: {
    fontSize: 36,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 40,
  },
  earningsStats: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
  },
  earningStat: {},
  earningStatValue: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  earningStatLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  payoutsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 14,
  },
  payoutsLinkText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },

  // Section
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pendingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  sectionTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 14,
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },

  // Request cards
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  requestCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  requestAvatarText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  requestInfo: {
    flex: 1,
  },
  requestClient: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  requestService: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  requestTime: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  requestRight: {
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  requestPrice: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 6,
  },
  requestBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnDecline: {
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  requestBtnAccept: {
    backgroundColor: '#F0E8D5',
  },

  // Quick actions
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickTile: {
    width: '47.5%',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    alignItems: 'flex-start',
  },
  quickIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickLabel: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // Empty schedule
  emptySchedule: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyScheduleText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 10,
  },
  emptyScheduleSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
})
