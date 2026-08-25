import { supabase } from './supabase'

// Guarantees a clients row exists for a signed-in user who has reached the app
// with NO role yet (an orphan), so their name resolves in messaging instead of
// showing "Client".
//
// Called from the shared tab shell (not at auth-resolve) so a provider still in
// onboarding — who is not in the tab shell yet — never gets a junk client row.
// Gate on role === null at the call site.
//
// The name is a neutral placeholder, never the email: the real name is not known
// at this point (it is captured later in onboarding / Edit Profile), and leaking
// the email local-part into the UI is a privacy issue. ignoreDuplicates makes it
// a no-op when a row already exists, so it never overwrites an existing name or
// resets created_at (which the DB defaults to now() on insert).
export async function ensureClientRow(userId: string) {
  const { error } = await supabase
    .from('clients')
    .upsert(
      { id: userId, name: 'Member' },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  if (error) console.log('Ensure clients row error:', error)
}
