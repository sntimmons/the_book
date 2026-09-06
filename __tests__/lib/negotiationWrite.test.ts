// lib/negotiationWrite.ts — the ordering every barter write on the negotiation screen shares,
// and the four ways individual operations are allowed to differ.
//
// These assertions are the reason the helper exists. Before consolidation the sequence was
// hand-spelled six times in app/community/negotiation/[id].tsx, where nothing could assert it
// without rendering the screen. What is pinned here is the part that must not vary: busy on
// before the write, busy off after it (even when the write throws), a user-facing message on
// every refusal, no success path on `ok: false`, and the server re-read last.

import { runBarterWrite, BarterWriteEffects } from '@/lib/negotiationWrite'

function recorder() {
  const calls: string[] = []
  const effects: BarterWriteEffects = {
    setBusy: (b) => calls.push(`busy:${b}`),
    setLoading: (l) => calls.push(`loading:${l}`),
    reportFailure: (title, body) => calls.push(`alert:${title}|${body}`),
    reload: () => calls.push('reload'),
  }
  return { calls, effects }
}

const OK = { ok: true, error: null }
/** `23514` on `acceptTerms` is the stale, NON-terminal "the terms changed" refusal. */
const STALE = { ok: false, error: { code: '23514' } }
/** `no_rows` is terminal for every operation. */
const TERMINAL = { ok: false, error: { barterClientCode: 'no_rows' } }
/** An unmapped code falls through to RETRY: neither terminal nor stale. */
const TRANSIENT = { ok: false, error: { code: '08006' } }

describe('runBarterWrite — the shared sequence', () => {
  it('sets busy, writes, clears busy, then re-reads on success', async () => {
    const { calls, effects } = recorder()
    const write = jest.fn().mockResolvedValue(OK)
    await runBarterWrite(effects, { op: 'acceptTerms', write })
    expect(write).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['busy:true', 'busy:false', 'loading:true', 'reload'])
  })

  it('calls the write exactly once — no retry, no second RPC', async () => {
    const { effects } = recorder()
    const write = jest.fn().mockResolvedValue(TERMINAL)
    await runBarterWrite(effects, { op: 'cancelTrade', write })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('reports every refusal to the user, transient ones included', async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, {
      op: 'cancelTrade',
      write: async () => TRANSIENT,
    })
    expect(calls).toContain('alert:Could not cancel|Please try again.')
  })

  it('never runs the success callback on a refusal', async () => {
    const { effects } = recorder()
    const onSuccess = jest.fn()
    await runBarterWrite(effects, { op: 'confirmTrade', write: async () => TERMINAL, onSuccess })
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('clears busy when the write throws, and lets the throw propagate', async () => {
    const { calls, effects } = recorder()
    const boom = new Error('network down')
    await expect(
      runBarterWrite(effects, {
        op: 'markDelivered',
        write: async () => {
          throw boom
        },
      }),
    ).rejects.toBe(boom)
    expect(calls).toEqual(['busy:true', 'busy:false'])
  })

  it('clears busy before the alert on a refusal', async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, { op: 'acceptTerms', write: async () => TERMINAL })
    expect(calls.indexOf('busy:false')).toBeLessThan(
      calls.findIndex((c) => c.startsWith('alert:')),
    )
  })
})

describe('runBarterWrite — the refusal-refresh gate', () => {
  it('defaults to re-reading only when the failure is terminal or stale', async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, { op: 'cancelTrade', write: async () => TRANSIENT })
    expect(calls).not.toContain('reload')
  })

  it('re-reads on a terminal refusal under the default gate', async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, { op: 'cancelTrade', write: async () => TERMINAL })
    expect(calls).toContain('reload')
  })

  it('re-reads on a stale, non-terminal refusal under the default gate', async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, { op: 'proposeTerms', write: async () => STALE })
    expect(calls).toContain('reload')
  })

  it("re-reads on ANY refusal when the gate is 'always'", async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, {
      op: 'acceptTerms',
      write: async () => TRANSIENT,
      refusalRefresh: 'always',
    })
    expect(calls).toEqual([
      'busy:true',
      'busy:false',
      'alert:Could not accept|Please try again.',
      'loading:true',
      'reload',
    ])
  })

  it('settles operation state before a refusal-triggered re-read', async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, {
      op: 'proposeTerms',
      write: async () => TERMINAL,
      onRefusalRefresh: () => calls.push('closeComposer'),
    })
    expect(calls).toEqual([
      'busy:true',
      'busy:false',
      'alert:That negotiation is no longer available|It may have ended. The details have been updated.',
      'closeComposer',
      'loading:true',
      'reload',
    ])
  })

  it('does not run the refusal callback when the gate does not fire', async () => {
    const { effects } = recorder()
    const onRefusalRefresh = jest.fn()
    await runBarterWrite(effects, {
      op: 'proposeTerms',
      write: async () => TRANSIENT,
      onRefusalRefresh,
    })
    expect(onRefusalRefresh).not.toHaveBeenCalled()
  })
})

describe('runBarterWrite — whether the re-read blocks the screen', () => {
  it('shows the loading state by default, on success and on a refusal', async () => {
    const ok = recorder()
    await runBarterWrite(ok.effects, { op: 'confirmTrade', write: async () => OK })
    expect(ok.calls).toEqual(['busy:true', 'busy:false', 'loading:true', 'reload'])

    const refused = recorder()
    await runBarterWrite(refused.effects, {
      op: 'confirmTrade',
      write: async () => TERMINAL,
      refusalRefresh: 'always',
    })
    expect(refused.calls.filter((c) => c === 'loading:true')).toHaveLength(1)
  })

  it('re-reads quietly when refreshShowsLoading is false', async () => {
    const ok = recorder()
    await runBarterWrite(ok.effects, {
      op: 'acceptTerms',
      write: async () => OK,
      refreshShowsLoading: false,
    })
    expect(ok.calls).toEqual(['busy:true', 'busy:false', 'reload'])

    const refused = recorder()
    await runBarterWrite(refused.effects, {
      op: 'proposeTerms',
      write: async () => TERMINAL,
      refreshShowsLoading: false,
      onRefusalRefresh: () => refused.calls.push('closeComposer'),
    })
    expect(refused.calls).not.toContain('loading:true')
    expect(refused.calls.slice(-2)).toEqual(['closeComposer', 'reload'])
  })
})

describe('runBarterWrite — success ordering', () => {
  it('settles operation state, then loading, then re-reads', async () => {
    const { calls, effects } = recorder()
    await runBarterWrite(effects, {
      op: 'cancelTrade',
      write: async () => OK,
      onSuccess: () => calls.push('clearReason'),
    })
    expect(calls).toEqual([
      'busy:true',
      'busy:false',
      'clearReason',
      'loading:true',
      'reload',
    ])
  })
})
