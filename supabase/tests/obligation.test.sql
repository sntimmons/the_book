-- B5B suite: obligation delivery and receiver confirmation.
--
-- Every assertion exercises real DB enforcement as the `authenticated` role. This harness runs
-- in ONE transaction and cannot stage a race; the races are proven by
-- scripts/negotiation-concurrency.mjs. What is pinned here is every invariant a race could
-- violate, plus the security posture of every object 20261004000000 created or redefined.
--
-- The suite also pins what the DELIVERY slice must NOT have added: no no-show, no adjudication,
-- no obligation-level cancellation, and no vocabulary beyond the four states delivery and
-- receipt can actually produce. Pre-delivery cancellation of the AGREEMENT arrived later, in
-- 20261005000000, and is pinned by supabase/tests/cancellation.test.sql — see the note on the
-- scope pin near the end of this file for how that assertion was aged.

create or replace function pg_temp.ob_due(p_days integer)
returns timestamptz
language sql
as $$
  select clock_timestamp() + make_interval(days => p_days)
$$;

-- One confirmed trade, end to end, as the two real participants. Returns the agreement id.
-- Every scenario below needs its own agreement because an obligation answer is write-once.
create or replace function pg_temp.ob_agreement(p_ou uuid, p_ru uuid, p_tag text)
returns uuid
language plpgsql
as $$
declare
  v_off uuid; v_int uuid; v_pid uuid; v_vid uuid; v_ag uuid;
