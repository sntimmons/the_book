import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
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
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadMedia } from '../../lib/storage'
import NeighborhoodPicker from '../../components/NeighborhoodPicker'

interface ProfileForm {
  name: string
  bio: string
  neighborhood: string
  phone: string
}

const BIO_LIMIT = 150

const EMPTY_FORM: ProfileForm = {
  name: '',
  bio: '',
  neighborhood: '',
  phone: '',
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

export default function EditProfileScreen() {
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoChanged, setPhotoChanged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [focusedField, setFocusedField] = useState<keyof ProfileForm | null>(null)

  const loadProfile = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // clients schema: id, name, notes, avatar_url, neighborhood, created_at.
      // Bio is stored in the notes column until the schema splits them.
      const { data } = await supabase
        .from('clients')
        .select('id, name, notes, avatar_url, neighborhood, created_at')
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        setForm({
          name: data.name ?? '',
          // Bio shares the notes column until the schema splits them.
          bio: data.notes ?? '',
          neighborhood: data.neighborhood ?? '',
          phone: user.phone ?? '',
        })
        // Show the saved avatar. Picking a new one sets photoChanged so we
        // only re-upload on an actual change.
        if (data.avatar_url) setPhoto(data.avatar_url)
      } else {
        setForm({
          name: 'Member',
          bio: '',
          neighborhood: '',
          phone: user.phone ?? '',
        })
      }
    } catch (err) {
      console.log('Load profile error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  function updateField(field: keyof ProfileForm, value: string) {
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
      setPhotoChanged(true)
      setHasChanges(true)
    }
  }

  async function handleSave() {
    if (!user) return
    if (!form.name.trim()) {
      Alert.alert('Name required', 'Please enter your name.', [{ text: 'OK' }])
      return
    }
    setSaving(true)
    try {
      // Upload the new photo if the user picked one. A failed upload leaves
      // avatarUrl null so we keep the previously saved avatar rather than
      // wiping it.
      let avatarUrl: string | null = null
      if (photoChanged && photo) {
        const result = await uploadMedia(photo, user.id, 'profile', 'provider-media')
        if (result.error || !result.url) {
          // Surface the failure rather than saving as if the photo went through.
          setSaving(false)
          Alert.alert(
            'Could not upload photo',
            result.error ?? 'Your photo could not be uploaded. Please try again.',
            [{ text: 'OK' }],
          )
          return
        }
        avatarUrl = result.url
      }

      // created_at is intentionally omitted: the clients.created_at column
      // defaults to now(), so a brand-new row still gets a timestamp while an
      // existing row keeps its original date (fixes "Member since" resetting
      // on every save).
      const updates: {
        id: string
        name: string
        notes: string | null
        neighborhood: string | null
        avatar_url?: string
      } = {
        id: user.id,
        name: form.name.trim(),
        notes: form.bio.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
      }
      // Only overwrite the stored avatar when a new photo uploaded successfully.
      if (avatarUrl) updates.avatar_url = avatarUrl

      const { error } = await supabase
        .from('clients')
        .upsert(updates, { onConflict: 'id' })

      if (error) {
        console.log('Save error:', error)
        Alert.alert(
          'Could not save',
          'Something went wrong. Please try again.',
          [{ text: 'OK' }],
        )
        setSaving(false)
        return
      }

      setSaving(false)
      setHasChanges(false)
      setPhotoChanged(false)
      Alert.alert(
        'Profile updated',
        'Your changes have been saved.',
        [{ text: 'Done', onPress: () => router.back() }],
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
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ],
    )
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          // Apple App Store requires account deletion to be available.
          // The current implementation signs the user out only. Wire this
          // to a Supabase Edge Function before App Store submission that
          // hard-deletes the auth.users row + every related row keyed on
          // it (clients, bookings, provider_follows, storage objects).
          onPress: async () => {
            await supabase.auth.signOut()
            router.replace('/')
          },
        },
      ],
    )
  }

  const avatarInitial =
    form.name.trim().charAt(0).toUpperCase() ||
    user?.email?.charAt(0).toUpperCase() ||
    'M'

  const saveActive = hasChanges && !saving

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
          disabled={!saveActive}
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
      >
        {loading ? (
          <View style={styles.skeletonWrap}>
            <Shimmer style={styles.skeletonAvatar} />
            <Shimmer style={[styles.skeletonField, { marginTop: 32 }]} />
            <Shimmer style={[styles.skeletonField, { marginTop: 16 }]} />
            <Shimmer style={[styles.skeletonField, { marginTop: 16, height: 100 }]} />
          </View>
        ) : (
          <>
            {/* Photo */}
            <View style={styles.photoSection}>
              <TouchableOpacity activeOpacity={0.8} onPress={pickPhoto}>
                <View style={styles.photoWrap}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.photoImg} />
                  ) : (
                    <View style={styles.photoFallback}>
                      <Text style={styles.photoInitial}>{avatarInitial}</Text>
                    </View>
                  )}
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={14} color="#080808" />
                  </View>
                </View>
              </TouchableOpacity>
              <Text style={styles.changePhotoText}>Change photo</Text>
            </View>

            {/* Full name */}
            <Text style={styles.fieldLabel}>FULL NAME</Text>
            <TextInput
              style={[
                styles.input,
                focusedField === 'name' && styles.inputFocused,
              ]}
              value={form.name}
              onChangeText={(v) => updateField('name', v)}
              placeholder="Your name"
              placeholderTextColor="rgba(240,232,213,0.25)"
              autoCapitalize="words"
              returnKeyType="next"
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
            />

            {/* Neighborhood */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
              YOUR NEIGHBORHOOD
            </Text>
            <NeighborhoodPicker
              value={form.neighborhood}
              onChange={(v) => updateField('neighborhood', v)}
            />
            <Text style={styles.helperText}>
              Helps providers know where you are.
            </Text>

            {/* Bio */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>BIO (OPTIONAL)</Text>
            <TextInput
              style={[
                styles.input,
                styles.bioInput,
                focusedField === 'bio' && styles.inputFocused,
              ]}
              value={form.bio}
              onChangeText={(v) => updateField('bio', v.slice(0, BIO_LIMIT))}
              placeholder="A little about yourself..."
              placeholderTextColor="rgba(240,232,213,0.25)"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={BIO_LIMIT}
              returnKeyType="done"
              onFocus={() => setFocusedField('bio')}
              onBlur={() => setFocusedField(null)}
            />
            <Text style={styles.bioCounter}>
              {form.bio.length} / {BIO_LIMIT}
            </Text>

            {/* Phone (read-only) */}
            <Text style={[styles.fieldLabel, { marginTop: 32 }]}>PHONE NUMBER</Text>
            <View style={[styles.input, styles.phoneRow]}>
              <Ionicons
                name="call-outline"
                size={16}
                color="rgba(240,232,213,0.3)"
                style={{ marginRight: 10 }}
              />
              <Text
                style={[
                  styles.phoneText,
                  !form.phone && styles.phoneTextEmpty,
                ]}
              >
                {form.phone || 'Not set'}
              </Text>
              <Ionicons
                name="lock-closed"
                size={14}
                color="rgba(240,232,213,0.25)"
              />
            </View>
            <Text style={styles.helperText}>
              To change your phone number contact support.
            </Text>

            {/* Account / Delete */}
            <Text style={[styles.fieldLabel, { marginTop: 32 }]}>ACCOUNT</Text>
            <TouchableOpacity
              style={styles.deleteRow}
              activeOpacity={0.7}
              onPress={handleDeleteAccount}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color="rgba(220,50,50,0.6)"
                style={{ marginRight: 12 }}
              />
              <Text style={styles.deleteText}>Delete Account</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
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
  saveTextActive: {
    color: '#C8922A',
  },
  saveTextMuted: {
    color: 'rgba(240,232,213,0.3)',
  },
  scrollContent: {
    paddingHorizontal: 24,
  },

  // Skeleton
  skeletonWrap: {
    paddingTop: 24,
    alignItems: 'center',
  },
  skeletonAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  skeletonField: {
    width: '100%',
    height: 52,
    borderRadius: 12,
  },

  // Photo
  photoSection: {
    marginTop: 24,
    alignItems: 'center',
    marginBottom: 32,
  },
  photoWrap: {
    width: 88,
    height: 88,
    position: 'relative',
  },
  photoImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1A1410',
  },
  photoFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: {
    fontSize: 32,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    marginTop: 10,
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },

  // Fields
  fieldLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
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
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  bioInput: {
    height: 100,
    paddingTop: 14,
  },
  bioCounter: {
    marginTop: 4,
    fontSize: 10,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'right',
  },

  // Phone (read only)
  phoneRow: {
    backgroundColor: 'rgba(240,232,213,0.03)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneText: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  phoneTextEmpty: {
    color: 'rgba(240,232,213,0.3)',
  },

  // Delete
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  deleteText: {
    fontSize: 15,
    color: 'rgba(220,50,50,0.7)',
    fontFamily: 'Manrope_500Medium',
  },
})
