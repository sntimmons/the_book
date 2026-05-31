import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useBookingStore } from '@/store/bookingStore'

const EXAMPLE_CHIPS = [
  'I have short natural lashes',
  'I want a specific style',
  'I have allergies or sensitivities',
  'I need extra time',
  'I have a reference photo',
  'First time client',
  'I have questions first',
]

export default function BookMessage() {
  const insets = useSafeAreaInsets()
  const {
    providerName,
    selectedService,
    selectedDate,
    selectedTime,
    bookingMessage,
    bookingPhotos,
    setBookingMessage,
    setBookingPhotos,
  } = useBookingStore()

  const [isFocused, setIsFocused] = useState(false)
  const isEmpty = bookingMessage.trim().length === 0 && bookingPhotos.length === 0

  async function pickPhoto() {
    if (bookingPhotos.length >= 3) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setBookingPhotos([...bookingPhotos, result.assets[0].uri])
    }
  }

  function removePhoto(index: number) {
    setBookingPhotos(bookingPhotos.filter((_, i) => i !== index))
  }

  function handleSkip() {
    setBookingMessage('')
    setBookingPhotos([])
    router.push('/book/policy')
  }

  const summaryMeta = [selectedService?.name, selectedDate, selectedTime]
    .filter(Boolean)
    .join(' · ')

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
        <Text style={styles.topBarTitle}>Your Request</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {/* Booking summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryProvider}>{providerName}</Text>
          {summaryMeta ? (
            <Text style={styles.summaryMeta}>{summaryMeta}</Text>
          ) : null}
        </View>
        <Feather name="check-circle" size={14} color="#4CAF50" />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={Keyboard.dismiss}>
        {/* Headline */}
        <Text style={styles.headline}>Anything they should know?</Text>
        <Text style={styles.subtext}>
          Your message goes directly to your provider with your booking request. They see this before deciding to accept.
        </Text>

        {/* Example chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
          style={styles.chipsContainer}
        >
          {EXAMPLE_CHIPS.map((chip) => (
            <TouchableOpacity
              key={chip}
              style={styles.chip}
              activeOpacity={0.7}
              onPress={() => setBookingMessage(chip)}
            >
              <Text style={styles.chipText}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Text input */}
        <View style={[styles.inputWrap, isFocused && styles.inputWrapFocused]}>
          <TextInput
            style={styles.input}
            value={bookingMessage}
            onChangeText={setBookingMessage}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={`Tell your provider what you need, any preferences, or questions about the service...`}
            placeholderTextColor="rgba(240,232,213,0.25)"
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        </View>
        {bookingMessage.length > 0 && (
          <Text style={styles.charCount}>{bookingMessage.length} / 500</Text>
        )}

        {/* Photo attachments */}
        <View style={styles.photoSection}>
          <View style={styles.photoHeader}>
            <Text style={styles.sectionLabel}>ATTACH PHOTOS (OPTIONAL)</Text>
            <Text style={styles.photoLimit}>Up to 3</Text>
          </View>
          <Text style={styles.photoHelper}>
            Share a reference photo, a style you like, or anything visual that helps your provider understand what you want.
          </Text>

          <View style={styles.photoRow}>
            {/* Filled photo slots */}
            {bookingPhotos.map((uri, index) => (
              <View key={uri} style={styles.photoSlotFilled}>
                <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.photoDeleteBtn}
                  onPress={() => removePhoto(index)}
                  activeOpacity={0.8}
                >
                  <Feather name="x" size={9} color="#F0E8D5" />
                </TouchableOpacity>
              </View>
            ))}

            {/* Empty slots */}
            {bookingPhotos.length < 3 && (
              <TouchableOpacity
                style={styles.photoSlotEmpty}
                onPress={pickPhoto}
                activeOpacity={0.7}
              >
                <Feather name="image" size={20} color="rgba(240,232,213,0.2)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Optional badge */}
        {isEmpty && (
          <View style={styles.optionalBadge}>
            <Feather name="info" size={12} color="rgba(240,232,213,0.25)" />
            <Text style={styles.optionalText}>
              This step is optional. Your provider will still receive your booking request.
            </Text>
          </View>
        )}
        </Pressable>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={styles.continueBtn}
          onPress={() => router.push('/book/policy')}
        >
          <Text style={styles.continueBtnText}>Continue to Review Policy</Text>
        </Pressable>

        <TouchableOpacity
          style={styles.skipLink}
          activeOpacity={0.6}
          onPress={handleSkip}
        >
          <Text style={styles.skipLinkText}>Skip, send request without a message</Text>
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
    paddingHorizontal: 20,
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
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  summaryLeft: {
    flex: 1,
    marginRight: 12,
  },
  summaryProvider: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  summaryMeta: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headline: {
    fontSize: 26,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 24,
  },
  chipsContainer: {
    marginBottom: 16,
    marginHorizontal: -24,
  },
  chipsScroll: {
    paddingHorizontal: 24,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  chipText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
  },
  inputWrap: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    minHeight: 120,
    marginBottom: 4,
  },
  inputWrapFocused: {
    borderColor: 'rgba(240,232,213,0.25)',
  },
  input: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    padding: 0,
    minHeight: 88,
  },
  charCount: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'right',
    marginBottom: 16,
    marginTop: 4,
  },
  photoSection: {
    marginBottom: 24,
  },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  photoLimit: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },
  photoHelper: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
    marginBottom: 12,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoSlotEmpty: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSlotFilled: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: 80,
    height: 80,
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(8,8,8,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  optionalText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    flex: 1,
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
  continueBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  skipLink: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
  },
  skipLinkText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
})
