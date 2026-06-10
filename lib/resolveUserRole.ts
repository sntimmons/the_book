import { supabase } from './supabase'

export type UserRole = 'provider' | 'client' | null

export interface ResolvedRole {
  role: UserRole
  isProvider: boolean
  // The providers.id row when the user is a provider, else null.
  providerId: string | null
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
  return { role: null, isProvider: false, providerId: null }
}
