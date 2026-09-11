-- B5B suite: the PD-057 receiver-response window and PD-059 Needs Attention.
--
-- WHAT THIS SLICE IS. Derived read state only. 20261011000000 adds no column, no row, no
-- trigger, no RPC, no background job and no write path, so what is proven here is (a) the anchor
-- and deadline arithmetic, exactly, including its edges, (b) that the two views apply it against
-- the SERVER's clock and nothing else, (c) that the participant scoping and grants are unchanged
-- in strength, and (d) that no outcome vocabulary was created.
--
-- AGEING A TRADE, WITHOUT A CONTRACT-FIELD BYPASS. `due_at` must be in the FUTURE when a
-- proposal is written, so a naturally elapsed window cannot occur inside one transaction. Since
-- 20261011000000 § 3b the obligation's `due_at`/`scheduled_at` are frozen against EVERY writer
-- including `service_role`, so the fixture may NOT simply UPDATE them — and deliberately does
-- not, because a test that needed that bypass would be a test arguing against the Founder ruling
-- it is meant to protect.
--
-- Instead `pg_temp.rw_age_terms` ages the trade the only legitimate way: it moves the ACCEPTED
-- TERM's timing (`barter_proposal_terms` is append-only to end users but privileged-writable, and
-- its guard is unchanged by this slice), deletes the derived obligations, and RE-DERIVES them
-- through the real `public.create_barter_obligation_pair`. The resulting rows are produced by
-- production code from a real term and satisfy `enforce_barter_obligation_consistent`, so they
-- are exactly the rows that would exist naturally once that much time had passed.
--
-- The one synthetic step left is `pg_temp.rw_backdate_delivery`, which moves `delivered_at`
-- only. That is a LIFECYCLE column, not a contract field: the Founder ruling names the contract
-- fields, and privileged maintenance keeps its existing latitude over the three lifecycle
-- columns. It is called out here rather than buried so the boundary of what the fixture assumes
-- is visible.
--
-- Together these let every boundary be proven against the REAL VIEW, not only the calculator.
--
-- RACES. This harness runs in ONE transaction and cannot stage a race. That is not a gap that
-- needed papering over here: this slice adds no write, so there is no new race-sensitive path to
-- stage. The one interleaving that matters — a receiver answering around the deadline — is
-- proven to be decided by the ANSWER and not by the clock, because `barter_receiver_window`
-- returns `none` for an answered obligation at ANY `p_as_of`, including long past the deadline.
-- See the "an answer settles it at every instant" block below.

-- ── Fixture helpers ────────────────────────────────────────────────────────
create or replace function pg_temp.rw_due(p_days integer)
returns timestamptz language sql as $$
  select clock_timestamp() + make_interval(days => p_days)
$$;

-- One confirmed trade with controllable term timing. Returns the agreement id.
create or replace function pg_temp.rw_agreement(
  p_ou uuid, p_ru uuid, p_tag text,
  p_owner_due timestamptz, p_owner_sched timestamptz,
  p_resp_due timestamptz, p_resp_sched timestamptz
)
returns uuid
language plpgsql
as $$
declare
  v_off uuid; v_int uuid; v_pid uuid; v_vid uuid; v_ag uuid;
begin
  perform pg_temp.act_service();
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values ((select id from public.providers where user_id = p_ou), p_ou,
            'rw offering ' || p_tag, 'rw seeking ' || p_tag)
    returning id into v_off;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status)
    values (v_off, (select id from public.providers where user_id = p_ru), p_ru, 'x', 'accepted')
    returning id into v_int;
  perform pg_temp.act(p_ou);
  select public.create_barter_proposal(
    v_int,
    'rw owner gives ' || p_tag, p_owner_due, p_owner_sched,
    'rw responder gives ' || p_tag, p_resp_due, p_resp_sched
  ) into v_pid;
  perform pg_temp.act_service();
  select id into v_vid from public.barter_proposal_versions
   where proposal_id = v_pid and version_no = 1;
  perform pg_temp.act(p_ou);
  perform public.accept_barter_version(v_vid);
  perform pg_temp.act(p_ru);
  perform public.accept_barter_version(v_vid);
  perform public.finalize_barter_agreement(v_pid);
  perform pg_temp.act_service();
  select id into v_ag from public.barter_agreements where proposal_id = v_pid;
  return v_ag;
end $$;

create or replace function pg_temp.rw_of(p_agreement uuid, p_side text)
returns uuid language sql as $$
  select id from public.barter_obligations
   where agreement_id = p_agreement and side = p_side
$$;

-- Age a trade by moving its ACCEPTED TERM's timing into the past and re-deriving the obligation
-- pair from it through production code. Touches no obligation contract field directly.
--
-- Obligation ids CHANGE across this call — the old rows are deleted and new ones inserted — so a
-- caller must re-read them with `pg_temp.rw_of` afterwards, and any delivery or answer recorded
-- before the call is gone. Call it BEFORE delivering.
create or replace function pg_temp.rw_age_terms(p_agreement uuid, p_by interval)
returns void language plpgsql as $$
declare v_ver uuid;
begin
  perform pg_temp.act_service();
  select accepted_version_id into v_ver from public.barter_agreements where id = p_agreement;
  -- Shifts `created_at` with the timing, deliberately. `barter_proposal_terms` carries
  -- `due_at > created_at` and `scheduled_at > created_at` CHECK constraints, and CHECKs bind
  -- service_role too — as they should. Moving all three together keeps the row internally
  -- consistent, which is the point: the fixture must produce a row that could genuinely have
  -- existed, not one the schema would have refused.
  update public.barter_proposal_terms
     set created_at = created_at - p_by,
         due_at = due_at - p_by,
         scheduled_at = case when scheduled_at is null then null else scheduled_at - p_by end
   where version_id = v_ver;
  -- Privileged DELETE is deliberately still permitted (account erasure cascades depend on it),
  -- and the pair creator refuses a PARTIAL pair, so both rows go.
  delete from public.barter_obligations where agreement_id = p_agreement;
  perform public.create_barter_obligation_pair(p_agreement);
end $$;

-- Backdate the DELIVERY stamp only. A lifecycle column, not a contract field — see the header.
create or replace function pg_temp.rw_backdate_delivery(p_obligation uuid, p_by interval)
returns void language plpgsql as $$
begin
  perform pg_temp.act_service();
  update public.barter_obligations
     set delivered_at = delivered_at - p_by
   where id = p_obligation and delivered_at is not null;
end $$;

