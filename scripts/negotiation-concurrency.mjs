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
// The numbered groups below are THEMES, not scenario numbers — the body runs twenty-four
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
//   H. Adjudication races. A terminal outcome is the one write in this slice that no participant
//      can reach, so its races are about PRECEDENCE and IMMUTABILITY rather than authority
//      alone: an outcome colliding with a participant act must leave exactly one authoritative
//      state with the participant's own history intact, two operators deciding differently must
//      leave exactly one outcome with the loser refused, an identical repeat must be safe for
//      both callers, and a participant racing an operator must be refused without ever
//      contending for the row.
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
 * A SHARED START INSTANT, so two sessions genuinely contend.
 *
 * Every race here launches its two operations with `Promise.all`, and each one
 * spawns its own `supabase db query` process. Those are genuinely parallel at
 * the OS level — but the CLI's startup ("Initialising login role... Connecting
 * to remote database...") is SECONDS long and VARIES between the two, so the
 * moment each session actually reaches its statement was never synchronized.
 *
 * The old mechanism was a flat `pg_sleep(2)` in each session before the clock
 * started, which absorbs startup skew only while the skew is under two seconds.
 * Observed skew against a loaded non-production API was **four**:
 *
 *     op maintenance window=[...555607, ...559304]   3.7s
 *     op maintenance window=[...559684, ...559686]   2ms   <- started AFTER
 *
 * The second session began 380ms after the first had committed, so the two
 * never overlapped, the scenario proved nothing, and the assertions downstream
 * of it failed as collateral. Nondeterministically — a different race lost the
 * coin toss on each run, which is exactly the shape that gets written off as a
 * flake and left alone.
 *
 * The fix is a barrier rather than a longer guess. `Promise.all` calls both
 * helpers within microseconds, so both compute the same target instant, and
 * each session sleeps until IT rather than for a fixed duration. Startup skew
 * up to LEAD is absorbed completely, and the cost is bounded by LEAD instead of
 * being added to it — a session that took four seconds to connect sleeps four,
 * not eight.
 *
 * If a session is so slow that the barrier has already passed, it starts
 * immediately and the overlap assertion catches it honestly. That assertion is
 * the point: a race that did not race must fail loudly, not pass quietly.
 */
