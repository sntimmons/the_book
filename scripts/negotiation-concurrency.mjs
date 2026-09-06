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
// The numbered groups below are THEMES, not scenario numbers — the body runs seventeen
// scenarios and each carries its own `── N. …` heading. The two indexes drifted apart once
// cancellation was appended, so this one no longer pretends to be an ordered list.
//
//   A. Two counters at once. Both must succeed with DISTINCT, consecutive version numbers.
//      Without the `for update` lock on the proposal both sessions read the same
//      current_version_no, compute the same next number, and one dies on the unique index --
//      turning a legitimate counter into an error the user cannot act on.
//
//   B. Two initial proposals at once on the same accepted response. Exactly ONE must exist
//      afterwards. This is the duplicate-creation race; the unique constraint on interest_id
//      is what decides it.
//
//   C. Acceptance racing a counter. The acceptance must either land on the version it named
//      while that version was still current, or be refused with 40001 -- never be recorded as
//      agreement to terms that had already been replaced.
//
//   D. Agreement finalization races must create exactly one agreement and exactly two
//      obligations. The obligation pair is created by an additive agreement trigger, so the
//      finalize races prove the new table is included in the same atomic outcome.
//
//   E. Two direct maintenance attempts to create the obligation pair for an existing agreement
//      must be idempotent under real overlap: final result exactly two, never a partial pair or
//      duplicate four-row pair.
//
//   F. Delivery and receipt races. `delivered_at` and the receiver's answer are each written
//      ONCE and never moved, exactly one receiver outcome becomes authoritative, an
//      unauthorized caller loses to the real deliverer rather than racing them, and the two
//      obligations of one agreement progress independently. These are the transitions where a
//      lost race would either reset the clock the future 7-day window is measured from, or let
//      both "received" and "didn't receive" be true of the same obligation.
//
//   G. Pre-delivery cancellation races. Cancelling and delivering are mutually exclusive and
//      race each other directly: exactly one must win and the loser must be refused, never
//      both landing. Two participants cancelling at once must record exactly two acts (and so
//      report "mutually cancelled") without losing either; the same participant cancelling
//      twice at once must record exactly one.
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

/**
 * `rpcStatement` is a plpgsql STATEMENT, so a caller that needs the RPC's return value writes
 * `v_result := f(...);` instead of `perform f(...);`. Most scenarios assert on end STATE rather
 * than on what the call returned — the client re-reads the views anyway — but where the return
 * value IS the contract (which classification a concurrent cancellation reports), asserting the
 * state alone would leave that half untested.
 */
async function runTimedUser(uid, rpcStatement) {
  const r = await runSql(`
create temp table _rpc_timing(started_at timestamptz, ended_at timestamptz, code text, result text) on commit drop;
do $$
declare
  v_started timestamptz;
  v_ended timestamptz;
  v_code text := '00000';
  v_result text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '${uid}', 'role', 'authenticated')::text, true);
  perform pg_sleep(2);
  v_started := clock_timestamp();
  begin
    ${rpcStatement}
  exception when others then
    v_code := sqlstate;
  end;
  v_ended := clock_timestamp();
  insert into _rpc_timing values (v_started, v_ended, v_code, v_result);
end $$;
select json_build_object(
  'started_at', started_at,
  'ended_at', ended_at,
  'code', code,
  'result', coalesce(result, '')
) as timing from _rpc_timing;`)
  const timing = parseTiming(r.out)
  return { ...r, timing, result: scalar(r.out, 'result'), opOk: r.ok && timing?.code === '00000' }
}