-- One confirmed trade whose receiver window has ALREADY CLOSED, built only through legitimate
-- paths: age the accepted term, re-derive the pair through production code, deliver through the
-- real RPC, then backdate the delivery stamp (the one lifecycle column, see the header).
--
-- Ordering matters and is the whole reason this is a helper: ageing the term re-derives the
-- obligations, so it must happen BEFORE the delivery, or the delivery is discarded with the row
-- that recorded it.
create or replace function pg_temp.rw_expired(
  p_ou uuid, p_ru uuid, p_tag text, p_by interval default interval '30 days',
  out o_ag uuid, out o_ob uuid
)
language plpgsql as $$
begin
  o_ag := pg_temp.rw_agreement(p_ou, p_ru, p_tag,
                               pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  perform pg_temp.rw_age_terms(o_ag, p_by);
  -- Re-read: the id changed when the pair was re-derived.
  o_ob := pg_temp.rw_of(o_ag, 'offer_owner');
  perform pg_temp.act(p_ou);
  perform public.mark_barter_obligation_delivered(o_ob);
  perform pg_temp.rw_backdate_delivery(o_ob, p_by);
  perform pg_temp.act_service();
end $$;

-- The window state the given caller sees for one obligation, through the real view.
create or replace function pg_temp.rw_state(p_uid uuid, p_obligation uuid)
returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act(p_uid);
  select b.receiver_window_state into v
    from public.my_barter_obligations b where b.id = p_obligation;
  perform pg_temp.act_service();
  return coalesce(v, 'NOT VISIBLE');
end $$;

do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru), (xu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'RW Owner', 'rwo_'||substr(ou::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (ru, 'RW Resp', 'rwr_'||substr(ru::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (xu, 'RW Other', 'rwx_'||substr(xu::text,1,8));
  perform set_config('b5b.rw_ou', ou::text, true);
  perform set_config('b5b.rw_ru', ru::text, true);
  perform set_config('b5b.rw_xu', xu::text, true);
  perform pg_temp.act(null, 'anon');
end $$;

-- ── 1. The anchor: the three cases the brief names ─────────────────────────
-- Proven on the pure calculator, where each input is stated exactly rather than inferred from a
-- fixture's clock. The view is proven to USE this calculator further down.
do $$
declare
  sat timestamptz := '2026-10-10 09:00+00';  -- the agreed date
  thu timestamptz := '2026-10-08 09:00+00';  -- delivered early
  sun timestamptz := '2026-10-11 09:00+00';  -- delivered late
  fri timestamptz := '2026-10-09 17:00+00';  -- a due date with no scheduled time
begin
  -- Computation runs in the harness's owner context. The fixture block above deliberately ends
  -- as `anon`, and anon has EXECUTE revoked on all three functions -- which § 11 asserts on
  -- purpose. These blocks are arithmetic assertions, not authorization ones.
  perform pg_temp.act_service();
  -- A. scheduled Saturday, delivered Thursday -> anchors on SATURDAY. An early delivery must not
  -- start the receiver's clock before the service was even due to happen.
  perform pg_temp.chk('receiver_window', 'A: early delivery anchors on scheduled_at',
    sat::text, public.barter_confirmation_anchor(thu, sat, fri + interval '2 days')::text);

  -- B. no scheduled time, due Friday, delivered Wednesday -> anchors on FRIDAY.
  perform pg_temp.chk('receiver_window', 'B: early delivery with no scheduled_at anchors on due_at',
    fri::text,
    public.barter_confirmation_anchor(fri - interval '2 days', null, fri)::text);

  -- C. due Friday, delivered Sunday -> anchors on the DELIVERY. Once delivery is the later fact
  -- it is the one that starts the window.
  perform pg_temp.chk('receiver_window', 'C: late delivery anchors on delivered_at',
    sun::text, public.barter_confirmation_anchor(sun, null, fri)::text);

  -- scheduled_at is preferred over due_at when present, per PD-057, even though the CHECK
  -- constraint guarantees it is the EARLIER of the two.
  perform pg_temp.chk('receiver_window', 'scheduled_at is preferred over due_at when present',
    sat::text,
    public.barter_confirmation_anchor(thu, sat, sat + interval '3 days')::text);

  -- No delivery, no window. NULL rather than a date, so nothing downstream can compute a
  -- deadline for an obligation nobody has delivered.
  perform pg_temp.chk('receiver_window', 'no delivery means no anchor',
    null, public.barter_confirmation_anchor(null, sat, fri)::text);
  perform pg_temp.chk('receiver_window', 'and therefore no deadline',
    null, public.barter_confirmation_deadline(null, sat, fri)::text);

  -- greatest() ignores NULLs, which would have made an undelivered obligation anchor on its due
  -- date. Pinned because the null case is decided by an explicit branch, not by greatest().
  perform pg_temp.chk('receiver_window',
    'an undelivered obligation does not fall through greatest() to its due date',
    'true', (public.barter_confirmation_anchor(null, null, fri) is null)::text);
end $$;

-- ── 2. The deadline is anchor + exactly 7 days ─────────────────────────────
do $$
declare
  sat timestamptz := '2026-10-10 09:00+00';
  fri timestamptz := '2026-10-09 17:00+00';
begin
  perform pg_temp.act_service();
  perform pg_temp.chk('receiver_window', 'deadline is the anchor plus 7 days',
    (sat + interval '7 days')::text,
    public.barter_confirmation_deadline('2026-10-08 09:00+00', sat, fri + interval '2 days')::text);
  perform pg_temp.chk('receiver_window', 'and it is 7 days, not 7 hours or 168 of anything else',
    '7 days',
    (public.barter_confirmation_deadline(sat, null, sat)
     - public.barter_confirmation_anchor(sat, null, sat))::text);
end $$;

-- ── 3. The boundary: before, exactly at, and after ────────────────────────
-- Founder ruling: Needs Attention begins at server_now >= deadline, INCLUSIVE.
do $$
declare
  d timestamptz := '2026-10-10 09:00+00';
  due timestamptz := '2026-10-10 09:00+00';
  dl timestamptz;
begin
  perform pg_temp.act_service();
  dl := public.barter_confirmation_deadline(d, null, due);
  perform pg_temp.chk('receiver_window', 'one microsecond before the deadline: not yet attention',
    'awaiting_receiver',
    public.barter_receiver_window('delivered', d, null, due, false,
                                  dl - interval '1 microsecond'));
  perform pg_temp.chk('receiver_window', 'EXACTLY at the deadline: attention (inclusive)',
    'needs_attention',
    public.barter_receiver_window('delivered', d, null, due, false, dl));
  perform pg_temp.chk('receiver_window', 'one microsecond after: still attention',
    'needs_attention',
    public.barter_receiver_window('delivered', d, null, due, false,
                                  dl + interval '1 microsecond'));
  perform pg_temp.chk('receiver_window', 'a day before: awaiting the receiver',
    'awaiting_receiver',
    public.barter_receiver_window('delivered', d, null, due, false, dl - interval '1 day'));
  perform pg_temp.chk('receiver_window', 'a year after: still only attention, never an outcome',
    'needs_attention',
    public.barter_receiver_window('delivered', d, null, due, false, dl + interval '365 days'));
end $$;

-- ── 4. What is NOT an attention state ─────────────────────────────────────
do $$
declare
  d timestamptz := '2026-10-10 09:00+00';
  late timestamptz := '2026-11-30 09:00+00';   -- long past any deadline
begin
  perform pg_temp.act_service();
  -- Undelivered: nothing is waiting on a receiver, however old the obligation is.
  perform pg_temp.chk('receiver_window', 'a pending obligation never needs attention',
    'none', public.barter_receiver_window('pending', null, null, d, false, late));

  -- An EXPLICIT answer settles it. PD-058: `not_received` is a receiver statement, and an
  -- unanswered expiry is a DIFFERENT fact — the clock must not drag an answered obligation into
  -- Needs Attention.
  perform pg_temp.chk('receiver_window', 'received prevents attention',
    'none', public.barter_receiver_window('received', d, null, d, false, late));
  perform pg_temp.chk('receiver_window',
    'not_received prevents UNANSWERED attention — an explicit statement is not silence',
    'none', public.barter_receiver_window('not_received', d, null, d, false, late));

  -- A cancelled trade does not participate at all.
  perform pg_temp.chk('receiver_window', 'a cancelled trade never needs attention',
    'none', public.barter_receiver_window('delivered', d, null, d, true, late));

  -- Fail closed on unknown inputs: withhold a state, never invent one.
  perform pg_temp.chk('receiver_window', 'an unknown cancellation flag withholds attention',
    'none', public.barter_receiver_window('delivered', d, null, d, null, late));
  perform pg_temp.chk('receiver_window', 'an unknown clock withholds attention',
    'none', public.barter_receiver_window('delivered', d, null, d, false, null));
  perform pg_temp.chk('receiver_window', 'an unknown status withholds attention',
    'none', public.barter_receiver_window(null, d, null, d, false, late));
end $$;

-- ── 5. An answer settles it at EVERY instant ──────────────────────────────
-- Stands in for the race this harness cannot stage. If an answer suppresses attention at every
-- p_as_of from well inside the window to well past it, then no interleaving of "answer commits"
-- against "another session reads the state" can produce a row that is simultaneously answered
-- and needing attention: the state is a pure function of the row, and the row is answered.
do $$
declare
  d timestamptz := '2026-10-10 09:00+00';
  dl timestamptz;
  v_bad integer;
begin
  perform pg_temp.act_service();
  dl := public.barter_confirmation_deadline(d, null, d);
  select count(*) into v_bad from (
    select public.barter_receiver_window('received', d, null, d, false, t) as s
      from generate_series(dl - interval '10 days', dl + interval '10 days',
                           interval '6 hours') as g(t)
    union all
    select public.barter_receiver_window('not_received', d, null, d, false, t)
      from generate_series(dl - interval '10 days', dl + interval '10 days',
                           interval '6 hours') as g(t)
  ) q where q.s <> 'none';
  perform pg_temp.chk('receiver_window',
    'an answered obligation is `none` at every instant across the deadline', '0', v_bad::text);

  -- And the mirror: an UNANSWERED obligation is never anything but the two live states.
  select count(*) into v_bad from (
    select public.barter_receiver_window('delivered', d, null, d, false, t) as s
      from generate_series(dl - interval '10 days', dl + interval '10 days',
                           interval '6 hours') as g(t)
  ) q where q.s not in ('awaiting_receiver', 'needs_attention');
  perform pg_temp.chk('receiver_window',
    'an unanswered delivery is only ever awaiting_receiver or needs_attention', '0', v_bad::text);
end $$;

-- ── 6. The VIEW: server clock, real rows, both roles ──────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  xu uuid := current_setting('b5b.rw_xu')::uuid;
  v_ag uuid; v_ob uuid; v_ag2 uuid; v_ob2 uuid;
  v_n integer; v_dl timestamptz; v_anchor timestamptz; v_code text;
begin
  -- Owner delivers their side; responder is the receiver of it.
  v_ag := pg_temp.rw_agreement(ou, ru, 'live', pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);

  -- BEFORE the deadline, unresolved is NOT Needs Attention.
  perform pg_temp.chk('receiver_window', 'view: before the deadline the receiver is awaited',
    'awaiting_receiver', pg_temp.rw_state(ru, v_ob));
  perform pg_temp.chk('receiver_window', 'view: and the deliverer sees the same live state',
    'awaiting_receiver', pg_temp.rw_state(ou, v_ob));

  -- The view's deadline equals the calculator's for that row: one rule, one place.
  perform pg_temp.act_service();
  select b.confirmation_deadline, b.confirmation_anchor into v_dl, v_anchor
    from public.my_barter_obligations b where b.id = v_ob;
  select count(*) into v_n from public.barter_obligations o
   where o.id = v_ob
     and public.barter_confirmation_deadline(o.delivered_at, o.scheduled_at, o.due_at) = v_dl
     and public.barter_confirmation_anchor(o.delivered_at, o.scheduled_at, o.due_at) = v_anchor;
  perform pg_temp.chk('receiver_window',
    'view: anchor and deadline come from the shared functions, not a second copy', '1', v_n::text);

  -- SERVER TIME IS AUTHORITATIVE. The view takes no parameter and reads no client value: its
  -- definition supplies now(), and there is nowhere for a device clock to enter.
  select count(*) into v_n from pg_views
   where schemaname = 'public' and viewname = 'my_barter_obligations'
     and definition like '%now()%';
  perform pg_temp.chk('receiver_window', 'view: the clock is the server''s now()', '1', v_n::text);
  select count(*) into v_n from pg_views
   where schemaname = 'public' and viewname = 'my_barter_obligations'
     and (definition ilike '%clock_timestamp()%' or definition ilike '%current_setting%');
  perform pg_temp.chk('receiver_window',
    'view: no per-row clock and no settable input decides the state', '0', v_n::text);

  -- AFTER the deadline, unresolved IS Needs Attention — on the real view. A SEPARATE trade,
  -- because ageing re-derives the obligation pair and would discard the delivery recorded above.
  select o_ag, o_ob into v_ag2, v_ob2 from pg_temp.rw_expired(ou, ru, 'expired');
  perform pg_temp.chk('receiver_window', 'view: past the deadline, unanswered needs attention',
    'needs_attention', pg_temp.rw_state(ru, v_ob2));
  perform pg_temp.chk('receiver_window', 'view: the deliverer sees it too — both are unresolved',
    'needs_attention', pg_temp.rw_state(ou, v_ob2));
  -- The aged row is a REAL row: still `delivered`, with its own past deadline.
  perform pg_temp.act_service();
  select count(*) into v_n from public.my_barter_obligations b
   where b.id = v_ob2 and b.status = 'delivered' and b.confirmation_deadline < now();
  perform pg_temp.chk('receiver_window',
    'view: and the aged row really is delivered with a past deadline', '1', v_n::text);

  -- The receiver may STILL answer after the deadline, and the answer clears the condition.
  -- STILL ANSWERABLE. The deadline means "this needs attention", not "you lost your right to
  -- answer", and the server agrees: no RPC consults it.
  v_ob := v_ob2;
  perform pg_temp.act(ru);
  begin
    perform public.confirm_barter_obligation_received(v_ob);
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'the receiver can still Confirm received after the deadline', 'OK', v_code);
  perform pg_temp.chk('receiver_window',
    'and that explicit answer clears the attention condition',
    'none', pg_temp.rw_state(ru, v_ob));
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligations
   where id = v_ob and status = 'received' and receipt_responded_at is not null;
  perform pg_temp.chk('receiver_window', 'the answer was really recorded', '1', v_n::text);
end $$;

-- ── 7. "Didn't receive" after the deadline ───────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_code text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'notrec');
  perform pg_temp.chk('receiver_window', 'unanswered and aged: needs attention',
    'needs_attention', pg_temp.rw_state(ru, v_ob));

  perform pg_temp.act(ru);
  begin
    perform public.report_barter_obligation_not_received(v_ob);
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'the receiver can still say Didn''t receive after the deadline', 'OK', v_code);
  -- An explicit statement is not an unanswered expiry. The obligation leaves the attention
  -- condition even though the window closed long ago, and the statement itself is NOT a verdict.
  perform pg_temp.chk('receiver_window',
    'an explicit not_received clears the unanswered condition',
    'none', pg_temp.rw_state(ru, v_ob));
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligations
   where id = v_ob and status = 'not_received';
  perform pg_temp.chk('receiver_window', 'and the statement stands on the row', '1', v_n::text);
end $$;

-- ── 8. Cancelled trades never enter the flow ─────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_code text;
begin
  v_ag := pg_temp.rw_agreement(ou, ru, 'cxl', pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  -- Aged FIRST, so this is a genuinely stale cancelled trade rather than one whose window simply
  -- has not opened. Nothing was delivered, so there was never anything to await.
  perform pg_temp.rw_age_terms(v_ag, interval '60 days');
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ou);
  perform public.cancel_barter_agreement(v_ag, null);
  perform pg_temp.chk('receiver_window', 'a cancelled trade shows no attention state for either',
    'none', pg_temp.rw_state(ru, v_ob));
  perform pg_temp.chk('receiver_window', 'nor for the other participant',
    'none', pg_temp.rw_state(ou, v_ob));

  -- The pre-existing mutual exclusion still holds, so a delivered+cancelled row cannot be built
  -- through any legitimate path. Restated here because the window rule depends on it.
  perform pg_temp.act(ou);
  begin
    perform public.mark_barter_obligation_delivered(v_ob);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'and a cancelled trade still cannot be delivered at all', 'PT409', v_code);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligations where id = v_ob and status = 'pending';
  perform pg_temp.chk('receiver_window', 'the cancelled trade''s obligation stayed pending',
    '1', v_n::text);
