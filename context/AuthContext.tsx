import {
  createContext,
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
  // in flight. Added for Mode 3; nothing consumes it yet.
  role: UserRole
  isProvider: boolean
  providerId: string | null
  roleLoading: boolean
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
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [role, setRole] = useState<UserRole>(null)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)

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
      return
    }

    let cancelled = false
    setRoleLoading(true)
    resolveUserRole(userId)
      .then((resolved) => {
        if (cancelled) return
        setRole(resolved.role)
        setProviderId(resolved.providerId)
        setRoleLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setRole(null)
        setProviderId(null)
        setRoleLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

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
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
