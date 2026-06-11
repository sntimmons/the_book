import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ComingSoonInterest } from '../../components/ComingSoonInterest'

type Side = {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
}

// Both sides post: providers show their work, clients show their results.
const SIDES: Side[] = [
  {
    icon: 'briefcase',
    title: 'Providers post their work',
    body: 'Photos, videos, and updates that show what you do best.',
  },
  {
    icon: 'sparkles',
    title: 'Clients post their results',
    body: 'A fresh cut, a workout, a shoutout. Real results that lift your providers.',
  },
]

export default function PostsPreviewScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="grid" size={26} color="#F0E8D5" />
          </View>

          <View style={styles.comingSoonPill}>
            <View style={styles.comingSoonDot} />
            <Text style={styles.comingSoonText}>Coming soon</Text>
          </View>

          <Text style={styles.title}>Posts</Text>
          <Text style={styles.lede}>
            Share your work and your results. Photos, videos, updates, and
            shoutouts, all in one place.
          </Text>
        </View>

        <View style={styles.sides}>
          {SIDES.map((side) => (
            <View key={side.title} style={styles.sideCard}>
              <View style={styles.sideIcon}>
                <Ionicons name={side.icon} size={18} color="#F0E8D5" />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.sideTitle}>{side.title}</Text>
                <Text style={styles.sideBody}>{side.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            Would you post here? Tell us and we will know what to build first.
          </Text>
          <ComingSoonInterest />
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
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  scroll: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  comingSoonPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    backgroundColor: 'rgba(240,232,213,0.04)',
    marginBottom: 16,
  },
  comingSoonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  comingSoonText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 32,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 12,
  },
  lede: {
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
  },
  sides: {
    paddingHorizontal: 24,
    gap: 10,
  },
  sideCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    backgroundColor: 'rgba(240,232,213,0.03)',
  },
  sideIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: { flex: 1 },
  sideTitle: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 3,
  },
  sideBody: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 14,
  },
  footerNote: {
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
})
