import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ── THE APP MAY ONLY ASK FOR PROVIDER COLUMNS THE DATABASE GRANTS ─────────
//
// `20261030000000_providers_public_column_surface.sql` moved the provider read
// boundary out of a code comment and into the privilege system: `anon` and
// `authenticated` now hold SELECT on 28 of the 49 `providers` columns, and the
// other 21 — `verification_notes`, every `stripe_*`, `no_show_count`,
// `late_count`, the deposit/payment config, the verification flags — are readable
// by `service_role` alone.
//
// THAT FIX INTRODUCED A NEW FAILURE MODE, and this guard exists for it. Before,
// asking for an extra column was a silent over-share that nobody noticed. Now it
// is a hard `42501` on one screen. That is the right direction, but the failure is
// LOCAL AND LATE: it appears only when a human opens that particular screen
// against a real database. `tsc` stays clean, Jest mocks the Supabase client so no
// unit test can see a grant, and B5B asserts the GRANT rather than the app's usage
// of it — so a new `from('providers').select('…payment_mode…')` would pass every
// check in CI and break in beta.
//
// Only 3 of ~40 `from('providers')` call sites use `PUBLIC_PROVIDER_FIELDS`; the
// rest write their column list inline, which is exactly how `completed_count` and
// `is_mobile` came to be needed by the grant without appearing in that constant.
// So the guard reads the source rather than trusting one shared list.
//
// WHEN A COLUMN IS LEGITIMATELY NEEDED, the fix is a forward migration granting
// it and an edit to `GRANTED` below — in that order. Editing only this file makes
// the test agree with a screen that will still 42501.

const ROOT = join(__dirname, '..', '..')
const ROOTS = ['app', 'components', 'lib', 'hooks', 'context', 'store']

// The 28 columns granted to `anon` and `authenticated`. Kept in sync with
// `20261030000000` § 2 by hand and by the failure this guard produces — B5B
// asserts the same list against the live catalog from the other side, so the two
// cannot drift for long without something going red.
const GRANTED = new Set([
  'id', 'user_id', 'display_name', 'business_name', 'username', 'category_id',
  'custom_category', 'bio', 'location', 'neighborhood', 'profile_photo_url',
  'cover_image_url', 'rating', 'average_rating', 'review_count', 'total_bookings',
  'completed_count', 'repeat_client_rate', 'follower_count', 'next_available',
  'is_trending', 'is_featured', 'is_approved', 'is_demo', 'is_mobile',
  'years_experience', 'specialties', 'created_at',
])

// Columns the app writes but never reads. Security Batch 3a grants INSERT/UPDATE
// on these; a write privilege is not a read privilege, so they are legal in an
// `.insert()`/`.update()`/`.upsert()` payload and illegal in a select list.
const WRITE_ONLY = new Set([
  'updated_at', 'verification_status', 'identity_verified', 'profile_style',
  'payment_mode', 'deposit_type', 'deposit_value', 'issue_window_hours',
])

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, full))
    }
  }
  for (const r of ROOTS) walk(join(ROOT, r))
  return out.sort()
}

/** Source with comments removed, so a column named in prose is not a hit. */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

interface Ref {
  file: string
  column: string
  how: string
}

