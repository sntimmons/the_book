// Controllable mock of supabase.functions.invoke for the rate-limit edge fn.
jest.mock('@/lib/supabase', () => {
  const invoke = jest.fn()
  return { supabase: { functions: { invoke } }, __invoke: invoke }
})

import { checkRateLimit } from '@/lib/rateLimit'
import * as supa from '@/lib/supabase'

const invoke = () => (supa as any).__invoke as jest.Mock

// Locks the fail-open contract: only an explicit 429 (or explicit allowed:false)
// blocks; every other failure mode allows so a limiter outage never blocks users.
describe('checkRateLimit', () => {
  it('blocks on a 429 from the edge function', async () => {
    invoke().mockResolvedValue({ data: null, error: { context: { status: 429 } } })
    const r = await checkRateLimit('u1', 'booking_create')
    expect(r.allowed).toBe(false)
    expect(r.message).toBeTruthy()
  })

  it('blocks when the body explicitly says allowed:false', async () => {
    invoke().mockResolvedValue({ data: { allowed: false }, error: null })
    const r = await checkRateLimit('u1', 'booking_create')
    expect(r.allowed).toBe(false)
  })

  it('allows (fail-open) on a non-429 error such as a 500', async () => {
    invoke().mockResolvedValue({ data: null, error: { context: { status: 500 } } })
    const r = await checkRateLimit('u1', 'booking_create')
    expect(r.allowed).toBe(true)
  })

  it('allows (fail-open) when invoke throws (network failure)', async () => {
    invoke().mockRejectedValue(new Error('network'))
    const r = await checkRateLimit('u1', 'booking_create')
    expect(r.allowed).toBe(true)
  })

  it('allows when the function returns a normal allowed result', async () => {
    invoke().mockResolvedValue({ data: { allowed: true }, error: null })
    const r = await checkRateLimit('u1', 'message_send')
    expect(r.allowed).toBe(true)
  })
})
