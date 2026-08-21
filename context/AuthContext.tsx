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

// Ensure a non-provider user has a clients row so their name resolves
// everywhere (e.g. the messaging inbox) even if they never completed client
// onboarding — the case that made orphaned users show up as "Client". The name
// defaults to the email local-part; the user can change it later via Edit
// Profile. ignoreDuplicates makes this a no-op when a row already exists, so it
// never overwrites an existing name (or resets created_at, which the DB
// defaults to now() on insert).
async function ensureClientRow(userId: string, email: string | null) {
  const derivedName =
    email && email.includes('@') ? email.split('@')[0] : 'Member'
  const { error } = await supabase
    .from('clients')
    .upsert(
      { id: userId, name: derivedName },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  if (error) console.log('Ensure clients row error:', error)
}

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
    const email = session?.user?.email ?? null
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

        // Backfill a clients row only for users who own NO row yet (role null:
        // neither provider nor client) — the orphaned-user case behind the
        // "Client" messaging bug. Deliberately NOT run for role === 'client'
        // (row already exists) or 'provider'. Gating on null preserves the
        // path-selection step for brand-new users and avoids silently turning
        // an incomplete provider signup into a client on their next login.
        // Fire-and-forget: it must never block role resolution.
        if (resolved.role === null) {
          void ensureClientRow(userId, email)
        }
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
