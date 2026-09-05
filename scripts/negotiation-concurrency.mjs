// NON-B5B CONCURRENCY PROOF for the barter negotiation slice (NON-PRODUCTION ONLY).
//
// WHY THIS EXISTS. `scripts/db-security-test.mjs` runs every suite inside ONE transaction that
// is always rolled back. That is the right design for RLS and trigger assertions, and it makes
// concurrency structurally unprovable there: a single session cannot race itself. Describing a
// sequential B5B case as a concurrency proof would be a false claim about what was tested, so
// the races get their own harness.
//
// WHAT IT PROVES. Each scenario opens TWO genuinely parallel database sessions (two separate
// `supabase db query` invocations, each its own backend) and has them collide inside the same
// RPC. A `pg_sleep` before the call widens the window so the overlap is real rather than
// hopeful.
//
//   1. Two counters at once. Both must succeed with DISTINCT, consecutive version numbers.
//      Without the `for update` lock on the proposal both sessions read the same
//      current_version_no, compute the same next number, and one dies on the unique index --
//      turning a legitimate counter into an error the user cannot act on.
//
//   2. Two initial proposals at once on the same accepted response. Exactly ONE must exist
//      afterwards. This is the duplicate-creation race; the unique constraint on interest_id
//      is what decides it.
//
//   3. Acceptance racing a counter. The acceptance must either land on the version it named
//      while that version was still current, or be refused with 40001 -- never be recorded as
//      agreement to terms that had already been replaced.
//
// Everything it writes is deleted at the end and the counts are re-asserted at zero.
//
// Usage:  node scripts/negotiation-concurrency.mjs
import { execFile, execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

import { PRODUCTION_SUPABASE_REF } from './prodRef.mjs'

const execFileAsync = promisify(execFile)

// The linked project must not be production. Same guard the B5B harness applies.
const linkedRef = execFileSync('cat', ['supabase/.temp/project-ref'], { encoding: 'utf8' }).trim()
if (linkedRef === PRODUCTION_SUPABASE_REF) {
  console.error('REFUSING: the linked project is production.')
  process.exit(1)
}

let fileSeq = 0
async function runSql(sql) {
  const file = `/tmp/negconc-${process.pid}-${fileSeq++}.sql`
  writeFileSync(file, sql)
  try {
    const { stdout } = await execFileAsync('supabase', ['db', 'query', '--linked', '--file', file], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
    return { ok: true, out: stdout }
  } catch (err) {
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  } finally {
    unlinkSync(file)
  }
}

// Run as a real authenticated user: the JWT claim gives the definer RPCs a true auth.uid()
// without assuming the `authenticated` database role, which these tables' RLS would otherwise
// apply to the fixture reads.
const asUser = (uid, body) => `
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '${uid}', 'role', 'authenticated')::text, true);
  ${body}
end $$;`

const TERMS = (a, b) => `jsonb_build_array(
  jsonb_build_object('provided_by','owner','service_description','${a}'),
  jsonb_build_object('provided_by','responder','service_description','${b}'))`

const results = []
const chk = (name, expected, actual) => {
  const ok = String(expected) === String(actual)
  results.push({ ok, name })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: expected=${expected} actual=${actual}`)
}

function scalar(out, key) {
  const m = out.match(new RegExp(`"${key}":\\s*"?([^",\\n}]+)"?`))
  return m ? m[1].trim() : null
}

const tag = randomUUID().slice(0, 8)
const ids = {
  ou: randomUUID(),
  ru: randomUUID(),
  offer: randomUUID(),
  interest: randomUUID(),
  offer2: randomUUID(),
  interest2: randomUUID(),
  offer3: randomUUID(),
  interest3: randomUUID(),
}

