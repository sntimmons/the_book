import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type FocusedField = 'firstName' | 'lastName' | 'neighborhood' | 'bio' | null

const BIO_LIMIT = 150

export default function ClientProfileSetup() {
  const insets = useSafeAreaInsets()
  const [focused, setFocused] = useState<FocusedField>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [bio, setBio] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri)
    }
  }

  function borderColor(field: FocusedField) {
    return focused === field ? 'rgba(240,232,213,0.3)' : 'rgba(240,232,213,0.08)'
  }

  return (
    <View style={styles.root}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.topBarLabel}>Set up your profile</Text>
        <Text style={styles.topBarStep}>Step 1 of 4</Text>
      </View>

      {/* Scrollable form */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.headline}>Tell us who you are.</Text>
        <Text style={styles.subtext}>
          Providers want to know who&apos;s booking them.{'\n'}
          A complete profile gets faster responses.
        </Text>

        {/* Photo upload */}
        <TouchableOpacity activeOpacity={0.8} style={styles.photoCircle} onPress={pickImage}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photoImage} resizeMode="cover" />
          ) : (
            <>
              <View style={styles.personHead} />
              <View style={styles.personBody} />
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.photoLabel}>{photo ? 'Change photo' : 'Add your photo'}</Text>
        <Text style={styles.photoHelper}>
          Providers are more likely to accept{'\n'}
          bookings with a profile photo
        </Text>

        {/* First Name */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>FIRST NAME</Text>
          <View style={[styles.inputContainer, { borderColor: borderColor('firstName') }]}>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Jasmine"
              placeholderTextColor="rgba(240,232,213,0.25)"
              autoCapitalize="words"
              onFocus={() => setFocused('firstName')}
              onBlur={() => setFocused(null)}
              style={styles.inputText}
            />
          </View>
        </View>

        {/* Last Name */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>LAST NAME</Text>
          <View style={[styles.inputContainer, { borderColor: borderColor('lastName') }]}>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Turner"
              placeholderTextColor="rgba(240,232,213,0.25)"
              autoCapitalize="words"
              onFocus={() => setFocused('lastName')}
              onBlur={() => setFocused(null)}
              style={styles.inputText}
            />
          </View>
        </View>

        {/* Neighborhood */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>YOUR NEIGHBORHOOD</Text>
          <View style={[styles.inputContainer, styles.inputRow, { borderColor: borderColor('neighborhood') }]}>
            <Text style={styles.pinIcon}>⊙</Text>
            <TextInput
              value={neighborhood}
              onChangeText={setNeighborhood}
              placeholder="Midtown, Houston"
              placeholderTextColor="rgba(240,232,213,0.25)"
              onFocus={() => setFocused('neighborhood')}
              onBlur={() => setFocused(null)}
              style={[styles.inputText, { flex: 1 }]}
            />
          </View>
        </View>

        {/* Bio */}
        <View style={styles.fieldWrap}>
          <View style={styles.bioLabelRow}>
            <Text style={styles.fieldLabel}>BIO (OPTIONAL)</Text>
            <Text style={styles.bioCounter}>{bio.length}/{BIO_LIMIT}</Text>
          </View>
          <View style={[styles.inputContainer, styles.bioContainer, { borderColor: borderColor('bio') }]}>
            <TextInput
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, BIO_LIMIT))}
              placeholder="A little about yourself..."
              placeholderTextColor="rgba(240,232,213,0.25)"
              multiline
              textAlignVertical="top"
              onFocus={() => setFocused('bio')}
              onBlur={() => setFocused(null)}
              style={[styles.inputText, styles.bioInput]}
            />
          </View>
        </View>

        {/* Trust row */}
        <View style={styles.trustRow}>
          <Text style={styles.shieldIcon}>⬡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.trustTitle}>Why do we need this?</Text>
            <Text style={styles.trustBody}>
              Providers see your profile before accepting bookings. This keeps The Book safe for everyone.
            </Text>
          </View>
        </View>

        {/* Verify row */}
        <View style={styles.verifyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.verifyTitle}>Verify your identity</Text>
            <Text style={styles.verifySubtext}>Get a verified badge to build trust.</Text>
          </View>
          <Text style={styles.verifyLink}>Verify →</Text>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16, bottom: 0, left: 0, right: 0, position: 'absolute' }]}>
        <Pressable
          style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.push('/onboarding/client/preferences')}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
        <Text style={styles.privacyText}>
          Your profile is only visible to providers you book with.
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.1)',
    zIndex: 10,
  },
  progressFill: {
    width: '25%',
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
    paddingTop: 16,
    paddingBottom: 140,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 38,
    marginTop: 24,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 32,
    textAlign: 'center',
  },
  photoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  photoImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  personHead: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(240,232,213,0.2)',
    marginBottom: 4,
  },
  personBody: {
    width: 36,
    height: 18,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.2)',
  },
  photoLabel: {
    textAlign: 'center',
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginBottom: 4,
    marginTop: 10,
  },
  photoHelper: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
    paddingHorizontal: 40,
    marginBottom: 32,
  },
  fieldWrap: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },
  pinIcon: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.4)',
    marginRight: 10,
  },
  bioLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bioCounter: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  bioContainer: {
    height: 96,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  bioInput: {
    paddingTop: 14,
    textAlignVertical: 'top',
    width: '100%',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
    marginTop: 8,
    marginBottom: 8,
  },
  shieldIcon: {
    fontSize: 18,
    color: 'rgba(240,232,213,0.4)',
    marginTop: 2,
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
  verifyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  verifyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  verifySubtext: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  verifyLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  cta: {
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
    marginBottom: 8,
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
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
})
