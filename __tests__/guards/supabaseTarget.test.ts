import {
  projectRefFromUrl,
  assertNotProductionSupabase,
  PRODUCTION_SUPABASE_REF,
} from '@/lib/supabaseTarget'

// Locks the production-target guard used by seed/DB-test/E2E tooling: it must
// reject the production ref and accept non-prod refs.
describe('projectRefFromUrl', () => {
  it('extracts the ref from a project URL', () => {
    expect(projectRefFromUrl('https://wcoyjeklscuqsumpjpfo.supabase.co')).toBe(
      'wcoyjeklscuqsumpjpfo',
    )
  })

  it('accepts a bare 20-char ref', () => {
    expect(projectRefFromUrl('wcoyjeklscuqsumpjpfo')).toBe('wcoyjeklscuqsumpjpfo')
  })

  it('returns null for empty / unrecognized input', () => {
    expect(projectRefFromUrl('')).toBeNull()
    expect(projectRefFromUrl(null)).toBeNull()
    expect(projectRefFromUrl('not a url')).toBeNull()
  })
})

describe('assertNotProductionSupabase', () => {
  it('throws for the production ref (URL form)', () => {
    expect(() =>
      assertNotProductionSupabase(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`),
    ).toThrow(/PRODUCTION/i)
  })

  it('throws for the production ref (bare form)', () => {
    expect(() => assertNotProductionSupabase(PRODUCTION_SUPABASE_REF)).toThrow(/PRODUCTION/i)
  })

  it('does not throw for a non-production ref', () => {
    expect(() =>
      assertNotProductionSupabase('https://wcoyjeklscuqsumpjpfo.supabase.co'),
    ).not.toThrow()
  })
})