async function seed() {
  const r = await runSql(`
do $$
declare opid uuid; rpid uuid;
begin
  -- Seeding runs as service_role so the barter write-integrity and rate-limit triggers
  -- early-return, exactly as pg_temp.act_service() does in the B5B fixtures. The RACES below
  -- run as real authenticated users; only the setup is privileged.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into auth.users(id) values ('${ids.ou}'), ('${ids.ru}');
  insert into public.providers(user_id, display_name, username)
    values ('${ids.ou}', 'Conc Owner ${tag}', 'cco_${tag}') returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values ('${ids.ru}', 'Conc Resp ${tag}', 'ccr_${tag}') returning id into rpid;

  insert into public.barter_offers(id, provider_id, user_id, offering_service, seeking_service)
    values ('${ids.offer}', opid, '${ids.ou}', 'conc offering ${tag}', 'conc seeking');
  insert into public.barter_interests(id, offer_id, interested_provider_id, interested_user_id,
    message, status) values ('${ids.interest}', '${ids.offer}', rpid, '${ids.ru}', 'x', 'accepted');

  insert into public.barter_offers(id, provider_id, user_id, offering_service, seeking_service)
    values ('${ids.offer2}', opid, '${ids.ou}', 'conc offering2 ${tag}', 'conc seeking');
  insert into public.barter_interests(id, offer_id, interested_provider_id, interested_user_id,
    message, status) values ('${ids.interest2}', '${ids.offer2}', rpid, '${ids.ru}', 'x', 'accepted');

  insert into public.barter_offers(id, provider_id, user_id, offering_service, seeking_service)
    values ('${ids.offer3}', opid, '${ids.ou}', 'conc offering3 ${tag}', 'conc seeking');
  insert into public.barter_interests(id, offer_id, interested_provider_id, interested_user_id,
    message, status) values ('${ids.interest3}', '${ids.offer3}', rpid, '${ids.ru}', 'x', 'accepted');
end $$;`)
  if (!r.ok) {
    console.error('seed failed:', r.out)
    process.exit(1)
  }
}

// ── 1. Two counters at once ─────────────────────────────────────────────────
async function raceCounters() {
  await runSql(asUser(ids.ou, `perform public.create_barter_proposal('${ids.interest}', ${TERMS('v1 own', 'v1 theirs')});`))

  const body = (uid, label) => asUser(uid, `
  perform pg_sleep(2);
  perform public.submit_barter_counter(
    (select id from public.barter_proposals where interest_id = '${ids.interest}'),
    ${TERMS(`${label} own`, `${label} theirs`)});`)

  const [a, b] = await Promise.all([
    runSql(body(ids.ou, 'ownerCounter')),
    runSql(body(ids.ru, 'responderCounter')),
  ])

  chk('two simultaneous counters both succeed', 'true', String(a.ok && b.ok))
  if (!a.ok) console.log('   session A:', a.out.slice(0, 300))
  if (!b.ok) console.log('   session B:', b.out.slice(0, 300))

  const q = await runSql(`
select count(*) as n, count(distinct version_no) as distinct_no, max(version_no) as max_no
  from public.barter_proposal_versions
 where proposal_id = (select id from public.barter_proposals where interest_id = '${ids.interest}');`)
  chk('three versions exist (the opener plus two counters)', '3', scalar(q.out, 'n'))
  // The invariant the lock exists for: no two versions share a number, and the sequence has no
  // gap. Without it one session dies on the unique index instead.
  chk('every version number is distinct', '3', scalar(q.out, 'distinct_no'))
  chk('and they are consecutive with no gap', '3', scalar(q.out, 'max_no'))

  const p = await runSql(`
select current_version_no as n from public.barter_proposals where interest_id = '${ids.interest}';`)
  chk('the pointer ends on the newest version', '3', scalar(p.out, 'n'))
}

// ── 2. Two initial proposals at once ────────────────────────────────────────
async function raceCreation() {
  const body = (uid) => asUser(uid, `
  perform pg_sleep(2);
  perform public.create_barter_proposal('${ids.interest2}', ${TERMS('dup own', 'dup theirs')});`)

  const [a, b] = await Promise.all([runSql(body(ids.ou)), runSql(body(ids.ru))])

  chk('exactly one of two simultaneous opens succeeds', 'true', String(a.ok !== b.ok))
  const q = await runSql(`
select count(*) as n from public.barter_proposals where interest_id = '${ids.interest2}';`)
  chk('and exactly one negotiation exists', '1', scalar(q.out, 'n'))
  const v = await runSql(`
select count(*) as n from public.barter_proposal_versions
 where proposal_id = (select id from public.barter_proposals where interest_id = '${ids.interest2}');`)
  chk('with exactly one opening version', '1', scalar(v.out, 'n'))
}