end $$;

-- ── 9. Trade Activity: role-relative state ───────────────────────────────
create or replace function pg_temp.rw_ta(p_uid uuid, p_ag uuid, p_col text)
returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.act(p_uid);
  execute format('select %I::text from public.my_trade_activity where agreement_id = %L',
                 p_col, p_ag) into v;
  perform pg_temp.act_service();
  return coalesce(v, 'NULL');
end $$;

do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  v_ag uuid; v_ob uuid; v_ag2 uuid; v_ob2 uuid;
begin
  v_ag := pg_temp.rw_agreement(ou, ru, 'ta', pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');

  -- Nothing delivered: neither side is awaited.
  perform pg_temp.chk('receiver_window', 'TA: nothing delivered, nothing awaited (owner)',
    'none', pg_temp.rw_ta(ou, v_ag, 'their_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: nothing delivered, nothing awaited (responder)',
    'none', pg_temp.rw_ta(ru, v_ag, 'my_response_state'));

  -- The OWNER delivers. The responder receives it, so it is the RESPONDER's action.
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.chk('receiver_window',
    'TA: the receiver sees it as THEIR action (my_response_state)',
    'awaiting_receiver', pg_temp.rw_ta(ru, v_ag, 'my_response_state'));
  perform pg_temp.chk('receiver_window',
    'TA: and not as something waiting on the counterparty',
    'none', pg_temp.rw_ta(ru, v_ag, 'their_response_state'));
  perform pg_temp.chk('receiver_window',
    'TA: the deliverer sees it as waiting on the OTHER side (their_response_state)',
    'awaiting_receiver', pg_temp.rw_ta(ou, v_ag, 'their_response_state'));
  perform pg_temp.chk('receiver_window',
    'TA: and the deliverer is not asked to act on it',
    'none', pg_temp.rw_ta(ou, v_ag, 'my_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: a live window carries its deadline',
    'false', (pg_temp.rw_ta(ru, v_ag, 'my_response_deadline') = 'NULL')::text);

  -- Answered: clears for both, on the live trade.
  perform pg_temp.act(ru);
  perform public.confirm_barter_obligation_received(v_ob);
  perform pg_temp.chk('receiver_window', 'TA: an explicit answer clears it for the receiver',
    'none', pg_temp.rw_ta(ru, v_ag, 'my_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: and for the deliverer',
    'none', pg_temp.rw_ta(ou, v_ag, 'their_response_state'));

  -- Past the deadline, on a separate already-expired trade: both see Needs Attention, each still
  -- on their own side of it.
  select o_ag, o_ob into v_ag2, v_ob2 from pg_temp.rw_expired(ou, ru, 'taexp');
  perform pg_temp.chk('receiver_window', 'TA: past the deadline the receiver needs attention',
    'needs_attention', pg_temp.rw_ta(ru, v_ag2, 'my_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: and so does the deliverer, on their side',
    'needs_attention', pg_temp.rw_ta(ou, v_ag2, 'their_response_state'));
  perform pg_temp.chk('receiver_window',
    'TA: and the deliverer is still not the one asked to act',
    'none', pg_temp.rw_ta(ou, v_ag2, 'my_response_state'));

  -- An explicit answer AFTER the deadline clears it there too.
  perform pg_temp.act(ru);
  perform public.confirm_barter_obligation_received(v_ob2);
  perform pg_temp.chk('receiver_window',
    'TA: a post-deadline answer clears Needs Attention for the receiver',
    'none', pg_temp.rw_ta(ru, v_ag2, 'my_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: and for the deliverer',
    'none', pg_temp.rw_ta(ou, v_ag2, 'their_response_state'));
end $$;

-- ── 10. Trade Activity on a cancelled trade ─────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  v_ag uuid;
begin
  v_ag := pg_temp.rw_agreement(ou, ru, 'tacxl', pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  perform pg_temp.act(ou);
  perform public.cancel_barter_agreement(v_ag, null);
  perform pg_temp.chk('receiver_window', 'TA: a cancelled trade asks nothing of either provider',
    'none', pg_temp.rw_ta(ru, v_ag, 'my_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: nor of the one who cancelled',
    'none', pg_temp.rw_ta(ou, v_ag, 'their_response_state'));
  -- The cancellation itself is still reported, so the client can keep it dominant.
  perform pg_temp.chk('receiver_window', 'TA: and the cancellation is still visible',
    'true', pg_temp.rw_ta(ou, v_ag, 'i_cancelled'));
end $$;

-- ── 11. Participant scoping and anon ────────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  xu uuid := current_setting('b5b.rw_xu')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_code text;
  v_c1 text; v_c2 text; v_c3 text; v_c4 text; v_c5 text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 'scope');

  -- An unrelated authenticated provider sees NOTHING — not the row, and therefore not its
  -- derived state. The view adds no WHERE clause of its own; this is
  -- barter_obligations_participant_read doing the work through security_invoker.
  perform pg_temp.chk('receiver_window', 'an unrelated provider cannot read the derived state',
    'NOT VISIBLE', pg_temp.rw_state(xu, v_ob));
  perform pg_temp.act(xu);
  select count(*) into v_n from public.my_barter_obligations;
  perform pg_temp.chk('receiver_window', 'and sees no obligation rows at all', '0', v_n::text);
  select count(*) into v_n from public.my_trade_activity where agreement_id = v_ag;
  perform pg_temp.chk('receiver_window', 'nor the trade activity row', '0', v_n::text);

  -- Both participants DO see it, so the scoping is not simply denying everyone.
  perform pg_temp.act_service();
  perform pg_temp.chk('receiver_window', 'both participants see the state (deliverer)',
    'needs_attention', pg_temp.rw_state(ou, v_ob));
  perform pg_temp.chk('receiver_window', 'both participants see the state (receiver)',
    'needs_attention', pg_temp.rw_state(ru, v_ob));

  -- anon reaches nothing: neither view, nor any of the three functions.
  --
  -- Every code is collected FIRST and asserted after the role is restored. `anon` holds no
  -- INSERT on the harness's pg_temp `_results` table, so calling `chk` while still acting as
  -- anon fails on the assertion rather than on the thing under test — which is itself a small
  -- proof that the anon role is genuinely assumed here and not merely claimed.
  perform pg_temp.act(null, 'anon');
  begin
    select count(*) into v_n from public.my_barter_obligations;
    v_c1 := 'ALLOWED';
  exception when others then v_c1 := sqlstate;
  end;
  begin
    select count(*) into v_n from public.my_trade_activity;
    v_c2 := 'ALLOWED';
  exception when others then v_c2 := sqlstate;
  end;
  begin
    perform public.barter_receiver_window('delivered', now(), null, now(), false, now());
    v_c3 := 'ALLOWED';
  exception when others then v_c3 := sqlstate;
  end;
  begin
    perform public.barter_confirmation_anchor(now(), null, now());
    v_c4 := 'ALLOWED';
  exception when others then v_c4 := sqlstate;
  end;
  begin
    perform public.barter_confirmation_deadline(now(), null, now());
    v_c5 := 'ALLOWED';
  exception when others then v_c5 := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('receiver_window', 'anon cannot read the obligation view',
    '42501', v_c1);
  perform pg_temp.chk('receiver_window', 'anon cannot read trade activity', '42501', v_c2);
  perform pg_temp.chk('receiver_window', 'anon cannot call the window function',
    '42501', v_c3);
  perform pg_temp.chk('receiver_window', 'anon cannot call the anchor function',
    '42501', v_c4);
  perform pg_temp.chk('receiver_window', 'anon cannot call the deadline function',
    '42501', v_c5);
end $$;

-- ── 12. The view is not a write path ────────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_code text;
begin
  v_ag := pg_temp.rw_agreement(ou, ru, 'noweb', pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  -- Needs Attention must not create a write bypass.
  --
  -- THE REFUSAL IS ASSERTED AS "REFUSED", NOT AS ONE SQLSTATE, AND THAT CHANGE IS DELIBERATE.
  -- Until `20261027000000` this view was a simple select over one table, so it was AUTO-UPDATABLE
  -- and the only thing refusing a write was the grant — `42501`. Computing the suppression
  -- predicate once added a lateral join, and a view that does not select from a single table is
  -- not auto-updatable at all, so the rewriter now refuses first with `55000`.
  --
  -- That is STRICTLY STRONGER: the write is structurally impossible rather than merely
  -- unprivileged, and both refusals are in force. Pinning the exact code would have made this
  -- test fail for a security IMPROVEMENT, so it pins the property that actually matters — no
  -- write reaches the table through this view — and the grant posture is asserted separately
  -- below so the older guarantee cannot lapse unnoticed if the view ever becomes simple again.
  perform pg_temp.act(ru);
  begin
    update public.my_barter_obligations set status = 'received' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('receiver_window', 'no UPDATE through the obligation view',
    'REFUSED', v_code);
  begin
    insert into public.my_barter_obligations(id) values (gen_random_uuid());
    v_code := 'ALLOWED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('receiver_window', 'no INSERT through the obligation view',
    'REFUSED', v_code);
  begin
    delete from public.my_barter_obligations where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('receiver_window', 'no DELETE through the obligation view',
    'REFUSED', v_code);
  -- THE GRANT-LEVEL GUARANTEE, kept explicit now that the structural one fires first. Without
  -- this, a future migration simplifying the view back to one table would silently restore
  -- auto-updatability and nothing here would notice whether the grants still refused.
  perform pg_temp.chk('receiver_window',
    'and authenticated still holds NO write privilege on the obligation view',
    'false',
    (has_table_privilege('authenticated', 'public.my_barter_obligations', 'insert')
     or has_table_privilege('authenticated', 'public.my_barter_obligations', 'update')
     or has_table_privilege('authenticated', 'public.my_barter_obligations', 'delete'))::text);
  -- AND THE PROPERTY WHOSE SILENT LOSS WOULD BE CATASTROPHIC. `my_barter_obligations` is
  -- security_invoker, so it is the CALLER's RLS that scopes every row it returns. Recreated
  -- without that option it would run as its postgres owner and hand every provider every other
  -- provider's obligations — a total read bypass, with no error anywhere. `my_trade_activity`
  -- has been pinned this way since it shipped; this view never was, and `20261027000000` had to
  -- drop and recreate it, which is exactly when an option gets lost.
  perform pg_temp.chk('receiver_window', 'the obligation view is security_invoker',
    'true',
    (select coalesce(array_to_string(reloptions, ',') like '%security_invoker=true%', false)
       from pg_class where oid = 'public.my_barter_obligations'::regclass)::text);
  perform pg_temp.chk('receiver_window', 'and anon cannot read it at all',
    'false', has_table_privilege('anon', 'public.my_barter_obligations', 'select')::text);
  -- And the underlying table is still SELECT-only for participants: the view changed nothing
  -- about the table's own posture.
  begin
    update public.barter_obligations set status = 'received' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'and still no direct write to the table',
    '42501', v_code);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligations where id = v_ob and status = 'pending';
  perform pg_temp.chk('receiver_window', 'and none of those attempts changed the row',
    '1', v_n::text);
end $$;

-- ── 13. Object posture ──────────────────────────────────────────────────
do $$
declare v_n integer;
begin
  -- security_invoker on BOTH views: the participant policy is the scoping, not a copy of it.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('my_barter_obligations', 'my_trade_activity')
     and c.relkind = 'v'
     -- The VALUE, not merely the key. `like '%security_invoker=%'` also passes for
     -- `security_invoker=false` — a view that runs as its postgres OWNER and therefore bypasses
     -- `barter_obligations_participant_read` entirely. That is the exact regression this
     -- assertion exists to catch, so it must not be the one shape it cannot see.
     and array_to_string(c.reloptions, ',') ilike '%security_invoker=true%';
  perform pg_temp.chk('receiver_window', 'both views are security_invoker=true', '2', v_n::text);

  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('my_barter_obligations', 'my_trade_activity')
     and pg_get_userbyid(c.relowner) = 'postgres';
  perform pg_temp.chk('receiver_window', 'and both are postgres-owned', '2', v_n::text);

  -- All three: search_path pinned, postgres-owned, and NOT definer — they hold no authority, so
  -- definer would grant reach they have no use for.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('barter_confirmation_anchor', 'barter_confirmation_deadline',
                       'barter_receiver_window')
     and not p.prosecdef
     and pg_get_userbyid(p.proowner) = 'postgres'
     -- Again the VALUE: `search_path=public` is a pinned search_path and a hijackable one.
     -- These functions pin the EMPTY path, which is what makes every reference in them
     -- schema-qualified by necessity. Tested as an ARRAY ELEMENT rather than by equality on the
     -- joined string, because `barter_confirmation_deadline` legitimately carries a second
     -- setting (`TimeZone=UTC`) alongside it.
     and 'search_path=""' = any(p.proconfig);
  perform pg_temp.chk('receiver_window',
    'all three functions are invoker-rights, postgres-owned and search_path pinned to the empty path',
    '3', v_n::text);

  -- VOLATILITY IS DECLARED HONESTLY, per function. `timestamptz + interval` is the STABLE
  -- operator `timestamptz_pl_interval`, so anything doing calendar arithmetic must be STABLE;
  -- claiming IMMUTABLE would be a promise to the planner that PostgreSQL does not verify at
  -- CREATE FUNCTION and would therefore fail silently. Asserted per function rather than in
  -- aggregate, so the two cannot be confused for each other.
  perform pg_temp.chk('receiver_window',
    'the anchor is genuinely IMMUTABLE — case/greatest/coalesce only', 'i',
    (select p.provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'barter_confirmation_anchor'));
  perform pg_temp.chk('receiver_window',
    'the deadline is STABLE, not IMMUTABLE — it does calendar arithmetic', 's',
    (select p.provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'barter_confirmation_deadline'));
  perform pg_temp.chk('receiver_window',
    'and the window is STABLE, because it calls the deadline', 's',
    (select p.provolatile::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'barter_receiver_window'));

  -- THE DEADLINE IS ONE INSTANT FOR EVERYBODY. The timezone is pinned in the function's own
  -- config, so a role-level `alter role ... set TimeZone`, a db-pre-request hook or a psql
  -- session cannot move the boundary — which would otherwise let the two participants of one
  -- trade disagree by up to an hour about whether it needs attention.
  perform pg_temp.chk('receiver_window',
    'the deadline pins its timezone, so both participants compute the same instant', 'true',
    (select (array_to_string(p.proconfig, ',') ilike '%timezone=utc%')::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'barter_confirmation_deadline'));

  -- And prove it behaves that way, not merely that it is configured that way: the same row read
  -- under two session timezones that straddle a DST transition must yield the identical instant.
  declare
    v_a timestamptz; v_b timestamptz;
  begin
    set local timezone = 'UTC';
    v_a := public.barter_confirmation_deadline(
             '2026-03-04 12:00+00', null, '2026-03-04 12:00+00');
    set local timezone = 'America/Chicago';
    v_b := public.barter_confirmation_deadline(
             '2026-03-04 12:00+00', null, '2026-03-04 12:00+00');
    set local timezone = 'UTC';
    perform pg_temp.chk('receiver_window',
      'the deadline is identical across a DST-straddling session timezone', 'true',
      (v_a = v_b)::text);
  end;

  -- They read no table, so they cannot be an existence oracle.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('barter_confirmation_anchor', 'barter_confirmation_deadline',
                       'barter_receiver_window')
     and (p.prosrc ilike '%barter_obligations%' or p.prosrc ilike '%barter_agreements%'
          or p.prosrc ilike '%auth.uid%');
  perform pg_temp.chk('receiver_window',
    'and none of them reads a table or the caller identity', '0', v_n::text);

  -- authenticated needs EXECUTE because the views are security_invoker.
  perform pg_temp.chk('receiver_window', 'authenticated may execute the window function', 'true',
    has_function_privilege('authenticated',
      'public.barter_receiver_window(text,timestamptz,timestamptz,timestamptz,boolean,timestamptz)',
      'execute')::text);
  perform pg_temp.chk('receiver_window', 'anon may not', 'false',
    has_function_privilege('anon',
      'public.barter_receiver_window(text,timestamptz,timestamptz,timestamptz,boolean,timestamptz)',
      'execute')::text);
end $$;

-- ── 14. Zero residue: nothing this slice must not have created ──────────
do $$
declare v_n integer;
begin
  -- No column was added anywhere. The window is derived, so a deadline, attention flag or
  -- outcome column would be a second, drifting copy of the truth.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_obligations'
     and column_name not in ('id','agreement_id','source_term_id','side','deliverer_provider_id',
       'deliverer_user_id','receiver_provider_id','receiver_user_id','agreed_description',
       'due_at','scheduled_at','created_at','status','delivered_at','receipt_responded_at');
  perform pg_temp.chk('receiver_window', 'no column was added to barter_obligations',
    '0', v_n::text);

  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name in ('barter_obligations','barter_agreements')
     and (column_name ilike '%needs_attention%' or column_name ilike '%deadline%'
          or column_name ilike '%outcome%' or column_name ilike '%expire%'
          or column_name ilike '%timeout%' or column_name ilike '%review%');
  perform pg_temp.chk('receiver_window',
    'no persisted deadline, attention, outcome, expiry, timeout or review column', '0', v_n::text);

  -- The status vocabulary is UNCHANGED. Needs Attention is not a status.
  select count(*) into v_n from pg_constraint
   where conname = 'barter_obligations_status_check'
     and pg_get_constraintdef(oid) like '%pending%delivered%received%not_received%'
     and pg_get_constraintdef(oid) not ilike '%needs_attention%'
     and pg_get_constraintdef(oid) not ilike '%under_review%'
     and pg_get_constraintdef(oid) not ilike '%fulfilled%'
     and pg_get_constraintdef(oid) not ilike '%completed%'
     and pg_get_constraintdef(oid) not ilike '%no_show%';
  perform pg_temp.chk('receiver_window',
    'the four-value status vocabulary is unchanged — attention is not a status', '1', v_n::text);

  -- No new function that adjudicates, completes, expires or reviews anything.
  --
  -- `%no_show%` and `%under_review%` were part of this list until 20261012000000, which added
  -- receiver-reported no-shows and the DERIVED Under Review state by Founder ruling. They are
  -- named explicitly below rather than dropped from the sweep, so the exemption is exactly five
  -- known objects and a SIXTH would still fail here. Everything else stays forbidden: an
  -- elapsed window must still create no outcome, and Under Review is not one.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname ilike '%no_show%' or p.proname ilike '%adjudicat%'
          or p.proname ilike '%under_review%' or p.proname ilike '%fulfil%'
          or p.proname ilike '%expire%' or p.proname ilike '%timeout%'
          or p.proname ilike '%dispute%' or p.proname ilike '%complete_barter%')
     and p.proname not in ('report_barter_obligation_no_show',
                           'barter_obligation_under_review',
                           'barter_can_report_no_show',
                           'enforce_barter_no_show_append_only',
                           'enforce_barter_no_show_consistent',
                           -- The three objects 20261019000000 added, exempted BY NAME for the
                           -- same reason as the no-show five: adjudication is now ruled in, and
                           -- a fourth adjudication-shaped function still has to be deliberate.
                           'adjudicate_barter_obligation',
                           'enforce_barter_adjudication_append_only',
                           'enforce_barter_adjudication_consistent',
                           -- Reviews Phase 2, PM ruling on disputes:
                           -- `stamp_under_review_at` trips the `%under_review%`
                           -- sweep and is not barter machinery — it stamps
                           -- `bookings.under_review_at`, the instant a BOOKING
                           -- dispute hold opened, which is what stops filing a
                           -- dispute from retracting an already-public review.
                           -- The assertion below proves it reads no barter object.
                           'stamp_under_review_at');
  perform pg_temp.chk('receiver_window',
    'no fulfilment, expiry, timeout or dispute function beyond the ruled no-show and adjudication',
    '0', v_n::text);
  -- The exemption above is only safe if the function it names really does live in
  -- the booking domain. Asserted rather than asserted-in-a-comment, so a later
  -- rewrite that reached into a barter table under the same name fails here.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'stamp_under_review_at'
     and p.prosrc ~* 'barter';
  perform pg_temp.chk('receiver_window',
    'and the exempted booking dispute-hold stamp reads no barter object', '0', v_n::text);

  -- No trigger and no scheduled job to flip rows at a deadline. The state is derived; a job
  -- would be a second source of truth that could disagree with the timestamps.
  select count(*) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'barter_obligations' and not t.tgisinternal
     and t.tgname not in ('barter_obligations_immutable','barter_obligations_consistent',
                          'barter_obligations_starts_pending');
  perform pg_temp.chk('receiver_window', 'no new trigger on barter_obligations', '0', v_n::text);

  select count(*) into v_n from pg_extension where extname in ('pg_cron', 'pgagent');
  perform pg_temp.chk('receiver_window', 'no scheduler extension was installed', '0', v_n::text);

  -- No obligation reached an answered state without a receiver acting. The clock cannot write.
  select count(*) into v_n from public.barter_obligations
   where status in ('received','not_received') and receipt_responded_at is null;
  perform pg_temp.chk('receiver_window',
    'nothing became received or not_received without a recorded answer', '0', v_n::text);

  -- And nothing was auto-completed or auto-fulfilled: every answered row was answered by an RPC,
  -- so an aged, unanswered obligation is still `delivered` on the table.
  select count(*) into v_n from public.barter_obligations o
   where o.status = 'delivered'
     and public.barter_confirmation_deadline(o.delivered_at, o.scheduled_at, o.due_at) < now();
  perform pg_temp.chk('receiver_window',
    'an expired window leaves the row `delivered` — no automatic Fulfilled or Completed',
    'true', (v_n > 0)::text);
end $$;

-- ── 14b. The agreed trade is frozen against service_role too (Founder ruling) ──
-- The core obligation contract fields must not be silently rewritten after the agreement exists,
-- by ANY writer. This is the assertion the ageing fixture above deliberately does not rely on:
-- if this section passed while `rw_age_terms` still UPDATEd `barter_obligations.due_at`, the
-- suite would be arguing with itself.
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  xu uuid := current_setting('b5b.rw_xu')::uuid;
  v_ag uuid; v_ob uuid; v_code text; v_n integer; v_before jsonb; v_after jsonb;
begin
  v_ag := pg_temp.rw_agreement(ou, ru, 'frozen',
                               pg_temp.rw_due(7), pg_temp.rw_due(5), pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act_service();
  select to_jsonb(o) into v_before from public.barter_obligations o where o.id = v_ob;

  -- Every contract field, one at a time, AS service_role. Each must be refused.
  begin
    update public.barter_obligations set due_at = due_at - interval '30 days' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'service_role cannot move due_at — the PD-057 anchor is not rewritable', '23514', v_code);

  begin
    update public.barter_obligations set scheduled_at = scheduled_at - interval '30 days'
     where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'service_role cannot move scheduled_at',
    '23514', v_code);

  begin
    update public.barter_obligations set receiver_user_id = xu where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'service_role cannot reassign the receiver — the read scoping key is not rewritable',
    '23514', v_code);

  begin
    update public.barter_obligations set deliverer_user_id = xu where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'service_role cannot reassign the deliverer',
    '23514', v_code);

  begin
    update public.barter_obligations
       set receiver_provider_id = (select id from public.providers where user_id = xu)
     where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'service_role cannot reassign the receiving provider',
    '23514', v_code);

  begin
    update public.barter_obligations
       set deliverer_provider_id = (select id from public.providers where user_id = xu)
     where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'service_role cannot reassign the delivering provider',
    '23514', v_code);

  begin
    update public.barter_obligations set agreed_description = 'rewritten' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'service_role cannot rewrite the agreed description', '23514', v_code);

  begin
    update public.barter_obligations set side = 'responder' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'service_role cannot flip the side', '23514', v_code);

  begin
    update public.barter_obligations set agreement_id = gen_random_uuid() where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'service_role cannot move it to another agreement',
    '23514', v_code);

  begin
    update public.barter_obligations set source_term_id = gen_random_uuid() where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'service_role cannot repoint the source term',
    '23514', v_code);

  -- The no-JWT maintenance path is the OTHER disjunct of the old bypass, and is bound too.
  perform pg_temp.act(null, 'authenticated');
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('role', 'none', true);
  begin
    update public.barter_obligations set due_at = due_at - interval '30 days' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'and neither can the no-JWT maintenance path — both disjuncts are bound', '23514', v_code);

  -- Nothing above changed a single byte of the agreed trade.
  perform pg_temp.act_service();
  select to_jsonb(o) into v_after from public.barter_obligations o where o.id = v_ob;
  perform pg_temp.chk('receiver_window',
    'and the obligation row is byte-identical after every attempt', 'true',
    (v_before is not distinct from v_after)::text);

  -- WHAT IS STILL PERMITTED, so this is a narrowing and not a lockout. The three lifecycle
  -- columns keep their previous privileged latitude (the Founder ruling names the contract
  -- fields), which is what maintenance and the ageing fixture above rely on.
  begin
    update public.barter_obligations set status = 'delivered', delivered_at = clock_timestamp()
     where id = v_ob;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'a privileged lifecycle write is still permitted — this is a narrowing, not a lockout',
    'OK', v_code);

  -- Privileged DELETE is still permitted, deliberately: every auth.users and barter_agreements
  -- FK here is ON DELETE CASCADE, so account erasure removes obligations as a privileged
  -- cascade. Tightening this would break a capability two earlier migrations preserved.
  begin
    delete from public.barter_obligations where agreement_id = v_ag;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window',
    'privileged DELETE still works, so account erasure is not broken', 'OK', v_code);
  select count(*) into v_n from public.barter_obligations where agreement_id = v_ag;
  perform pg_temp.chk('receiver_window', 'and both rows went', '0', v_n::text);

  -- An ordinary participant still cannot write anything at all: the grant, not the trigger, is
  -- their outer wall, and neither changed.
  v_ag := pg_temp.rw_agreement(ou, ru, 'frozen2',
                               pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ru);
  begin
    update public.barter_obligations set due_at = due_at - interval '1 day' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'a participant cannot move due_at either',
    '42501', v_code);
  perform pg_temp.act_service();