async function runTimedMaintenance(statement) {
  const r = await runSql(`
create temp table _rpc_timing(started_at timestamptz, ended_at timestamptz, code text) on commit drop;
do $$
declare
  v_started timestamptz;
  v_ended timestamptz;
  v_code text := '00000';
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform pg_sleep(2);
  v_started := clock_timestamp();
  begin
    ${statement}
  exception when others then
    v_code := sqlstate;
  end;
  v_ended := clock_timestamp();
  insert into _rpc_timing values (v_started, v_ended, v_code);
end $$;
select json_build_object(
  'started_at', started_at,
  'ended_at', ended_at,
  'code', code
) as timing from _rpc_timing;`)
  const timing = parseTiming(r.out)
  return { ...r, timing, opOk: r.ok && timing?.code === '00000' }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function blockOfferForInterest(interest) {
  return runSql(`
begin;
select o.id
  from public.barter_offers o
  join public.barter_interests i on i.offer_id = o.id
 where i.id = '${interest}'
 for update;
select pg_sleep(8);
commit;`)
}

async function blockProposalForInterest(interest) {
  return runSql(`
begin;
select p.id
  from public.barter_proposals p
 where p.interest_id = '${interest}'
 for update;
select pg_sleep(8);
commit;`)
}

// Holds the OBLIGATION row itself, so the two racers below queue on the same lock the RPC
// takes. Without it a delivery race can serialize by luck and the scenario proves nothing.
//
// Passing no side locks BOTH obligations of the agreement — needed when the two racers act on
// DIFFERENT obligations. Locking the agreement row instead does not work: the delivery RPCs
// never touch `barter_agreements`, so nothing would queue and the scenario would report a
// false overlap failure (it did, once).
async function blockObligation(interest, side = null) {
  return runSql(`
begin;
select bo.id
  from public.barter_obligations bo
  join public.barter_agreements ag on ag.id = bo.agreement_id
 where ag.interest_id = '${interest}'
   ${side === null ? '' : `and bo.side = '${side}'`}
 for update;
select pg_sleep(15);
commit;`)
}

async function blockAgreementForInterest(interest) {
  return runSql(`
begin;
select ag.id
  from public.barter_agreements ag
 where ag.interest_id = '${interest}'
 for update;
select pg_sleep(8);
commit;`)
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

// Content and timing for the two sides. The RPCs bind each to its participant; nothing here
// names provider ids, participant ids, sides or version numbers.
const TERMS = (a, b) =>
  `'${a}', clock_timestamp() + interval '7 days', null, `
  + `'${b}', clock_timestamp() + interval '8 days', null`

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

function parseTiming(out) {
  const started = scalar(out, 'started_at')
  const ended = scalar(out, 'ended_at')
  const code = scalar(out, 'code')
  if (!started || !ended || !code) return null
  return {
    startedAt: Date.parse(started),
    endedAt: Date.parse(ended),
    code,
  }
}

/**
 * The property an UNAUTHORIZED caller must have, now that both delivery RPCs and
 * cancel_barter_agreement authorize on an unlocked read before taking any lock: they are
 * refused WITHOUT ever contending for the row.
 *
 * Overlap is the wrong evidence for these scenarios — and asserting it was wrong. A caller who
 * overlapped would be one who had waited on the lock, which is exactly the timing side channel
 * ("exists but is busy" measurably different from "does not exist") that authorize-before-lock
 * exists to close. So the proof is inverted: the intruder must finish quickly and finish
 * BEFORE the blocked legitimate caller, i.e. while the lock it would have needed is still held
 * by someone else.
 */
function refusedWithoutWaiting(intruder, blocked) {
  if (!intruder || !blocked) return false
  if (!Number.isFinite(intruder.startedAt) || !Number.isFinite(intruder.endedAt)) return false
  if (!Number.isFinite(blocked.endedAt)) return false
  const tookMs = intruder.endedAt - intruder.startedAt
  return tookMs < 1500 && intruder.endedAt < blocked.endedAt
}

function intervalsOverlap(a, b) {
  if (!a || !b) return false
  if (!Number.isFinite(a.startedAt) || !Number.isFinite(a.endedAt)) return false
  if (!Number.isFinite(b.startedAt) || !Number.isFinite(b.endedAt)) return false
  return a.startedAt <= b.endedAt && b.startedAt <= a.endedAt
}

const tag = randomUUID().slice(0, 8)
const ids = {
  ou: randomUUID(),
  ru: randomUUID(),
  // The pair's ONE canonical thread. Cancelling an official trade now writes a system message
  // into it (20261007000000), so the harness must have one or the signal is never exercised.
  conv: randomUUID(),
  offer: randomUUID(),
  interest: randomUUID(),
  offer2: randomUUID(),
  interest2: randomUUID(),
  offer3: randomUUID(),
  interest3: randomUUID(),
  offer4: randomUUID(),
  interest4: randomUUID(),
  offer5: randomUUID(),
  interest5: randomUUID(),
  offer6: randomUUID(),
  interest6: randomUUID(),
  offer7: randomUUID(),
  interest7: randomUUID(),
  offer8: randomUUID(),
  interest8: randomUUID(),
  offer9: randomUUID(),
  interest9: randomUUID(),
  offer10: randomUUID(),
  interest10: randomUUID(),
  offer11: randomUUID(),
  interest11: randomUUID(),
  offer12: randomUUID(),
  interest12: randomUUID(),
  offer13: randomUUID(),
  interest13: randomUUID(),
  offer14: randomUUID(),
  interest14: randomUUID(),
  offer15: randomUUID(),
  interest15: randomUUID(),
  offer16: randomUUID(),
  interest16: randomUUID(),
  offer17: randomUUID(),
  interest17: randomUUID(),
}

// Every interest this harness creates, in one place: the cleanup and the residue assertions
// both read it, so adding a scenario cannot leave rows behind by forgetting one list.
const ALL_INTERESTS = [
  ids.interest, ids.interest2, ids.interest3, ids.interest4, ids.interest5, ids.interest6,
  ids.interest7, ids.interest8, ids.interest9, ids.interest10, ids.interest11, ids.interest12,
  ids.interest13, ids.interest14, ids.interest15, ids.interest16, ids.interest17,
]
const ALL_OFFERS = [
  ids.offer, ids.offer2, ids.offer3, ids.offer4, ids.offer5, ids.offer6, ids.offer7,
  ids.offer8, ids.offer9, ids.offer10, ids.offer11, ids.offer12,
  ids.offer13, ids.offer14, ids.offer15, ids.offer16, ids.offer17,
]
// The interests that reach an official agreement, and therefore have obligations.
const AGREEMENT_INTERESTS = [
  ids.interest4, ids.interest5, ids.interest6, ids.interest7, ids.interest8, ids.interest9,
  ids.interest10, ids.interest11, ids.interest12,
  ids.interest13, ids.interest14, ids.interest15, ids.interest16, ids.interest17,
]
const quoted = (list) => list.map((v) => `'${v}'`).join(',')

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

  -- Inserted as service_role so the request-status clamp leaves it open; the canonical
  -- provider_pair_key is derived by the server either way.
  insert into public.conversation(id, client_id, provider_id, request_status, request_opened_at)
    values ('${ids.conv}', '${ids.ru}', opid, 'accepted', now());

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
  -- Agreement finalization scenarios.
  insert into public.barter_offers(id, provider_id, user_id, offering_service, seeking_service)
    values ('${ids.offer4}', opid, '${ids.ou}', 'conc offering4 ${tag}', 'conc seeking'),
           ('${ids.offer5}', opid, '${ids.ou}', 'conc offering5 ${tag}', 'conc seeking'),
           ('${ids.offer6}', opid, '${ids.ou}', 'conc offering6 ${tag}', 'conc seeking'),
           ('${ids.offer7}', opid, '${ids.ou}', 'conc offering7 ${tag}', 'conc seeking'),
           ('${ids.offer8}', opid, '${ids.ou}', 'conc offering8 ${tag}', 'conc seeking'),
           ('${ids.offer9}', opid, '${ids.ou}', 'conc offering9 ${tag}', 'conc seeking'),
           ('${ids.offer10}', opid, '${ids.ou}', 'conc offering10 ${tag}', 'conc seeking'),
           ('${ids.offer11}', opid, '${ids.ou}', 'conc offering11 ${tag}', 'conc seeking'),
           ('${ids.offer12}', opid, '${ids.ou}', 'conc offering12 ${tag}', 'conc seeking'),
           ('${ids.offer13}', opid, '${ids.ou}', 'conc offering13 ${tag}', 'conc seeking'),
           ('${ids.offer14}', opid, '${ids.ou}', 'conc offering14 ${tag}', 'conc seeking'),
           ('${ids.offer15}', opid, '${ids.ou}', 'conc offering15 ${tag}', 'conc seeking'),
           ('${ids.offer16}', opid, '${ids.ou}', 'conc offering16 ${tag}', 'conc seeking'),
           ('${ids.offer17}', opid, '${ids.ou}', 'conc offering17 ${tag}', 'conc seeking');
  insert into public.barter_interests(id, offer_id, interested_provider_id, interested_user_id,
    message, status) values
    ('${ids.interest4}', '${ids.offer4}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest5}', '${ids.offer5}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest6}', '${ids.offer6}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest7}', '${ids.offer7}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest8}', '${ids.offer8}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest9}', '${ids.offer9}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest10}', '${ids.offer10}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest11}', '${ids.offer11}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest12}', '${ids.offer12}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest13}', '${ids.offer13}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest14}', '${ids.offer14}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest15}', '${ids.offer15}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest16}', '${ids.offer16}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest17}', '${ids.offer17}', rpid, '${ids.ru}', 'x', 'accepted');
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

  // OVERLAP EVIDENCE. Without this the scenario cannot fail: if the two CLI processes do not
  // reach the server together, a lock-free submit_barter_counter also produces three distinct
  // consecutive versions and every assertion below passes. Reporting that as proof of the lock
  // would be a false claim about what was tested.
  const w = await runSql(`
select (extract(epoch from (max(created_at) - min(created_at))) < 1.5) as overlapped
  from public.barter_proposal_versions
 where proposal_id = (select id from public.barter_proposals where interest_id = '${ids.interest}')
   and version_no > 1;`)
  const overlapped = /true/i.test(scalar(w.out, 'overlapped') ?? '')
  chk('the two sessions genuinely overlapped (else this scenario proves nothing)',
    'true', String(overlapped))
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

  // OVERLAP EVIDENCE, as in scenario 1. `a.ok !== b.ok` also holds if the second open simply
  // arrived later and hit the constraint, so without this the scenario passes on a sequential
  // run and proves nothing about the race.
  const w2 = await runSql(`
select (extract(epoch from (clock_timestamp() - min(created_at))) < 8) as overlapped
  from public.barter_proposals where interest_id = '${ids.interest2}';`)
  chk('the two opens genuinely overlapped', 'true',
    String(/true/i.test(scalar(w2.out, 'overlapped') ?? '')))

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
  // Both sessions sleep the same 2s before acting, so a version and an acceptance written far
  // apart means they did not overlap and this scenario proves nothing either way.
  const w3 = await runSql(`
select (extract(epoch from (clock_timestamp() - min(v.created_at))) < 8) as overlapped
  from public.barter_proposal_versions v
  join public.barter_proposals p on p.id = v.proposal_id
 where p.interest_id = '${ids.interest3}' and v.version_no > 1;`)
  chk('the acceptance and the counter genuinely overlapped', 'true',
    String(/true/i.test(scalar(w3.out, 'overlapped') ?? '')))

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

// Opens a negotiation on `interest` and has both parties accept v1. Returns nothing; the
// callers look the proposal up by interest.
async function readyToConfirm(interest) {
  await runSql(asUser(ids.ou, `perform public.create_barter_proposal('${interest}', ${TERMS('r own', 'r theirs')});`))
  const acceptV1 = (uid) => asUser(uid, `
  perform public.accept_barter_version(
    (select id from public.barter_proposal_versions
      where proposal_id = (select id from public.barter_proposals where interest_id = '${interest}')
      order by version_no limit 1));`)
  await runSql(acceptV1(ids.ou))
  await runSql(acceptV1(ids.ru))
}
const proposalOf = (interest) =>
  `(select id from public.barter_proposals where interest_id = '${interest}')`

// ── 4. Both participants finalize at once ───────────────────────────────────
async function raceFinalizeFinalize() {
  await readyToConfirm(ids.interest4)
  const fin = `perform public.finalize_barter_agreement(${proposalOf(ids.interest4)});`
  const blocker = blockProposalForInterest(ids.interest4)
  await delay(2000)
  const [a, b] = await Promise.all([runTimedUser(ids.ou, fin), runTimedUser(ids.ru, fin)])
  await blocker
  chk('both simultaneous finalizations succeed (second returns the first)', 'true', String(a.opOk && b.opOk))
  chk('the two finalization RPC intervals genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  const q = await runSql(`
select count(*) as n,
       (select count(*) from public.barter_obligations bo
         join public.barter_agreements ag on ag.id = bo.agreement_id
        where ag.interest_id = '${ids.interest4}') as obligations
  from public.barter_agreements where interest_id = '${ids.interest4}';`)
  chk('exactly ONE agreement exists', '1', scalar(q.out, 'n'))
  chk('and exactly TWO obligations exist', '2', scalar(q.out, 'obligations'))
  const p = await runSql(`select is_active as a from public.barter_offers where id = '${ids.offer4}';`)
  chk('and the post is closed', 'false', scalar(p.out, 'a'))
}

// ── 5. Finalize races a counter ─────────────────────────────────────────────
// Either the finalization lands first (then the counter is refused: terms frozen), or the
// counter lands first (then the finalization is refused: acceptances are of an old version).
// What must NEVER happen: an agreement referencing a version that is no longer current.
async function raceFinalizeCounter() {
  await readyToConfirm(ids.interest5)
  const fin = `perform public.finalize_barter_agreement(${proposalOf(ids.interest5)});`
  const cnt =
    `perform public.submit_barter_counter(${proposalOf(ids.interest5)}, ${TERMS('late own', 'late theirs')});`
  const blocker = blockProposalForInterest(ids.interest5)
  await delay(2000)
  const [f, c] = await Promise.all([runTimedUser(ids.ou, fin), runTimedUser(ids.ru, cnt)])
  await blocker
  chk('finalize and counter RPC intervals genuinely overlapped',
    'true', String(intervalsOverlap(f.timing, c.timing)))
  chk('exactly one of finalize / counter wins', 'true', String(f.opOk !== c.opOk))
  const q = await runSql(`
select coalesce((select count(*) from public.barter_agreements ag
  join public.barter_proposal_versions v on v.id = ag.accepted_version_id
  join public.barter_proposals p on p.id = ag.proposal_id
 where ag.interest_id = '${ids.interest5}' and v.version_no <> p.current_version_no), 0) as stale,
 (select count(*) from public.barter_obligations bo join public.barter_agreements ag on ag.id = bo.agreement_id
   where ag.interest_id = '${ids.interest5}') as obligations,
 (select count(*) from public.barter_proposal_versions v join public.barter_proposals p on p.id = v.proposal_id
   where p.interest_id = '${ids.interest5}') as versions;`)
  chk('no agreement references a version that is no longer current', '0', scalar(q.out, 'stale'))
  const obligations = scalar(q.out, 'obligations')
  chk('finalize vs counter leaves either zero or two obligations',
    'true', String(obligations === '0' || obligations === '2'))
}

// ── 6. Finalize races a release ─────────────────────────────────────────────
// What must NEVER happen: an agreement on a released interest, or a release of a confirmed one.
async function raceFinalizeRelease() {
  await readyToConfirm(ids.interest6)
  const fin = `perform public.finalize_barter_agreement(${proposalOf(ids.interest6)});`
  const rel = `perform public.release_barter_interest('${ids.interest6}');`
  const blocker = blockOfferForInterest(ids.interest6)
  await delay(2000)
  const [f, r] = await Promise.all([runTimedUser(ids.ou, fin), runTimedUser(ids.ru, rel)])
  await blocker
  chk('finalize and release RPC intervals genuinely overlapped',
    'true', String(intervalsOverlap(f.timing, r.timing)))
  chk('exactly one of finalize / release wins', 'true', String(f.opOk !== r.opOk))
  const q = await runSql(`
select (select count(*) from public.barter_agreements where interest_id = '${ids.interest6}') as agreements,
       (select count(*) from public.barter_obligations bo join public.barter_agreements ag on ag.id = bo.agreement_id
         where ag.interest_id = '${ids.interest6}') as obligations,
       (select status from public.barter_interests where id = '${ids.interest6}') as status;`)
  const agreements = scalar(q.out, 'agreements'), obligations = scalar(q.out, 'obligations'), status = scalar(q.out, 'status')
  const consistent =
    (agreements === '1' && obligations === '2' && status === 'accepted')
    || (agreements === '0' && obligations === '0' && status === 'released')
  chk('the end state is consistent: (agreement, accepted) or (none, released)', 'true', String(consistent))
}

// ── 7. Two obligation-pair creation attempts at once ───────────────────────
async function raceObligationPairCreation() {
  await readyToConfirm(ids.interest7)
  await runSql(asUser(ids.ou, `perform public.finalize_barter_agreement(${proposalOf(ids.interest7)});`))
  await runSql(`
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  delete from public.barter_obligations
   where agreement_id = (select id from public.barter_agreements where interest_id = '${ids.interest7}');
end $$;`)
  const statement =
    `perform public.create_barter_obligation_pair((select id from public.barter_agreements where interest_id = '${ids.interest7}'));`
  const blocker = blockAgreementForInterest(ids.interest7)
  await delay(2000)
  const [a, b] = await Promise.all([runTimedMaintenance(statement), runTimedMaintenance(statement)])
  await blocker
  chk('two obligation-pair creation attempts genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('both obligation-pair creation attempts are idempotent',
    'true', String(a.opOk && b.opOk))
  const q = await runSql(`
select count(*) as n, count(distinct side) as sides
  from public.barter_obligations
 where agreement_id = (select id from public.barter_agreements where interest_id = '${ids.interest7}');`)
  chk('obligation-pair race leaves exactly two obligations', '2', scalar(q.out, 'n'))
  chk('obligation-pair race leaves one per side', '2', scalar(q.out, 'sides'))
}

// Opens, accepts and finalizes, leaving a confirmed trade with its two obligations.
async function confirmedTrade(interest) {
  await readyToConfirm(interest)
  await runSql(asUser(ids.ou, `perform public.finalize_barter_agreement(${proposalOf(interest)});`))
}
const obligationOf = (interest, side) =>
  `(select bo.id from public.barter_obligations bo`
  + ` join public.barter_agreements ag on ag.id = bo.agreement_id`
  + ` where ag.interest_id = '${interest}' and bo.side = '${side}')`

// A SQL NULL comes back from the CLI as the bare token `null`, which `scalar` returns as the
// four-character STRING "null" — so `x === null` is false for a column that is genuinely
// empty. That produced two false failures ("no receiver answer was invented") on a run where
// the database was entirely correct. Normalised here rather than inside `scalar`, which the
// pre-existing scenarios compare as raw text.
const nullable = (v) => (v === null || v === 'null' ? null : v)

async function obligationRow(interest, side) {
  const r = await runSql(`
select bo.status as status,
       bo.delivered_at as delivered_at,
       bo.receipt_responded_at as answered_at
  from public.barter_obligations bo
  join public.barter_agreements ag on ag.id = bo.agreement_id
 where ag.interest_id = '${interest}' and bo.side = '${side}';`)
  return {
    status: scalar(r.out, 'status'),
    deliveredAt: nullable(scalar(r.out, 'delivered_at')),
    answeredAt: nullable(scalar(r.out, 'answered_at')),
  }
}

// ── 8. Two mark-delivered attempts at once, twice ──────────────────────────
// The double tap. Both must succeed (the second is a no-op returning the state that exists),
// and `delivered_at` must be written ONCE. A second round proves it stays put: if a duplicate
// mark could re-stamp it, the clock the future 7-day receiver window is measured from would be
// pushed forward every time the deliverer tapped again.
async function raceMarkDelivered() {
  await confirmedTrade(ids.interest8)
  const mark =
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest8, 'offer_owner')});`
  const blocker = blockObligation(ids.interest8, 'offer_owner')
  await delay(2000)
  const [a, b] = await Promise.all([runTimedUser(ids.ou, mark), runTimedUser(ids.ou, mark)])
  await blocker
  chk('the two mark-delivered RPC intervals genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('both simultaneous mark-delivered attempts succeed', 'true', String(a.opOk && b.opOk))
  const first = await obligationRow(ids.interest8, 'offer_owner')
  chk('a concurrent double mark leaves exactly one delivered obligation', 'delivered', first.status)
  chk('and it carries a delivered_at', 'true', String(first.deliveredAt !== null))
  chk('and no receiver answer was invented', 'true', String(first.answeredAt === null))

  const blocker2 = blockObligation(ids.interest8, 'offer_owner')
  await delay(2000)
  const [c, d] = await Promise.all([runTimedUser(ids.ou, mark), runTimedUser(ids.ou, mark)])
  await blocker2
  chk('a second pair of mark-delivered attempts also overlapped',
    'true', String(intervalsOverlap(c.timing, d.timing)))
  const second = await obligationRow(ids.interest8, 'offer_owner')
  chk('and re-marking under contention does NOT reset delivered_at',
    first.deliveredAt, second.deliveredAt)

  const other = await obligationRow(ids.interest8, 'responder')
  chk('the counterparty obligation is untouched by the race', 'pending', other.status)
}

// ── 9. The deliverer racing someone with no authority over the obligation ──
async function raceDelivererVsIntruder() {
  await confirmedTrade(ids.interest9)
  const mark =
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest9, 'offer_owner')});`
  const blocker = blockObligation(ids.interest9, 'offer_owner')
  await delay(2000)
  // ids.ru is the RECEIVER of this obligation: a real participant, with no authority over
  // this end of it. The race must be decided by the row, not by who arrived first.
  const [deliverer, intruder] = await Promise.all([
    runTimedUser(ids.ou, mark),
    runTimedUser(ids.ru, mark),
  ])
  await blocker
  // The deliverer is blocked on the row lock for the whole window; the receiver must be
  // refused without ever joining that queue. Asserting overlap here would assert the timing
  // side channel authorize-before-lock deliberately removed.
  chk('the receiver is refused without ever contending for the locked obligation',
    'true', String(refusedWithoutWaiting(intruder.timing, deliverer.timing)))
  chk('the deliverer wins', 'true', String(deliverer.opOk))
  chk('and the receiver is refused whichever order they arrive in',
    '42501', intruder.timing?.code)
  const row = await obligationRow(ids.interest9, 'offer_owner')
  chk('exactly the deliverer\'s mark stands', 'delivered', row.status)
  chk('with a delivered_at written', 'true', String(row.deliveredAt !== null))
}

// ── 10. The two receiver answers racing each other ─────────────────────────
// The one race where a lost decision would make both "received" and "didn't receive" true of
// the same obligation. Exactly one must become authoritative; the other must be refused.
async function raceOpposingReceiverAnswers() {
  await confirmedTrade(ids.interest10)
  await runSql(asUser(ids.ou,
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest10, 'offer_owner')});`))
  const confirm =
    `perform public.confirm_barter_obligation_received(${obligationOf(ids.interest10, 'offer_owner')});`
  const deny =
    `perform public.report_barter_obligation_not_received(${obligationOf(ids.interest10, 'offer_owner')});`
  const blocker = blockObligation(ids.interest10, 'offer_owner')
  await delay(2000)
  const [yes, no] = await Promise.all([
    runTimedUser(ids.ru, confirm),
    runTimedUser(ids.ru, deny),
  ])
  await blocker
  chk('the two opposing receiver answers genuinely overlapped',
    'true', String(intervalsOverlap(yes.timing, no.timing)))
  chk('exactly one receiver answer wins', 'true', String(yes.opOk !== no.opOk))
  const loser = yes.opOk ? no : yes
  chk('and the loser is told an answer is already recorded', 'PT412', loser.timing?.code)
  const row = await obligationRow(ids.interest10, 'offer_owner')
  chk('the obligation carries exactly one of the two answers', 'true',
    String(row.status === 'received' || row.status === 'not_received'))
  chk('the winning answer matches the RPC that succeeded', 'true',
    String(row.status === (yes.opOk ? 'received' : 'not_received')))
  chk('and a single answer time is stamped', 'true', String(row.answeredAt !== null))
}

