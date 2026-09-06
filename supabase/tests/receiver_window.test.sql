-- B5B suite: the PD-057 receiver-response window and PD-059 Needs Attention.
--
-- WHAT THIS SLICE IS. Derived read state only. 20261011000000 adds no column, no row, no
-- trigger, no RPC, no background job and no write path, so what is proven here is (a) the anchor
-- and deadline arithmetic, exactly, including its edges, (b) that the two views apply it against
-- the SERVER's clock and nothing else, (c) that the participant scoping and grants are unchanged
-- in strength, and (d) that no outcome vocabulary was created.
--
-- AGEING A TRADE. `due_at` must be in the FUTURE when a proposal is written, so a naturally
-- past deadline cannot occur inside one transaction. The fixtures below therefore AGE a trade as
-- `service_role`, which is legitimate rather than a trick: `enforce_barter_obligations_immutable`
-- returns early for `service_role` (20261004000000 line 96) and
-- `enforce_barter_obligation_consistent` is a BEFORE INSERT trigger only, so a service-role
-- UPDATE of the timing columns is permitted by design. Every CHECK constraint still applies.
-- This lets every boundary be proven against the REAL VIEW, not only against the calculator.
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

-- Move an obligation's timing into the past, as service_role. Keeps
-- `barter_obligations_scheduled_before_due` satisfied by shifting both columns together.
create or replace function pg_temp.rw_age(p_obligation uuid, p_by interval)
returns void language plpgsql as $$
begin
  perform pg_temp.act_service();
  update public.barter_obligations
     set due_at = due_at - p_by,
         scheduled_at = case when scheduled_at is null then null else scheduled_at - p_by end,
         delivered_at = case when delivered_at is null then null else delivered_at - p_by end
   where id = p_obligation;
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
  dl timestamptz := public.barter_confirmation_deadline(d, null, due);
begin
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
  dl timestamptz := public.barter_confirmation_deadline(d, null, d);
  v_bad integer;
begin
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
  v_ag uuid; v_ob uuid; v_n integer; v_dl timestamptz; v_anchor timestamptz; v_code text;
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

  -- AFTER the deadline, unresolved IS Needs Attention — on the real view.
  perform pg_temp.rw_age(v_ob, interval '30 days');
  perform pg_temp.chk('receiver_window', 'view: past the deadline, unanswered needs attention',
    'needs_attention', pg_temp.rw_state(ru, v_ob));
  perform pg_temp.chk('receiver_window', 'view: the deliverer sees it too — both are unresolved',
    'needs_attention', pg_temp.rw_state(ou, v_ob));

  -- The receiver may STILL answer after the deadline, and the answer clears the condition.
  -- STILL ANSWERABLE. The deadline means "this needs attention", not "you lost your right to
  -- answer", and the server agrees: no RPC consults it.
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
  v_ag := pg_temp.rw_agreement(ou, ru, 'notrec', pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.rw_age(v_ob, interval '30 days');
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
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ou);
  perform public.cancel_barter_agreement(v_ag, null);
  -- Nothing was delivered, so nothing could be awaited; ageing it changes nothing.
  perform pg_temp.rw_age(v_ob, interval '60 days');
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
  v_ag uuid; v_ob uuid;
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

  -- Aged: both see Needs Attention, still on their own side of it.
  perform pg_temp.rw_age(v_ob, interval '30 days');
  perform pg_temp.chk('receiver_window', 'TA: past the deadline the receiver needs attention',
    'needs_attention', pg_temp.rw_ta(ru, v_ag, 'my_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: and so does the deliverer, on their side',
    'needs_attention', pg_temp.rw_ta(ou, v_ag, 'their_response_state'));

  -- Answered: clears for both.
  perform pg_temp.act(ru);
  perform public.confirm_barter_obligation_received(v_ob);
  perform pg_temp.chk('receiver_window', 'TA: an explicit answer clears it for the receiver',
    'none', pg_temp.rw_ta(ru, v_ag, 'my_response_state'));
  perform pg_temp.chk('receiver_window', 'TA: and for the deliverer',
    'none', pg_temp.rw_ta(ou, v_ag, 'their_response_state'));
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
begin
  v_ag := pg_temp.rw_agreement(ou, ru, 'scope', pg_temp.rw_due(7), null, pg_temp.rw_due(8), null);
  v_ob := pg_temp.rw_of(v_ag, 'offer_owner');
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_ob);
  perform pg_temp.rw_age(v_ob, interval '30 days');

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
  perform pg_temp.act(null, 'anon');
  begin
    select count(*) into v_n from public.my_barter_obligations;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'anon cannot read the obligation view',
    '42501', v_code);
  begin
    select count(*) into v_n from public.my_trade_activity;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'anon cannot read trade activity', '42501', v_code);
  begin
    perform public.barter_receiver_window('delivered', now(), null, now(), false, now());
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'anon cannot call the window function',
    '42501', v_code);
  begin
    perform public.barter_confirmation_anchor(now(), null, now());
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'anon cannot call the anchor function',
    '42501', v_code);
  begin
    perform public.barter_confirmation_deadline(now(), null, now());
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'anon cannot call the deadline function',
    '42501', v_code);
  perform pg_temp.act_service();
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
  -- Needs Attention must not create a write bypass. A simple view over one table is
  -- auto-updatable unless the grants say otherwise, and these do.
  perform pg_temp.act(ru);
  begin
    update public.my_barter_obligations set status = 'received' where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'no UPDATE through the obligation view',
    '42501', v_code);
  begin
    insert into public.my_barter_obligations(id) values (gen_random_uuid());
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'no INSERT through the obligation view',
    '42501', v_code);
  begin
    delete from public.my_barter_obligations where id = v_ob;
    v_code := 'ALLOWED';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('receiver_window', 'no DELETE through the obligation view',
    '42501', v_code);
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
     and array_to_string(c.reloptions, ',') like '%security_invoker=%';
  perform pg_temp.chk('receiver_window', 'both views are security_invoker', '2', v_n::text);

  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('my_barter_obligations', 'my_trade_activity')
     and pg_get_userbyid(c.relowner) = 'postgres';
  perform pg_temp.chk('receiver_window', 'and both are postgres-owned', '2', v_n::text);

  -- The three functions: IMMUTABLE, search_path pinned, postgres-owned, and NOT definer — they
  -- hold no authority, so definer would grant reach they have no use for.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('barter_confirmation_anchor', 'barter_confirmation_deadline',
                       'barter_receiver_window')
     and p.provolatile = 'i'
     and not p.prosecdef
     and pg_get_userbyid(p.proowner) = 'postgres'
     and array_to_string(p.proconfig, ',') like '%search_path=%';
  perform pg_temp.chk('receiver_window',
    'all three functions are immutable, invoker-rights, owned and search_path pinned',
    '3', v_n::text);

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
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname ilike '%no_show%' or p.proname ilike '%adjudicat%'
          or p.proname ilike '%under_review%' or p.proname ilike '%fulfil%'
          or p.proname ilike '%expire%' or p.proname ilike '%timeout%'
          or p.proname ilike '%dispute%' or p.proname ilike '%complete_barter%');
  perform pg_temp.chk('receiver_window',
    'no no-show, adjudication, review, fulfilment, expiry, timeout or dispute function',
    '0', v_n::text);

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