begin
  perform pg_temp.act_service();
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values ((select id from public.providers where user_id = p_ou), p_ou,
            'ob offering ' || p_tag, 'ob seeking ' || p_tag)
    returning id into v_off;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status)
    values (v_off, (select id from public.providers where user_id = p_ru), p_ru, 'x', 'accepted')
    returning id into v_int;

  perform pg_temp.act(p_ou);
  select public.create_barter_proposal(
    v_int,
    'ob owner gives ' || p_tag, pg_temp.ob_due(7), null,
    'ob responder gives ' || p_tag, pg_temp.ob_due(8), null
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

create or replace function pg_temp.ob_of(p_agreement uuid, p_side text)
returns uuid
language sql
as $$
  select id from public.barter_obligations
   where agreement_id = p_agreement and side = p_side
$$;

do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru), (xu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Obl Owner', 'oblo_'||substr(ou::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Obl Resp', 'oblr_'||substr(ru::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (xu, 'Obl Other', 'oblx_'||substr(xu::text,1,8));

  perform set_config('b5b.ob_ou', ou::text, true);
  perform set_config('b5b.ob_ru', ru::text, true);
  perform set_config('b5b.ob_xu', xu::text, true);
  perform set_config('b5b.ob_a', pg_temp.ob_agreement(ou, ru, 'a')::text, true);
  perform set_config('b5b.ob_b', pg_temp.ob_agreement(ou, ru, 'b')::text, true);
  perform set_config('b5b.ob_c', pg_temp.ob_agreement(ou, ru, 'c')::text, true);
  perform set_config('b5b.ob_d', pg_temp.ob_agreement(ou, ru, 'd')::text, true);
  perform pg_temp.act(null, 'anon');
end $$;

-- ── A new obligation starts with nothing recorded ──────────────────────────
do $$
declare
  v_ag uuid := current_setting('b5b.ob_a')::uuid;
  v_n integer;
begin
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligations
   where agreement_id = v_ag and status = 'pending'
     and delivered_at is null and receipt_responded_at is null;
  perform pg_temp.chk('obligation', 'a confirmed trade starts with two undelivered obligations',
    '2', v_n::text);
end $$;

-- ── Mark delivered: who may, who may not, and what the server stamps ───────
do $$
declare
  ou uuid := current_setting('b5b.ob_ou')::uuid;
  ru uuid := current_setting('b5b.ob_ru')::uuid;
  xu uuid := current_setting('b5b.ob_xu')::uuid;
  v_ag uuid := current_setting('b5b.ob_a')::uuid;
  v_own uuid; v_resp uuid;
  v_code text; v_status text; v_t1 timestamptz; v_t2 timestamptz; v_n integer;
begin
  perform pg_temp.act_service();
  v_own := pg_temp.ob_of(v_ag, 'offer_owner');
  v_resp := pg_temp.ob_of(v_ag, 'responder');

  -- The RECEIVER of an obligation cannot mark it delivered. This is the whole point of the
  -- surface: delivery is not complete because someone else says so, and it is certainly not
  -- complete because the person owed it says so.
  perform pg_temp.act(ru);
  begin
    perform public.mark_barter_obligation_delivered(v_own);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the receiver cannot mark an obligation delivered',
    '42501', v_code);

  -- An unrelated user is answered EXACTLY as a missing obligation is, so this is not an
  -- existence oracle.
  perform pg_temp.act(xu);
  begin
    perform public.mark_barter_obligation_delivered(v_own);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an unrelated user cannot mark an obligation delivered',
    '23514', v_code);
  begin
    perform public.mark_barter_obligation_delivered(gen_random_uuid());
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation',
    'and a real obligation is indistinguishable from one that does not exist', '23514', v_code);

  -- A session with no auth.uid() fails closed rather than falling through.
  perform pg_temp.act(null, 'authenticated');
  begin
    perform public.mark_barter_obligation_delivered(v_own);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'a null auth.uid() cannot mark delivered', '23514', v_code);

  -- Nothing above changed anything.
  perform pg_temp.act_service();
  select status into v_status from public.barter_obligations where id = v_own;
  perform pg_temp.chk('obligation', 'and none of those refusals changed the obligation',
    'pending', v_status);

  -- The DELIVERER can, and the server stamps the time.
  perform pg_temp.act(ou);
  select public.mark_barter_obligation_delivered(v_own) into v_status;
  perform pg_temp.chk('obligation', 'the deliverer can mark their own obligation delivered',
    'delivered', v_status);
  perform pg_temp.act_service();
  select delivered_at into v_t1 from public.barter_obligations where id = v_own;
  perform pg_temp.chk('obligation', 'delivered_at is stamped by the server', 'true',
    (v_t1 is not null)::text);
  select count(*) into v_n from public.barter_obligations
   where id = v_own and status = 'delivered' and receipt_responded_at is null;
  perform pg_temp.chk('obligation', 'and no receiver answer is invented at delivery time',
    '1', v_n::text);

  -- The COUNTERPARTY obligation is untouched. No cross-obligation authority.
  select status into v_status from public.barter_obligations where id = v_resp;
  perform pg_temp.chk('obligation', 'marking one obligation delivered does not touch the other',
    'pending', v_status);

  -- IDEMPOTENT, and the clock the future 7-day window is measured from is not reset.
  perform pg_temp.act(ou);
  select public.mark_barter_obligation_delivered(v_own) into v_status;
  perform pg_temp.chk('obligation', 'a duplicate mark-delivered returns the existing state',
    'delivered', v_status);
  perform pg_temp.act_service();
  select delivered_at into v_t2 from public.barter_obligations where id = v_own;
  perform pg_temp.chk('obligation', 'and never re-stamps delivered_at',
    v_t1::text, v_t2::text);
end $$;

-- ── The receiver answers; nobody else does, and nobody answers twice ───────
do $$
declare
  ou uuid := current_setting('b5b.ob_ou')::uuid;
  ru uuid := current_setting('b5b.ob_ru')::uuid;
  xu uuid := current_setting('b5b.ob_xu')::uuid;
  v_a uuid := current_setting('b5b.ob_a')::uuid;
  v_b uuid := current_setting('b5b.ob_b')::uuid;
  v_own_a uuid; v_resp_a uuid; v_own_b uuid;
  v_code text; v_status text; v_t1 timestamptz; v_t2 timestamptz;
