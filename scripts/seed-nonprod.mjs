// Minimal NON-PRODUCTION seed foundation for B5B (DB/security), B5C (Maestro) and
// Discover QA. Creates two reserved auth identities plus a provider row, client
// row, one provider service, and the small amount of CONTENT the Discover social
// rows need in order to be visible at all. Idempotent. Targets NON-PROD only,
// with a hard production-ref guard.
//
// ── WHY CONTENT IS SEEDED AT ALL ──────────────────────────────────────────
//
// `From people you follow` and `See the work` are both hidden when empty, by
// design — no filler, no fallback to strangers. That is correct behaviour and it
// is exactly why they were invisible in QA: non-production had ZERO posts and the
// QA client followed nobody, so both rows suppressed themselves truthfully.
//
// This seeds the minimum that makes them appear: one follow, one recent image
// post, one video post. It is QA DATA, not product behaviour — nothing here
// changes ranking, eligibility or any rule. The media is real: the repository's
// own photographic assets, uploaded into the non-production `posts-media` bucket
// under a clearly-labelled `qa-seed` folder so nobody mistakes it for a real
// provider's work.
//
// Secrets are read from the private tooling env (NOT EXPO_PUBLIC_*, never bundled,
// never committed). Populate .env.tooling.local from .env.tooling.example and run:
//
//   set -a; . ./.env.tooling.local; set +a; node scripts/seed-nonprod.mjs
//
// Required env: TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY,
//   SEED_CLIENT_EMAIL, SEED_CLIENT_PASSWORD, SEED_PROVIDER_EMAIL, SEED_PROVIDER_PASSWORD.
import { readFileSync } from 'node:fs'
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

  // Client row (id = auth uid). Service role bypasses RLS — it does NOT bypass
  // triggers, and the difference now bites: `reputation_is_derived` (PD-094)
  // refuses a `providers` INSERT or UPDATE carrying any reputation value the
  // review data does not produce, for every role including this one. A seed that
  // sets `rating`, `average_rating`, `review_count` or `rating_client_count` is
  // rejected with `check_violation`. Leave them at their defaults; reviews are
  // what move them.
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

  // ── DISCOVER QA CONTENT ──────────────────────────────────────────────
  //
  // Everything below is idempotent and additive. It creates no rule, changes no
  // ranking, and touches no schema: three rows in `posts` and one in
  // `provider_follows`, all of which the product's own screens already write.
  const seeded = await seedDiscoverContent(admin, providerUser.id, providerId, clientUser.id)

  console.log(
    JSON.stringify(
      {
        ok: true,
        clientUserId: clientUser.id,
        providerUserId: providerUser.id,
        providerId,
        discoverQa: seeded,
      },
      null,
      2,
    ),
  )
}

const POSTS_BUCKET = 'posts-media'

// Real bytes from the repository's own assets. Uploaded rather than linked so
// non-production owns its media and the seed has no external dependency.
const MEDIA = {
  work1: { file: 'assets/images/auth/signup1.jpg', type: 'image/jpeg', ext: 'jpg' },
  work2: { file: 'assets/images/auth/signup2.jpg', type: 'image/jpeg', ext: 'jpg' },
  still: { file: 'assets/images/auth/signup3.jpg', type: 'image/jpeg', ext: 'jpg' },
  clip: { file: 'assets/videos/welcome.mp4', type: 'video/mp4', ext: 'mp4' },
}

/**
 * Upload one asset to a DETERMINISTIC path and return its public URL.
 *
 * The path is fixed rather than timestamped (which is what the app's own
 * `generatePath` does) precisely so re-running this seed overwrites the same
 * object instead of accumulating a new copy on every run.
 */
