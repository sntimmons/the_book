import { supabase } from './supabase'

export type UserRole = 'provider' | 'client' | null

// 'error' is distinct from null: null means "confirmed no role yet" (safe to
// backfill a clients row), while 'error' means the lookup itself failed and the
// user's role is UNKNOWN (must NOT create a phantom clients row).
export type ResolvedRoleValue = UserRole | 'error'

export interface ResolvedRole {
  role: ResolvedRoleValue
  isProvider: boolean
  // The providers.id row when the user is a provider, else null.
  providerId: string | null
  error?: string
}

// Single source of truth for "what is this user?" — owns a providers row ->
// provider; else owns a clients row -> client; else null (new / not onboarded).
// Provider takes precedence if a user somehow has both rows. This mirrors the
// precedence the auth screens already used (provider checked first).
export async function resolveUserRole(userId: string): Promise<ResolvedRole> {
  const [clientResult, providerResult] = await Promise.all([
    supabase.from('clients').select('id').eq('id', userId).maybeSingle(),
    supabase.from('providers').select('id').eq('user_id', userId).maybeSingle(),
  ])

  // A positive identification always wins, even if the other query errored
  // ("if only one query errors, still use the other result if valid").
  if (providerResult.data) {
    return {
      role: 'provider',
      isProvider: true,
      providerId: providerResult.data.id as string,
    }
  }
  if (clientResult.data) {
    return { role: 'client', isProvider: false, providerId: null }
  }

  // No positive match. If EITHER query errored we cannot safely conclude the
  // user simply has no role — a network/RLS failure would otherwise masquerade
  // as "no role" and trigger a phantom clients-row backfill. Treat as a
  // recoverable error so the UI can retry instead of writing bad data.
  if (providerResult.error || clientResult.error) {
    return {
      role: 'error',
      isProvider: false,
      providerId: null,
      error: 'Network error. Please try again.',
    }
  }

  return { role: null, isProvider: false, providerId: null }
}
