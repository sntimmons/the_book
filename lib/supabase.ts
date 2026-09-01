import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Supabase connection is ENVIRONMENT-DRIVEN — there is no hardcoded project.
// Both values are PUBLIC client configuration: the anon key is RLS-gated and is
// meant to ship in the client. They are provided via EXPO_PUBLIC_* so Expo
// inlines them at build time (see .env.example). The service-role key must NEVER
// live here or in any EXPO_PUBLIC_* variable.
//
// Missing config fails LOUDLY at module load. There is deliberately NO fallback
// to a default/production project, so a misconfigured build or dev machine can
// never silently talk to the wrong backend.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
    !supabaseAnonKey && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ]
    .filter(Boolean)
    .join(', ')
  throw new Error(
    `Missing required public Supabase configuration: ${missing}. ` +
      'Set these in your local .env (see .env.example) or in the build ' +
      'environment. There is no production fallback by design.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