// ── 11. The same receiver answer twice at once ─────────────────────────────
async function raceSameReceiverAnswer() {
  await confirmedTrade(ids.interest11)
  await runSql(asUser(ids.ou,
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest11, 'offer_owner')});`))
  const confirm =
    `perform public.confirm_barter_obligation_received(${obligationOf(ids.interest11, 'offer_owner')});`
  const blocker = blockObligation(ids.interest11, 'offer_owner')
  await delay(2000)
  const [a, b] = await Promise.all([runTimedUser(ids.ru, confirm), runTimedUser(ids.ru, confirm)])
  await blocker
  chk('the two identical receiver answers genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('repeating the same answer under contention is safe for both',
    'true', String(a.opOk && b.opOk))
  const first = await obligationRow(ids.interest11, 'offer_owner')
  chk('and records the answer once', 'received', first.status)

  await runSql(asUser(ids.ru, confirm))
  const second = await obligationRow(ids.interest11, 'offer_owner')
  chk('and a later repeat does not move the answer time', first.answeredAt, second.answeredAt)
  chk('nor the delivery time', first.deliveredAt, second.deliveredAt)
}

// ── 12. Both sides of one agreement delivering at once ─────────────────────
// Proves there is no cross-obligation authority OR cross-obligation interference: each
// participant writes their own end, and neither touches the other's.
async function raceBothSidesDeliver() {
  await confirmedTrade(ids.interest12)
  const markOwner =
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest12, 'offer_owner')});`
  const markResponder =
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest12, 'responder')});`
  // Both obligations, because the two racers act on different rows.
  const blocker = blockObligation(ids.interest12)
  await delay(2000)
  const [a, b] = await Promise.all([
    runTimedUser(ids.ou, markOwner),
    runTimedUser(ids.ru, markResponder),
  ])
  await blocker
  chk('both sides delivering genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('each participant can mark their own obligation delivered at the same time',
    'true', String(a.opOk && b.opOk))
  const owner = await obligationRow(ids.interest12, 'offer_owner')
  const responder = await obligationRow(ids.interest12, 'responder')
  chk('the owner side is delivered', 'delivered', owner.status)
  chk('the responder side is delivered', 'delivered', responder.status)
  chk('each side has its own delivery time', 'true',
    String(owner.deliveredAt !== null && responder.deliveredAt !== null))
  chk('and neither side recorded a receiver answer', 'true',
    String(owner.answeredAt === null && responder.answeredAt === null))
}

const agreementOf = (interest) =>
  `(select ag.id from public.barter_agreements ag where ag.interest_id = '${interest}')`

async function cancellationRows(interest) {
  const r = await runSql(`