begin
  perform pg_temp.act_service();
  v_own_a := pg_temp.ob_of(v_a, 'offer_owner');
  v_resp_a := pg_temp.ob_of(v_a, 'responder');
  v_own_b := pg_temp.ob_of(v_b, 'offer_owner');

  -- Nothing to answer for before delivery. 55000, not a permission error: the caller IS the
  -- receiver, the obligation is simply not in the state the action needs.
  perform pg_temp.act(ou);
  begin
    perform public.confirm_barter_obligation_received(v_resp_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the receiver cannot confirm before delivery',
    '55000', v_code);
  begin
    perform public.report_barter_obligation_not_received(v_resp_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the receiver cannot deny receipt before delivery',
    '55000', v_code);

  -- The DELIVERER cannot confirm their own delivery, in either direction.
  perform pg_temp.act(ou);
  begin
    perform public.confirm_barter_obligation_received(v_own_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the deliverer cannot confirm their own delivery',
    '42501', v_code);
  begin
    perform public.report_barter_obligation_not_received(v_own_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the deliverer cannot answer their own delivery at all',
    '42501', v_code);

  -- An unrelated user gets the not-found answer, for either outcome.
  perform pg_temp.act(xu);
  begin
    perform public.confirm_barter_obligation_received(v_own_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an unrelated user cannot confirm receipt', '23514', v_code);
  begin
    perform public.report_barter_obligation_not_received(v_own_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an unrelated user cannot deny receipt', '23514', v_code);

  perform pg_temp.act(null, 'authenticated');
  begin
    perform public.confirm_barter_obligation_received(v_own_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'a null auth.uid() cannot answer', '23514', v_code);

  perform pg_temp.act_service();
  select status into v_status from public.barter_obligations where id = v_own_a;
  perform pg_temp.chk('obligation', 'and none of those refusals recorded an answer',
    'delivered', v_status);

  -- CONFIRM RECEIVED. The receiver, after delivery, once.
  perform pg_temp.act(ru);
  select public.confirm_barter_obligation_received(v_own_a) into v_status;
  perform pg_temp.chk('obligation', 'the receiver can confirm receipt after delivery',
    'received', v_status);
  perform pg_temp.act_service();
  select receipt_responded_at into v_t1 from public.barter_obligations where id = v_own_a;
  perform pg_temp.chk('obligation', 'the receiver answer time is stamped by the server',
    'true', (v_t1 is not null)::text);

  -- Repeating the SAME answer is safe and moves nothing.
  perform pg_temp.act(ru);
  select public.confirm_barter_obligation_received(v_own_a) into v_status;
  perform pg_temp.chk('obligation', 'repeating the same answer returns the existing state',
    'received', v_status);
  perform pg_temp.act_service();
  select receipt_responded_at into v_t2 from public.barter_obligations where id = v_own_a;
  perform pg_temp.chk('obligation', 'and never re-stamps the answer time',
    v_t1::text, v_t2::text);

  -- A CONFIRMED answer cannot flip.
  perform pg_temp.act(ru);
  begin
    perform public.report_barter_obligation_not_received(v_own_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'a confirmed receipt cannot flip to didn''t receive',
    'PT412', v_code);
  perform pg_temp.act_service();
  select status into v_status from public.barter_obligations where id = v_own_a;
  perform pg_temp.chk('obligation', 'and the confirmed answer stands', 'received', v_status);

  -- Marking an already-answered obligation delivered again is still a safe no-op.
  perform pg_temp.act(ou);
  select public.mark_barter_obligation_delivered(v_own_a) into v_status;
  perform pg_temp.chk('obligation',
    'mark-delivered on an answered obligation is a safe no-op', 'received', v_status);

  -- DIDN'T RECEIVE, on a separate agreement, and it cannot flip either.
  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_own_b);
  perform pg_temp.act(ru);
  select public.report_barter_obligation_not_received(v_own_b) into v_status;
  perform pg_temp.chk('obligation', 'the receiver can say they did not receive it',
    'not_received', v_status);
  select public.report_barter_obligation_not_received(v_own_b) into v_status;
  perform pg_temp.chk('obligation', 'repeating didn''t receive is safe', 'not_received', v_status);
  begin
    perform public.confirm_barter_obligation_received(v_own_b);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'didn''t receive cannot flip to confirmed', 'PT412', v_code);
  perform pg_temp.act_service();
  select status into v_status from public.barter_obligations where id = v_own_b;
  perform pg_temp.chk('obligation', 'and the denial stands', 'not_received', v_status);

  -- "Didn't receive" adjudicates NOTHING. The counterparty obligation, the agreement and the
  -- interest are all exactly as they were.
  select status into v_status from public.barter_obligations
   where id = pg_temp.ob_of(v_b, 'responder');
  perform pg_temp.chk('obligation', 'a denial does not touch the counterparty obligation',
    'pending', v_status);
  select status into v_status from public.barter_interests
   where id = (select interest_id from public.barter_agreements where id = v_b);
  perform pg_temp.chk('obligation', 'a denial does not change the trade record',
    'accepted', v_status);
end $$;

