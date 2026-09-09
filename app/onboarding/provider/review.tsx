import { View, Text, Pressable, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProviderStore } from '@/store/providerStore'

// ITEM Y (Correction 3) — the final review page, before Go Live.
//
// ── WHY THIS SCREEN EXISTS ────────────────────────────────────────────────
//
// Onboarding is eight screens long and each one forgets the last. A provider
// picked a category on screen one, priced a service on screen four and set hours
// on screen five, and then pressed a button called "Go Live Now" without ever
// seeing those answers together. Go Live is a PUBLISHING act — after it, real
// clients see the profile and can send real requests — and the last thing before
// an irreversible, outward-facing step should be a chance to check the work.
//
// The go-live screen already previews the PROFILE ("this is how clients will see
// you"), which is the shop window. This is the other half: the parts a client
// never sees on the profile but which decide whether a booking can actually
// happen — services, hours, service mode, and the policy the contract rests on.
//
// ── IT CHECKS, IT DOES NOT GATE ───────────────────────────────────────────
//
// Item Y is explicit that onboarding stays MINIMAL. Nothing here is a new
// requirement: the only hard precondition in this flow is still one service (set
// on the services step) and a profile photo (enforced at Go Live). Everything
// else that is missing is reported as a consequence in the provider's own terms —
// "clients can't book you until you add hours" — with a way back to fix it now
// rather than a wall that refuses to let them through.
//
// Deliberately NOT required, and deliberately not asked for here: analytics,
// payouts, reels, and every advanced setting. A provider can be live and useful
// without any of them.

interface ReviewRow {
  key: string
  label: string
  /** What is actually set, in the provider's words. */
  value: string
  /** Present when something is missing, saying what follows from that. */
  consequence?: string
  route: string
}

export default function ProviderReview() {
  const insets = useSafeAreaInsets()
  const {
    name, businessName, category, customCategory,
    location, isMobile, photo,
    services, portfolioPhotos, reels, availability, policy,
  } = useProviderStore()

  const displayCategory = customCategory || category
  // Counted off the SCHEDULE, which is the part that decides whether a client
  // can pick a time. An availability value with every day switched off is the
  // same as none set, and must read that way.
  const openDays = availability
    ? Object.values(availability.schedule).filter((d) => d?.enabled).length
    : 0
  const publicContent = portfolioPhotos.length + reels.length

  const rows: ReviewRow[] = [
    {
      key: 'profile',
      label: 'Your profile',
      value: [name, businessName].filter(Boolean).join(' · ') || 'Not set yet',
      consequence: !name
        ? 'Clients see your name on every card and request.'
        : !photo
          ? 'A profile photo is needed before you can go live.'
          : undefined,
      route: '/onboarding/provider',
    },
    {
      key: 'category',
      label: 'What you do',
      value: displayCategory || 'Not set yet',
      consequence: displayCategory
        ? undefined
        : 'Clients browse and search by category, so this is how they find you.',
      route: '/onboarding/provider',
    },
    {
      key: 'services',
      label: services.length === 1 ? '1 service' : `${services.length} services`,
      value:
        services.length > 0
          ? services.map((s) => s.name).filter(Boolean).slice(0, 3).join(', ')
          : 'Not set yet',
      consequence:
        services.length > 0 ? undefined : 'Clients pick a service to request a booking.',
      route: '/onboarding/provider/services',
    },
    {
      key: 'where',
      label: 'Where you work',
      value: [location, isMobile ? 'You travel to clients' : null]
        .filter(Boolean)
        .join(' · ') || 'Not set yet',
      route: '/onboarding/provider',
    },
    {
      key: 'availability',
      label: 'Your hours',
      value: openDays > 0 ? `Open ${openDays} ${openDays === 1 ? 'day' : 'days'} a week` : 'Not set yet',
      consequence:
        openDays > 0
          ? undefined
          : "Clients can't book you until you add hours. You can add them now or later from your dashboard.",
      route: '/onboarding/provider/availability',
    },
    {
      key: 'content',
      label: 'Your work',
      value:
        publicContent > 0
          ? `${publicContent} ${publicContent === 1 ? 'photo or video' : 'photos and videos'}`
          : 'Nothing added yet',
      consequence:
        publicContent > 0
          ? undefined
          : 'Your profile will look empty to a client deciding whether to book you.',
      route: '/onboarding/provider/portfolio',
    },
    {
      key: 'policy',
      label: 'Your policy',
      // Never says "no policy": the policy step's Skip persists the real default
      // terms rather than nothing, so every provider goes live with one.
      value: policy ? 'Set' : 'Using the standard terms',
      route: '/onboarding/provider/policy',
    },
  ]

  return (
    <View style={styles.root}>
      {/* Progress bar: last step before publishing. */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Review</Text>
        <Text style={styles.topBarStep}>Step 7 of 7</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* The approved copy, verbatim. */}
        <Text style={styles.heading}>Review your business</Text>
        <Text style={styles.sub}>
          Make sure everything looks right before your profile goes live.
        </Text>

        {rows.map((row) => (
          <Pressable
            key={row.key}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(row.route as never)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
              {/* SAYS WHAT FOLLOWS, not that something is "invalid". A provider
                  skipping hours has not made a mistake — they have made a choice
                  with a consequence, and the consequence is the useful thing to
                  tell them. */}
              {row.consequence ? (
                <Text style={styles.rowConsequence}>{row.consequence}</Text>
              ) : null}
            </View>
            <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.35)" />
          </Pressable>
        ))}

        <Text style={styles.footnote}>
          You can change any of this later from your dashboard.
        </Text>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={styles.continueBtn}
          onPress={() => router.push('/onboarding/provider/golive')}
        >
          <Text style={styles.continueBtnText}>Looks right — continue</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  progressTrack: { height: 2, backgroundColor: 'rgba(240,232,213,0.08)' },
  progressFill: { height: 2, width: '92%', backgroundColor: '#C8922A' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarLabel: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  topBarStep: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    width: 74,
    textAlign: 'right',
  },
  body: { paddingHorizontal: 20, paddingTop: 8 },
  heading: {
    fontSize: 26,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.07)',
  },
  rowPressed: { opacity: 0.65 },
  rowLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  rowValue: {
    marginTop: 4,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  rowConsequence: {
    marginTop: 5,
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
  footnote: {
    marginTop: 22,
    fontSize: 12,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
  cta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  continueBtn: {
    height: 54,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: { fontSize: 16, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
