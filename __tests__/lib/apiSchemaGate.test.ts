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