-- ── The agreed trade itself stays immutable, and only the RPCs may write ───
do $$
declare
  ou uuid := current_setting('b5b.ob_ou')::uuid;
  ru uuid := current_setting('b5b.ob_ru')::uuid;
  v_a uuid := current_setting('b5b.ob_a')::uuid;
  v_c uuid := current_setting('b5b.ob_c')::uuid;
  v_own_a uuid; v_own_c uuid; v_resp_c uuid;
  v_code text; v_status text; v_desc text; v_due timestamptz; v_t timestamptz;
begin
  perform pg_temp.act_service();
  v_own_a := pg_temp.ob_of(v_a, 'offer_owner');
  v_own_c := pg_temp.ob_of(v_c, 'offer_owner');
  v_resp_c := pg_temp.ob_of(v_c, 'responder');
  select agreed_description, due_at into v_desc, v_due
    from public.barter_obligations where id = v_own_a;

  -- Ordinary authenticated users hold no write privilege at all.
  perform pg_temp.act(ou);
  begin
    update public.barter_obligations set status = 'received' where id = v_own_c;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an ordinary user cannot set an obligation status directly',
    '42501', v_code);
  begin
    update public.barter_obligations set delivered_at = clock_timestamp() where id = v_own_c;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an ordinary user cannot supply delivered_at directly',
    '42501', v_code);

  -- Publishing the marker themselves changes nothing: the grant is the outer wall.
  perform set_config('app.barter_obligation_write', v_own_c::text, true);
  begin
    update public.barter_obligations
       set status = 'delivered', delivered_at = clock_timestamp() where id = v_own_c;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform set_config('app.barter_obligation_write', '', true);
  perform pg_temp.chk('obligation', 'a user publishing the write marker still cannot update',
    '42501', v_code);

  -- With grants bypassed, the TRIGGER is the authority. No marker: refused.
  perform pg_temp.act_service();
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);
  begin
    update public.barter_obligations
       set status = 'delivered', delivered_at = clock_timestamp() where id = v_own_c;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation',
    'a privileged direct update without the marker is refused', '42501', v_code);

  -- A marker published for ONE obligation cannot write another.
  perform set_config('app.barter_obligation_write', v_own_c::text, true);
  begin
    update public.barter_obligations
       set status = 'delivered', delivered_at = clock_timestamp() where id = v_resp_c;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'a marker for one obligation cannot write another',
    '42501', v_code);
  perform set_config('app.barter_obligation_write', '', true);

  -- The agreed trade cannot be edited even with the marker held.
  perform set_config('app.barter_obligation_write', v_own_a::text, true);
  begin
    update public.barter_obligations set agreed_description = 'rewritten' where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the agreed description cannot be rewritten', '23514', v_code);
  begin
    update public.barter_obligations set due_at = clock_timestamp() + interval '99 days'
     where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the agreed timing cannot be rewritten', '23514', v_code);
  begin
    update public.barter_obligations set deliverer_user_id = ru, receiver_user_id = ou
     where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the direction of an obligation cannot be swapped',
    '23514', v_code);

  -- delivered_at is write-once even for a privileged caller holding the marker.
  begin
    update public.barter_obligations set delivered_at = clock_timestamp() where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'delivered_at cannot be moved once recorded', '23514', v_code);
  begin
    update public.barter_obligations set receipt_responded_at = clock_timestamp()
     where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'the receiver answer time cannot be moved once recorded',
    '23514', v_code);

  -- Illegal transitions are refused by the trigger regardless of who holds the marker.
  begin
    update public.barter_obligations set status = 'not_received' where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'a recorded answer cannot be overwritten by a direct update',
    '23514', v_code);
  begin
    update public.barter_obligations set status = 'pending', delivered_at = null
     where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an obligation cannot be returned to undelivered',
    '23514', v_code);

  -- Vocabulary beyond this slice is not silently accepted. Fulfilled, Unfulfilled, Needs
  -- Attention, Under Review and Closed Without Resolution do not exist yet, and a row claiming
  -- one would be the first false record in the system.
  begin
    update public.barter_obligations set status = 'fulfilled' where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an adjudicated outcome cannot be written yet',
    '23514', v_code);

  -- Deleting is still absolute.
  begin
    delete from public.barter_obligations where id = v_own_a;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an obligation still cannot be deleted', '23514', v_code);
  perform set_config('app.barter_obligation_write', '', true);

  -- Everything above left the record exactly as it was.
  perform pg_temp.act_service();
  select status, agreed_description, due_at, delivered_at
    into v_status, v_desc, v_due, v_t
    from public.barter_obligations where id = v_own_a;
  perform pg_temp.chk('obligation', 'the answered obligation is unchanged', 'received', v_status);
  perform pg_temp.chk('obligation', 'and its description survives', 'true',
    (v_desc <> 'rewritten')::text);
  perform pg_temp.chk('obligation', 'and its delivery time survives', 'true',
    (v_t is not null)::text);
  select status into v_status from public.barter_obligations where id = v_own_c;
  perform pg_temp.chk('obligation', 'and the untouched obligation is still pending',
    'pending', v_status);
