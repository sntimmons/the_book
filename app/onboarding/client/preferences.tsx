import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Switch,
  Alert,
  StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const INTERESTS = [
  { id: 'lashes', icon: '✦', title: 'Lashes', subtitle: 'Extensions & lifts' },
  { id: 'hair', icon: '◈', title: 'Hair', subtitle: 'Cuts, color & styling' },
  { id: 'makeup', icon: '◉', title: 'Makeup', subtitle: 'Glam & editorial' },
  { id: 'nails', icon: '⬡', title: 'Nails', subtitle: 'Sets & nail art' },
  { id: 'brows', icon: '⌖', title: 'Brows', subtitle: 'Shaping & tinting' },
  { id: 'skincare', icon: '◎', title: 'Skincare', subtitle: 'Facials & glow' },
  { id: 'massage', icon: '⊛', title: 'Massage', subtitle: 'Therapeutic & relaxation' },
  { id: 'waxing', icon: '⊕', title: 'Waxing', subtitle: 'Body & facial' },
  { id: 'photography', icon: '⌗', title: 'Photography', subtitle: 'Portraits & shoots' },
] as const

type InterestId = typeof INTERESTS[number]['id']

const DEFAULT_SELECTED: Set<InterestId> = new Set(['lashes', 'hair', 'makeup', 'nails'])

function InterestCard({
  icon,
  title,
  subtitle,
  selected,
  onToggle,
}: {
  icon: string
  title: string
  subtitle: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onToggle}
      style={[styles.interestCard, selected ? styles.interestCardSelected : styles.interestCardUnselected]}
    >
      <View style={styles.interestCardTopRow}>
        <Text style={[styles.interestIcon, selected && styles.interestIconSelected]}>{icon}</Text>
        {selected && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.interestTitle, selected && styles.interestTitleSelected]}>{title}</Text>
      <Text style={[styles.interestSubtitle, selected && styles.interestSubtitleSelected]}>{subtitle}</Text>
    </TouchableOpacity>
  )
}

export default function ClientPreferences() {
  const insets = useSafeAreaInsets()
  const [selected, setSelected] = useState<Set<InterestId>>(new Set(DEFAULT_SELECTED))
  const [location, setLocation] = useState('Midtown, Houston')
  const [mobileProv, setMobileProv] = useState(true)
  const [notifBooking, setNotifBooking] = useState(true)
  const [notifCreator, setNotifCreator] = useState(true)
  const [notifDeals, setNotifDeals] = useState(false)

  function toggleInterest(id: InterestId) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleChangeLocation() {
    Alert.prompt(
      'Change Location',
      'Enter your neighborhood',
      (value: string) => {
        if (value && value.trim()) setLocation(value.trim())
      },
      'plain-text',
      location,
    )
  }

  const rows: Array<typeof INTERESTS[number][]> = []
  for (let i = 0; i < INTERESTS.length; i += 2) {
    rows.push(INTERESTS.slice(i, i + 2) as typeof INTERESTS[number][])
  }

  return (
    <View style={styles.root}>
      {/* Progress bar — 100% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.topBarLabel}>Set your preferences</Text>
        <Text style={styles.topBarStep}>Step 2 of 2</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.headline}>What are you into?</Text>
        <Text style={styles.subtext}>
          We&apos;ll surface the best providers{'\n'}
          for the things you care about most.
        </Text>

        {/* Interest grid */}
        <View style={styles.grid}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.gridRow}>
              {row.map((item) => (
                <InterestCard
                  key={item.id}
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={selected.has(item.id)}
                  onToggle={() => toggleInterest(item.id)}
                />
              ))}
              {row.length === 1 && <View style={styles.interestCardSpacer} />}
            </View>
          ))}
        </View>

        {/* Location section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>LOCATION</Text>
        </View>
        <View style={styles.sectionCard}>
          <View style={styles.locationRow}>
            <Text style={styles.pinIcon}>⊙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>{location}</Text>
              <Text style={styles.locationSubtext}>Providers within 15 miles</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={handleChangeLocation}>
              <Text style={styles.changeLink}>Change</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.notifRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>Show mobile providers</Text>
              <Text style={styles.locationSubtext}>Creators that come to you</Text>
            </View>
            <Switch
              value={mobileProv}
              onValueChange={setMobileProv}
              trackColor={{ false: 'rgba(240,232,213,0.15)', true: 'rgba(240,232,213,0.5)' }}
              thumbColor={mobileProv ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
            />
          </View>
        </View>

        {/* Notifications section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        </View>
        <View style={styles.sectionCard}>
          <View style={styles.notifRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>Booking updates</Text>
              <Text style={styles.notifSubtext}>Confirmations and reminders</Text>
            </View>
            <Switch
              value={notifBooking}
              onValueChange={setNotifBooking}
              trackColor={{ false: 'rgba(240,232,213,0.15)', true: 'rgba(240,232,213,0.5)' }}
              thumbColor={notifBooking ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.notifRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>New creators nearby</Text>
              <Text style={styles.notifSubtext}>When providers join your area</Text>
            </View>
            <Switch
              value={notifCreator}
              onValueChange={setNotifCreator}
              trackColor={{ false: 'rgba(240,232,213,0.15)', true: 'rgba(240,232,213,0.5)' }}
              thumbColor={notifCreator ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.notifRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifTitle}>Deals & promotions</Text>
              <Text style={styles.notifSubtext}>Special offers from providers</Text>
            </View>
            <Switch
              value={notifDeals}
              onValueChange={setNotifDeals}
              trackColor={{ false: 'rgba(240,232,213,0.15)', true: 'rgba(240,232,213,0.5)' }}
              thumbColor={notifDeals ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
            />
          </View>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.startBtnText}>Start Exploring</Text>
        </Pressable>
        <Text style={styles.ctaNote}>You can update these anytime in settings.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.1)',
    zIndex: 10,
  },
  progressFill: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  topBarLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  topBarStep: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 96,
    flexGrow: 1,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 38,
    marginTop: 24,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 28,
  },
  grid: {
    gap: 12,
    marginBottom: 32,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  interestCard: {
    flex: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 16,
    minHeight: 100,
  },
  interestCardSpacer: {
    flex: 1,
  },
  interestCardUnselected: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderColor: 'rgba(240,232,213,0.08)',
  },
  interestCardSelected: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderColor: 'rgba(240,232,213,0.28)',
  },
  interestCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  interestIcon: {
    fontSize: 18,
    color: 'rgba(240,232,213,0.3)',
  },
  interestIconSelected: {
    color: '#F0E8D5',
  },
  checkmark: {
    fontSize: 12,
    color: '#F0E8D5',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  interestTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 3,
  },
  interestTitleSelected: {
    color: '#F0E8D5',
  },
  interestSubtitle: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 15,
  },
  interestSubtitleSelected: {
    color: 'rgba(240,232,213,0.5)',
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 16,
    borderCurve: 'continuous',
    marginBottom: 24,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  pinIcon: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.5)',
    width: 20,
    textAlign: 'center',
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginBottom: 2,
  },
  locationSubtext: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  changeLink: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_600SemiBold',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginBottom: 2,
  },
  notifSubtext: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  startBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 8,
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  ctaNote: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
})
