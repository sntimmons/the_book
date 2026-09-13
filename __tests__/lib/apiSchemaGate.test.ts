// THE EXPOSED-SCHEMA GATE'S PASS PREDICATE.
//
// This gate is the only control the repository holds over pg_net's PUBLIC grants
// on `net.http_post` and `net._http_response` — `supabase_admin` made them and
// `postgres` cannot revoke them (`20261132000000`). So the predicate is
// load-bearing, and its first version had a false-pass path that mattered
// precisely because of WHAT it probes: `net._http_response` stores HTTP response
// bodies, `cron.job` stores SQL and `vault.decrypted_secrets` stores secrets. It
// decided on `text.includes('PGRST106')` over the raw body, so one stored row
// containing that token would have reported PASS while the schema was wide open.
//
// Tested with captured PostgREST shapes and no project, because a gate that
// passes for the wrong reason is worse than no gate.
import {
  classify,
  exposedFrom,
  exposedObservations,
  judgeExposedList,
} from '@/scripts/check-api-schemas.mjs'

const REFUSAL = {
  code: 'PGRST106',
  details: null,
  hint: 'Only the following schemas are exposed: public, graphql_public',
  message: 'Invalid schema: net',
}

describe('classify — only a structural refusal is a pass', () => {
  it('passes on a genuine 406 PGRST106', () => {
    expect(classify(406, REFUSAL)).toMatchObject({ state: 'refused' })
  })

  it('FAILS on a 200 whose row data merely contains the token', () => {
    // The exact false pass. If `net` were exposed, this is what the probe gets:
    // a 200 and rows — and one of those rows is a stored HTTP response body that
    // happens to contain "PGRST106", because this database makes HTTP calls and
    // keeps the replies.
    const rows = [{ id: 1, content: '{"code":"PGRST106","message":"Invalid schema: net"}' }]
    expect(classify(200, rows)).toMatchObject({ state: 'reachable' })
  })

  it('FAILS on a 200 even with no rows — reachable is reachable', () => {
    expect(classify(200, [])).toMatchObject({ state: 'reachable' })
  })

  it('never puts row content in the detail it prints', () => {
    const secret = 'sb-secret-do-not-log-me'
    const r = classify(200, [{ decrypted_secret: secret }])
    expect(r.detail).not.toContain(secret)
    expect(r.detail).toMatch(/1 row\(s\) returned/)
  })

  it('is INCONCLUSIVE, not a pass, on a bad key or a gateway error', () => {
    expect(classify(401, { message: 'Invalid API key' })).toMatchObject({ state: 'inconclusive' })
    expect(classify(502, null)).toMatchObject({ state: 'inconclusive' })
    // PGRST202 means the schema WAS searched and the object was not found — which
    // is not a refusal and must never read as one.
    expect(classify(404, { code: 'PGRST202', message: 'not found' })).toMatchObject({
      state: 'inconclusive',
    })
  })

  it('does not accept PGRST106 with the wrong status', () => {
    expect(classify(200, REFUSAL)).toMatchObject({ state: 'reachable' })
    expect(classify(500, REFUSAL)).toMatchObject({ state: 'inconclusive' })
  })
})

describe('exposedFrom — the list comes out of the hint', () => {
  it('parses the schemas PostgREST names', () => {
    expect(exposedFrom(REFUSAL.hint)).toEqual(['public', 'graphql_public'])
  })

  it('returns null when the message does not carry a list', () => {
    // This is why the gate failed on its own first run: the list is in `hint`,
    // and `message` is only "Invalid schema: net".
    expect(exposedFrom(REFUSAL.message)).toBeNull()
    expect(exposedFrom(undefined)).toBeNull()
  })
})

describe('judgeExposedList — a refusal alone proves nothing', () => {
  it('accepts exactly the two schemas that should be exposed', () => {
    expect(judgeExposedList([['public', 'graphql_public']])).toBeNull()
  })

  it('rejects a forbidden schema in the list even though every probe was refused', () => {
    // The typo case: probe `nett`, get refused, report PASS — while `net` is open.
    // Checking the real list is what makes the gate typo-proof.
    expect(judgeExposedList([['public', 'graphql_public', 'net']])).toMatch(/forbidden schema/)
  })

  it('rejects an unexpected extra schema', () => {
    expect(judgeExposedList([['public', 'graphql_public', 'storage']])).toMatch(/expected/)
  })

  it('refuses to pass when no list was obtained at all', () => {
    expect(judgeExposedList([null, null])).toMatch(/prove nothing/)
  })
})