end $$;

-- ── Reads, approval changes, and the cancellation boundary ─────────────────
do $$
declare
  ou uuid := current_setting('b5b.ob_ou')::uuid;
  ru uuid := current_setting('b5b.ob_ru')::uuid;
  xu uuid := current_setting('b5b.ob_xu')::uuid;
  v_a uuid := current_setting('b5b.ob_a')::uuid;
  v_d uuid := current_setting('b5b.ob_d')::uuid;
  v_own_d uuid; v_int_d uuid; v_n integer; v_code text; v_status text;
begin
  perform pg_temp.act_service();
  v_own_d := pg_temp.ob_of(v_d, 'offer_owner');
  select interest_id into v_int_d from public.barter_agreements where id = v_d;

  -- Both participants read both obligations, delivery state included.
  perform pg_temp.act(ou);
  select count(*) into v_n from public.barter_obligations
   where agreement_id = v_a and status is not null;
  perform pg_temp.chk('obligation', 'the deliverer reads both obligations and their state',
    '2', v_n::text);
  perform pg_temp.act(ru);
  select count(*) into v_n from public.barter_obligations
   where agreement_id = v_a and status is not null;
  perform pg_temp.chk('obligation', 'the receiver reads both obligations and their state',
    '2', v_n::text);
  perform pg_temp.act(xu);
  select count(*) into v_n from public.barter_obligations where agreement_id = v_a;
  perform pg_temp.chk('obligation', 'an unrelated user reads none of them', '0', v_n::text);

  -- A participant de-approved AFTER the trade was confirmed can still finish it. Losing
  -- approval must not strand the counterparty mid-trade.
  perform pg_temp.act_service();
  update public.providers set is_approved = false where user_id in (ou, ru);
  perform pg_temp.act(ou);
  select public.mark_barter_obligation_delivered(v_own_d) into v_status;
  perform pg_temp.chk('obligation',
    'a de-approved deliverer can still mark an existing obligation delivered',
    'delivered', v_status);
  perform pg_temp.act(ru);
  select public.confirm_barter_obligation_received(v_own_d) into v_status;
  perform pg_temp.chk('obligation', 'a de-approved receiver can still confirm receipt',
    'received', v_status);
  perform pg_temp.act_service();
  update public.providers set is_approved = true where user_id in (ou, ru);

  -- The PRE-AGREEMENT exit (release) stays closed after an agreement — before and after a
  -- delivery alike. This is not the post-agreement cancellation path, which is a separate RPC
  -- added by 20261005000000 and asserted in supabase/tests/cancellation.test.sql; that one is
  -- refused after a delivery too, permanently.
  perform pg_temp.act(ru);
  begin
    perform public.release_barter_interest(v_int_d);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation',
    'the pre-agreement release stays closed once an obligation is delivered', 'PT409', v_code);
  perform pg_temp.act_service();
  select status into v_status from public.barter_interests where id = v_int_d;
  perform pg_temp.chk('obligation', 'and the trade record is untouched', 'accepted', v_status);
end $$;

-- ── Security posture of everything 20261004000000 created or redefined ─────
do $$
declare
  v_n integer;