async function putMedia(admin, providerUserId, key) {
  const m = MEDIA[key]
  const path = `${providerUserId}/qa-seed/${key}.${m.ext}`
  const bytes = readFileSync(m.file)
  const { error } = await admin.storage
    .from(POSTS_BUCKET)
    .upload(path, bytes, { contentType: m.type, upsert: true })
  if (error) throw new Error(`upload ${key}: ${error.message}`)
  const { data } = admin.storage.from(POSTS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Insert a post once, keyed on its media_url so a re-run does not duplicate it. */
async function ensurePost(admin, providerId, row) {
  const { data: existing } = await admin
    .from('posts')
    .select('id')
    .eq('provider_id', providerId)
    .eq('media_url', row.media_url)
    .maybeSingle()
  if (existing) return existing.id
  const { data, error } = await admin.from('posts').insert(row).select('id').single()
  if (error) throw new Error(`post insert: ${error.message}`)
  return data.id
}

async function seedDiscoverContent(admin, providerUserId, providerId, clientUserId) {
  const [work1, work2, still, clip] = await Promise.all([
    putMedia(admin, providerUserId, 'work1'),
    putMedia(admin, providerUserId, 'work2'),
    putMedia(admin, providerUserId, 'still'),
    putMedia(admin, providerUserId, 'clip'),
  ])

  // `created_at` is left to the column default (now()), which is what puts these
  // inside the 30-day activity window. Backdating them would be seeding a lie
  // about when the work happened, and a stale seed would silently stop showing
  // the row 31 days later with no explanation.
  const posts = {
    image1: await ensurePost(admin, providerId, {
      provider_id: providerId,
      media_url: work1,
      media_type: 'image',
      content_type: 'portfolio',
      caption: 'QA seed — portfolio image',
      is_active: true,
      is_demo: false,
    }),
    image2: await ensurePost(admin, providerId, {
      provider_id: providerId,
      media_url: work2,
      media_type: 'image',
      content_type: 'portfolio',
      caption: 'QA seed — portfolio image',
      is_active: true,
      is_demo: false,
    }),
    // THE THUMBNAIL IS SET EXPLICITLY, AND THAT IS NOT INCIDENTAL. Nothing in
    // the product writes `thumbnail_url` — see the deferred defect recorded in
    // docs/product/CURRENT_STATE.md — so a video seeded without one would be
    // dropped by every surface that draws a still, and `See the work` would
    // stay invisible even with content present. Setting it here is what makes
    // the row reviewable; it does not fix the defect.
    video: await ensurePost(admin, providerId, {
      provider_id: providerId,
      media_url: clip,
      media_type: 'video',
      thumbnail_url: still,
      content_type: 'reel',
      caption: 'QA seed — reel',
      is_active: true,
      is_demo: false,
    }),
  }

  // ── THE FOLLOWS ─────────────────────────────────────────────────────
  //
  // `From people you follow` is gated on VIEWER FOLLOW STATE, not on role. A
  // provider browsing Discover is a client like anyone else, and sees the row
  // whenever THEY follow somebody with recent work.
  //
  // Both reserved accounts are therefore seeded as followers, so QA can review
  // the row from either side of the switcher. Seeding only the client made the
  // row look client-only and cost a review cycle to a false defect report.
  await ensureFollow(admin, providerId, clientUserId)

  // The provider account needs somebody ELSE to follow — a provider cannot
  // follow themselves, and the row would be meaningless if they could. Any
  // second approved provider will do; it is discovered rather than hardcoded so
  // this does not pin the seed to one non-production row.
  const second = await findSecondProvider(admin, providerId)
  let providerFollows = null
  if (second) {
    const work = await putMedia(admin, second.user_id, 'work1')
    await ensurePost(admin, second.id, {
      provider_id: second.id,
      media_url: work,
      media_type: 'image',
      content_type: 'portfolio',
      caption: 'QA seed — portfolio image',
      is_active: true,
      is_demo: false,
    })
    await ensureFollow(admin, second.id, providerUserId)
    providerFollows = { providerId: second.id, displayName: second.display_name }
  }

  return {
    posts,
    follows: {
      clientFollows: { providerId, follower: clientUserId },
      // Null when non-production has only one approved provider. Reported rather
      // than silently skipped: without it the provider account sees no row, and
      // a QA reviewer needs to know that is the data and not the code.
      providerFollows: providerFollows
        ? { ...providerFollows, follower: providerUserId }
        : null,
    },
  }
}

/** Insert a follow once. The pair is the identity, so a re-run is a no-op. */
async function ensureFollow(admin, providerId, followerUserId) {
  const { data: existing } = await admin
    .from('provider_follows')
    .select('id')
    .eq('provider_id', providerId)
    .eq('follower_user_id', followerUserId)
    .maybeSingle()
  if (existing) return existing.id
  const { data, error } = await admin
    .from('provider_follows')
    .insert({ provider_id: providerId, follower_user_id: followerUserId })
    .select('id')
    .single()
  if (error) throw new Error(`follow insert: ${error.message}`)
  return data.id
}

/** Any approved provider that is not the QA provider and still has an owner. */
async function findSecondProvider(admin, excludeProviderId) {
  const { data } = await admin
    .from('providers')
    .select('id, user_id, display_name')
    .eq('is_approved', true)
    .not('user_id', 'is', null)
    .neq('id', excludeProviderId)
    .order('display_name')
    .limit(1)
  return data && data.length > 0 ? data[0] : null
}

main().catch((e) => {
  console.error('Seed failed:', e.message)
  process.exit(1)
})