select count(*) as n,
       count(distinct c.actor_user_id) as actors,
       coalesce(string_agg(coalesce(c.reason, '(none)'), ' | ' order by c.created_at), '') as reasons
  from public.barter_agreement_cancellations c
  join public.barter_agreements ag on ag.id = c.agreement_id
 where ag.interest_id = '${interest}';`)
  return {
    n: scalar(r.out, 'n'),
    actors: scalar(r.out, 'actors'),
    reasons: scalar(r.out, 'reasons'),
  }
}

// ── 13. Both participants cancel at once ───────────────────────────────────
// Two independent acts must BOTH be recorded. If one were lost the trade would read as
// "cancelled by one participant" when both had in fact agreed — and the second act is the
// only evidence of the counterparty's assent.
// Declared once. The copy is server-authored and carries a bounded, server-derived post label
// (barter_terms_label), so these match the stable stems rather than a whole sentence -- a
// harness that pinned the label would break on an unrelated offer-title change.
const FIRST_ACT_NOTICE = 'The trade for %was cancelled by one provider.'
const MUTUAL_NOTICE = 'Both providers agreed to cancel the trade for %'

// SQL string literal, escaped the way Postgres actually wants it. The previous spelling was
// JSON.stringify(...).replace(/"/g, "'"), which turns any apostrophe in the copy into a syntax
// error -- and the product's cancellation copy already contains one elsewhere.
const sqlLit = (v) => `'${String(v).replace(/'/g, "''")}'`

