import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react'
import { Session, User } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '../lib/supabase'

// DEV-ONLY IMPERSONATION. This works because RLS is currently disabled.
// DO NOT SHIP. Removing this MUST happen together with enabling RLS (Phase 4 hardening).
// If RLS is enabled while this remains, or this ships at all, it is a security hole.
const IMPERSONATION_STORAGE_KEY = 'dev_impersonated_user_id'

interface AuthContextType {
  session: Session | null
  user: User | null
  isLoading: boolean
  signOut: () => Promise<void>
  // DEV-ONLY: the auth id we are currently pretending to be (null when not impersonating).
  // Always null in production builds because the setter and resolution are gated by __DEV__.
  impersonatedUserId: string | null
  // DEV-ONLY: set the override to an auth user id, or null to stop impersonating.
  setImpersonatedUserId: (id: string | null) => void
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  signOut: async () => {},
  impersonatedUserId: null,
  setImpersonatedUserId: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // DEV-ONLY IMPERSONATION. This works because RLS is currently disabled.
  // DO NOT SHIP. Removing this MUST happen together with enabling RLS (Phase 4 hardening).
  // If RLS is enabled while this remains, or this ships at all, it is a security hole.
  const [impersonatedUserId, setImpersonatedUserIdState] = useState<string | null>(
    null,
  )

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // DEV-ONLY: restore a persisted impersonation choice on boot so it survives reload.
  useEffect(() => {
    if (!__DEV__) return
    SecureStore.getItemAsync(IMPERSONATION_STORAGE_KEY)
      .then((stored) => {
        if (stored) setImpersonatedUserIdState(stored)
      })
      .catch(() => {})
  }, [])

  // DEV-ONLY: set or clear the impersonation override and persist the choice.
  const setImpersonatedUserId = useCallback((id: string | null) => {
    if (!__DEV__) return
    setImpersonatedUserIdState(id)
    if (id) {
      SecureStore.setItemAsync(IMPERSONATION_STORAGE_KEY, id).catch(() => {})
    } else {
      SecureStore.deleteItemAsync(IMPERSONATION_STORAGE_KEY).catch(() => {})
    }
  }, [])

  const signOut = async () => {
    // DEV-ONLY: signing out should also drop any impersonation override.
    if (__DEV__) setImpersonatedUserId(null)
    await supabase.auth.signOut()
  }

  // DEV-ONLY: a minimal fake User carrying just the auth id every screen reads.
  // Memoized so its identity is stable per id and does not retrigger screen fetch loops.
  const impersonatedUser = useMemo<User | null>(() => {
    if (!__DEV__ || !impersonatedUserId) return null
    return {
      id: impersonatedUserId,
      app_metadata: {},
      user_metadata: { impersonated: true },
      aud: 'authenticated',
      created_at: '2024-01-01T00:00:00.000Z',
    } as User
  }, [impersonatedUserId])

  // In production __DEV__ is false, so impersonatedUser is always null and this
  // collapses to the original `session?.user ?? null`.
  const effectiveUser = impersonatedUser ?? session?.user ?? null

  return (
    <AuthContext.Provider
      value={{
        session,
        user: effectiveUser,
        isLoading,
        signOut,
        impersonatedUserId: __DEV__ ? impersonatedUserId : null,
        setImpersonatedUserId,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
