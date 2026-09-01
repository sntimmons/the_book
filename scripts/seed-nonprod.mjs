// Minimal NON-PRODUCTION seed foundation for B5B (DB/security) and B5C (Maestro).
// Creates two reserved auth identities plus a provider row, client row, and one
// provider service. Idempotent. Targets NON-PROD only, with a hard production-ref
// guard.
//
// Secrets are read from the private tooling env (NOT EXPO_PUBLIC_*, never bundled,
// never committed). Populate .env.tooling.local from .env.tooling.example and run:
//
//   set -a; . ./.env.tooling.local; set +a; node scripts/seed-nonprod.mjs
//
// Required env: TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY,
//   SEED_CLIENT_EMAIL, SEED_CLIENT_PASSWORD, SEED_PROVIDER_EMAIL, SEED_PROVIDER_PASSWORD.
import { createClient } from '@supabase/supabase-js'

// Keep in sync with test/guards/supabaseTarget.ts (that TS guard is the canonical
// one for tests; this small copy avoids a build step for the .mjs seed runner).
const PRODUCTION_SUPABASE_REF = 'kxregomuawwcqvisuhtr'
function assertNotProductionSupabase(url) {
  const m = String(url || '').match(/^(?:https?:\/\/)?([a-z0-9]+)\.supabase\./i)
  const ref = m ? m[1].toLowerCase() : null
  if (ref === PRODUCTION_SUPABASE_REF) {
    throw new Error(
      `Refusing to seed the PRODUCTION Supabase project (ref ${PRODUCTION_SUPABASE_REF}).`,
    )
  }
}

function required(value, name) {
  if (!value) throw new Error(`Missing required tooling env: ${name} (see .env.tooling.example)`)
  return value
}

const url = required(process.env.TEST_SUPABASE_URL, 'TEST_SUPABASE_URL')
const serviceRoleKey = required(
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
  'TEST_SUPABASE_SERVICE_ROLE_KEY',
)
assertNotProductionSupabase(url) // hard guard BEFORE any connection

const clientEmail = required(process.env.SEED_CLIENT_EMAIL, 'SEED_CLIENT_EMAIL')
const clientPassword = required(process.env.SEED_CLIENT_PASSWORD, 'SEED_CLIENT_PASSWORD')
const providerEmail = required(process.env.SEED_PROVIDER_EMAIL, 'SEED_PROVIDER_EMAIL')
const providerPassword = required(process.env.SEED_PROVIDER_PASSWORD, 'SEED_PROVIDER_PASSWORD')

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Find an existing auth user by email (paginated), else create one (confirmed).
async function ensureUser(email, password) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email === email)
    if (found) return found
    if (data.users.length < 200) break
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return data.user
}

async function main() {
  const clientUser = await ensureUser(clientEmail, clientPassword)
  const providerUser = await ensureUser(providerEmail, providerPassword)

  // Client row (id = auth uid). Service role bypasses RLS/triggers.
  const { error: cErr } = await admin
    .from('clients')
    .upsert({ id: clientUser.id, name: 'Test Client' }, { onConflict: 'id' })
  if (cErr) throw cErr

  // Provider row (one per user_id).
  let providerId
  const { data: existingProvider } = await admin
    .from('providers')
    .select('id')
    .eq('user_id', providerUser.id)
    .maybeSingle()
  if (existingProvider) {
    providerId = existingProvider.id
  } else {
    const { data, error: pErr } = await admin
      .from('providers')
      .insert({
        user_id: providerUser.id,
        display_name: 'Test Provider',
        username: 'test_provider',
      })
      .select('id')
      .single()
    if (pErr) throw pErr
    providerId = data.id
  }

  // One provider service (idempotent by name).
  const { data: svc } = await admin
    .from('provider_services')
    .select('id')
    .eq('provider_id', providerId)
    .eq('name', 'Test Service')
    .maybeSingle()
  if (!svc) {
    const { error: sErr } = await admin
      .from('provider_services')
      .insert({ provider_id: providerId, name: 'Test Service', price: 50 })
    if (sErr) throw sErr
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        clientUserId: clientUser.id,
        providerUserId: providerUser.id,
        providerId,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error('Seed failed:', e.message)
  process.exit(1)
})