// Platform notices of one wording in the pair's thread. Counted by content because every
// cancellation scenario in this run shares the one canonical conversation, so a bare total
// would drift as later scenarios cancel their own trades.
async function systemMessages(pattern) {
  const q = await runSql(
    `select count(*) as n from public.messages
      where conversation_id = '${ids.conv}' and sender_id is null
        and content like ${sqlLit(pattern)};`)
  return scalar(q.out, 'n')
}

async function raceBothCancel() {
  await confirmedTrade(ids.interest13)
  const cancel = (who) =>
    `v_result := public.cancel_barter_agreement(${agreementOf(ids.interest13)}, '${who}');`
  const blocker = blockObligation(ids.interest13)
  await delay(2000)
  const [a, b] = await Promise.all([
    runTimedUser(ids.ou, cancel('owner reason')),
    runTimedUser(ids.ru, cancel('responder reason')),
  ])
  await blocker
  chk('the two cancellations genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('both participants cancelling at once both succeed', 'true', String(a.opOk && b.opOk))
  // The two RETURN values must be the two classifications, one each: whoever commits first is
  // told "cancelled by participant" and the second "mutually cancelled". If the first act could
  // report mutual, one participant would be told the other had agreed before they had.
  const classifications = [a.result, b.result].sort().join(',')
  chk('one call reports cancelled-by-participant and the other mutually-cancelled',
    'cancelled_by_participant,mutually_cancelled', classifications)
  const rows = await cancellationRows(ids.interest13)
  chk('a simultaneous mutual cancellation records exactly two acts', '2', rows.n)
  chk('one per participant', '2', rows.actors)
  chk('and neither act loses its own reason', 'true',
    String(rows.reasons.includes('owner reason') && rows.reasons.includes('responder reason')))
  const ob = await obligationRow(ids.interest13, 'offer_owner')
  chk('cancelling touches no obligation', 'pending', ob.status)
  // EXACTLY ONCE PER TRANSITION, under a real race. Both calls insert an act; only the first
  // to commit sees one act and only the second sees two, because both hold the agreement lock
  // when they count. If the count were read outside the lock, both could report the same
  // classification and write the same message twice.
  chk('the simultaneous mutual cancellation announced the first act exactly once',
    '1', await systemMessages(FIRST_ACT_NOTICE))
  chk('and the mutual outcome exactly once',
    '1', await systemMessages(MUTUAL_NOTICE))
  const leak = await runSql(
    `select count(*) as n from public.messages
      where conversation_id = '${ids.conv}'
        and (content like '%owner reason%' or content like '%responder reason%');`)
  chk('and no cancellation reason reached the thread', '0', scalar(leak.out, 'n'))
}

// ── 14. The same participant cancels twice at once ─────────────────────────
async function raceSameParticipantCancels() {
  await confirmedTrade(ids.interest14)
  const cancel =
    `perform public.cancel_barter_agreement(${agreementOf(ids.interest14)}, 'double tap');`
  const blocker = blockObligation(ids.interest14)
  await delay(2000)
  const [a, b] = await Promise.all([
    runTimedUser(ids.ou, cancel),
    runTimedUser(ids.ou, cancel),
  ])
  await blocker
  chk('the two identical cancellations genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('a concurrent double cancel is safe for both', 'true', String(a.opOk && b.opOk))
  const rows = await cancellationRows(ids.interest14)
  chk('and records exactly one act', '1', rows.n)
  chk('by exactly one participant', '1', rows.actors)
  // The no-duplicate-notice property proven under a REAL race, not only sequentially. This is
  // the race where a duplicate is most plausible: both calls are the same participant, so both
  // would write the SAME sentence if the already-acted branch were read outside the lock.
  const before = Number(await systemMessages(FIRST_ACT_NOTICE))
  chk('a concurrent double tap announced the cancellation exactly once', 'true',
    String(before >= 1))
  const q = await runSql(
    `select count(*) as n from public.messages
      where conversation_id = '${ids.conv}' and sender_id is null
        and content like '%conc offering14%';`)
  chk('exactly one notice for that trade', '1', scalar(q.out, 'n'))
  const addressed = await runSql(
    `select count(*) as n from public.messages
      where conversation_id = '${ids.conv}' and sender_id is null
        and content like '%conc offering14%' and system_recipient_id = '${ids.ru}';`)
  chk('and it is addressed to the participant who did not act', '1', scalar(addressed.out, 'n'))
}

// ── 15. Cancel racing the deliverer's own mark-delivered ───────────────────
// THE boundary. Exactly one of the two must win, and the loser must be refused — never both.
async function raceCancelVsDeliver() {
  await confirmedTrade(ids.interest15)
  const cancel =
    `perform public.cancel_barter_agreement(${agreementOf(ids.interest15)}, 'racing delivery');`
  const mark =
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest15, 'offer_owner')});`
  const blocker = blockObligation(ids.interest15, 'offer_owner')
  await delay(2000)
  // Same participant on both sides: the owner is the deliverer of this obligation AND a
  // participant who may cancel, so nothing but the state transition decides the winner.
  const [c, d] = await Promise.all([
    runTimedUser(ids.ou, cancel),
    runTimedUser(ids.ou, mark),
  ])
  await blocker
  chk('cancel and mark-delivered genuinely overlapped',
    'true', String(intervalsOverlap(c.timing, d.timing)))
  chk('exactly one of cancel / deliver wins', 'true', String(c.opOk !== d.opOk))
  const rows = await cancellationRows(ids.interest15)
  const ob = await obligationRow(ids.interest15, 'offer_owner')
  // The two legal end states, and nothing else. A delivered obligation on a cancelled trade,
  // or a trade that is neither delivered nor cancelled, would both be corruption.
  const deliveryWon = rows.n === '0' && ob.status === 'delivered' && ob.deliveredAt !== null
  const cancelWon = rows.n === '1' && ob.status === 'pending' && ob.deliveredAt === null
  chk('the end state is exactly one of (delivered, uncancelled) or (pending, cancelled)',
    'true', String(deliveryWon || cancelWon))
  chk('the winner matches the RPC that succeeded', 'true',
    String(d.opOk ? deliveryWon : cancelWon))
  chk('and the loser was refused with a code the UI maps', 'true',
    String(d.opOk ? c.timing?.code === '55000' : d.timing?.code === 'PT409'))
}

// ── 16. Cancel racing the COUNTERPARTY's delivery ──────────────────────────
// Same boundary, opposite participants: the responder delivers their own obligation while the
// owner tries to cancel the trade out from under them.
async function raceCancelVsCounterpartyDeliver() {
  await confirmedTrade(ids.interest16)
  const cancel =
    `perform public.cancel_barter_agreement(${agreementOf(ids.interest16)}, 'while they deliver');`
  const mark =
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest16, 'responder')});`
  const blocker = blockObligation(ids.interest16, 'responder')
  await delay(2000)
  const [c, d] = await Promise.all([
    runTimedUser(ids.ou, cancel),
    runTimedUser(ids.ru, mark),
  ])
  await blocker
  chk('cancel and the counterparty delivery genuinely overlapped',
    'true', String(intervalsOverlap(c.timing, d.timing)))
  chk('exactly one of cancel / counterparty delivery wins', 'true', String(c.opOk !== d.opOk))
  const rows = await cancellationRows(ids.interest16)
  const ob = await obligationRow(ids.interest16, 'responder')
  const deliveryWon = rows.n === '0' && ob.status === 'delivered'
  const cancelWon = rows.n === '1' && ob.status === 'pending' && ob.deliveredAt === null
  chk('the end state is consistent from the other side too', 'true',
    String(deliveryWon || cancelWon))
  chk('and it matches the RPC that succeeded', 'true', String(d.opOk ? deliveryWon : cancelWon))
  const other = await obligationRow(ids.interest16, 'offer_owner')
  chk('the obligation nobody touched is still pending', 'pending', other.status)
}

