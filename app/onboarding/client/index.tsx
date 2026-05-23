import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type FocusedField = 'firstName' | 'lastName' | 'neighborhood' | 'bio' | null

export default function ClientProfileSetup() {
  const insets = useSafeAreaInsets()
  const [focused, setFocused] = useState<FocusedField>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [bio, setBio] = useState('')

  const BIO_LIMIT = 150

  function inputBorderColor(field: FocusedField) {
    return focused === field
      ? 'rgba(200,146,42,0.4)'
      : 'rgba(240,232,213,0.1)'
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarLeft}>Set up your profile</Text>
        <Text style={styles.topBarRight}>Step 1 of 2</Text>
      </View>

      {/* Scrollable form */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headline}>Tell us who you are.</Text>
        <Text style={styles.subtext}>
          Providers want to know who&apos;s booking them.{'\n'}
          A complete profile gets faster responses.
        </Text>

        {/* Photo upload */}
        <Pressable style={styles.photoCircle} onPress={() => {}}>
          <View style={styles.personHead} />
          <View style={styles.personBody} />
        </Pressable>
        <Text style={styles.photoLabel}>Add your photo</Text>
        <Text style={styles.photoHelper}>JPG or PNG, at least 400x400px</Text>

        {/* First Name */}
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First Name (e.g. Jasmine)"
          placeholderTextColor="rgba(240,232,213,0.25)"
          onFocus={() => setFocused('firstName')}
          onBlur={() => setFocused(null)}
          style={[styles.input, { borderColor: inputBorderColor('firstName') }]}
        />

        {/* Last Name */}
        <TextInput
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last Name (e.g. Turner)"
          placeholderTextColor="rgba(240,232,213,0.25)"
          onFocus={() => setFocused('lastName')}
          onBlur={() => setFocused(null)}
          style={[styles.input, { borderColor: inputBorderColor('lastName') }]}
        />

        {/* Neighborhood */}
        <View style={[styles.inputRow, { borderColor: inputBorderColor('neighborhood') }]}>
          <TextInput
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder="Neighborhood (e.g. Midtown, Houston)"
            placeholderTextColor="rgba(240,232,213,0.25)"
            onFocus={() => setFocused('neighborhood')}
            onBlur={() => setFocused(null)}
            style={styles.inputRowText}
          />
          <Text style={styles.pinIcon}>📍</Text>
        </View>

        {/* Bio */}
        <View style={[styles.bioWrap, { borderColor: inputBorderColor('bio') }]}>
          <TextInput
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, BIO_LIMIT))}
            placeholder="Bio (optional) — tell providers a bit about yourself"
            placeholderTextColor="rgba(240,232,213,0.25)"
            multiline
            numberOfLines={4}
            onFocus={() => setFocused('bio')}
            onBlur={() => setFocused(null)}
            style={styles.bioInput}
          />
          <Text style={styles.bioCounter}>
            {bio.length}/{BIO_LIMIT}
          </Text>
        </View>

        {/* Trust row */}
        <View style={styles.trustRow}>
          <Text style={styles.trustIcon}>🛡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.trustTitle}>Why do we need this?</Text>
            <Text style={styles.trustBody}>
              Providers see your profile before accepting a booking. A real name and photo
              helps them feel confident accepting new clients.
            </Text>
          </View>
        </View>

        {/* Spacer for fixed CTA */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.push('/onboarding/client/preferences')}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
        <Text style={styles.privacyText}>
          Your info is only shared with providers you book.
        </Text>
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
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  progressFill: {
    width: '50%',
    height: 4,
    backgroundColor: '#C8922A',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  topBarLeft: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  topBarRight: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 34,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginBottom: 32,
  },
  photoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.25)',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  personHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(240,232,213,0.2)',
    marginBottom: 4,
  },
  personBody: {
    width: 32,
    height: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.2)',
  },
  photoLabel: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 4,
  },
  photoHelper: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 28,
  },
  input: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  inputRowText: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },
  pinIcon: {
    fontSize: 16,
    marginLeft: 8,
  },
  bioWrap: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    minHeight: 100,
  },
  bioInput: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    textAlignVertical: 'top',
    minHeight: 72,
    padding: 0,
  },
  bioCounter: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
  },
  trustRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
  },
  trustIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  trustTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 4,
  },
  trustBody: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  ctaBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    backgroundColor: '#080808',
  },
  continueBtn: {
    height: 52,
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  privacyText: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
  },
})
