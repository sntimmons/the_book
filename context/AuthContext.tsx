import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { resolveUserRole, UserRole } from '../lib/resolveUserRole'

interface AuthContextType {
  session: Session | null
  user: User | null
  isLoading: boolean
  signOut: () => Promise<void>
  // Role of the signed-in user, resolved once per session. `role` is null when
  // signed out or not yet onboarded. `roleLoading` is true while the lookup is
  // in flight.
  role: UserRole
  isProvider: boolean
  providerId: string | null
  roleLoading: boolean
  // Set when role resolution FAILED (network/RLS) rather than returning a real
  // role. The UI should show a retry screen and NOT proceed, so a transient
  // failure never gets treated as "user has no role".
  roleError: string | null
  retryRole: () => void
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  signOut: async () => {},
  role: null,
  isProvider: false,
  providerId: null,
  roleLoading: true,
  roleError: null,
  retryRole: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [role, setRole] = useState<UserRole>(null)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)
  const [roleError, setRoleError] = useState<string | null>(null)
  // Bumping this re-runs role resolution (used by retryRole).
  const [retryNonce, setRetryNonce] = useState(0)
  const retryRole = useCallback(() => setRetryNonce((n) => n + 1), [])

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

  // Resolve the user's role once per session (re-runs when the user id
  // changes — i.e. sign in / sign out / account switch).
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setRole(null)
      setProviderId(null)
      setRoleLoading(false)
      setRoleError(null)
      return
    }

    let cancelled = false
    setRoleLoading(true)
    setRoleError(null)
    resolveUserRole(userId)
      .then((resolved) => {
        if (cancelled) return

        // Resolution FAILED (network/RLS). Do NOT create a phantom clients row;
        // surface the error so the UI can offer a retry.
        if (resolved.role === 'error') {
          setRoleError(resolved.error ?? 'Could not load your account. Please try again.')
          setRole(null)
          setProviderId(null)
          setRoleLoading(false)
          return
        }

        setRole(resolved.role)
        setProviderId(resolved.providerId)
        setRoleLoading(false)
        // NOTE: the orphan clients-row backfill deliberately does NOT run here.
        // At auth-resolve a brand-new provider still owns no rows (role null),
        // so backfilling here created a junk client row before they onboarded.
        // It now runs from the tab shell (see app/(tabs)/_layout.tsx), gated on
        // role === null, where a provider still in onboarding never reaches.
      })
      .catch(() => {
        if (cancelled) return
        // An unexpected throw is also a failure, not "no role".
        setRoleError('Could not load your account. Please try again.')
        setRole(null)
        setProviderId(null)
        setRoleLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session?.user?.id, retryNonce])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        signOut,
        role,
        isProvider: role === 'provider',
        providerId,
        roleLoading,
        roleError,
        retryRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