begin
  perform pg_temp.act_service();

  -- Every new or redefined function is owned by postgres, SECURITY DEFINER and pinned to an
  -- empty search_path.
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('mark_barter_obligation_delivered',
                       'record_barter_obligation_receipt',
                       'confirm_barter_obligation_received',
                       'report_barter_obligation_not_received',
                       'enforce_barter_obligations_immutable')
     -- Counted POSITIVELY (expect 5) rather than counting violators (expect 0): a typo in a
     -- name makes a violator count pass vacuously, which is the failure mode this whole
     -- harness exists to avoid.
     and pg_get_userbyid(p.proowner) = 'postgres'
     and p.prosecdef
     and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%';
  perform pg_temp.chk('obligation',
    'every delivery function is postgres-owned, definer, and search_path pinned',
    '5', v_n::text);

  -- anon holds EXECUTE on none of them. Supabase default privileges re-add anon EXECUTE at
  -- CREATE time, so this is the assertion that catches a missing revoke.
  perform pg_temp.chk('obligation', 'anon cannot execute mark_barter_obligation_delivered',
    'false',
    has_function_privilege('anon', 'public.mark_barter_obligation_delivered(uuid)', 'execute')::text);
  perform pg_temp.chk('obligation', 'anon cannot execute confirm_barter_obligation_received',
    'false',
    has_function_privilege('anon', 'public.confirm_barter_obligation_received(uuid)', 'execute')::text);
  perform pg_temp.chk('obligation', 'anon cannot execute report_barter_obligation_not_received',
    'false',
    has_function_privilege('anon', 'public.report_barter_obligation_not_received(uuid)', 'execute')::text);
  perform pg_temp.chk('obligation', 'anon cannot execute the internal receipt helper', 'false',
    has_function_privilege('anon', 'public.record_barter_obligation_receipt(uuid,text)', 'execute')::text);
  perform pg_temp.chk('obligation', 'anon cannot execute the immutability trigger function',
    'false',
    has_function_privilege('anon', 'public.enforce_barter_obligations_immutable()', 'execute')::text);

  -- The internal helper is the ONE place the outcome travels as a parameter, so no client may
  -- reach it: the two wrappers are the whole receiver vocabulary.
  perform pg_temp.chk('obligation',
    'authenticated cannot execute the internal receipt helper', 'false',
    has_function_privilege('authenticated',
      'public.record_barter_obligation_receipt(uuid,text)', 'execute')::text);
  perform pg_temp.chk('obligation',
    'authenticated cannot execute the immutability trigger function', 'false',
    has_function_privilege('authenticated',
      'public.enforce_barter_obligations_immutable()', 'execute')::text);

  -- The two participant-facing boundaries ARE reachable, so a revoke-everything regression
  -- cannot look like success.
  perform pg_temp.chk('obligation', 'authenticated can execute mark_barter_obligation_delivered',
    'true',
    has_function_privilege('authenticated',
      'public.mark_barter_obligation_delivered(uuid)', 'execute')::text);
  perform pg_temp.chk('obligation', 'authenticated can execute both receiver answers', 'true',
    (has_function_privilege('authenticated',
       'public.confirm_barter_obligation_received(uuid)', 'execute')
     and has_function_privilege('authenticated',
       'public.report_barter_obligation_not_received(uuid)', 'execute'))::text);

  -- The table's posture is unchanged by this slice: participant SELECT only, no write policy.
  perform pg_temp.chk('obligation', 'authenticated may still only read barter_obligations',
    'true',
    (has_table_privilege('authenticated', 'public.barter_obligations', 'select')
     and not has_table_privilege('authenticated', 'public.barter_obligations', 'insert')
     and not has_table_privilege('authenticated', 'public.barter_obligations', 'update')
     and not has_table_privilege('authenticated', 'public.barter_obligations', 'delete'))::text);
  perform pg_temp.chk('obligation', 'anon still holds nothing on barter_obligations', 'false',
    has_table_privilege('anon', 'public.barter_obligations', 'select')::text);
  -- ANCHORED: the read policy is asserted to EXIST first, so the "no write policy" count
  -- below cannot pass vacuously against a mistyped or renamed table.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'barter_obligations' and cmd = 'SELECT';
  perform pg_temp.chk('obligation', 'the participant read policy still exists', '1', v_n::text);
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'barter_obligations' and cmd <> 'SELECT';
  perform pg_temp.chk('obligation', 'still no write policy on barter_obligations',
    '0', v_n::text);
  perform pg_temp.chk('obligation', 'RLS is still enabled on barter_obligations', 'true',
    (select c.relrowsecurity::text from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relname = 'barter_obligations' and n.nspname = 'public'));

  -- The lifecycle columns exist with the shape the rest of the slice assumes.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_obligations'
     and column_name in ('status', 'delivered_at', 'receipt_responded_at');
  perform pg_temp.chk('obligation', 'the three lifecycle columns exist', '3', v_n::text);
  perform pg_temp.chk('obligation', 'status has no client-writable default beyond pending',
    'true',
    (select column_default like '''pending''%' from information_schema.columns
      where table_schema = 'public' and table_name = 'barter_obligations'
        and column_name = 'status')::text);
  perform pg_temp.chk('obligation', 'delivered_at has no column default', 'true',
    (select column_default is null from information_schema.columns
      where table_schema = 'public' and table_name = 'barter_obligations'
        and column_name = 'delivered_at')::text);

  -- NOT built in this slice. A later migration adding any of these is a product decision, not
  -- an implementation detail, so their absence is asserted rather than assumed.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_obligations'
     and column_name in ('cancelled_at', 'cancelled_by', 'outcome', 'no_show_at',
                         'review_state', 'closed_at', 'confirm_deadline_at');
  perform pg_temp.chk('obligation',
    'no cancellation, no-show, adjudication or terminal-outcome column was added',
    '0', v_n::text);
  -- `cancel_barter_agreement` was on this list until PRE-DELIVERY CANCELLATION landed
  -- (20261005000000), which is the point: this assertion is a SCOPE PIN, and a later slice
  -- adding a capability must edit it deliberately rather than have it pass by accident. What
  -- that slice added is pinned by supabase/tests/cancellation.test.sql; what it did NOT add is
  -- still pinned here. Obligation-level cancellation remains absent — cancelling is an
  -- agreement-level act and decides nothing about either obligation.
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('cancel_barter_obligation',
                       'report_barter_no_show', 'adjudicate_barter_obligation',
                       'complete_barter_agreement', 'expire_barter_obligation');
  perform pg_temp.chk('obligation',
    'no no-show, adjudication, completion or obligation-cancellation function was added',
    '0', v_n::text);
  -- ANCHORED the same way: prove the table name matches something before asserting an absence
  -- against it.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_agreements'
     and column_name in ('id', 'accepted_version_id', 'officialized_at');
  perform pg_temp.chk('obligation', 'the agreement table is the one being checked',
    '3', v_n::text);
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_agreements'
     and column_name in ('status', 'outcome', 'completed_at', 'cancelled_at');
  perform pg_temp.chk('obligation', 'the agreement gained no terminal outcome', '0', v_n::text);

  -- The four CHECK constraints exist BY NAME. Counted positively for the same reason as the
  -- function posture above.
  select count(*) into v_n from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'barter_obligations' and c.contype = 'c'
     and c.conname in ('barter_obligations_status_check',
                       'barter_obligations_delivered_stamp',
                       'barter_obligations_response_stamp',
                       'barter_obligations_response_after_delivery');
  perform pg_temp.chk('obligation', 'the four lifecycle CHECK constraints exist by name',
    '4', v_n::text);

  -- EXHAUSTIVE grantee list for the internal helper, not just anon + authenticated. A future
  -- migration granting it to some other role would slip past a two-role assertion, and the
  -- closed receiver vocabulary rests entirely on no CLIENT being able to call it with an
  -- outcome parameter.
  --
  -- `service_role` is expected and is not a hole: Supabase's default privileges grant it at
  -- CREATE time, it already bypasses this table's grants, RLS and the immutability trigger,
  -- and the vocabulary guard inside the function is what protects the value from it. What the
  -- assertion pins is that the list is EXACTLY these two.
  perform pg_temp.chk('obligation',
    'EXECUTE on the internal receipt helper is held by exactly postgres and service_role',
    'postgres, service_role',
    (select string_agg(distinct pg_get_userbyid(a.grantee), ', ' order by
                       pg_get_userbyid(a.grantee))
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'public'
        and p.proname = 'record_barter_obligation_receipt'
        and a.privilege_type = 'EXECUTE'));

  -- The insert-side lifecycle guard exists and carries the same posture as the rest.
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'enforce_barter_obligation_starts_pending'
     and pg_get_userbyid(p.proowner) = 'postgres'
     and p.prosecdef
     and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%';
  perform pg_temp.chk('obligation',
    'the insert-side lifecycle guard is postgres-owned, definer and search_path pinned',
    '1', v_n::text);
  perform pg_temp.chk('obligation', 'and is not executable by anon or authenticated', 'false',
    (has_function_privilege('anon',
       'public.enforce_barter_obligation_starts_pending()', 'execute')
     or has_function_privilege('authenticated',
       'public.enforce_barter_obligation_starts_pending()', 'execute'))::text);
end $$;

-- ── The CHECK constraints, where no trigger stands in front of them ────────
-- The immutability trigger early-returns for service_role, so for every privileged/backfill
-- writer these constraints are the ONLY thing preventing a row that claims an answer it never
-- received. Every other assertion in this suite is intercepted by the trigger first, and the
-- trigger raises the SAME 23514 — so without this block the constraints could be missing
-- entirely and nothing would fail.
do $$
declare
  v_c uuid := current_setting('b5b.ob_c')::uuid;
  v_own uuid; v_code text; v_status text;
begin
  perform pg_temp.act_service();
  v_own := pg_temp.ob_of(v_c, 'offer_owner');

  begin
    update public.barter_obligations set status = 'delivered' where id = v_own;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'delivered without a delivery time is refused',
    '23514', v_code);

  begin
    update public.barter_obligations
       set status = 'received', delivered_at = clock_timestamp() where id = v_own;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an answer without an answer time is refused',
    '23514', v_code);

  begin
    update public.barter_obligations
       set status = 'received',
           delivered_at = clock_timestamp(),
           receipt_responded_at = clock_timestamp() - interval '1 day'
     where id = v_own;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'an answer recorded before the delivery is refused',
    '23514', v_code);

  begin
    update public.barter_obligations
       set status = 'closed_without_resolution',
           delivered_at = clock_timestamp(),
           receipt_responded_at = clock_timestamp()
     where id = v_own;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'a status outside this slice''s vocabulary is refused',
    '23514', v_code);

  begin
    update public.barter_obligations set delivered_at = clock_timestamp() where id = v_own;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation', 'a delivery time with no delivery is refused',
    '23514', v_code);

  select status into v_status from public.barter_obligations where id = v_own;
  perform pg_temp.chk('obligation', 'and the obligation is still untouched', 'pending', v_status);
end $$;

-- ── Every obligation enters the lifecycle at the beginning ─────────────────
-- Without an INSERT-side guard a row could be written already answered, having passed through
-- neither transition; the CHECK constraints would find it internally consistent. This guard
-- has no service_role bypass, so it holds for backfills too.
do $$
declare
  v_c uuid := current_setting('b5b.ob_c')::uuid;
  v_code text; v_n integer; v_vid uuid; v_ou uuid; v_ru uuid;
  v_opid uuid; v_rpid uuid;
begin
  perform pg_temp.act_service();
  select ag.owner_user_id, ag.responder_user_id, ag.owner_provider_id, ag.responder_provider_id,
         ag.accepted_version_id
    into v_ou, v_ru, v_opid, v_rpid, v_vid
    from public.barter_agreements ag where ag.id = v_c;

  -- Delete the pair first so the one-per-side index is not what refuses this.
  delete from public.barter_obligations where agreement_id = v_c;
  begin
    insert into public.barter_obligations
      (agreement_id, source_term_id, side, deliverer_provider_id, deliverer_user_id,
       receiver_provider_id, receiver_user_id, agreed_description, due_at, scheduled_at,
       status, delivered_at, receipt_responded_at)
    select v_c, t.id, 'offer_owner', v_opid, v_ou, v_rpid, v_ru,
           t.service_description, t.due_at, t.scheduled_at,
           'received', clock_timestamp(), clock_timestamp()
      from public.barter_proposal_terms t
     where t.version_id = v_vid and t.provided_by = 'offer_owner';
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('obligation',
    'an obligation cannot be inserted already delivered and answered', '23514', v_code);
  select count(*) into v_n from public.barter_obligations where agreement_id = v_c;
  perform pg_temp.chk('obligation', 'and no such row exists', '0', v_n::text);

  -- The legitimate creator still works, and produces the two pending obligations.
  perform public.create_barter_obligation_pair(v_c);
  select count(*) into v_n from public.barter_obligations
   where agreement_id = v_c and status = 'pending'
     and delivered_at is null and receipt_responded_at is null;
  perform pg_temp.chk('obligation', 'and the pair creator still writes two pending obligations',
    '2', v_n::text);
end $$;