describe('judgeExposedList — the probes must AGREE, and a disagreement fails closed', () => {
  // The three probes (`net`, `cron`, `vault`) read ONE project setting. The
  // judgement used to take whichever list came back first and ignore the rest, so a
  // disagreement was resolved silently in favour of the earliest answer. On a
  // release gate that is the same defect class as the substring match this file
  // already closed: a pass for the wrong reason.
  const ALLOWED = ['public', 'graphql_public']

  it('(1) PASSES when all three probes agree on the allowed list', () => {
    expect(judgeExposedList([ALLOWED, ALLOWED, ALLOWED])).toBeNull()
  })

  it('(1b) agreement is by SET, not by order — a different order is not a disagreement', () => {
    expect(judgeExposedList([ALLOWED, ['graphql_public', 'public'], ALLOWED])).toBeNull()
  })

  it('(2) FAILS when all three probes agree on a DISALLOWED list', () => {
    // Unanimity is not correctness. Three probes agreeing that `net` is exposed is
    // the gate's worst-case finding, not its happy path.
    expect(judgeExposedList([['public', 'net'], ['public', 'net'], ['public', 'net']])).toMatch(
      /forbidden schema/,
    )
    // And an extra non-forbidden schema is still not the expected list.
    const extra = ['public', 'graphql_public', 'storage']
    expect(judgeExposedList([extra, extra, extra])).toMatch(/expected/)
  })

  it('(3) FAILS when the probes DISAGREE, naming every list it saw', () => {
    const problem = judgeExposedList([ALLOWED, ['public', 'graphql_public', 'storage'], ALLOWED])
    expect(problem).toMatch(/DISAGREE/)
    // The diagnostic must show the differing lists, not just announce a conflict —
    // otherwise nobody can tell which probe to go and look at.
    expect(problem).toContain('[public, graphql_public]')
    expect(problem).toContain('[public, graphql_public, storage]')
  })

  it('(3b) does NOT silently choose the first list — the OLD behaviour would have passed this', () => {
    // First list is clean, a later one is not. Pre-fix this returned null.
    expect(judgeExposedList([ALLOWED, ['public', 'graphql_public', 'net']])).not.toBeNull()
  })

  it('(3c) a disagreement never MASKS a leak — the forbidden schema is reported', () => {
    // Both things are wrong here. The leak is the more urgent fact and must be the
    // one named, rather than being hidden behind "the probes disagree".
    expect(judgeExposedList([ALLOWED, ['public', 'net']])).toMatch(/forbidden schema/)
  })

  it('(4) FAILS on malformed or unusable probe responses', () => {
    expect(judgeExposedList([null, undefined])).toMatch(/prove nothing/)
    expect(judgeExposedList([])).toMatch(/prove nothing/)
    expect(judgeExposedList(undefined)).toMatch(/prove nothing/)
    // `[]` is TRUTHY, so a `filter(Boolean)` would have kept it and then reported
    // "the exposed list is exactly []" as a finding derived from nothing.
    expect(judgeExposedList([[]])).toMatch(/prove nothing/)
    // A non-array where a list was expected is not an observation either.
    expect(judgeExposedList(['public, graphql_public'])).toMatch(/prove nothing/)
  })

  it('ignores unusable entries when a real observation exists beside them', () => {
    expect(judgeExposedList([null, ALLOWED, []])).toBeNull()
  })
})

describe('exposedObservations — what the PASS line is allowed to read', () => {
  // The CLI printed `lists.filter(Boolean)[0]`, which could pick an empty array and
  // print "exactly []" on a run that had genuinely observed the allowed list. Both
  // the judgement and the print now go through this one filter.
  it('keeps only non-empty arrays', () => {
    expect(exposedObservations([null, [], ['public'], 'nope', undefined])).toEqual([['public']])
  })

  it('returns an empty array for nothing usable, rather than throwing', () => {
    expect(exposedObservations(undefined)).toEqual([])
    expect(exposedObservations([null, []])).toEqual([])
  })
})