const START_BARRIER_MS = 8000
const barrierSql = () => {
  const at = new Date(Date.now() + START_BARRIER_MS).toISOString()
  return `perform pg_sleep(greatest(0, extract(epoch from `
    + `('${at}'::timestamptz - clock_timestamp()))));`
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
  ${barrierSql()}
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
  const opOk = r.ok && timing?.code === '00000'
  recordOp('user', timing, opOk)
  return { ...r, timing, result: scalar(r.out, 'result'), opOk }
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
  ${barrierSql()}
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
  const opOk = r.ok && timing?.code === '00000'
  recordOp('maintenance', timing, opOk)
  return { ...r, timing, opOk }
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

// Terms whose OWNER side carries a scheduled appointment. No-show exists only for a scheduled
// obligation, so the no-show races need this shape rather than the due-date-only default.
// Scheduled sits inside the due date, as the schema's own CHECK requires.
const SCHEDULED_TERMS = (a, b) =>
  `'${a}', clock_timestamp() + interval '30 days', clock_timestamp() + interval '20 days', `
  + `'${b}', clock_timestamp() + interval '30 days', null`

const results = []
// The last few timed operations, so a FAILURE can say WHY rather than only
// that it happened.
//
// Every assertion here is about two sessions contending, and when one fails the
// question is always the same: what did each session actually do — did it
// commit, what SQLSTATE did it raise, and did the two intervals really overlap?
// None of that was printed, so a failing race reported `expected=true
// actual=false` and nothing else, and diagnosing it meant editing the harness
// and re-running a ten-minute suite. Now the evidence is already there.
const recentOps = []
function recordOp(kind, timing, opOk) {
  recentOps.push({ kind, ok: opOk, code: timing?.code ?? null,
    startedAt: timing?.startedAt ?? null, endedAt: timing?.endedAt ?? null })
  if (recentOps.length > 4) recentOps.shift()
}

const chk = (name, expected, actual) => {
  const ok = String(expected) === String(actual)
  results.push({ ok, name })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: expected=${expected} actual=${actual}`)
  if (!ok && recentOps.length) {
    for (const o of recentOps) {
      console.log(`     op ${o.kind} ok=${o.ok} code=${o.code} `
        + `window=[${o.startedAt}, ${o.endedAt}]`)
    }
  }
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
  offer18: randomUUID(),
  interest18: randomUUID(),
  offer19: randomUUID(),
  interest19: randomUUID(),
  offer20: randomUUID(),
  interest20: randomUUID(),
  offer21: randomUUID(),
  interest21: randomUUID(),
  offer22: randomUUID(),
  interest22: randomUUID(),
  offer23: randomUUID(),
  interest23: randomUUID(),
  offer24: randomUUID(),
  interest24: randomUUID(),
  offer25: randomUUID(),
  interest25: randomUUID(),
  offer26: randomUUID(),
  interest26: randomUUID(),
  offer27: randomUUID(),
  interest27: randomUUID(),
  offer28: randomUUID(),
  interest28: randomUUID(),
  // The OPERATOR. An auth user with no provider row and no part in any trade here, because an
  // adjudicator may not be a participant — the RPC and the trigger both refuse one.
  op: randomUUID(),
}

// Every interest this harness creates, in one place: the cleanup and the residue assertions
// both read it, so adding a scenario cannot leave rows behind by forgetting one list.
const ALL_INTERESTS = [
  ids.interest, ids.interest2, ids.interest3, ids.interest4, ids.interest5, ids.interest6,
  ids.interest7, ids.interest8, ids.interest9, ids.interest10, ids.interest11, ids.interest12,
  ids.interest13, ids.interest14, ids.interest15, ids.interest16, ids.interest17,
  ids.interest18, ids.interest19, ids.interest20, ids.interest21,
  ids.interest22, ids.interest23, ids.interest24, ids.interest25,
  ids.interest26, ids.interest27, ids.interest28,
]
const ALL_OFFERS = [
  ids.offer, ids.offer2, ids.offer3, ids.offer4, ids.offer5, ids.offer6, ids.offer7,
  ids.offer8, ids.offer9, ids.offer10, ids.offer11, ids.offer12,
  ids.offer13, ids.offer14, ids.offer15, ids.offer16, ids.offer17,
  // 18-21 were absent, so four offers were left on the target and the residue count could not
  // see them. Listed now, with the adjudication scenarios' own.
  ids.offer18, ids.offer19, ids.offer20, ids.offer21,
  ids.offer22, ids.offer23, ids.offer24, ids.offer25,
  ids.offer26, ids.offer27, ids.offer28,
]
// The interests that reach an official agreement, and therefore have obligations.
const AGREEMENT_INTERESTS = [
  ids.interest4, ids.interest5, ids.interest6, ids.interest7, ids.interest8, ids.interest9,
  ids.interest10, ids.interest11, ids.interest12,
  ids.interest13, ids.interest14, ids.interest15, ids.interest16, ids.interest17,
  ids.interest18, ids.interest19, ids.interest20, ids.interest21,
  ids.interest22, ids.interest23, ids.interest24, ids.interest25,
  ids.interest26, ids.interest27, ids.interest28,
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
  insert into auth.users(id) values ('${ids.ou}'), ('${ids.ru}'), ('${ids.op}');
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
           ('${ids.offer17}', opid, '${ids.ou}', 'conc offering17 ${tag}', 'conc seeking'),
           ('${ids.offer18}', opid, '${ids.ou}', 'conc offering18 ${tag}', 'conc seeking'),
           ('${ids.offer19}', opid, '${ids.ou}', 'conc offering19 ${tag}', 'conc seeking'),
           ('${ids.offer20}', opid, '${ids.ou}', 'conc offering20 ${tag}', 'conc seeking'),
           ('${ids.offer21}', opid, '${ids.ou}', 'conc offering21 ${tag}', 'conc seeking'),
           ('${ids.offer22}', opid, '${ids.ou}', 'conc offering22 ${tag}', 'conc seeking'),
           ('${ids.offer23}', opid, '${ids.ou}', 'conc offering23 ${tag}', 'conc seeking'),
           ('${ids.offer24}', opid, '${ids.ou}', 'conc offering24 ${tag}', 'conc seeking'),
           ('${ids.offer25}', opid, '${ids.ou}', 'conc offering25 ${tag}', 'conc seeking'),
           ('${ids.offer26}', opid, '${ids.ou}', 'conc offering26 ${tag}', 'conc seeking'),
           ('${ids.offer27}', opid, '${ids.ou}', 'conc offering27 ${tag}', 'conc seeking'),
           ('${ids.offer28}', opid, '${ids.ou}', 'conc offering28 ${tag}', 'conc seeking');
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
    ('${ids.interest17}', '${ids.offer17}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest18}', '${ids.offer18}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest19}', '${ids.offer19}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest20}', '${ids.offer20}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest21}', '${ids.offer21}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest22}', '${ids.offer22}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest23}', '${ids.offer23}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest24}', '${ids.offer24}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest25}', '${ids.offer25}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest26}', '${ids.offer26}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest27}', '${ids.offer27}', rpid, '${ids.ru}', 'x', 'accepted'),
    ('${ids.interest28}', '${ids.offer28}', rpid, '${ids.ru}', 'x', 'accepted');
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
// Same shape as readyToConfirm, with an appointment on the owner side.
async function readyToConfirmScheduled(interest) {
  await runSql(asUser(ids.ou, `perform public.create_barter_proposal('${interest}', ${SCHEDULED_TERMS('ns own', 'ns theirs')});`))
  const acceptV1 = (uid) => asUser(uid, `
  perform public.accept_barter_version(
    (select id from public.barter_proposal_versions
      where proposal_id = (select id from public.barter_proposals where interest_id = '${interest}')
      order by version_no limit 1));`)
  await runSql(acceptV1(ids.ou))
  await runSql(acceptV1(ids.ru))
}

// A confirmed trade whose owner-side APPOINTMENT has already passed while its DUE DATE has not.
//
// The appointment is moved by ageing the ACCEPTED TERM and re-deriving the obligation pair
// through production code — never by updating the obligation's `scheduled_at`, which
// 20261011000000 § 3b freezes against every writer including service_role. Obligation ids
// change across this call, so nothing may be captured before it.
async function confirmedScheduledTradeInPast(interest) {
  await readyToConfirmScheduled(interest)
  await runSql(asUser(ids.ou, `perform public.finalize_barter_agreement(${proposalOf(interest)});`))
  await runSql(`
do $$
declare v_ag uuid; v_ver uuid;
begin
  select ag.id, ag.accepted_version_id into v_ag, v_ver
    from public.barter_agreements ag where ag.interest_id = '${interest}';
  update public.barter_proposal_terms
     set created_at = created_at - interval '25 days',
         due_at = due_at - interval '25 days',
         scheduled_at = case when scheduled_at is null then null
                             else scheduled_at - interval '25 days' end
   where version_id = v_ver;
  delete from public.barter_obligations where agreement_id = v_ag;
  perform public.create_barter_obligation_pair(v_ag);
end $$;`)
}

async function noShowRows(interest) {
  const r = await runSql(`
select count(*) as n, min(r.created_at) as first_at, min(r.reason) as reason
  from public.barter_obligation_no_show_reports r
  join public.barter_agreements ag on ag.id = r.agreement_id
 where ag.interest_id = '${interest}';`)
  return {
    n: scalar(r.out, 'n'),
    firstAt: nullable(scalar(r.out, 'first_at')),
    reason: nullable(scalar(r.out, 'reason')),
  }
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
const MUTUAL_NOTICE = 'Both providers cancelled the trade for %'

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
  // NEVER DUPLICATED — which is the property a race can violate, and the only one that is
  // guaranteed here. Both calls insert an act; only the first to commit sees one act and only
  // the second sees two, because both count while holding the agreement lock. If that count
  // were read outside the lock, both could report the same classification and write the SAME
  // sentence twice.
  //
  // Deliberately "at most", not "exactly". The notice is best-effort BY CONSTRUCTION
  // (20261009000000): it is wrapped so it can fail for any reason without touching the act it
  // announces, and this scenario forces contention on purpose, so a dropped notice is the
  // design working rather than a defect. An earlier version of these two lines asserted
  // exactly 1 and was flaky for precisely that reason. The exactly-once DELIVERY guarantee is
  // proven in supabase/tests/cancellation.test.sql, sequentially and uncontended, which is
  // where it can be asserted honestly.
  chk('the simultaneous mutual cancellation never announced the first act twice', 'true',
    String(Number(await systemMessages(FIRST_ACT_NOTICE)) <= 1))
  chk('nor the mutual outcome twice', 'true',
    String(Number(await systemMessages(MUTUAL_NOTICE)) <= 1))
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
  // The no-duplicate-notice property under a REAL race — the race where a duplicate is most
  // plausible, because both calls are the SAME participant and would write the SAME sentence
  // if the already-acted branch were read outside the lock. Scoped to this trade's own label
  // so earlier scenarios sharing the one canonical thread cannot inflate it.
  const q = await runSql(
    `select count(*) as n,
            count(*) filter (where system_recipient_id = '${ids.ru}') as addressed
       from public.messages
      where conversation_id = '${ids.conv}' and sender_id is null
        and content like '%conc offering14%';`)
  const notices = Number(scalar(q.out, 'n'))
  chk('a concurrent double tap never announces the cancellation twice', 'true',
    String(notices <= 1))
  // Whatever WAS written is addressed to the participant who did not act. Written as an
  // equality against the count rather than a literal 1, so it stays honest if the best-effort
  // notice was dropped: it then asserts 0 = 0, and the no-duplicate check above still binds.
  chk('and every notice written is addressed to the one who did not act',
    String(notices), scalar(q.out, 'addressed'))
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

// ── 18. The same receiver reports a no-show twice at once ──────────────────
// The double tap, on a write that must be idempotent rather than a second event. BOTH calls
// must succeed, exactly ONE row may exist, and the timestamp must be the FIRST one: if a repeat
// could re-stamp it, the record of when the complaint was actually made would move every time
// the receiver tapped again — and that timestamp is the only evidence of when they raised it.
async function raceDoubleNoShow() {
  await confirmedScheduledTradeInPast(ids.interest18)
  const report = (reason) =>
    `perform public.report_barter_obligation_no_show(`
    + `${obligationOf(ids.interest18, 'offer_owner')}, '${reason}');`
  const blocker = blockObligation(ids.interest18, 'offer_owner')
  await delay(2000)
  const [a, b] = await Promise.all([
    runTimedUser(ids.ru, report('first account')),
    runTimedUser(ids.ru, report('second account')),
  ])
  await blocker
  chk('the two no-show reports genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('a concurrent double no-show report is safe for both', 'true', String(a.opOk && b.opOk))
  const rows = await noShowRows(ids.interest18)
  chk('and records exactly one report', '1', rows.n)
  chk('the surviving reason is one of the two, not a merge of both', 'true',
    String(rows.reason === 'first account' || rows.reason === 'second account'))
  const ob = await obligationRow(ids.interest18, 'offer_owner')
  chk('reporting a no-show creates no outcome — the obligation is untouched',
    'pending', ob.status)
}

// ── 19. No-show racing the receiver's own confirm-received ─────────────────
// The same participant, two contradictory statements, at the same instant. Exactly ONE must
// land: "I received it" and "they never showed" cannot both be authoritative, and the end state
// must be internally consistent whichever wins.
async function raceNoShowVsConfirmReceived() {
  await confirmedScheduledTradeInPast(ids.interest19)
  await runSql(asUser(ids.ou,
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest19, 'offer_owner')});`))
  const report =
    `perform public.report_barter_obligation_no_show(${obligationOf(ids.interest19, 'offer_owner')}, 'nobody came');`
  const confirm =
    `perform public.confirm_barter_obligation_received(${obligationOf(ids.interest19, 'offer_owner')});`
  const blocker = blockObligation(ids.interest19, 'offer_owner')
  await delay(2000)
  const [n, c] = await Promise.all([
    runTimedUser(ids.ru, report),
    runTimedUser(ids.ru, confirm),
  ])
  await blocker
  chk('no-show and confirm-received genuinely overlapped',
    'true', String(intervalsOverlap(n.timing, c.timing)))
  const rows = await noShowRows(ids.interest19)
  const ob = await obligationRow(ids.interest19, 'offer_owner')
  // Two compatible end states, and nothing else. Either the confirmation landed first and the
  // no-show was refused as PT412, or the report landed first and the confirmation still
  // succeeded — a receiver may confirm receipt after reporting, and the report stays on record.
  const confirmFirst = rows.n === '0' && ob.status === 'received' && !n.opOk
  const reportFirst = rows.n === '1' && n.opOk
  chk('exactly one authoritative, self-consistent state results',
    'true', String(confirmFirst !== reportFirst))
  chk('and it is one of the two legal shapes', 'true', String(confirmFirst || reportFirst))
  chk('a confirmed receipt never coexists with a no-show reported afterwards',
    'false', String(ob.status === 'received' && rows.n === '1' && !n.opOk))
}

