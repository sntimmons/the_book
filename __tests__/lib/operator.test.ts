import {
  CASE_TYPE_LABEL,
  NO_SLA_NOTE,
  OUTCOME_HELP,
  OUTCOME_LABEL,
  amIOperator,
  listCases,
  updateCase,
} from '@/lib/operator'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }))

// Session 8B's client half. The assertions worth having here are not about the
// calls — the database refuses everything that matters — but about the two
// places a UI can still do harm: deciding what to DRAW when it does not know,
// and describing an irreversible decision in words an operator will act on.

beforeEach(() => jest.clearAllMocks())

describe('knowing whether you are an operator', () => {
  it('answers true only on an explicit true', async () => {
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: true, error: null })
    await expect(amIOperator()).resolves.toBe(true)
  })

  it('answers null — not false — when it cannot tell', async () => {
    // Null draws NOTHING. False would send an operator away from a screen they
    // are entitled to; true would flash case subjects at someone who may not be
    // an operator at all. Neither guess is acceptable, so there is a third state.
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { code: '08006' } })
    await expect(amIOperator()).resolves.toBeNull()
  })

  it('does not treat a non-true value as permission', async () => {
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: 'yes', error: null })
    await expect(amIOperator()).resolves.toBe(false)
  })
})

describe('the queue', () => {
  it('distinguishes an empty queue from a failed read', async () => {
    // A failed read rendering as "nothing waiting" would tell an operator there
    // is no work while people are waiting — the worst lie this screen can tell.
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null })
    await expect(listCases()).resolves.toEqual([])
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { code: '08006' } })
    await expect(listCases()).resolves.toBeNull()
  })

  it('passes filters through as nulls when unset', async () => {
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null })
    await listCases()
    expect(supabase.rpc).toHaveBeenCalledWith('operator_list_cases', {
      p_status: null,
      p_case_type: null,
    })
  })
})

describe('taking an action', () => {
  it('records the actor and reports a refusal as a refusal', async () => {
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: 'under_review', error: null })
    const ok = await updateCase('c1', 'claimed', 'me', ' looking ')
    expect(ok).toEqual({ ok: true, status: 'under_review', error: null })
    expect(supabase.rpc).toHaveBeenCalledWith('operator_update_case', {
      p_case_id: 'c1',
      p_action: 'claimed',
      p_actor_user_id: 'me',
      p_note: 'looking',
    })
    ;(supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { code: '42501' } })
    const no = await updateCase('c1', 'resolved', 'me')
    expect(no.ok).toBe(false)
  })
})

describe('the words an operator decides by', () => {
  it('spells out that the third outcome is not a softer "unfulfilled"', () => {
    // PD-065. Under time pressure a one-word label gets reached for as
    // "unfulfilled but kinder", which is exactly what it is not — it records
    // that the evidence supported NEITHER finding, assigns no fault and carries
    // no reputation effect.
    const help = OUTCOME_HELP.closed_without_resolution.toLowerCase()
    expect(help).toContain('neither')
    expect(help).toContain('not a finding of fault')
    expect(help).toContain('no reputation effect')
  })

  it('gives every outcome a plain-language meaning', () => {
    for (const k of ['fulfilled', 'unfulfilled', 'closed_without_resolution']) {
      expect(OUTCOME_LABEL[k]).toBeTruthy()
      expect(OUTCOME_HELP[k].length).toBeGreaterThan(20)
    }
  })

  it('names no timeframe anywhere, including to the operator', () => {
    // PD-068: there is no SLA. Copy that implied one to the OPERATOR would be a
    // deadline nobody agreed to, invented by a label.
    const all = [
      ...Object.values(CASE_TYPE_LABEL),
      ...Object.values(OUTCOME_LABEL),
      ...Object.values(OUTCOME_HELP),
      NO_SLA_NOTE,
    ].join(' ').toLowerCase()
    for (const p of ['within', ' hours', ' days', 'deadline', 'overdue', 'sla', 'urgent']) {
      expect([p, all.includes(p)]).toEqual([p, false])
    }
  })

  it('tells the operator that nobody is being notified', () => {
    // The one thing an operator will otherwise assume. Claiming a case sends
    // nothing to the person waiting, because there is no channel to send it on.
    expect(NO_SLA_NOTE.toLowerCase()).toContain('nothing here tells')
  })
})
