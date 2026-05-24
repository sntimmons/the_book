import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  TouchableOpacity,
  Switch,
  Modal,
  Image,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type FocusedField = 'name' | 'businessName' | 'location' | 'bio' | 'customCategory' | null
type Errors = { name?: string; category?: string; photo?: string }

const CATEGORIES = [
  'Hair', 'Lashes', 'Brows', 'Nails', 'Makeup',
  'Barber', 'Massage', 'Skincare', 'Waxing',
  'Photography', 'Videography', 'Bartending',
  'Mechanics', 'Event Hosting', 'Fitness', 'Wellness', 'Other',
]

export default function ProviderOnboardingStep1() {
  const insets = useSafeAreaInsets()

  const [photo, setPhoto] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')
  const [location, setLocation] = useState('')
  const [bio, setBio] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [showCategorySheet, setShowCategorySheet] = useState(false)
  const [focusedField, setFocusedField] = useState<FocusedField>(null)
  const [errors, setErrors] = useState<Errors>({})

  const isValid =
    name.trim().length > 0 &&
    (category.length > 0 || customCategory.trim().length > 0) &&
    photo !== null

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri)
      setErrors((prev) => ({ ...prev, photo: undefined }))
    }
  }

  async function pickBanner() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setBanner(result.assets[0].uri)
    }
  }

  function selectCategory(cat: string) {
    setCategory(cat)
    setShowCategorySheet(false)
    setErrors((prev) => ({ ...prev, category: undefined }))
  }

  function handleContinue() {
    const newErrors: Errors = {}
    if (!name.trim()) newErrors.name = 'This field is required'
    if (!category && !customCategory.trim()) newErrors.category = 'This field is required'
    if (!photo) newErrors.photo = 'A profile photo is required'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    router.push('/onboarding/provider/portfolio')
  }

  function fieldBorder(field: FocusedField) {
    return focusedField === field
      ? 'rgba(240,232,213,0.25)'
      : 'rgba(240,232,213,0.08)'
  }

  const displayCategory = category === 'Other' ? 'Other' : category

  return (
    <View style={styles.root}>
      {/* Progress bar — 1 of 8 = 12.5% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Build your profile</Text>
        <Text style={styles.topBarStep}>Step 1 of 8</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.headline}>Let's build your profile.</Text>
        <Text style={styles.subtext}>
          Tell clients who you are and what you do. This is your first impression.
        </Text>

        {/* ── BANNER ─────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={pickBanner}
          style={styles.bannerBox}
        >
          {banner ? (
            <>
              <Image source={{ uri: banner }} style={styles.bannerImage} resizeMode="cover" />
              <View style={styles.bannerEditPill}>
                <Text style={styles.bannerEditText}>Edit</Text>
              </View>
            </>
          ) : (
            <>
              <Feather name="image" size={22} color="rgba(240,232,213,0.2)" />
              <Text style={styles.bannerPlaceholder}>Add cover photo (optional)</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── PROFILE PHOTO (overlaps banner) ─── */}
        <TouchableOpacity activeOpacity={0.8} onPress={pickPhoto} style={styles.photoWrap}>
          <View style={styles.photoOuter}>
            <View style={styles.photoInner}>
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photoImage} resizeMode="cover" />
              ) : (
                <Feather name="user" size={26} color="rgba(240,232,213,0.2)" />
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Feather name="camera" size={12} color="#080808" />
            </View>
          </View>
        </TouchableOpacity>

        {errors.photo && (
          <Text style={[styles.errorText, { marginLeft: 16, marginBottom: 4 }]}>{errors.photo}</Text>
        )}
        <Text style={styles.photoHelper}>
          A clear profile photo helps clients trust and recognize you.
        </Text>

        {/* ── FULL NAME ──────────────────────────── */}
        <View style={styles.fieldWrap}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>YOUR NAME</Text>
            <View style={styles.requiredDot} />
          </View>
          <View style={[styles.inputContainer, { borderColor: fieldBorder('name') }]}>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t)
                if (t.trim()) setErrors((prev) => ({ ...prev, name: undefined }))
              }}
              placeholder="Marcus Johnson"
              placeholderTextColor="rgba(240,232,213,0.25)"
              autoCapitalize="words"
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              style={styles.inputText}
            />
          </View>
          {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        </View>

        {/* ── BUSINESS NAME ──────────────────────── */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>BUSINESS NAME (OPTIONAL)</Text>
          <View style={[styles.inputContainer, { borderColor: fieldBorder('businessName') }]}>
            <TextInput
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Blade Cuts Studio"
              placeholderTextColor="rgba(240,232,213,0.25)"
              autoCapitalize="words"
              onFocus={() => setFocusedField('businessName')}
              onBlur={() => setFocusedField(null)}
              style={styles.inputText}
            />
          </View>
          <Text style={styles.helperText}>Leave blank to use your name only.</Text>
        </View>

        {/* ── CATEGORY ───────────────────────────── */}
        <View style={styles.fieldWrap}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>WHAT DO YOU DO</Text>
            <View style={styles.requiredDot} />
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.inputContainer, styles.selectorRow, { borderColor: errors.category ? '#E05C5C' : 'rgba(240,232,213,0.08)' }]}
            onPress={() => setShowCategorySheet(true)}
          >
            <Text style={[styles.inputText, { flex: 1, color: displayCategory ? '#F0E8D5' : 'rgba(240,232,213,0.25)' }]}>
              {displayCategory || 'Select your primary category'}
            </Text>
            <Feather name="chevron-down" size={16} color="rgba(240,232,213,0.3)" />
          </TouchableOpacity>
          {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}
        </View>

        {/* Custom category input when Other selected */}
        {category === 'Other' && (
          <View style={[styles.fieldWrap, { marginTop: -8 }]}>
            <Text style={styles.fieldLabel}>DESCRIBE WHAT YOU DO</Text>
            <View style={[styles.inputContainer, { borderColor: fieldBorder('customCategory') }]}>
              <TextInput
                value={customCategory}
                onChangeText={(t) => {
                  setCustomCategory(t)
                  if (t.trim()) setErrors((prev) => ({ ...prev, category: undefined }))
                }}
                placeholder="e.g. Mobile Car Detailing"
                placeholderTextColor="rgba(240,232,213,0.25)"
                autoFocus
                onFocus={() => setFocusedField('customCategory')}
                onBlur={() => setFocusedField(null)}
                style={styles.inputText}
              />
            </View>
          </View>
        )}

        {/* ── LOCATION ───────────────────────────── */}
        <View style={styles.fieldWrap}>
          <View style={styles.labelRow}>
            <Text style={styles.fieldLabel}>YOUR LOCATION</Text>
            <View style={styles.requiredDot} />
          </View>
          <View style={[styles.inputContainer, styles.selectorRow, { borderColor: fieldBorder('location') }]}>
            <Feather name="map-pin" size={16} color="rgba(240,232,213,0.3)" style={{ marginRight: 10 }} />
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Midtown, Houston TX"
              placeholderTextColor="rgba(240,232,213,0.25)"
              onFocus={() => setFocusedField('location')}
              onBlur={() => setFocusedField(null)}
              style={[styles.inputText, { flex: 1 }]}
            />
          </View>
          <Text style={styles.helperText}>Where you are based or primarily work.</Text>
        </View>

        {/* ── BIO ────────────────────────────────── */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>YOUR BIO (OPTIONAL)</Text>
          <View style={[styles.inputContainer, styles.bioContainer, { borderColor: fieldBorder('bio') }]}>
            <TextInput
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, 300))}
              placeholder={'Tell clients about yourself, your experience, and your style...'}
              placeholderTextColor="rgba(240,232,213,0.25)"
              multiline
              textAlignVertical="top"
              maxLength={300}
              onFocus={() => setFocusedField('bio')}
              onBlur={() => setFocusedField(null)}
              style={[styles.inputText, styles.bioInput]}
            />
          </View>
          <Text style={styles.bioCounter}>{bio.length} / 300</Text>
        </View>

        {/* ── MOBILE TOGGLE ──────────────────────── */}
        <View style={styles.mobileToggle}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>I travel to clients</Text>
            <Text style={styles.toggleSubtitle}>Mobile provider, home visits, on-site</Text>
          </View>
          <Switch
            value={isMobile}
            onValueChange={setIsMobile}
            trackColor={{ false: 'rgba(240,232,213,0.15)', true: 'rgba(240,232,213,0.5)' }}
            thumbColor={isMobile ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
          />
        </View>
      </ScrollView>

      {/* ── FIXED CTA ──────────────────────────────── */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.continueBtn, !isValid && styles.continueBtnInactive]}
          onPress={handleContinue}
        >
          <Text style={[styles.continueBtnText, !isValid && styles.continueBtnTextInactive]}>
            Continue
          </Text>
        </Pressable>
        <Text style={styles.ctaNote}>Your profile will not be visible until you go live.</Text>
      </View>

      {/* ── CATEGORY BOTTOM SHEET ──────────────────── */}
      <Modal
        visible={showCategorySheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategorySheet(false)}
      >
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowCategorySheet(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Select your category</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {CATEGORIES.map((cat, i) => (
                <Pressable
                  key={cat}
                  style={[styles.categoryRow, i < CATEGORIES.length - 1 && styles.categoryRowBorder]}
                  onPress={() => selectCategory(cat)}
                >
                  <Text style={styles.categoryName}>{cat}</Text>
                  {category === cat && (
                    <Feather name="check" size={16} color="#C8922A" />
                  )}
                </Pressable>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    width: '12.5%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
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
    paddingBottom: 140,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 36,
    marginTop: 24,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 32,
  },

  // Banner
  bannerBox: {
    width: '100%',
    height: 120,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.12)',
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: 120,
  },
  bannerEditPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(8,8,8,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  bannerEditText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  bannerPlaceholder: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },

  // Profile photo
  photoWrap: {
    marginTop: -28,
    marginLeft: 16,
    marginBottom: 8,
  },
  photoOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#080808',
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHelper: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginLeft: 16,
    marginBottom: 28,
    lineHeight: 16,
  },

  // Fields
  fieldWrap: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  requiredDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E05C5C',
    marginTop: 1,
  },
  inputContainer: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    borderCurve: 'continuous',
    height: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },
  helperText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },
  errorText: {
    fontSize: 11,
    color: '#E05C5C',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  bioContainer: {
    height: 100,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: 14,
  },
  bioInput: {
    textAlignVertical: 'top',
    width: '100%',
  },
  bioCounter: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'right',
    marginTop: 4,
  },

  // Mobile toggle
  mobileToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  toggleSubtitle: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },

  // CTA
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
    marginBottom: 8,
  },
  continueBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  continueBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
  ctaNote: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },

  // Category sheet
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  categoryRow: {
    height: 52,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  categoryName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
})