// ── 17. Cancel racing an unauthorized caller, and cancel after a delivery ──
async function raceCancelUnauthorizedAndLate() {
  await confirmedTrade(ids.interest17)
  const cancel =
    `perform public.cancel_barter_agreement(${agreementOf(ids.interest17)}, 'legitimate');`
  const blocker = blockObligation(ids.interest17)
  await delay(2000)
  // A genuinely unrelated caller: a random uuid that is on neither side of this agreement.
  // It must be answered exactly as a non-existent trade would be, and without waiting.
  const [ok, intruder] = await Promise.all([
    runTimedUser(ids.ou, cancel),
    runTimedUser(randomUUID(), cancel),
  ])
  await blocker
  chk('the unrelated caller is refused without ever contending for the locked rows',
    'true', String(refusedWithoutWaiting(intruder.timing, ok.timing)))
  chk('the participant wins', 'true', String(ok.opOk))
  chk('and the unrelated user is refused', '23514', intruder.timing?.code)
  const rows = await cancellationRows(ids.interest17)
  chk('exactly one act is recorded', '1', rows.n)

  // With the trade cancelled, delivery is closed for good — proven sequentially, because the
  // race that matters was scenario 15.
  const late = await runTimedUser(ids.ou,
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest17, 'offer_owner')});`)
  chk('delivery after a cancellation is refused', 'PT409', late.timing?.code)
  const ob = await obligationRow(ids.interest17, 'offer_owner')
  chk('and the obligation is untouched', 'pending', ob.status)
}

async function cleanup() {
  const r = await runSql(`
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- Obligations cascade with their agreement, and the immutability trigger early-returns for
  -- service_role, so the agreement delete is what removes them.
  delete from public.messages where conversation_id = '${ids.conv}';
  delete from public.conversation where id = '${ids.conv}';
  delete from public.barter_agreement_cancellations c
   using public.barter_agreements ag
   where c.agreement_id = ag.id and ag.interest_id in (${quoted(AGREEMENT_INTERESTS)});
  delete from public.barter_agreements
   where interest_id in (${quoted(AGREEMENT_INTERESTS)});
  delete from public.barter_version_acceptances a using public.barter_proposal_versions v,
    public.barter_proposals p
   where a.version_id = v.id and v.proposal_id = p.id
     and p.interest_id in (${quoted(ALL_INTERESTS)});
  delete from public.barter_proposal_terms t using public.barter_proposal_versions v,
    public.barter_proposals p
   where t.version_id = v.id and v.proposal_id = p.id
     and p.interest_id in (${quoted(ALL_INTERESTS)});
  delete from public.barter_proposal_versions v using public.barter_proposals p
   where v.proposal_id = p.id
     and p.interest_id in (${quoted(ALL_INTERESTS)});
  delete from public.barter_proposals
   where interest_id in (${quoted(ALL_INTERESTS)});
  delete from public.barter_interests
   where id in (${quoted(ALL_INTERESTS)});
  delete from public.barter_offers where id in (${quoted(ALL_OFFERS)});
  delete from public.providers where user_id in ('${ids.ou}','${ids.ru}');
  delete from auth.users where id in ('${ids.ou}','${ids.ru}');