end $$;

-- ── 14c. The participant sets the two read policies scope on cannot diverge ──
-- The window's cancellation input is `exists(...)` over barter_agreement_cancellations, whose
-- read policy scopes on the AGREEMENT's participants, while the obligation's read policy scopes
-- on the OBLIGATION's. Those are different columns, and the view's correctness depends on them
-- naming the same two people. 14b is what makes that structural; this asserts it directly.
do $$
declare v_n integer;
begin
  perform pg_temp.act_service();
  select count(*) into v_n
    from public.barter_obligations o
    join public.barter_agreements ag on ag.id = o.agreement_id
   where o.deliverer_user_id not in (ag.owner_user_id, ag.responder_user_id)
      or o.receiver_user_id  not in (ag.owner_user_id, ag.responder_user_id)
      or o.deliverer_user_id = o.receiver_user_id;
  perform pg_temp.chk('receiver_window',
    'every obligation names exactly the two people its agreement names', '0', v_n::text);

  -- And each participant is the deliverer of exactly one and the receiver of exactly one, which
  -- is what makes my_response_* / their_response_* scalar reads rather than aggregates.
  select count(*) into v_n from (
    select o.agreement_id, o.receiver_user_id, count(*) as c
      from public.barter_obligations o
     group by o.agreement_id, o.receiver_user_id
    having count(*) <> 1
  ) q;
  perform pg_temp.chk('receiver_window',
    'and receives exactly one obligation per agreement — so the lateral joins are scalar',
    '0', v_n::text);
  select count(*) into v_n from (
    select o.agreement_id, o.deliverer_user_id, count(*) as c
      from public.barter_obligations o
     group by o.agreement_id, o.deliverer_user_id
    having count(*) <> 1
  ) q;
  perform pg_temp.chk('receiver_window', 'and delivers exactly one', '0', v_n::text);
