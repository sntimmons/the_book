// fetchProviderContract chains .from().select().eq().eq().maybeSingle().
// `mockContractResult` (mock-prefixed so the jest.mock factory may close over it)
// is the value maybeSingle resolves to; each test sets it.
let mockContractResult: { data: unknown; error: unknown }

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(mockContractResult),
          }),
        }),
      }),
    }),
  },
}))

import { fetchProviderContract } from '@/lib/contracts'

// Locks the Batch 4A contract fail-open fix: a genuine no-row returns null, but a
// technical failure must THROW — it can never masquerade as "no contract".
describe('fetchProviderContract', () => {
  it('returns null for a genuine no-row (data null, error null)', async () => {
    mockContractResult = { data: null, error: null }
    await expect(fetchProviderContract('prov-1')).resolves.toBeNull()
  })

  it('throws on a real Supabase/query error (does not collapse to null)', async () => {
    mockContractResult = { data: null, error: { message: 'network down' } }
    await expect(fetchProviderContract('prov-1')).rejects.toBeTruthy()
  })

  it('returns null immediately for an empty providerId (no lookup)', async () => {
    mockContractResult = { data: { id: 'should-not-be-used' }, error: null }
    await expect(fetchProviderContract('')).resolves.toBeNull()
  })

  it('maps a returned row to a Contract', async () => {
    mockContractResult = {
      data: {
        id: 'c1',
        provider_id: 'prov-1',
        user_id: 'u1',
        title: 'Terms',
        body: 'Body',
        contract_type: 'text',
        pdf_url: null,
        pdf_filename: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: null,
      },
      error: null,
    }
    const c = await fetchProviderContract('prov-1')
    expect(c).toMatchObject({ id: 'c1', providerId: 'prov-1', contractType: 'text' })
  })
})
