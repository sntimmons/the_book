import { readFileSync } from 'fs'
import { join } from 'path'

// A DEFAULT IS NOT A PROVIDER'S TERM.
//
// `app/book/policy.tsx` showed a client `DEFAULT_POLICY`'s cancellation window
// and grace beside that provider's real fee terms, in the same list and the same
// type, and the client then ticked a box agreeing to it. The cause was a read of
// an OWNER-ONLY table that returns zero rows and no error to a client.
//
// Source-level because the defect was invisible at runtime by construction: the
// screen rendered perfectly, and every value on it looked like data.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function stripComments(src: string): string {
  let inBlock = false
  return src.split('\n').map((line) => {
    let out = ''
    let i = 0
    while (i < line.length) {
      if (inBlock) {
        const close = line.indexOf('*/', i)
        if (close === -1) return out
        inBlock = false
        i = close + 2
        continue
      }
      const block = line.indexOf('/*', i)
      const lineComment = line.indexOf('//', i)
      if (lineComment !== -1 && (block === -1 || lineComment < block)) return out + line.slice(i, lineComment)
      if (block !== -1) { out += line.slice(i, block); inBlock = true; i = block + 2; continue }
      return out + line.slice(i)
    }
    return out
  }).join('\n')
}

const CLIENT_SURFACES = ['app/book/policy.tsx', 'app/providers/[id].tsx', 'components/ProviderProfile.tsx'] as const

describe('no client surface reads the owner-only preferences table', () => {
  it.each(CLIENT_SURFACES)('%s does not touch provider_booking_preferences', (rel) => {
    // Owner-only by design: the same row carries vacation_mode,
    // max_bookings_per_day, buffer_minutes, minimum_notice_hours and timezone.
    expect(stripComments(read(rel))).not.toContain('provider_booking_preferences')
  })

  it('the provider-side editors still do, because they own the row', () => {
    // The fix must not have quietly broken the people the table belongs to.
    expect(read('components/PolicyEditor.tsx')).toContain('provider_booking_preferences')
    expect(read('app/onboarding/provider/golive.tsx')).toContain('provider_booking_preferences')
  })
})

describe('the client policy screen cannot fall back to a default', () => {
  const src = stripComments(read('app/book/policy.tsx'))

  it('no longer imports DEFAULT_POLICY at all', () => {
    // The strongest available signal: the fallback is not merely unused, it is
    // not in scope.
    expect(src).not.toContain('DEFAULT_POLICY')
  })

  it('reads the narrow RPC instead', () => {
    expect(src).toContain('fetchPublicBookingTerms')
  })

  it('names the unpublished state rather than filling it in', () => {
    expect(src).toContain('UNPUBLISHED_TERMS_COPY')
  })

  it('hands rowsToPolicy a null prefs row, so its defaults cannot reach the screen', () => {
    expect(src).toMatch(/rowsToPolicy\([^)]*,\s*null\)/)
  })
})

describe('the public terms module admits only two fields, and no money', () => {
  const src = stripComments(read('lib/publicBookingTerms.ts'))

  it('exposes the window and the grace and nothing else', () => {
    expect(src).toContain('cancellationWindowHours')
    expect(src).toContain('latenessGraceMinutes')
    for (const priv of [
      'vacation_mode', 'max_bookings_per_day', 'buffer_minutes',
      'minimum_notice_hours', 'requires_manual_approval', 'timezone',
      'appointment_time_required', 'same_day_booking',
    ]) {
      expect(src).not.toContain(priv)
    }
  })

  it('carries no fee, deposit or payment vocabulary', () => {
    expect(src).not.toMatch(/\bfee\b|deposit|refund|payout|charge/i)
  })

  it('never imports the policy defaults', () => {
    expect(src).not.toContain('DEFAULT_POLICY')
  })
})

describe('the migration is the narrow shape a definer must have', () => {
  const sql = read('supabase/migrations/20261137000000_a_default_is_not_a_providers_term.sql')

  it('is SECURITY DEFINER with a fixed search_path and no side effects', () => {
    expect(sql).toMatch(/security definer/)
    expect(sql).toMatch(/set search_path = ''/)
    expect(sql).toMatch(/\bstable\b/)
  })

  it('returns only the two approved columns', () => {
    expect(sql).toMatch(/returns table \(cancellation_window_hours integer, lateness_grace_minutes integer\)/)
  })

  it('is revoked from anon and granted to authenticated', () => {
    expect(sql).toMatch(/revoke all on function public\.provider_public_booking_terms\(uuid\) from public, anon/)
    expect(sql).toMatch(/grant execute on function public\.provider_public_booking_terms\(uuid\) to authenticated/)
  })

  it('reuses the one erasure gate rather than writing a second one', () => {
    expect(sql).toContain('provider_content_hidden')
  })

  it('does not widen the table it reads', () => {
    expect(sql).not.toMatch(/create policy|alter table .*provider_booking_preferences|grant select/i)
  })

  it('is covered by a registered DB security suite', () => {
    expect(read('scripts/db-security-test.mjs')).toContain('supabase/tests/policy_terms.test.sql')
  })
})
