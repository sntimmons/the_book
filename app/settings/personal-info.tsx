import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

interface ClientRow {
  id: string
  name: string | null
  notes: string | null
  created_at: string | null
}

export default function PersonalInfo() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [name, setName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, name, notes, created_at')
        .eq('id', user.id)
        .maybeSingle<ClientRow>()
      const initial = data?.name ?? ''
      setName(initial)
      setOriginalName(initial)
    } catch (err) {
      console.log('Load personal info error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const hasChanges = name.trim() !== originalName.trim()

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

  async function handleSave() {
    if (!user) return
    const trimmed = name.trim()
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter your name.', [{ text: 'OK' }])
      return
    }
    setSaving(true)
    try {
      // Same save pattern as app/me/edit.tsx: upsert the clients row by id.
      const updates = {
        id: user.id,
        name: trimmed,
        created_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('clients')
        .upsert(updates, { onConflict: 'id' })

      if (error) {
        console.log('Save personal info error:', error)
        Alert.alert(
          'Could not save',
          'Something went wrong. Please try again.',
          [{ text: 'OK' }],
        )
        setSaving(false)
        return
      }

      setOriginalName(trimmed)
      setSaving(false)
      Alert.alert(
        'Saved',
        'Your name has been updated.',
        [{ text: 'Done', onPress: () => router.back() }],
      )
    } catch (err) {
      console.log('Save exception:', err)
      Alert.alert(
        'Something went wrong',
        'Please check your connection and try again.',
        [{ text: 'OK' }],
      )
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Personal Information</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!hasChanges || saving}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {saving ? (
            <ActivityIndicator color="#C8922A" />
          ) : (
            <Text
              style={[
                s.saveText,
                (!hasChanges || saving) && s.saveTextDisabled,
              ]}
            >
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.fieldLabel}>NAME</Text>
        {loading ? (
          <View style={s.skeletonInput} />
        ) : (
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="rgba(240,232,213,0.3)"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={hasChanges ? handleSave : undefined}
          />
        )}
        <Text style={s.helperText}>
          This is the name providers see when you book.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  saveText: {
    fontSize: 15,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  saveTextDisabled: {
    color: 'rgba(200,146,42,0.3)',
  },
  fieldLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  skeletonInput: {
    height: 50,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  helperText: {
    marginTop: 10,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
})
