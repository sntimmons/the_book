import { useState, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

// Basic shape check only — Supabase is the source of truth for deliverability.
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export default function EmailScreen() {
  const [email, setEmail] = useState('')
  const [focused, setFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const insets = useSafeAreaInsets()
  const inputRef = useRef<TextInput>(null)

  const trimmed = email.trim()
  const isValid = isValidEmail(trimmed)

  function handleChangeText(text: string) {
    // Strip whitespace as users type; emails never contain spaces.
    setEmail(text.replace(/\s/g, ''))
    if (error) setError('')
  }

  async function handleSendOTP() {
    if (!isValid || isLoading) return

    setIsLoading(true)
    setError('')

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
    })

    if (otpError) {
      setError(otpError.message)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    router.push({
      pathname: '/auth/verify',
      params: { email: trimmed, method: 'email' },
    })
  }

  return (
    <View style={[styles.root, { backgroundColor: '#080808' }]}>
      {/* Wordmark */}
      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      {/* Back arrow */}
      <TouchableOpacity
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
      >
        <Feather name="chevron-left" size={18} color="#F0E8D5" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Content */}
        <View style={[styles.content, { paddingTop: insets.top + 80 }]}>
          <Text style={styles.headline}>
            Enter your email to sign in.
          </Text>

          {/* Email input */}
          <Pressable onPress={() => inputRef.current?.focus()}>
            <TextInput
              ref={inputRef}
              value={email}
              onChangeText={handleChangeText}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="rgba(240,232,213,0.3)"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              onSubmitEditing={handleSendOTP}
              returnKeyType="next"
              style={[
                styles.input,
                { borderBottomColor: focused ? '#C8922A' : 'rgba(240,232,213,0.2)' },
              ]}
            />
            <Text style={styles.inputLabel}>EMAIL</Text>
          </Pressable>

          {error.length > 0 && (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>

        <View style={{ flex: 1 }} />

        {/* Next button */}
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 32 }]}>
          <Pressable
            style={[
              styles.nextBtn,
              isValid && !isLoading ? styles.nextBtnActive : styles.nextBtnInactive,
            ]}
            disabled={!isValid || isLoading}
            onPress={handleSendOTP}
          >
            {isLoading ? (
              <ActivityIndicator color="#080808" />
            ) : (
              <Text style={[styles.nextText, isValid ? styles.nextTextActive : styles.nextTextInactive]}>
                Next
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  wordmark: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3.5,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    zIndex: 1,
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 38,
    marginBottom: 40,
  },
  input: {
    fontSize: 28,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 2,
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: '#E05C5C',
    fontFamily: 'Manrope_400Regular',
  },
  ctaBar: {
    paddingHorizontal: 24,
  },
  nextBtn: {
    height: 52,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnActive: {
    backgroundColor: '#F0E8D5',
  },
  nextBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.15)',
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  nextTextActive: {
    color: '#080808',
  },
  nextTextInactive: {
    color: 'rgba(240,232,213,0.4)',
  },
})