// ── 20. No-show racing a cancellation ──────────────────────────────────────
// PD-063: the two acts are MUTUALLY EXCLUSIVE. Both are attemptable at this instant — nothing is
// delivered, so the ordinary exit is still open, and the appointment has passed, so a no-show may
// be reported — but exactly ONE may commit. The loser is refused: PT423 if the report won, PT409
// if the cancellation did. A cancelled trade never carries a report, and a reported trade never
// carries a cancellation.
async function raceNoShowVsCancel() {
  await confirmedScheduledTradeInPast(ids.interest20)
  const report =
    `perform public.report_barter_obligation_no_show(${obligationOf(ids.interest20, 'offer_owner')}, 'missed');`
  const cancel =
    `perform public.cancel_barter_agreement(${agreementOf(ids.interest20)}, 'ending it');`
  const blocker = blockObligation(ids.interest20)
  await delay(2000)
  const [n, c] = await Promise.all([
    runTimedUser(ids.ru, report),
    runTimedUser(ids.ou, cancel),
  ])
  await blocker
  chk('no-show and cancellation genuinely overlapped',
    'true', String(intervalsOverlap(n.timing, c.timing)))
  const rows = await noShowRows(ids.interest20)
  const cancels = await cancellationRows(ids.interest20)
  // A DEADLOCK MUST FAIL THIS SCENARIO, NOT BE ABSORBED BY IT. Every other assertion here is
  // conditional on which RPC won, so if PostgreSQL aborts one side with 40P01 they would all
  // still pass while both acts failed. These two are unconditional.
  chk('at least one of the two acts succeeded', 'true', String(n.opOk || c.opOk))
  chk('neither act deadlocked', 'true',
    String(n.timing?.code !== '40P01' && c.timing?.code !== '40P01'))
  // PD-063: the two acts are MUTUALLY EXCLUSIVE, not compatible. Exactly one transition wins
  // and the loser is refused — a report can never be written against a cancelled trade, and a
  // cancellation can never be recorded against a reported one.
  chk('exactly one of the two acts succeeded', 'true', String(n.opOk !== c.opOk))
  const cancelledOnly = cancels.n === '1' && rows.n === '0' && c.opOk && !n.opOk
  const reviewedOnly = rows.n === '1' && cancels.n === '0' && n.opOk && !c.opOk
  chk('the end state is exactly one of cancelled-no-report or reported-no-cancellation',
    'true', String(cancelledOnly !== reviewedOnly))
  chk('and it is one of those two shapes', 'true', String(cancelledOnly || reviewedOnly))
  // The shape the Founder ruled out: a report existing while a cancellation hides it.
  chk('a cancellation and a report never both exist', 'false',
    String(cancels.n !== '0' && rows.n !== '0'))
  chk('and the result matches the RPC that succeeded', 'true',
    String(n.opOk ? rows.n === '1' : rows.n === '0'))
  // The loser carries the code its own side maps: PT423 when the report won, PT409 when the
  // cancellation did.
  chk('the loser is refused with the mapped code for the state that won', 'true',
    String(n.opOk ? c.timing?.code === 'PT423' : n.timing?.code === 'PT409'))
  const ob = await obligationRow(ids.interest20, 'offer_owner')
  chk('neither act invented an outcome on the obligation', 'pending', ob.status)
}

