import { useState, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function formatPhone(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export default function PhoneScreen() {
  const [rawDigits, setRawDigits] = useState('')
  const [focused, setFocused] = useState(false)
  const insets = useSafeAreaInsets()
  const inputRef = useRef<TextInput>(null)

  const isValid = rawDigits.length >= 10

  function handleChangeText(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 10)
    setRawDigits(digits)
  }

  return (
    <View style={[styles.root, { backgroundColor: '#080808' }]}>
      {/* Wordmark */}
      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      {/* Back arrow */}
      <Pressable
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
      >
        <Text style={styles.backText}>{'<'}</Text>
      </Pressable>

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Content */}
        <View style={[styles.content, { paddingTop: insets.top + 80 }]}>
          <Text style={styles.headline}>
            Enter your phone number to sign in.
          </Text>

          {/* Phone input */}
          <Pressable onPress={() => inputRef.current?.focus()}>
            <TextInput
              ref={inputRef}
              value={formatPhone(rawDigits)}
              onChangeText={handleChangeText}
              keyboardType="phone-pad"
              placeholder="(000) 000-0000"
              placeholderTextColor="rgba(240,232,213,0.3)"
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[
                styles.input,
                { borderBottomColor: focused ? '#C8922A' : 'rgba(240,232,213,0.2)' },
              ]}
            />
            <Text style={styles.inputLabel}>PHONE</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />

        {/* Next button */}
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 32 }]}>
          <Pressable
            style={[
              styles.nextBtn,
              isValid ? styles.nextBtnActive : styles.nextBtnInactive,
            ]}
            onPress={() => router.push('/auth/verify')}
          >
            <Text style={[styles.nextText, isValid ? styles.nextTextActive : styles.nextTextInactive]}>
              Next
            </Text>
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
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_600SemiBold',
    zIndex: 1,
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 1,
    padding: 4,
  },
  backText: {
    fontSize: 24,
    color: 'rgba(240,232,213,0.6)',
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
