import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const CATEGORIES = [
  'Great results',
  'On time',
  'Clean space',
  'Great communication',
  'Worth the price',
  'Will rebook',
  'Felt comfortable',
  'Exceeded expectations',
]

export default function WriteReview() {
  const insets = useSafeAreaInsets()
  const [reviewText, setReviewText] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [focused, setFocused] = useState(false)

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((c) => c !== cat)
      }
      if (prev.length >= 5) return prev
      return [...prev, cat]
    })
  }

  const canPost = reviewText.trim().length > 10

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Write a Review</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Provider header */}
        <View style={styles.providerHeader}>
          <View style={styles.avatar}>
            <Feather name="user" size={22} color="rgba(240,232,213,0.4)" />
          </View>
          <Text style={styles.providerName}>Nia Laurent</Text>
          <Text style={styles.serviceDate}>Classic Full Set · May 28</Text>

          <View style={styles.starDisplay}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Feather key={i} name="star" size={24} color="#C8922A" />
            ))}
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()}>
            <Text style={styles.changeRating}>Change rating</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.separator} />

        {/* Review categories */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WHAT STOOD OUT?</Text>
          <Text style={styles.helper}>Select all that apply</Text>

          <View style={styles.chipWrap}>
            {CATEGORIES.map((cat) => {
              const selected = selectedCategories.includes(cat)
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                  activeOpacity={0.7}
                  onPress={() => toggleCategory(cat)}
                >
                  <Text style={selected ? styles.chipTextSelected : styles.chipTextUnselected}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Written review */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOUR REVIEW</Text>
          <Text style={styles.helperBlock}>
            Tell others what made this appointment great. Your review helps Nia grow her business.
          </Text>

          <View style={[styles.inputContainer, focused && styles.inputContainerFocused]}>
            <TextInput
              style={styles.input}
              multiline
              maxLength={500}
              placeholder="Share your experience..."
              placeholderTextColor="rgba(240,232,213,0.25)"
              textAlignVertical="top"
              value={reviewText}
              onChangeText={setReviewText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <Text style={styles.counter}>{reviewText.length} / 500</Text>
          </View>
        </View>

        {/* Provider rebook */}
        <View style={styles.rebookSection}>
          <View style={styles.rebookRow}>
            <View style={styles.rebookLeft}>
              <Text style={styles.rebookTitle}>Book Nia again</Text>
              <Text style={styles.rebookSub}>She has availability next week</Text>
            </View>
            <TouchableOpacity
              style={styles.rebookPill}
              activeOpacity={0.7}
              onPress={() => router.push('/book/service')}
            >
              <Text style={styles.rebookPillText}>Rebook</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Community note */}
        <View style={styles.communityNote}>
          <Feather
            name="shield"
            size={13}
            color="rgba(240,232,213,0.25)"
            style={styles.communityIcon}
          />
          <Text style={styles.communityText}>
            Reviews are public and help the Houston creator community. Offensive or false reviews are removed by our team.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        <TouchableOpacity
          style={[styles.postBtn, !canPost && styles.postBtnInactive]}
          activeOpacity={canPost ? 0.85 : 1}
          disabled={!canPost}
          onPress={() => router.push('/post-booking/submitted')}
        >
          <Text style={[styles.postBtnText, !canPost && styles.postBtnTextInactive]}>
            Post Review
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipBtn}
          activeOpacity={0.7}
          onPress={() => router.push('/post-booking/submitted')}
        >
          <Text style={styles.skipText}>Skip — post without a written review</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  topBarSpacer: {
    width: 36,
  },
  scroll: {
    flex: 1,
  },
  providerHeader: {
    marginTop: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: {
    marginTop: 12,
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  serviceDate: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  starDisplay: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 6,
  },
  changeRating: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 24,
    marginTop: 20,
  },
  section: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  helper: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 12,
    marginTop: -4,
  },
  helperBlock: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
    marginBottom: 10,
    marginTop: -4,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.3)',
  },
  chipUnselected: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.08)',
  },
  chipTextSelected: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  chipTextUnselected: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  inputContainer: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 14,
    padding: 16,
    minHeight: 120,
  },
  inputContainerFocused: {
    borderColor: 'rgba(240,232,213,0.2)',
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
    minHeight: 80,
  },
  counter: {
    marginTop: 8,
    textAlign: 'right',
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  rebookSection: {
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 8,
  },
  rebookRow: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(240,232,213,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rebookLeft: {
    flex: 1,
  },
  rebookTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  rebookSub: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  rebookPill: {
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rebookPillText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  communityNote: {
    paddingHorizontal: 24,
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  communityIcon: {
    marginTop: 2,
  },
  communityText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 15,
  },
  bottomBar: {
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
  postBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  postBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  postBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
  skipBtn: {
    marginTop: 10,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
})