// Collect every provider column the app READS: select lists, embedded
// `providers(...)` joins, and filter/order arguments — PostgreSQL requires SELECT
// privilege on a column used in WHERE or ORDER BY, not only in the output list,
// which is why `is_approved` has to be granted despite never being displayed.
function providerColumnReads(): Ref[] {
  const refs: Ref[] = []
  for (const rel of sourceFiles()) {
    const src = code(rel)

    // `.from('providers')` … up to the end of the chain.
    const chain = /from\(\s*'providers'\s*\)([\s\S]{0,900}?)(?=\n\s*\n|from\(\s*'|$)/g
    let m: RegExpExecArray | null
    while ((m = chain.exec(src)) !== null) {
      const body = m[1]
      // Only the READ side. An insert/update/upsert payload may legally name a
      // write-only column, and its `.select()` (if any) is matched separately.
      const isWrite = /\.(insert|update|upsert)\(/.test(body)

      for (const sel of body.matchAll(/\.select\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g)) {
        const lit = sel[1] ?? sel[2] ?? sel[3]
        if (!lit || lit.includes('*')) continue
        for (const raw of lit.split(',')) {
          const col = raw.trim().split(/[\s:(]/)[0]
          if (col) refs.push({ file: rel, column: col, how: 'select' })
        }
      }
      if (isWrite) continue
      for (const f of body.matchAll(
        /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|order|contains)\(\s*'([a-z_]+)'/g,
      )) {
        refs.push({ file: rel, column: f[1], how: 'filter/order' })
      }
      for (const o of body.matchAll(/\.or\(\s*(?:'([^']*)'|`([^`]*)`)/g)) {
        const lit = o[1] ?? o[2] ?? ''
        for (const term of lit.split(',')) {
          const col = term.trim().split('.')[0]
          if (/^[a-z_]+$/.test(col)) refs.push({ file: rel, column: col, how: 'or-filter' })
        }
      }
    }

    // Embedded joins: `provider:providers(id, display_name)` / `providers(...)`.
    //
    // A term carrying its own `(` is a NESTED RELATION, not a column — the feed
    // embeds `providers(id, display_name, categories(name))`, where `categories`
    // is a joined table whose privileges are its own. An earlier version of this
    // guard reported `providers.categories` as an ungranted column, which is the
    // right instinct applied to the wrong token.
    for (const e of src.matchAll(/providers\s*!?\w*\s*\(([^)]*)\)/g)) {
      for (const raw of e[1].split(',')) {
        const term = raw.trim()
        if (term.includes('(')) continue
        const col = term.split(/[\s:]/)[0]
        if (/^[a-z_]+$/.test(col)) refs.push({ file: rel, column: col, how: 'embed' })
      }
    }
  }
  return refs
}

describe('every provider column the app reads is one the database grants', () => {
  const refs = providerColumnReads()

  it('finds the provider reads to check (a guard over nothing passes vacuously)', () => {
    expect(refs.length).toBeGreaterThan(40)
    expect(refs.some((r) => r.file === join('hooks', 'useProviders.ts'))).toBe(true)
    expect(refs.some((r) => r.how === 'filter/order')).toBe(true)
    expect(refs.some((r) => r.how === 'embed')).toBe(true)
  })

  it('reads no column outside the granted set', () => {
    const offenders = refs
      .filter((r) => !GRANTED.has(r.column))
      .map(
        (r) =>
          `${r.file} reads providers.${r.column} (${r.how}) — not granted to anon/authenticated` +
          (WRITE_ONLY.has(r.column)
            ? '; it is WRITE-only under Security Batch 3a, so it may appear in an insert/update payload but never in a read'
            : ''),
      )
    expect(offenders).toEqual([])
  })

  // The client's shared constant must stay inside the grant too. It is only used
  // by three call sites, so the sweep above would not necessarily cover a column
  // added to it and not yet used.
  it('PUBLIC_PROVIDER_FIELDS is a subset of the granted columns', () => {
    const src = code(join('hooks', 'useProviders.ts'))
    const block = src.match(/const PUBLIC_PROVIDER_FIELDS = \[([\s\S]*?)\]/)
    expect(block).not.toBeNull()
    const cols = [...(block as RegExpMatchArray)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(cols.length).toBeGreaterThan(20)
    expect(cols.filter((c) => !GRANTED.has(c))).toEqual([])
  })

  // The point of the migration, asserted from this side as well: naming one of
  // the withheld columns in a read is the mistake this guard exists to catch.
  it('never reads a withheld column', () => {
    const withheld = [
      'verification_notes', 'stripe_account_id', 'stripe_onboarding_complete',
      'stripe_charges_enabled', 'stripe_payouts_enabled', 'stripe_details_submitted',
      'stripe_account_updated_at', 'no_show_count', 'late_count', 'business_verified',
      'verification_submitted_at', 'bookings_this_week', 'bookings_this_month',
    ]
    const offenders = refs.filter((r) => withheld.includes(r.column))
    expect(offenders).toEqual([])
  })
})

// ── THE WRITE SHAPE THAT BROKE PROVIDER GO-LIVE MUST NOT COME BACK ────────
//
// `.upsert(row, { onConflict: 'user_id' })` makes PostgREST emit
// `ON CONFLICT (user_id) DO UPDATE SET <every payload column>`, INCLUDING
// `user_id = excluded.user_id`. Security Batch 3a granted `user_id` INSERT but
// deliberately NOT UPDATE, because reassigning it hands the whole provider row to
// another user. PostgreSQL therefore refuses the statement with
// `42501 permission denied for table providers` WHETHER OR NOT A CONFLICT OCCURS
// — so provider go-live failed for every real provider from 2026-08-30 until
// Pre-Beta Correction 2 found it.
//
// It was invisible for so long because nothing could see it: `tsc` is happy, Jest
// mocks the client, and Security Batch 3a's own compatibility test exercised a
// hand-written `DO UPDATE SET display_name` rather than the statement the client
// actually sends. The column guard above cannot catch it either — it deliberately
// skips write payloads, since a write may legally name a write-only column.
//
// So the SHAPE is asserted directly. The supported pattern is INSERT, then on
// `23505` for `providers_user_id_key` an UPDATE that omits `user_id`.
describe('providers is never written through an upsert with a conflict target', () => {
  it('no source file upserts providers onConflict', () => {
    const offenders: string[] = []
    for (const rel of sourceFiles()) {
      const src = code(rel)
      for (const m of src.matchAll(/from\(\s*'providers'\s*\)([\s\S]{0,600}?)(?=\n\s*\n|from\(\s*'|$)/g)) {
        if (/\.upsert\(/.test(m[1]) && /onConflict/.test(m[1])) {
          offenders.push(
            `${rel} upserts providers with an onConflict target — PostgREST will emit ` +
              'DO UPDATE SET user_id, which is not UPDATE-granted and fails with 42501',
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('go-live only takes its conflict path for the user_id constraint', () => {
    // The fallback must not fire on a `providers_username_key` collision: that is
    // a first-time provider, and an UPDATE keyed on their user_id would match zero
    // rows, return no error, and let the flow report success with no provider row.
    const src = code(join('app', 'onboarding', 'provider', 'golive.tsx'))
    expect(src).toMatch(/providers_user_id_key/)
    expect(src).toMatch(/if \(!providerDbId\)/)
  })
})