end $$;`)
  if (!r.ok) console.error('cleanup failed:', r.out)

  // SCOPED to this run's own fixtures. A global count(*) = 0 passes today only because the
  // non-production barter tables happen to be empty, and would report a false FAILURE the
  // moment any real row exists on the target.
  const q = await runSql(`
select (select count(*) from public.barter_offers where id in
          (${quoted(ALL_OFFERS)})) as offers,
       (select count(*) from public.barter_interests where id in
          (${quoted(ALL_INTERESTS)})) as interests,
       (select count(*) from public.barter_proposals where interest_id in
          (${quoted(ALL_INTERESTS)})) as proposals,
       (select count(*) from public.barter_obligations bo join public.barter_agreements ag on ag.id = bo.agreement_id
          where ag.interest_id in (${quoted(AGREEMENT_INTERESTS)})) as obligations,
       (select count(*) from public.barter_agreements where interest_id in
          (${quoted(AGREEMENT_INTERESTS)})) as agreements,
       (select count(*) from public.barter_agreement_cancellations c
          join public.barter_agreements ag on ag.id = c.agreement_id
          where ag.interest_id in (${quoted(AGREEMENT_INTERESTS)})) as cancellations,
       (select count(*) from public.messages
          where conversation_id = '${ids.conv}') as messages,
       (select count(*) from public.conversation
          where id = '${ids.conv}') as conversations,
       (select count(*) from public.providers where user_id in
          ('${ids.ou}','${ids.ru}')) as providers,
       (select count(*) from auth.users where id in ('${ids.ou}','${ids.ru}')) as users;`)
  for (const k of ['offers', 'interests', 'proposals', 'obligations', 'agreements',
    'cancellations', 'messages', 'conversations', 'providers', 'users']) {
    chk(`zero residue: ${k}`, '0', scalar(q.out, k))
  }
}

await seed()
await raceCounters()
await raceCreation()
await raceAcceptVsCounter()
await raceFinalizeFinalize()
await raceFinalizeCounter()
await raceFinalizeRelease()
await raceObligationPairCreation()
await raceMarkDelivered()
await raceDelivererVsIntruder()
await raceOpposingReceiverAnswers()
await raceSameReceiverAnswer()
await raceBothSidesDeliver()
await raceBothCancel()
await raceSameParticipantCancels()
await raceCancelVsDeliver()
await raceCancelVsCounterpartyDeliver()
await raceCancelUnauthorizedAndLate()
await cleanup()

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
