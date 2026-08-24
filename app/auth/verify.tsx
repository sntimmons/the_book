import { useState, useEffect, useRef } from 'react'
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
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { resolveUserRole } from '@/lib/resolveUserRole'

const COUNTDOWN_START = 45

function formatPhoneDisplay(phone: string | undefined): string {
  if (!phone) return 'your phone'
  return (
    phone.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, '($2) $3-$4') || phone
  )
}

export default function VerifyScreen() {
  const { phone, email, method } = useLocalSearchParams<{
    phone?: string
    email?: string
    method?: string
  }>()
  // Email when explicitly flagged, or inferred when only an email was passed.
  // Falls back to phone so the existing phone flow keeps working untouched
  // (phone.tsx routes here with just `phone` and no `method`).
  const isEmail = method === 'email' || (!!email && !phone)
  const contact = isEmail ? (email ?? '') : (phone ?? '')
  const [code, setCode] = useState('')
  const [seconds, setSeconds] = useState(COUNTDOWN_START)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<TextInput>(null)
  const insets = useSafeAreaInsets()

  const isValid = code.length === 6

  // Countdown timer
  useEffect(() => {
    if (seconds <= 0) return
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds])

  function formatCountdown(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // Accepts an explicit code so auto-submit can pass the freshly-typed value
  // (setCode is async, so `code` state lags by one render). The Verify button
  // calls it with no arg and falls back to state.
  async function handleVerify(submittedCode: string = code) {
    if (submittedCode.length !== 6 || isLoading) return

    setIsLoading(true)
    setError('')

    const { data, error: verifyError } = isEmail
      ? await supabase.auth.verifyOtp({
          email: contact,
          token: submittedCode,
          type: 'email',
        })
      : await supabase.auth.verifyOtp({
          phone: contact,
          token: submittedCode,
          type: 'sms',
        })

    if (verifyError || !data.user) {
      // Surface the real reason (expired vs invalid) instead of a blanket
      // message, while keeping a friendly fallback.
      const raw = verifyError?.message?.toLowerCase() ?? ''
      if (raw.includes('expired')) {
        setError('That code has expired. Tap resend to get a new one.')
      } else if (verifyError?.message) {
        setError('Invalid code. Please try again.')
      } else {
        setError('Something went wrong. Please try again.')
      }
      setIsLoading(false)
      setCode('')
      inputRef.current?.focus()
      return
    }

    // Resolve role to decide where to route (same precedence/destinations as
    // before — provider > client > new user).
    const { role } = await resolveUserRole(data.user.id)

    setIsLoading(false)

    if (role === 'provider') {
      // Providers land in the shared tabs and reach the dashboard via the Me
      // tab's My Studio entrance (NAVIGATION_ARCHITECTURE.md: one shell, no modes).
      router.replace('/(tabs)/')
    } else if (role === 'client') {
      router.replace('/(tabs)/')
    } else {
      router.replace('/path-selection')
    }
  }

  async function handleResend() {
    if (!contact || seconds > 0) return
    const { error: resendError } = isEmail
      ? await supabase.auth.signInWithOtp({ email: contact })
      : await supabase.auth.signInWithOtp({ phone: contact })
    if (!resendError) {
      setSeconds(COUNTDOWN_START)
      setError('')
    } else {
      setError(resendError.message)
    }
  }

  return (
    <View style={styles.root}>
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
            {isEmail ? 'Check your email.' : 'Check your messages.'}
          </Text>

          <Text style={styles.subtext}>We sent a 6-digit code to</Text>
          <Text style={styles.phoneDisplay}>
            {isEmail ? contact : formatPhoneDisplay(contact)}
          </Text>

          <Pressable onPress={() => router.back()}>
            <Text style={styles.wrongNumber}>
              {isEmail ? 'Wrong email?' : 'Wrong number?'}
            </Text>
          </Pressable>

          {/* OTP boxes */}
          <Pressable style={styles.boxesRow} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: 6 }).map((_, i) => {
              const isFilled = i < code.length
              const isActive = i === code.length
              return (
                <View
                  key={i}
                  style={[
                    styles.box,
                    isActive && styles.boxActive,
                    isFilled && styles.boxFilled,
                  ]}
                >
                  <Text style={styles.boxText}>{code[i] ?? ''}</Text>
                </View>
              )
            })}
          </Pressable>

          {/* Hidden real input */}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(t) => {
              const next = t.replace(/\D/g, '').slice(0, 6)
              setCode(next)
              if (error) setError('')
              // Auto-submit the moment all 6 digits are present (typed or
              // autofilled), so no extra tap is needed.
              if (next.length === 6) handleVerify(next)
            }}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.hiddenInput}
            caretHidden
            autoFocus
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
          />

          {error.length > 0 && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {/* Countdown / resend */}
          <Pressable onPress={handleResend} disabled={seconds > 0}>
            <Text style={styles.resendText}>
              {seconds > 0
                ? `Resend code in ${formatCountdown(seconds)}`
                : 'Resend code'}
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />

        {/* Verify button — also a fallback if auto-submit doesn't fire */}
        <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 32 }]}>
          <Pressable
            style={[
              styles.verifyBtn,
              isValid && !isLoading ? styles.verifyBtnActive : styles.verifyBtnInactive,
            ]}
            disabled={!isValid || isLoading}
            onPress={() => handleVerify()}
          >
            {isLoading ? (
              <ActivityIndicator color="#080808" />
            ) : (
              <Text style={[styles.verifyText, isValid ? styles.verifyTextActive : styles.verifyTextInactive]}>
                Verify
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
    backgroundColor: '#080808',
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
    marginBottom: 12,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
  },
  phoneDisplay: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 8,
  },
  wrongNumber: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 48,
  },
  boxesRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  box: {
    width: 44,
    height: 54,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: 'rgba(240,232,213,0.5)',
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  boxFilled: {
    borderColor: 'rgba(240,232,213,0.2)',
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  boxText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  resendText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 12,
    color: '#E05C5C',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  ctaBar: {
    paddingHorizontal: 24,
  },
  verifyBtn: {
    height: 52,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnActive: {
    backgroundColor: '#C8922A',
  },
  verifyBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.15)',
  },
  verifyText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  verifyTextActive: {
    color: '#080808',
  },
  verifyTextInactive: {
    color: 'rgba(240,232,213,0.4)',
  },
})
