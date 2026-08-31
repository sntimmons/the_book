// Controllable mock of the Supabase client. resolveUserRole issues two parallel
// lookups: clients by id, providers by user_id — each ends in .maybeSingle().
jest.mock('@/lib/supabase', () => {
  const clients = jest.fn()
  const providers = jest.fn()
  return {
    supabase: {
      from: jest.fn((table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: table === 'clients' ? clients : providers,
          }),
        }),
      })),
      __clients: clients,
      __providers: providers,
    },
  }
})

import { supabase } from '@/lib/supabase'
import { resolveUserRole } from '@/lib/resolveUserRole'

const clientsFn = () => (supabase as any).__clients as jest.Mock
const providersFn = () => (supabase as any).__providers as jest.Mock

// Locks provider-precedence and — critically — the error-vs-null distinction
// that prevents a phantom clients row being minted on a transient failure.
describe('resolveUserRole', () => {
  it('makes no network call (mock only)', async () => {
    clientsFn().mockResolvedValue({ data: null, error: null })
    providersFn().mockResolvedValue({ data: null, error: null })
    await resolveUserRole('u1')
    // `from` is our mock; nothing real was contacted.
    expect((supabase as any).from).toHaveBeenCalled()
  })

  it('provider wins when both a provider and client row exist', async () => {
    clientsFn().mockResolvedValue({ data: { id: 'u1' }, error: null })
    providersFn().mockResolvedValue({ data: { id: 'prov-9' }, error: null })
    const r = await resolveUserRole('u1')
    expect(r).toEqual({ role: 'provider', isProvider: true, providerId: 'prov-9' })
  })

  it('resolves provider-only to provider', async () => {
    clientsFn().mockResolvedValue({ data: null, error: null })
    providersFn().mockResolvedValue({ data: { id: 'prov-9' }, error: null })
    const r = await resolveUserRole('u1')
    expect(r.role).toBe('provider')
    expect(r.providerId).toBe('prov-9')
  })

  it('resolves client-only to client', async () => {
    clientsFn().mockResolvedValue({ data: { id: 'u1' }, error: null })
    providersFn().mockResolvedValue({ data: null, error: null })
    const r = await resolveUserRole('u1')
    expect(r).toEqual({ role: 'client', isProvider: false, providerId: null })
  })

  it('returns null role when neither row exists AND no query errored', async () => {
    clientsFn().mockResolvedValue({ data: null, error: null })
    providersFn().mockResolvedValue({ data: null, error: null })
    const r = await resolveUserRole('u1')
    expect(r.role).toBeNull()
  })

  it("returns the 'error' sentinel when there is no match but a query errored", async () => {
    clientsFn().mockResolvedValue({ data: null, error: { message: 'network' } })
    providersFn().mockResolvedValue({ data: null, error: null })
    const r = await resolveUserRole('u1')
    expect(r.role).toBe('error')
    expect(r.providerId).toBeNull()
  })

  it('a positive match still wins even if the other query errored', async () => {
    clientsFn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    providersFn().mockResolvedValue({ data: { id: 'prov-9' }, error: null })
    const r = await resolveUserRole('u1')
    expect(r.role).toBe('provider')
  })
})