end $$;

-- ── 15. The receiver RPCs were not touched ──────────────────────────────
do $$
declare v_n integer;
begin
  -- Neither receiver answer consults a deadline. This is what makes "you may still answer" true
  -- at the server rather than only in the copy.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('record_barter_obligation_receipt', 'confirm_barter_obligation_received',
                       'report_barter_obligation_not_received', 'mark_barter_obligation_delivered')
     and (p.prosrc ilike '%confirmation_deadline%' or p.prosrc ilike '%7 days%'
          or p.prosrc ilike '%needs_attention%' or p.prosrc ilike '%receiver_window%');
  perform pg_temp.chk('receiver_window',
    'no obligation RPC consults the deadline or the window state', '0', v_n::text);
end $$;

-- ── SUPPRESSION IS ONE EXPRESSION, AND THE PARAMETER SAYS WHAT IT MEANS ────
--
-- `20261020000000` fed `cancelled OR adjudicated` into three derived functions so the rule was
-- applied once — but SPELLED IT OUT three times inside a view that must be restated in full on
-- every change. Adding a fourth suppressor then means editing three identical expressions, and
-- editing two of three produces the exact failure that migration was written against: the read
-- model saying "Under Review" while the record says "unfulfilled". This graph has already had
-- one silent copy-forward revert, so the hazard is demonstrated rather than hypothetical.
--
-- `20261027000000` computes it once in a lateral. These assertions read the LIVE view definition
-- so a future restatement that re-inlines the predicate fails here instead of being noticed by
-- eye — the same reason the append-only trigger's predicate is pinned by source text.
do $$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_viewdef('public.my_barter_obligations'::regclass, true);

  -- ALL THREE DEDUPLICATIONS ARE COUNTED, not just the first. A partial re-inline that moved
  -- cancellation into the lateral but spelled the adjudication half out at each call site would
  -- have passed a cancellation-only assertion, which is the shape of the defect being guarded.
  -- Each expected count is named so a deliberate change reads as deliberate.
  select count(*) into v_n from regexp_matches(
    lower(v_def), 'from barter_agreement_cancellations', 'g');
  perform pg_temp.chk('receiver_window',
    'cancellations are read ONCE — only the lateral needs them',
    '1', v_n::text);

  -- THREE for adjudications: the lateral's suppression test, plus the two scalar subqueries that
  -- select DIFFERENT columns (terminal_outcome, adjudicated_at). Those two are not duplication —
  -- they fetch values, not the predicate.
  select count(*) into v_n from regexp_matches(
    lower(v_def), 'from barter_obligation_adjudications', 'g');
  perform pg_temp.chk('receiver_window',
    'adjudications are read exactly three times: the lateral, terminal_outcome, adjudicated_at',
    '3', v_n::text);

  -- THREE for no-show reports, for the same reason: the lateral's `no_show_reported` plus
  -- no_show_reported_at and no_show_reason.
  select count(*) into v_n from regexp_matches(
    lower(v_def), 'from barter_obligation_no_show_reports', 'g');
  perform pg_temp.chk('receiver_window',
    'no-show reports are read exactly three times: the lateral, the timestamp, the reason',
    '3', v_n::text);

  -- And the lateral itself still exists — without it the counts above could be met by a view
  -- that simply dropped a column.
  perform pg_temp.chk('receiver_window',
    'the suppression lateral is present',
    'true', (position('suppressed' in lower(v_def)) > 0)::text);

  -- And every derived column is still PRODUCED. Checked as ` as <name>` so the assertion cannot
  -- be satisfied by the function name barter_obligation_under_review merely appearing in a call.
  perform pg_temp.chk('receiver_window',
    'and all three derived columns are still produced',
    'true',
    (position(' as receiver_window_state' in lower(v_def)) > 0
     and position(' as under_review' in lower(v_def)) > 0
     and position(' as can_report_no_show' in lower(v_def)) > 0)::text);