// ── 3. Acceptance racing a counter ──────────────────────────────────────────
async function raceAcceptVsCounter() {
  await runSql(asUser(ids.ou, `perform public.create_barter_proposal('${ids.interest3}', ${TERMS('r3 own', 'r3 theirs')});`))

  const accept = asUser(ids.ru, `
  perform pg_sleep(2);
  perform public.accept_barter_version(
    (select id from public.barter_proposal_versions
      where proposal_id = (select id from public.barter_proposals where interest_id = '${ids.interest3}')
      order by version_no limit 1));`)
  const counter = asUser(ids.ou, `
  perform pg_sleep(2);
  perform public.submit_barter_counter(
    (select id from public.barter_proposals where interest_id = '${ids.interest3}'),
    ${TERMS('r3 own v2', 'r3 theirs v2')});`)

  const [acc, cnt] = await Promise.all([runSql(accept), runSql(counter)])

  // Either ordering is legitimate. What must NEVER happen is an acceptance counted as
  // agreement to terms that were already replaced.
  chk('the counter always lands', 'true', String(cnt.ok))
  const staleRefusal = !acc.ok && /40001|replaced by a newer version/.test(acc.out)
  chk('the acceptance either lands or is refused as stale',
    'true', String(acc.ok || staleRefusal))

  // Acceptances of a superseded version are HISTORY and may legitimately exist. What must not
  // happen is one being counted as agreement to the terms now on the table, so the assertion
  // is on the DERIVED answer rather than on the presence of a row.
  const agreed = await runSql(`
select coalesce((select count(*) from public.barter_version_acceptances a
  join public.barter_proposal_versions v on v.id = a.version_id
  join public.barter_proposals p on p.id = v.proposal_id
 where p.interest_id = '${ids.interest3}' and v.version_no = p.current_version_no), 0) as n;`)
  chk('no acceptance is counted against the terms now on the table', '0', scalar(agreed.out, 'n'))
}

async function cleanup() {
  const r = await runSql(`
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  delete from public.barter_version_acceptances a using public.barter_proposal_versions v,
    public.barter_proposals p
   where a.version_id = v.id and v.proposal_id = p.id
     and p.interest_id in ('${ids.interest}','${ids.interest2}','${ids.interest3}');
  delete from public.barter_proposal_terms t using public.barter_proposal_versions v,
    public.barter_proposals p
   where t.version_id = v.id and v.proposal_id = p.id
     and p.interest_id in ('${ids.interest}','${ids.interest2}','${ids.interest3}');
  delete from public.barter_proposal_versions v using public.barter_proposals p
   where v.proposal_id = p.id
     and p.interest_id in ('${ids.interest}','${ids.interest2}','${ids.interest3}');
  delete from public.barter_proposals
   where interest_id in ('${ids.interest}','${ids.interest2}','${ids.interest3}');
  delete from public.barter_interests
   where id in ('${ids.interest}','${ids.interest2}','${ids.interest3}');
  delete from public.barter_offers where id in ('${ids.offer}','${ids.offer2}','${ids.offer3}');
  delete from public.providers where user_id in ('${ids.ou}','${ids.ru}');
  delete from auth.users where id in ('${ids.ou}','${ids.ru}');
end $$;`)
  if (!r.ok) console.error('cleanup failed:', r.out)

  const q = await runSql(`
select (select count(*) from public.barter_proposals) as proposals,
       (select count(*) from public.barter_proposal_versions) as versions,
       (select count(*) from public.barter_proposal_terms) as terms,
       (select count(*) from public.barter_version_acceptances) as acceptances,
       (select count(*) from public.barter_offers) as offers,
       (select count(*) from public.barter_interests) as interests;`)
  for (const k of ['proposals', 'versions', 'terms', 'acceptances', 'offers', 'interests']) {
    chk(`zero residue: ${k}`, '0', scalar(q.out, k))
  }
}

await seed()
await raceCounters()
await raceCreation()
await raceAcceptVsCounter()
await cleanup()

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
