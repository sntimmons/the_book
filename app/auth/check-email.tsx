import { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { magicLinkRedirectTo } from '@/lib/authCallback'
import { useAuth } from '@/context/AuthContext'

// THE EMAIL PATH'S HOLDING SCREEN.
//
// This replaces /auth/verify for email. There is deliberately NO code entry
// here: the Supabase template for this project sends a magic link, so there is
// no code to enter. The user's next action is in their inbox, not on this
// screen. When they tap the link, hooks/useMagicLinkSession opens the session
// and lib/postAuthRouting carries them into the app — this screen only has to
// say what is happening and offer a way to try again.
//
// /auth/verify is untouched and still owns phone (SMS) OTP.

const COUNTDOWN_START = 45

export default function CheckEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>()
  const address = email ?? ''
  const insets = useSafeAreaInsets()
  const { magicLinkStatus, magicLinkError, clearMagicLinkError } = useAuth()

  const [seconds, setSeconds] = useState(COUNTDOWN_START)
  const [isResending, setIsResending] = useState(false)
  const [resendError, setResendError] = useState('')
  const [resent, setResent] = useState(false)

  // Countdown before a resend is allowed, matching the phone path's pacing.
  useEffect(() => {
    if (seconds <= 0) return
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [seconds])

  const canResend = seconds <= 0 && !isResending && address.length > 0
  // A failed link is the most useful thing to show; a local resend failure
  // second. Both are recoverable from this screen.
  const message = magicLinkError ?? (resendError.length > 0 ? resendError : null)

  async function handleResend() {
    if (!canResend) return

    setIsResending(true)
    setResendError('')
    setResent(false)
    // The old link's failure is no longer the current state once a new one is on
    // its way.
    clearMagicLinkError()

    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: magicLinkRedirectTo() },
    })

    setIsResending(false)

    if (error) {
      setResendError(error.message)
      return
    }

    setSeconds(COUNTDOWN_START)
    setResent(true)
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

      <View style={[styles.content, { paddingTop: insets.top + 80 }]}>
        <Text style={styles.headline}>Check your email.</Text>

        <Text style={styles.subtext}>We sent a sign-in link to</Text>
        <Text style={styles.address}>{address}</Text>

        <Pressable onPress={() => router.back()}>
          <Text style={styles.wrongAddress}>Wrong email?</Text>
        </Pressable>

        <Text style={styles.instruction}>
          Open it on this device and you&apos;ll be signed in automatically. The
          link works once, and expires.
        </Text>

        {magicLinkStatus === 'exchanging' && (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#C8922A" size="small" />
            <Text style={styles.statusText}>Signing you in...</Text>
          </View>
        )}

        {message !== null && <Text style={styles.errorText}>{message}</Text>}

        {resent && message === null && (
          <Text style={styles.sentText}>New link sent.</Text>
        )}
      </View>

      <View style={{ flex: 1 }} />

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 32 }]}>
        <Pressable disabled={!canResend} onPress={handleResend}>
          {isResending ? (
            <ActivityIndicator color="rgba(240,232,213,0.6)" />
          ) : (
            <Text style={[styles.resend, canResend && styles.resendActive]}>
              {canResend ? 'Send a new link' : `Send a new link in 0:${String(seconds).padStart(2, '0')}`}
            </Text>
          )}
        </Pressable>
      </View>
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
    marginBottom: 24,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  address: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  wrongAddress: {
    marginTop: 10,
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  instruction: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  statusRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 10,
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
  errorText: {
    marginTop: 24,
    fontSize: 13,
    lineHeight: 19,
    color: '#E05C5C',
    fontFamily: 'Manrope_400Regular',
  },
  sentText: {
    marginTop: 24,
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  ctaBar: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  resend: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
  },
  resendActive: {
    color: '#F0E8D5',
  },
})
