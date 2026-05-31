import { useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

export default function BookingAccepted() {
  const insets = useSafeAreaInsets()
  const scale = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 65,
      friction: 8,
      useNativeDriver: true,
    }).start()
  }, [scale])

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Status animation */}
          <Animated.View style={[styles.outerRing, { transform: [{ scale }] }]}>
            <View style={styles.innerCircle}>
              <Feather name="check" size={32} color="#4CAF50" />
            </View>
          </Animated.View>

          {/* Status badge */}
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>BOOKING CONFIRMED</Text>
          </View>

          {/* Headline */}
          <Text style={styles.headline}>You're in.</Text>

          {/* Subtext */}
          <Text style={styles.subtext}>
            Nia confirmed your booking.{'\n'}
            Your $45.00 deposit has been charged.
          </Text>

          {/* Booking card */}
          <View style={styles.card}>
            {/* Provider row */}
            <View style={styles.providerRow}>
              <View style={styles.avatar}>
                <Feather name="user" size={18} color="rgba(240,232,213,0.4)" />
              </View>
              <View style={styles.providerStack}>
                <Text style={styles.providerName}>Nia Laurent</Text>
                <Text style={styles.providerMeta}>Lash Tech · River Oaks</Text>
              </View>
              <View style={styles.ratingRow}>
                <Feather name="star" size={11} color="#C8922A" />
                <Text style={styles.ratingText}>4.9</Text>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Detail rows */}
            <View style={styles.detailRow}>
              <Feather name="scissors" size={13} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Classic Full Set</Text>
              <Text style={styles.detailValueBold}>$145.00</Text>
            </View>
            <View style={styles.detailRow}>
              <Feather name="calendar" size={13} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>May 28, 2026</Text>
              <Text style={styles.detailValue}>1:00 PM</Text>
            </View>
            <View style={styles.detailRow}>
              <Feather name="map-pin" size={13} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Midtown Studio</Text>
            </View>

            <View style={[styles.separator, styles.separatorBottom]} />

            {/* Deposit row */}
            <View style={styles.depositRow}>
              <View style={styles.depositLeft}>
                <Feather name="check-circle" size={13} color="#4CAF50" />
                <Text style={styles.depositText}>$45.00 deposit charged</Text>
              </View>
              <Text style={styles.balanceText}>Balance: $100.00 at appointment</Text>
            </View>
          </View>

          {/* Add to calendar */}
          <TouchableOpacity
            style={styles.calendarBtn}
            activeOpacity={0.7}
            onPress={() =>
              Alert.alert(
                'Coming soon',
                'This feature is coming in the next update.',
                [{ text: 'OK' }],
              )
            }
          >
            <Feather name="calendar" size={15} color="#C8922A" />
            <Text style={styles.calendarBtnText}>Add to Calendar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom buttons */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.messageBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/(tabs)/messages' as never)}
        >
          <Feather name="message-circle" size={18} color="#F0E8D5" />
          <Text style={styles.messageBtnText}>Message Provider</Text>
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
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: 'rgba(76,175,80,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(76,175,80,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    marginTop: 16,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#4CAF50',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.8,
  },
  headline: {
    marginTop: 20,
    fontSize: 34,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  subtext: {
    marginTop: 8,
    paddingHorizontal: 40,
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    marginTop: 28,
    marginHorizontal: 24,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 16,
    padding: 16,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerStack: {
    flex: 1,
  },
  providerName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerMeta: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginBottom: 14,
  },
  separatorBottom: {
    marginTop: 14,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  detailLabel: {
    flex: 1,
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  detailValue: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  detailValueBold: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  depositRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  depositLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  depositText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  balanceText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  calendarBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  calendarBtnText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  messageBtn: {
    marginBottom: 10,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 14,
    height: 52,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  messageBtnText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
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