// ── 21. An unrelated caller racing the legitimate reporter ─────────────────
// The intruder must be refused as a non-participant WITHOUT ever contending for the row lock —
// the authority check runs before the lock is taken, so a stranger cannot even make a
// legitimate reporter wait.
async function raceNoShowUnauthorized() {
  await confirmedScheduledTradeInPast(ids.interest21)
  const report =
    `perform public.report_barter_obligation_no_show(${obligationOf(ids.interest21, 'offer_owner')}, 'legitimate');`
  const blocker = blockObligation(ids.interest21, 'offer_owner')
  await delay(2000)
  const [ok, intruder] = await Promise.all([
    runTimedUser(ids.ru, report),
    runTimedUser(randomUUID(), report),
  ])
  await blocker
  chk('the unrelated reporter is refused without ever contending for the locked row',
    'true', String(refusedWithoutWaiting(intruder.timing, ok.timing)))
  chk('the receiver wins', 'true', String(ok.opOk))
  chk('and the unrelated user is refused', '23514', intruder.timing?.code)
  const rows = await noShowRows(ids.interest21)
  chk('exactly one report is recorded', '1', rows.n)
  chk('and it is the legitimate one', 'legitimate', rows.reason)
  // The DELIVERER is a participant and still may not report themselves as a no-show.
  const deliverer = await runTimedUser(ids.ou, report)
  chk('the deliverer cannot report themselves, even after the fact',
    '42501', deliverer.timing?.code)
  chk('and no second report was created', '1', (await noShowRows(ids.interest21)).n)
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


// ── Adjudication helpers ───────────────────────────────────────────────────
// The operator's write path, as a plpgsql statement. `runTimedMaintenance` supplies the
// service_role claim, which is the ONLY context that can reach this function: `execute` is
// granted to service_role alone. There is deliberately no `runTimedUser` equivalent, and the
// participant-racing-operator scenario below proves an authenticated caller is refused.
const adjudicate = (interest, side, outcome, why) =>
  `perform public.adjudicate_barter_obligation(`
  + `${obligationOf(interest, side)}, '${outcome}', '${ids.op}', '${why}');`

async function adjudicationRows(interest) {
  const r = await runSql(`
select count(*) as n,
       min(a.outcome) as outcome,
       count(distinct a.outcome) as outcomes,
       min(a.rationale) as rationale,
       min(a.adjudicator_user_id::text) as adjudicator
  from public.barter_obligation_adjudications a
  join public.barter_agreements ag on ag.id = a.agreement_id
 where ag.interest_id = '${interest}';`)
  return {
    n: scalar(r.out, 'n'),
    outcome: nullable(scalar(r.out, 'outcome')),
    outcomes: scalar(r.out, 'outcomes'),
    rationale: nullable(scalar(r.out, 'rationale')),
    adjudicator: nullable(scalar(r.out, 'adjudicator')),
  }
}

// An obligation that is genuinely UNDER REVIEW, reached only through real participant acts:
// delivered by its deliverer, then reported as a no-show by its receiver. `p_delivered` false
// leaves it undelivered, which is what the mark-delivered race needs.
async function underReviewByNoShow(interest, delivered = true) {
  await confirmedScheduledTradeInPast(interest)
  if (delivered) {
    await runSql(asUser(ids.ou,
      `perform public.mark_barter_obligation_delivered(${obligationOf(interest, 'offer_owner')});`))
  }
  await runSql(asUser(ids.ru,
    `perform public.report_barter_obligation_no_show(`
    + `${obligationOf(interest, 'offer_owner')}, 'nobody came');`))
}

// ── 22. Adjudication racing the receiver's confirm-received ────────────────
// The operator resolves a trade at the instant its receiver changes their mind. Both acts are
// legal at that instant, and the ORDER decides only whether the participant's answer lands:
// once an outcome exists every participant write on that obligation is refused PT424, while an
// answer that lands first does not un-report the no-show, so the obligation is still Under
// Review and still adjudicable. The adjudication therefore wins either way — and, crucially,
// the receiver's answer is never rewritten to agree with the outcome.
async function raceAdjudicateVsConfirmReceived() {
  await underReviewByNoShow(ids.interest22)
  const confirm =
    `perform public.confirm_barter_obligation_received(${obligationOf(ids.interest22, 'offer_owner')});`
  const blocker = blockObligation(ids.interest22, 'offer_owner')
  await delay(2000)
  const [a, c] = await Promise.all([
    runTimedMaintenance(adjudicate(ids.interest22, 'offer_owner', 'fulfilled', 'Evidence stands.')),
    runTimedUser(ids.ru, confirm),
  ])
  await blocker
  chk('adjudication and confirm-received genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, c.timing)))
  chk('neither act deadlocked', 'true',
    String(a.timing?.code !== '40P01' && c.timing?.code !== '40P01'))
  chk('the adjudication lands whichever order the two resolve in', 'true', String(a.opOk))
  const rows = await adjudicationRows(ids.interest22)
  chk('exactly one terminal outcome exists', '1', rows.n)
  chk('and it is the one the operator decided', 'fulfilled', rows.outcome)
  const ob = await obligationRow(ids.interest22, 'offer_owner')
  // Two legal shapes and nothing else. The participant answer either landed before the outcome
  // and STAYS on the record beside it, or it was refused with the code the client maps.
  const answerLanded = c.opOk && ob.status === 'received'
  const answerRefused = !c.opOk && c.timing?.code === 'PT424' && ob.status === 'delivered'
  chk('the receiver answer either landed or was refused as resolved — never both, never neither',
    'true', String(answerLanded !== answerRefused))
  chk('and the end state is one of those two shapes', 'true', String(answerLanded || answerRefused))
  const reports = await noShowRows(ids.interest22)
  chk('the no-show report survives the outcome — history is not rewritten', '1', reports.n)
}

// ── 23. Adjudication racing the receiver's "Didn't receive" ────────────────
// The same boundary from the other direction: the participant is making the complaint that
// would normally PRECEDE a review while the operator is already closing one.
async function raceAdjudicateVsNotReceived() {
  await underReviewByNoShow(ids.interest23)
  const deny =
    `perform public.report_barter_obligation_not_received(${obligationOf(ids.interest23, 'offer_owner')});`
  const blocker = blockObligation(ids.interest23, 'offer_owner')
  await delay(2000)
  const [a, d] = await Promise.all([
    runTimedMaintenance(
      adjudicate(ids.interest23, 'offer_owner', 'unfulfilled', 'Nothing was provided.')),
    runTimedUser(ids.ru, deny),
  ])
  await blocker
  chk('adjudication and "didn\'t receive" genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, d.timing)))
  chk('neither of those two deadlocked', 'true',
    String(a.timing?.code !== '40P01' && d.timing?.code !== '40P01'))
  chk('the adjudication lands here too', 'true', String(a.opOk))
  const rows = await adjudicationRows(ids.interest23)
  chk('exactly one terminal outcome exists after that race', '1', rows.n)
  const ob = await obligationRow(ids.interest23, 'offer_owner')
  const answerLanded = d.opOk && ob.status === 'not_received'
  const answerRefused = !d.opOk && d.timing?.code === 'PT424' && ob.status === 'delivered'
  chk('the denial either landed or was refused as resolved', 'true',
    String(answerLanded !== answerRefused))
  chk('and no third shape is reachable', 'true', String(answerLanded || answerRefused))
  // The coexistence the product depends on: a receiver's "Didn't receive" and an operator's
  // determination are BOTH on the record when the answer got there first.
  chk('a landed denial coexists with the outcome rather than being overwritten', 'true',
    String(!answerLanded || (ob.status === 'not_received' && rows.n === '1')))
}

// ── 24. Adjudication racing a no-show report ───────────────────────────────
// Under Review reached by the OTHER route (`not_received`), so the report being raced is a
// genuinely new participant act rather than a repeat of the one that opened the review.
async function raceAdjudicateVsNoShowReport() {
  await confirmedScheduledTradeInPast(ids.interest24)
  await runSql(asUser(ids.ou,
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest24, 'offer_owner')});`))
  await runSql(asUser(ids.ru,
    `perform public.report_barter_obligation_not_received(${obligationOf(ids.interest24, 'offer_owner')});`))
  const report =
    `perform public.report_barter_obligation_no_show(`
    + `${obligationOf(ids.interest24, 'offer_owner')}, 'they never came');`
  const blocker = blockObligation(ids.interest24, 'offer_owner')
  await delay(2000)
  const [a, n] = await Promise.all([
    runTimedMaintenance(adjudicate(ids.interest24, 'offer_owner', 'closed_without_resolution',
      'Conflicting accounts and no evidence either way.')),
    runTimedUser(ids.ru, report),
  ])
  await blocker
  chk('adjudication and a no-show report genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, n.timing)))
  chk('neither the outcome nor the report deadlocked', 'true',
    String(a.timing?.code !== '40P01' && n.timing?.code !== '40P01'))
  chk('the adjudication lands', 'true', String(a.opOk))
  const rows = await adjudicationRows(ids.interest24)
  chk('one terminal outcome, and it is the one decided', '1', rows.n)
  chk('closed without resolution is recorded as itself', 'closed_without_resolution', rows.outcome)
  const reports = await noShowRows(ids.interest24)
  const reportLanded = n.opOk && reports.n === '1'
  const reportRefused = !n.opOk && n.timing?.code === 'PT424' && reports.n === '0'
  chk('the report either landed before the outcome or was refused as resolved', 'true',
    String(reportLanded !== reportRefused))
  chk('and never both', 'true', String(reportLanded || reportRefused))
  const ob = await obligationRow(ids.interest24, 'offer_owner')
  chk('the receiver\'s earlier answer is untouched by the outcome', 'not_received', ob.status)
}

// ── 25. Adjudication racing mark-delivered ─────────────────────────────────
// The obligation is UNDELIVERED and under review by no-show report, so the deliverer marking it
// delivered is a legal act at that instant. Whichever lands, `delivered_at` is never invented
// and never erased: a delivery that got there first stands as a fact beside the outcome.
async function raceAdjudicateVsMarkDelivered() {
  await underReviewByNoShow(ids.interest25, false)
  const mark =
    `perform public.mark_barter_obligation_delivered(${obligationOf(ids.interest25, 'offer_owner')});`
  const blocker = blockObligation(ids.interest25, 'offer_owner')
  await delay(2000)
  const [a, m] = await Promise.all([
    runTimedMaintenance(
      adjudicate(ids.interest25, 'offer_owner', 'unfulfilled', 'The appointment did not happen.')),
    runTimedUser(ids.ou, mark),
  ])
  await blocker
  chk('adjudication and mark-delivered genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, m.timing)))
  chk('neither the outcome nor the delivery deadlocked', 'true',
    String(a.timing?.code !== '40P01' && m.timing?.code !== '40P01'))
  chk('the adjudication lands against an undelivered obligation under review', 'true',
    String(a.opOk))
  const rows = await adjudicationRows(ids.interest25)
  chk('exactly one terminal outcome after the delivery race', '1', rows.n)
  const ob = await obligationRow(ids.interest25, 'offer_owner')
  const deliveryLanded = m.opOk && ob.status === 'delivered' && ob.deliveredAt !== null
  const deliveryRefused =
    !m.opOk && m.timing?.code === 'PT424' && ob.status === 'pending' && ob.deliveredAt === null
  chk('the delivery either landed or was refused as resolved', 'true',
    String(deliveryLanded !== deliveryRefused))
  chk('and the obligation is in exactly one of those two shapes', 'true',
    String(deliveryLanded || deliveryRefused))
  chk('an outcome never erases a delivery that got there first', 'false',
    String(m.opOk && ob.deliveredAt === null))
}

// ── 26. Two operators, two DIFFERENT outcomes, at once ─────────────────────
// The scenario the whole immutability design exists for. Exactly one must commit; the other
// must be refused rather than overwriting, and the surviving row must be the winner's — not a
// blend, and not the later one silently replacing the earlier.
async function raceTwoOperatorsDifferentOutcomes() {
  await underReviewByNoShow(ids.interest26)
  const blocker = blockObligation(ids.interest26, 'offer_owner')
  await delay(2000)
  const [f, u] = await Promise.all([
    runTimedMaintenance(
      adjudicate(ids.interest26, 'offer_owner', 'fulfilled', 'Operator A: it was provided.')),
    runTimedMaintenance(
      adjudicate(ids.interest26, 'offer_owner', 'unfulfilled', 'Operator B: it was not.')),
  ])
  await blocker
  chk('the two operator decisions genuinely overlapped',
    'true', String(intervalsOverlap(f.timing, u.timing)))
  chk('neither operator deadlocked', 'true',
    String(f.timing?.code !== '40P01' && u.timing?.code !== '40P01'))
  chk('exactly one of the two conflicting outcomes commits', 'true', String(f.opOk !== u.opOk))
  chk('and the loser is refused as already resolved', 'PT412',
    f.opOk ? u.timing?.code : f.timing?.code)
  const rows = await adjudicationRows(ids.interest26)
  chk('exactly one adjudication row exists', '1', rows.n)
  chk('and only one outcome value is present', '1', rows.outcomes)
  chk('the surviving outcome is the one that succeeded', f.opOk ? 'fulfilled' : 'unfulfilled',
    rows.outcome)
  chk('the rationale stored is the winner\'s, not a merge',
    f.opOk ? 'Operator A: it was provided.' : 'Operator B: it was not.', rows.rationale)
}

// ── 27. The same decision submitted twice at once ──────────────────────────
// The double tap on an operator tool. BOTH must succeed — a retried identical decision is not
// an error — and exactly one row may exist, with one of the two rationales rather than a
// second row or an overwritten one.
async function raceDuplicateAdjudication() {
  await underReviewByNoShow(ids.interest27)
  const blocker = blockObligation(ids.interest27, 'offer_owner')
  await delay(2000)
  const [a, b] = await Promise.all([
    runTimedMaintenance(
      adjudicate(ids.interest27, 'offer_owner', 'fulfilled', 'first submission')),
    runTimedMaintenance(
      adjudicate(ids.interest27, 'offer_owner', 'fulfilled', 'second submission')),
  ])
  await blocker
  chk('the two identical decisions genuinely overlapped',
    'true', String(intervalsOverlap(a.timing, b.timing)))
  chk('a concurrent duplicate decision is safe for both callers', 'true',
    String(a.opOk && b.opOk))
  const rows = await adjudicationRows(ids.interest27)
  chk('and records exactly one adjudication', '1', rows.n)
  chk('with the decided outcome', 'fulfilled', rows.outcome)
  chk('and one of the two rationales, not a merge of both', 'true',
    String(rows.rationale === 'first submission' || rows.rationale === 'second submission'))
}

// ── 28. A participant racing the operator ──────────────────────────────────
// The authority boundary under contention. `execute` on the RPC is granted to service_role
// alone, so an authenticated participant is refused at the privilege check — before any row is
// touched, which is why they cannot even make the operator wait.
async function raceParticipantVsOperator() {
  await underReviewByNoShow(ids.interest28)
  const blocker = blockObligation(ids.interest28, 'offer_owner')
  await delay(2000)
  const [op, party] = await Promise.all([
    runTimedMaintenance(
      adjudicate(ids.interest28, 'offer_owner', 'fulfilled', 'Operator decision.')),
    runTimedUser(ids.ru,
      adjudicate(ids.interest28, 'offer_owner', 'unfulfilled', 'Participant decision.')),
  ])
  await blocker
  chk('the participant is refused without ever contending for the locked row',
    'true', String(refusedWithoutWaiting(party.timing, op.timing)))
  chk('the operator wins', 'true', String(op.opOk))
  chk('and the participant is refused for want of privilege', '42501', party.timing?.code)
  const rows = await adjudicationRows(ids.interest28)
  chk('exactly one adjudication exists', '1', rows.n)
  chk('and it is the operator\'s', 'fulfilled', rows.outcome)
  chk('recorded against the operator, never the participant', ids.op, rows.adjudicator)
  // And the same refusal holds sequentially, with no contention at all to explain it away.
  const after = await runTimedUser(ids.ou,
    adjudicate(ids.interest28, 'offer_owner', 'fulfilled', 'Deliverer decision.'))
  chk('the deliverer cannot adjudicate either, uncontended', '42501', after.timing?.code)
  chk('and no second adjudication was created', '1', (await adjudicationRows(ids.interest28)).n)
}

async function cleanup() {
  const r = await runSql(`
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- Obligations cascade with their agreement, and the immutability trigger early-returns for
  -- service_role, so the agreement delete is what removes them.
  -- Session 8 rows first: operator_cases cascades from providers, and its event
  -- log refuses DELETE to anyone but a privileged caller, so removing them here
  -- keeps the residue counts below testing the delete rather than the cascade.
  delete from public.operator_cases
   where requested_by_user_id in ('${ids.ou}','${ids.ru}','${ids.op}')
      or provider_id in (select id from public.providers
                          where user_id in ('${ids.ou}','${ids.ru}'))
      or report_id in (select id from public.reports
                        where reporter_user_id in ('${ids.ou}','${ids.ru}'));
  delete from public.reports where reporter_user_id in ('${ids.ou}','${ids.ru}');
  delete from public.user_blocks
   where blocker_user_id in ('${ids.ou}','${ids.ru}')
      or blocked_user_id in ('${ids.ou}','${ids.ru}');
  delete from public.bookings where user_id in ('${ids.ou}','${ids.ru}')
     or provider_id in (select id from public.providers
                         where user_id in ('${ids.ou}','${ids.ru}'));
  delete from public.messages where conversation_id = '${ids.conv}';
  delete from public.conversation where id = '${ids.conv}';
  delete from public.barter_agreement_cancellations c
   using public.barter_agreements ag
   where c.agreement_id = ag.id and ag.interest_id in (${quoted(AGREEMENT_INTERESTS)});
  -- Adjudications would cascade with the agreement anyway; deleted explicitly for the same
  -- reason cancellations are, so the residue count below is testing the delete and not the
  -- cascade. The append-only trigger permits DELETE from a privileged caller only.
  delete from public.barter_obligation_adjudications a
   using public.barter_agreements ag
   where a.agreement_id = ag.id and ag.interest_id in (${quoted(AGREEMENT_INTERESTS)});
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
  delete from auth.users where id in ('${ids.ou}','${ids.ru}','${ids.op}');
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
       (select count(*) from public.barter_obligation_no_show_reports r
          join public.barter_agreements ag on ag.id = r.agreement_id
          where ag.interest_id in (${quoted(AGREEMENT_INTERESTS)})) as no_show_reports,
       (select count(*) from public.barter_obligation_adjudications a
          join public.barter_agreements ag on ag.id = a.agreement_id
          where ag.interest_id in (${quoted(AGREEMENT_INTERESTS)})) as adjudications,
       (select count(*) from public.messages
          where conversation_id = '${ids.conv}') as messages,
       (select count(*) from public.conversation
          where id = '${ids.conv}') as conversations,
       (select count(*) from public.providers where user_id in
          ('${ids.ou}','${ids.ru}')) as providers,
       (select count(*) from auth.users
         where id in ('${ids.ou}','${ids.ru}','${ids.op}')) as users;`)
  for (const k of ['offers', 'interests', 'proposals', 'obligations', 'agreements',
    'cancellations', 'no_show_reports', 'adjudications', 'messages', 'conversations',
    'providers', 'users']) {
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
await raceDoubleNoShow()
await raceNoShowVsConfirmReceived()
await raceNoShowVsCancel()
await raceNoShowUnauthorized()
await raceAdjudicateVsConfirmReceived()
await raceAdjudicateVsNotReceived()
await raceAdjudicateVsNoShowReport()
await raceAdjudicateVsMarkDelivered()
await raceTwoOperatorsDifferentOutcomes()
await raceDuplicateAdjudication()
await raceParticipantVsOperator()

// ══ SESSION 8 — SAFETY AND OPERATOR RACES ═════════════════════════════════
//
// These are the combinations the Session 8 brief names. Each is two people acting
// at the same moment about the same relationship, where the wrong resolution
// either traps somebody in an obligation or lets somebody past a boundary.
//
// ── A NOTE ON "GENUINELY OVERLAPPED" ──────────────────────────────────────
//
// Most races in this file assert that the two RPC intervals overlapped, because
// otherwise the scenario proves nothing — a "race" that ran sequentially only
// tested the happy path twice. They can assert it because they have a CONTENTION
// POINT: a third session holds a row lock (`blockObligation`) and both racers
// block on it, so overlap is forced rather than hoped for.
//
// **Three of the scenarios below have no such point, and saying so is more honest
// than manufacturing one.** Two blocks in opposite directions are two different
// rows; a block and a booking are two different tables; two appeals contend only
// on a unique index, which cannot be held open from outside. For those, the
// interesting property was never the overlap — it is the END STATE, which is
// asserted directly and is what a duplicate or a lost write would corrupt.
//
// Where a contention point DOES exist — `operator_update_case` takes
// `select … for update` on the case row — it is used, and overlap is asserted.

/** Hold the case row so two operator calls must contend on it. */
async function blockCase(caseId) {
  return runSql(`
begin;
select id from public.operator_cases where id = '${caseId}' for update;
select pg_sleep(15);
commit;`)
}

// ── S8-1. Two people block each other at the same instant ──────────────────
//
// Both must succeed. A block is one person's own decision about their own
// contact, and there is no version of "they blocked you first" that should make
// your block fail. No contention point: these are two different rows, which is
// exactly why both must land.
async function raceMutualBlock() {
  await runSql(`delete from public.user_blocks where blocker_user_id in ('${ids.ou}','${ids.ru}');`)
  const a = `insert into public.user_blocks(blocker_user_id, blocked_user_id) values ('${ids.ou}','${ids.ru}');`
  const b = `insert into public.user_blocks(blocker_user_id, blocked_user_id) values ('${ids.ru}','${ids.ou}');`
  const [x, y] = await Promise.all([runTimedUser(ids.ou, a), runTimedUser(ids.ru, b)])
  chk('two people can block each other simultaneously; both succeed',
    'true', String(x.opOk && y.opOk))
  const n = await runSql(`select json_build_object('n', count(*)) as timing
    from public.user_blocks where blocker_user_id in ('${ids.ou}','${ids.ru}');`)
  chk('and each owns their own block row', '2', scalar(n.out, 'n'))
  const both = await runSql(`select json_build_object('n',
    public.contact_blocked('${ids.ou}','${ids.ru}')::text) as timing;`)
  chk('the pair reads as blocked from either side', 'true', scalar(both.out, 'n'))
}

// ── S8-2. The same person blocks twice at once ─────────────────────────────
//
// The unique constraint is the contract. One row, whichever attempt wins.
async function raceDuplicateBlock() {
  await runSql(`delete from public.user_blocks where blocker_user_id = '${ids.ou}' and blocked_user_id = '${ids.ru}';`)
  const stmt = `insert into public.user_blocks(blocker_user_id, blocked_user_id) values ('${ids.ou}','${ids.ru}');`
  const [x, y] = await Promise.all([runTimedUser(ids.ou, stmt), runTimedUser(ids.ou, stmt)])
  chk('a concurrent double block is safe for at least one caller',
    'true', String(x.opOk || y.opOk))
  const n = await runSql(`select json_build_object('n', count(*)) as timing
    from public.user_blocks where blocker_user_id = '${ids.ou}' and blocked_user_id = '${ids.ru}';`)
  chk('and leaves exactly one block row, never two', '1', scalar(n.out, 'n'))
}

// ── S8-3. A block landing alongside a new booking ──────────────────────────
//
// The one that decides whether blocking is real. Either order is acceptable;
// what is NOT acceptable is a block that fails because a booking was in flight,
// or a booking that survives a block that beat it.
async function raceBlockVsBooking() {
  await runSql(`
    delete from public.user_blocks where blocker_user_id = '${ids.ru}' and blocked_user_id = '${ids.ou}';
    delete from public.bookings where user_id = '${ids.ru}'
      and provider_id = (select id from public.providers where user_id = '${ids.ou}');`)
  const block = `insert into public.user_blocks(blocker_user_id, blocked_user_id) values ('${ids.ru}','${ids.ou}');`
  const book = `insert into public.bookings(user_id, provider_id, service_name, requested_date)
    values ('${ids.ru}', (select id from public.providers where user_id = '${ids.ou}'), 'race svc', current_date);`
  const [x, y] = await Promise.all([runTimedUser(ids.ru, block), runTimedUser(ids.ru, book)])
  chk('the block always succeeds — it is the actor\'s own decision', 'true', String(x.opOk))
  const n = await runSql(`select json_build_object('n', count(*)) as timing
    from public.bookings where user_id = '${ids.ru}'
      and provider_id = (select id from public.providers where user_id = '${ids.ou}');`)
  chk('the outcome is consistent: the booking either landed first or was refused',
    'true', String(['0','1'].includes(scalar(n.out, 'n'))))
  chk('and when refused it is the BLOCK code, never the eligibility one',
    'true', String(y.opOk || y.timing?.code === 'PT427'))
  // A block AFTER the fact must not retroactively remove a booking that landed.
  chk('a booking that won the race still exists — a block never deletes history',
    'true', String(!y.opOk || scalar(n.out, 'n') === '1'))
  await runSql(`
    delete from public.bookings where user_id = '${ids.ru}'
      and provider_id = (select id from public.providers where user_id = '${ids.ou}');
    delete from public.user_blocks where blocker_user_id = '${ids.ru}' and blocked_user_id = '${ids.ou}';`)
}

// ── S8-4. Two duplicate provider appeals at once ───────────────────────────
//
// The brief names duplicate appeals specifically: one live case, or an operator
// answers the same question twice.
async function raceDuplicateProviderAppeal() {
  await runSql(`
    update public.providers set is_approved = false where user_id = '${ids.ou}';
    delete from public.operator_cases
     where provider_id = (select id from public.providers where user_id = '${ids.ou}');`)
  const stmt = `perform public.request_provider_review('please look');`
  const [x, y] = await Promise.all([runTimedUser(ids.ou, stmt), runTimedUser(ids.ou, stmt)])
  chk('both appeal calls succeed — the RPC is idempotent, not first-wins',
    'true', String(x.opOk && y.opOk))
  const n = await runSql(`select json_build_object('n', count(*)) as timing
    from public.operator_cases
   where provider_id = (select id from public.providers where user_id = '${ids.ou}')
     and status in ('open','under_review');`)
  chk('and exactly ONE live appeal case exists', '1', scalar(n.out, 'n'))
  await runSql(`
    delete from public.operator_cases
     where provider_id = (select id from public.providers where user_id = '${ids.ou}');
    update public.providers set is_approved = true where user_id = '${ids.ou}';`)
}

// ── S8-5. Two operators resolving the same case at once ────────────────────
//
// This one HAS a contention point — `operator_update_case` takes the case row
// `for update` — so a third session holds it and the overlap is forced.
async function raceTwoOperatorsOneCase() {
  await runSql(`
    delete from public.operator_cases where report_id in
      (select id from public.reports where reporter_user_id = '${ids.ru}');
    delete from public.reports where reporter_user_id = '${ids.ru}';
    insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id)
    values ('${ids.ru}', 'client', 'safety_concern', '${ids.ou}');`)
  // Read the case in a SEPARATE statement: the trigger that opens it is AFTER
  // INSERT, so a CTE in the same statement cannot see its effect. The first
  // version of this race did exactly that, got a null case id, and every
  // assertion below it failed for a reason that had nothing to do with the race.
  const found = await runSql(`select json_build_object('cid', c.id) as timing
    from public.operator_cases c
    join public.reports r on r.id = c.report_id
   where r.reporter_user_id = '${ids.ru}';`)
  const caseId = scalar(found.out, 'cid')
  chk('the report opened a case the race can contend over', 'true', String(!!caseId))

  const resolve = `perform public.operator_update_case('${caseId}','resolved','${ids.op}','first');`
  const dismiss = `perform public.operator_update_case('${caseId}','dismissed','${ids.op}','second');`
  const blocker = blockCase(caseId)
  await delay(2000)
  const [x, y] = await Promise.all([
    runTimedMaintenance(resolve), runTimedMaintenance(dismiss),
  ])
  await blocker
  chk('the two operator resolutions genuinely overlapped',
    'true', String(intervalsOverlap(x.timing, y.timing)))
  chk('exactly one operator resolution wins', 'true', String(x.opOk !== y.opOk))
  const st = await runSql(`select json_build_object('s', status, 'n',
      (select count(*) from public.operator_case_events where case_id = '${caseId}')) as timing
    from public.operator_cases where id = '${caseId}';`)
  chk('the case reaches exactly one terminal state', 'true',
    String(['resolved','dismissed'].includes(scalar(st.out, 's'))))
  chk('the loser is refused rather than silently overwriting the winner',
    'true', String(x.timing?.code === 'PT412' || y.timing?.code === 'PT412'))
  // Audit: the opening plus exactly one accepted resolution.
  chk('and the audit log records the opening and one resolution, not two',
    '2', scalar(st.out, 'n'))
  await runSql(`
    delete from public.operator_cases where id = '${caseId}';
    delete from public.reports where reporter_user_id = '${ids.ru}';`)
}

await raceMutualBlock()
await raceDuplicateBlock()
await raceBlockVsBooking()
await raceDuplicateProviderAppeal()
await raceTwoOperatorsOneCase()

await cleanup()

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
