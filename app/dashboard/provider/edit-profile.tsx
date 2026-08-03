import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { uploadMedia } from '../../../lib/storage'
import { useCategories } from '../../../hooks/useProviders'
import { DoneAccessory, DONE_ACCESSORY_ID } from '../../../components/DoneAccessory'

interface ProviderForm {
  displayName: string
  bio: string
  location: string
  neighborhood: string
  specialties: string
  yearsExperience: string
}

interface ProviderData {
  id: string
  display_name: string | null
  bio: string | null
  location: string | null
  neighborhood: string | null
  profile_photo_url: string | null
  cover_image_url: string | null
  category_id: number | null
  specialties: string[] | null
  years_experience: number | null
}

const BIO_LIMIT = 300
const EMPTY_FORM: ProviderForm = {
  displayName: '',
  bio: '',
  location: '',
  neighborhood: '',
  specialties: '',
  yearsExperience: '',
}

function Shimmer({ style }: { style: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
      opacity.stopAnimation()
    }
  }, [opacity])
  return (
    <Animated.View
      style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]}
    />
  )
}

export default function ProviderEditProfileScreen() {
  const { user } = useAuth()
  const insets = useSafeAreaInsets()
  const { categories } = useCategories()

  const [providerData, setProviderData] = useState<ProviderData | null>(null)
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [bannerChanged, setBannerChanged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showCategorySheet, setShowCategorySheet] = useState(false)
  const [focused, setFocused] = useState<keyof ProviderForm | null>(null)

  const loadProviderData = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('providers')
        .select(
          'id, display_name, bio, location, neighborhood, profile_photo_url, cover_image_url, category_id, specialties, years_experience',
        )
        .eq('user_id', user.id)
        .maybeSingle()

      if (error || !data) {
        console.log('Load provider error:', error)
        setLoading(false)
        return
      }
      const row = data as ProviderData
      setProviderData(row)
      setSelectedCategoryId(row.category_id)
      setPhoto(row.profile_photo_url)
      setPhotoError(false)
      setBanner(row.cover_image_url)
      setForm({
        displayName: row.display_name ?? '',
        bio: row.bio ?? '',
        location: row.location ?? '',
        neighborhood: row.neighborhood ?? '',
        specialties: row.specialties?.join(', ') ?? '',
        yearsExperience: row.years_experience?.toString() ?? '',
      })
    } catch (err) {
      console.log('Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadProviderData()
  }, [loadProviderData])

  function updateField(field: keyof ProviderForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow access to your photo library to update your profile photo.',
        [{ text: 'OK' }],
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri)
      setPhotoError(false)
      setPhotoChanged(true)
      setHasChanges(true)
    }
  }

  async function pickBanner() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow access to your photo library to update your cover photo.',
        [{ text: 'OK' }],
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setBanner(result.assets[0].uri)
      setBannerChanged(true)
      setHasChanges(true)
    }
  }

  async function handleSave() {
    if (!user || !providerData) return
    if (!form.displayName.trim()) {
      Alert.alert('Name required', 'Please enter your display name.', [{ text: 'OK' }])
      return
    }
    setSaving(true)
    try {
      let profilePhotoUrl = providerData.profile_photo_url
      if (photoChanged && photo) {
        const result = await uploadMedia(photo, user.id, 'profile', 'provider-media')
        if (result.url) profilePhotoUrl = result.url
        if (result.error) console.log('Photo upload error:', result.error)
      }

      let coverImageUrl = providerData.cover_image_url
      if (bannerChanged && banner) {
        const result = await uploadMedia(banner, user.id, 'banner', 'provider-media')
        if (result.url) coverImageUrl = result.url
        if (result.error) console.log('Banner upload error:', result.error)
      }

      const specialtiesArray = form.specialties
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      const yearsInt = form.yearsExperience
        ? parseInt(form.yearsExperience, 10)
        : null
      const yearsValue =
        yearsInt != null && !Number.isNaN(yearsInt) ? yearsInt : null

      const updates = {
        display_name: form.displayName.trim(),
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        category_id: selectedCategoryId,
        profile_photo_url: profilePhotoUrl,
        cover_image_url: coverImageUrl,
        // specialties is NOT NULL (default '{}') in the DB, so an empty list
        // must be sent as an empty array — never null — to avoid a constraint
        // violation when a provider clears all their specialties.
        specialties: specialtiesArray,
        years_experience: yearsValue,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('providers')
        .update(updates)
        .eq('user_id', user.id)

      if (error) {
        console.log('Save error:', error)
        setSaving(false)
        // Surface the real reason rather than hiding every failure behind a
        // single generic line. If the save fails because of a schema or
        // permission problem (e.g. a missing column or an RLS rule), the tester
        // now sees exactly what went wrong so it can be reported and fixed.
        Alert.alert(
          'Could not save',
          error.message
            ? `We could not save your changes: ${error.message}`
            : 'Something went wrong. Please try again.',
          [{ text: 'OK' }],
        )
        return
      }

      setSaving(false)
      setHasChanges(false)
      setPhotoChanged(false)
      setBannerChanged(false)
      Alert.alert(
        'Profile updated',
        'Your changes have been saved and are live on your profile.',
        // Land explicitly on the dashboard via replace rather than router.back().
        // The provider stack is built with router.replace (see the dashboard
        // _layout note), so back() here can cross the auth boundary to a
        // detached screen and leave the app frozen/untappable.
        [{ text: 'Done', onPress: () => router.replace('/dashboard/provider') }],
      )
    } catch (err: any) {
      console.log('Save exception:', err)
      Alert.alert(
        'Something went wrong',
        'Please check your connection and try again.',
        [{ text: 'OK' }],
      )
      setSaving(false)
    }
  }

  function handleBack() {
    if (!hasChanges) {
      router.back()
      return
    }
    Alert.alert(
      'Unsaved changes',
      'You have unsaved changes. Are you sure you want to go back?',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => router.back() },
      ],
    )
  }

  const avatarInitial =
    form.displayName.trim().charAt(0).toUpperCase() ||
    providerData?.display_name?.charAt(0).toUpperCase() ||
    'P'
  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name ?? ''

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Edit Profile</Text>
        <Pressable
          onPress={handleSave}
          disabled={!hasChanges || saving}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {saving ? (
            <ActivityIndicator color="#C8922A" size="small" />
          ) : (
            <Text
              style={[
                styles.saveText,
                hasChanges ? styles.saveTextActive : styles.saveTextMuted,
              ]}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {loading ? (
          <View>
            <Shimmer style={{ width: '100%', height: 160 }} />
            <View style={{ paddingHorizontal: 24, marginTop: -40 }}>
              <Shimmer style={{ width: 80, height: 80, borderRadius: 40 }} />
              <Shimmer style={[styles.skeletonField, { marginTop: 32 }]} />
              <Shimmer style={[styles.skeletonField, { marginTop: 16 }]} />
              <Shimmer style={[styles.skeletonField, { marginTop: 16, height: 100 }]} />
            </View>
          </View>
        ) : (
          <>
            {/* Banner */}
            <View style={styles.bannerWrap}>
              {banner ? (
                <Image source={{ uri: banner }} style={styles.bannerImg} />
              ) : (
                <View style={styles.bannerPlaceholder}>
                  <Ionicons
                    name="image-outline"
                    size={32}
                    color="rgba(240,232,213,0.15)"
                  />
                  <Text style={styles.bannerPlaceholderText}>Add cover photo</Text>
                </View>
              )}
              <View style={styles.bannerEditBadge}>
                <Ionicons name="camera-outline" size={14} color="#F0E8D5" />
                <Text style={styles.bannerEditText}>Edit cover</Text>
              </View>
              <Pressable
                onPress={pickBanner}
                style={StyleSheet.absoluteFill}
                android_ripple={null}
              />
            </View>

            {/* Photo + identity */}
            <View style={styles.identityRow}>
              <View style={styles.photoWrap}>
                {photo && !photoError ? (
                  <Image
                    source={{ uri: photo }}
                    style={styles.photoImg}
                    // If the stored photo URL is broken/missing, fall back to
                    // initials so it reads as "empty, needs updating" rather
                    // than a blank square.
                    onError={() => setPhotoError(true)}
                  />
                ) : (
                  <View style={styles.photoFallback}>
                    <Text style={styles.photoInitial}>{avatarInitial}</Text>
                  </View>
                )}
                <View style={styles.photoCameraBadge}>
                  <Ionicons name="camera" size={12} color="#080808" />
                </View>
                <Pressable
                  onPress={pickPhoto}
                  style={StyleSheet.absoluteFill}
                  android_ripple={null}
                />
              </View>
              <View style={styles.identityText}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {form.displayName.trim() || 'Your name'}
                </Text>
                <Text style={styles.identityCategory} numberOfLines={1}>
                  {selectedCategoryName || 'No category'}
                </Text>
              </View>
            </View>

            <View style={styles.fieldsWrap}>
              {/* Display name */}
              <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
              <TextInput
                style={[styles.input, focused === 'displayName' && styles.inputFocused]}
                value={form.displayName}
                onChangeText={(v) => updateField('displayName', v)}
                placeholder="Your name or business name"
                placeholderTextColor="rgba(240,232,213,0.25)"
                autoCapitalize="words"
                onFocus={() => setFocused('displayName')}
                onBlur={() => setFocused(null)}
              />

              {/* Category */}
              <Text style={styles.fieldLabel}>CATEGORY</Text>
              <Pressable
                style={[styles.input, styles.selectRow]}
                onPress={() => setShowCategorySheet(true)}
              >
                <Text
                  style={[
                    styles.selectText,
                    !selectedCategoryName && styles.selectTextEmpty,
                  ]}
                >
                  {selectedCategoryName || 'Select a category'}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="rgba(240,232,213,0.3)"
                />
              </Pressable>

              {/* Bio */}
              <Text style={styles.fieldLabel}>BIO</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.bioInput,
                  focused === 'bio' && styles.inputFocused,
                ]}
                value={form.bio}
                onChangeText={(v) => updateField('bio', v.slice(0, BIO_LIMIT))}
                placeholder="Tell clients about yourself and your work..."
                placeholderTextColor="rgba(240,232,213,0.25)"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={BIO_LIMIT}
                onFocus={() => setFocused('bio')}
                onBlur={() => setFocused(null)}
              />
              <Text style={styles.charCounter}>
                {form.bio.length} / {BIO_LIMIT}
              </Text>

              {/* Location */}
              <Text style={styles.fieldLabel}>CITY OR AREA</Text>
              <TextInput
                style={[styles.input, focused === 'location' && styles.inputFocused]}
                value={form.location}
                onChangeText={(v) => updateField('location', v)}
                placeholder="Houston, TX"
                placeholderTextColor="rgba(240,232,213,0.25)"
                onFocus={() => setFocused('location')}
                onBlur={() => setFocused(null)}
              />

              {/* Neighborhood */}
              <Text style={styles.fieldLabel}>NEIGHBORHOOD</Text>
              <TextInput
                style={[
                  styles.input,
                  focused === 'neighborhood' && styles.inputFocused,
                ]}
                value={form.neighborhood}
                onChangeText={(v) => updateField('neighborhood', v)}
                placeholder="Midtown, River Oaks..."
                placeholderTextColor="rgba(240,232,213,0.25)"
                onFocus={() => setFocused('neighborhood')}
                onBlur={() => setFocused(null)}
              />

              {/* Specialties */}
              <Text style={styles.fieldLabel}>SPECIALTIES</Text>
              <TextInput
                style={[
                  styles.input,
                  focused === 'specialties' && styles.inputFocused,
                ]}
                value={form.specialties}
                onChangeText={(v) => updateField('specialties', v)}
                placeholder="Knotless braids, silk press, color treatments..."
                placeholderTextColor="rgba(240,232,213,0.25)"
                onFocus={() => setFocused('specialties')}
                onBlur={() => setFocused(null)}
              />
              <Text style={styles.helperText}>Separate with commas</Text>

              {/* Years experience */}
              <Text style={styles.fieldLabel}>YEARS OF EXPERIENCE</Text>
              <TextInput
                style={[
                  styles.input,
                  focused === 'yearsExperience' && styles.inputFocused,
                ]}
                value={form.yearsExperience}
                onChangeText={(v) => updateField('yearsExperience', v.replace(/[^0-9]/g, ''))}
                placeholder="5"
                placeholderTextColor="rgba(240,232,213,0.25)"
                keyboardType="numeric"
                maxLength={2}
                inputAccessoryViewID={DONE_ACCESSORY_ID}
                onFocus={() => setFocused('yearsExperience')}
                onBlur={() => setFocused(null)}
              />
            </View>
          </>
        )}
      </ScrollView>

      <DoneAccessory />

      {/* Category bottom sheet */}
      <Modal
        visible={showCategorySheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategorySheet(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setShowCategorySheet(false)}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Select Category</Text>
            <TouchableOpacity
              onPress={() => setShowCategorySheet(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="rgba(240,232,213,0.5)" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.sheetScroll}
            showsVerticalScrollIndicator={false}
          >
            {categories.map((cat) => {
              const selected = cat.id === selectedCategoryId
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.sheetRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSelectedCategoryId(cat.id)
                    setHasChanges(true)
                    setShowCategorySheet(false)
                  }}
                >
                  <Text style={[styles.sheetRowText, selected && styles.sheetRowTextActive]}>
                    {cat.name}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={18} color="#C8922A" />
                  )}
                </TouchableOpacity>
              )
            })}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  saveText: {
    fontSize: 15,
    fontFamily: 'Manrope_600SemiBold',
  },
  saveTextActive: { color: '#C8922A' },
  saveTextMuted: { color: 'rgba(240,232,213,0.3)' },

  // Banner
  bannerWrap: {
    width: '100%',
    height: 160,
    position: 'relative',
  },
  bannerImg: {
    width: '100%',
    height: 160,
    resizeMode: 'cover',
  },
  bannerPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: 'rgba(240,232,213,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerPlaceholderText: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  bannerEditBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(8,8,8,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bannerEditText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // Identity row
  identityRow: {
    paddingHorizontal: 24,
    marginTop: -40,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  photoWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#080808',
    backgroundColor: '#1A1410',
    overflow: 'hidden',
    position: 'relative',
  },
  photoImg: {
    width: 74,
    height: 74,
    borderRadius: 37,
    resizeMode: 'cover',
  },
  photoFallback: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: {
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  photoCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
    paddingBottom: 4,
  },
  identityName: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  identityCategory: {
    marginTop: 2,
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },

  // Fields
  fieldsWrap: { paddingHorizontal: 24 },
  fieldLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 24,
  },
  input: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  inputFocused: {
    borderColor: 'rgba(200,146,42,0.4)',
  },
  bioInput: {
    height: 100,
    paddingTop: 14,
  },
  charCounter: {
    marginTop: 4,
    fontSize: 10,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'right',
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  selectTextEmpty: {
    color: 'rgba(240,232,213,0.25)',
  },
  skeletonField: {
    width: '100%',
    height: 52,
    borderRadius: 12,
  },

  // Category sheet
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  sheetScroll: {
    maxHeight: '100%',
  },
  sheetRow: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetRowText: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
  sheetRowTextActive: {
    color: '#F0E8D5',
  },
})