end $$;

-- THE PARAMETER NAME. `p_trade_cancelled` carried "cancelled OR has-a-terminal-outcome" for six
-- migrations, which is a name that lies about what the value means — and these three functions
-- CANNOT distinguish a cancelled trade from a resolved one, so an editor who believed the name
-- would apply cancellation copy to every adjudicated obligation. Renamed by `20261027000000`.
-- Pinned by name, because `create or replace function` cannot rename a parameter: reverting this
-- requires a deliberate drop-and-recreate, and it should fail here when someone does it.
do $$
declare v_n integer;
begin
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('barter_receiver_window', 'barter_obligation_under_review',
                       'barter_can_report_no_show')
     and 'p_suppressed' = any (p.proargnames);
  perform pg_temp.chk('receiver_window',
    'all three derived-state helpers take p_suppressed, not p_trade_cancelled',
    '3', v_n::text);

  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and 'p_trade_cancelled' = any (p.proargnames);
  perform pg_temp.chk('receiver_window',
    'and the misleading old name is gone from every function in the schema',
    '0', v_n::text);

  -- The rename required a DROP, which is where a grant or an owner gets lost. Re-pinned here.
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('barter_receiver_window', 'barter_obligation_under_review',
                       'barter_can_report_no_show')
     and pg_get_userbyid(p.proowner) = 'postgres'
     -- THE EMPTY search_path BY ARRAY MEMBERSHIP, not a `like '%search_path=%'` substring. That
     -- weaker form is satisfied by `search_path=public`, which is pinned AND hijackable — the
     -- distinction this suite already makes for barter_receiver_window and must make for all
     -- three, since the rename dropped and recreated every one of them.
     and 'search_path=""' = any (p.proconfig)
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not has_function_privilege('anon', p.oid, 'execute');
  perform pg_temp.chk('receiver_window',
    'and all three kept owner, an EMPTY search_path, the authenticated grant and no anon grant',
    '3', v_n::text);
end $$;
