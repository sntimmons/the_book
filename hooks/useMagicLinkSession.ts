import { useCallback, useEffect, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase'
import {
  describeAuthCallbackError,
  parseAuthCallbackUrl,
} from '@/lib/authCallback'

// THE APP ESTABLISHES THE MAGIC-LINK SESSION ITSELF.
//
// lib/supabase.ts sets `detectSessionInUrl: false` — correct on native, where
// there is no browser URL for the client to read — which makes the exchange this
// app's job. Nothing did it before: there was no deep-link handling anywhere in
// the codebase, so a tapped magic link had nowhere to land.
//
// This hook is the whole of that job. It does NOT navigate: it opens the session
// and lets onAuthStateChange -> AuthContext -> lib/postAuthRouting drive routing,
// so there is still exactly one navigation system in the app.

export type MagicLinkStatus = 'idle' | 'exchanging' | 'error'

export interface MagicLinkState {
  status: MagicLinkStatus
  error: string | null
  /** A callback opened a session that routing has not acted on yet. */
  pendingRedirect: boolean
  clearRedirect: () => void
  clearError: () => void
}

const GENERIC_FAILURE = "We couldn't finish signing you in. Request a new link below."

export function useMagicLinkSession(): MagicLinkState {
  const [status, setStatus] = useState<MagicLinkStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pendingRedirect, setPendingRedirect] = useState(false)

  // URLs already acted on. The OS can deliver the launch URL through BOTH
  // getInitialURL() and the 'url' event, and magic-link tokens are single-use —
  // a second attempt fails, which would show an error on a sign-in that actually
  // worked. A ref, not state: this must be consulted synchronously.
  const handled = useRef<Set<string>>(new Set())
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const handleUrl = useCallback(async (url: string | null | undefined) => {
    if (!url || handled.current.has(url)) return

    const callback = parseAuthCallbackUrl(url)
    if (callback.kind === 'none') return

    // Claim the URL BEFORE the first await, so a duplicate arriving while the
    // exchange is in flight is dropped rather than queued behind it.
    handled.current.add(url)

    if (callback.kind === 'error') {
      if (!mounted.current) return
      setStatus('error')
      setError(describeAuthCallbackError(callback))
      return
    }

    setStatus('exchanging')
    setError(null)

    try {
      const { data, error: exchangeError } =
        callback.kind === 'tokens'
          ? await supabase.auth.setSession({
              access_token: callback.accessToken,
              refresh_token: callback.refreshToken,
            })
          : await supabase.auth.exchangeCodeForSession(callback.code)

      if (!mounted.current) return

      if (exchangeError || !data?.session) {
        setStatus('error')
        setError(GENERIC_FAILURE)
        return
      }

      // Session is live. AuthContext's onAuthStateChange subscription has it;
      // this flag only tells routing that the arrival was a magic link, which is
      // what separates "carry them into the app" from a sign-in that happened on
      // a screen that routes itself.
      setStatus('idle')
      setError(null)
      setPendingRedirect(true)
    } catch {
      // A thrown network failure is still just a failed sign-in to the user.
      if (!mounted.current) return
      setStatus('error')
      setError(GENERIC_FAILURE)
    }
  }, [])

  useEffect(() => {
    // Cold start: the link IS the launch URL.
    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => {})

    // Warm start: the app was already running.
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url)
    })

    return () => subscription.remove()
  }, [handleUrl])

  const clearRedirect = useCallback(() => setPendingRedirect(false), [])
  const clearError = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return { status, error, pendingRedirect, clearRedirect, clearError }
}
