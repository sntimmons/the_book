import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = 'https://kxregomuawwcqvisuhtr.supabase.co'
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4cmVnb211YXd3Y3F2aXN1aHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzQyODQsImV4cCI6MjA5MjA1MDI4NH0.CUsGptlSlKsizEyj-xedTMoTeZ3mfrzgUY1n2w2xwVU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
