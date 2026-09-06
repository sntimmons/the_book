-- B5B suite: pre-delivery cancellation of a confirmed barter agreement.
--
-- Every assertion exercises real DB enforcement as the `authenticated` role. This harness runs
-- in ONE transaction and cannot stage a race; the delivery-versus-cancellation race is proven
-- by scripts/negotiation-concurrency.mjs. What is pinned here is every invariant a race could
-- violate, plus the security posture of every object 20261005000000 created or redefined, plus
-- the ABSENCE of everything this slice must not have added.

create or replace function pg_temp.cx_due(p_days integer)
returns timestamptz language sql as $$
  select clock_timestamp() + make_interval(days => p_days)
$$;

-- One confirmed trade, end to end, as the two real participants. Each scenario needs its own,
-- because a cancellation act is write-once per participant.
create or replace function pg_temp.cx_agreement(p_ou uuid, p_ru uuid, p_tag text)
returns uuid language plpgsql as $$
declare v_off uuid; v_int uuid; v_pid uuid; v_vid uuid; v_ag uuid;
begin
  perform pg_temp.act_service();
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values ((select id from public.providers where user_id = p_ou), p_ou,
            'cx offering ' || p_tag, 'cx seeking ' || p_tag) returning id into v_off;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status)
    values (v_off, (select id from public.providers where user_id = p_ru), p_ru, 'x', 'accepted')
    returning id into v_int;
  perform pg_temp.act(p_ou);
  select public.create_barter_proposal(v_int,
    'cx owner gives ' || p_tag, pg_temp.cx_due(7), null,
    'cx responder gives ' || p_tag, pg_temp.cx_due(8), null) into v_pid;
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

create or replace function pg_temp.cx_ob(p_agreement uuid, p_side text)
returns uuid language sql as $$
  select id from public.barter_obligations
   where agreement_id = p_agreement and side = p_side
$$;

create or replace function pg_temp.cx_acts(p_agreement uuid)
returns integer language sql as $$
  select count(*)::integer from public.barter_agreement_cancellations
   where agreement_id = p_agreement
$$;

do $$
declare ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru), (xu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Cx Owner', 'cxo_'||substr(ou::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Cx Resp', 'cxr_'||substr(ru::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (xu, 'Cx Other', 'cxx_'||substr(xu::text,1,8));
  perform set_config('b5b.cx_ou', ou::text, true);
  perform set_config('b5b.cx_ru', ru::text, true);
  perform set_config('b5b.cx_xu', xu::text, true);
  perform set_config('b5b.cx_a', pg_temp.cx_agreement(ou, ru, 'a')::text, true);
  perform set_config('b5b.cx_b', pg_temp.cx_agreement(ou, ru, 'b')::text, true);
  perform set_config('b5b.cx_c', pg_temp.cx_agreement(ou, ru, 'c')::text, true);
  perform set_config('b5b.cx_d', pg_temp.cx_agreement(ou, ru, 'd')::text, true);
  perform set_config('b5b.cx_e', pg_temp.cx_agreement(ou, ru, 'e')::text, true);
  perform pg_temp.act(null, 'anon');
end $$;

-- ── Who may cancel, and what the server derives ────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  xu uuid := current_setting('b5b.cx_xu')::uuid;
  v_a uuid := current_setting('b5b.cx_a')::uuid;
  v_code text; v_res text; v_n integer; v_t timestamptz; v_t2 timestamptz;
  v_reason text; v_actor uuid; v_provider uuid; v_expected uuid;
begin
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_agreement_cancellations where agreement_id = v_a;
  perform pg_temp.chk('cancellation', 'a confirmed trade starts uncancelled', '0', v_n::text);

  -- An unrelated user is answered exactly as a missing trade is: not an existence oracle.
  perform pg_temp.act(xu);
  begin
    perform public.cancel_barter_agreement(v_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'an unrelated user cannot cancel', '23514', v_code);
  begin
    perform public.cancel_barter_agreement(gen_random_uuid());
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation',
    'and a real trade is indistinguishable from one that does not exist', '23514', v_code);

  perform pg_temp.act(null, 'authenticated');
  begin
    perform public.cancel_barter_agreement(v_a);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'a null auth.uid() cannot cancel', '23514', v_code);

  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and none of those refusals recorded anything',
    '0', pg_temp.cx_acts(v_a)::text);

  -- The RESPONDER cancels, with an untrimmed optional reason.
  perform pg_temp.act(ru);
  select public.cancel_barter_agreement(v_a, '  ran out of time  ') into v_res;
  perform pg_temp.chk('cancellation', 'either participant may cancel before delivery',
    'cancelled_by_participant', v_res);

  perform pg_temp.act_service();
  select actor_user_id, actor_provider_id, reason, created_at
    into v_actor, v_provider, v_reason, v_t
    from public.barter_agreement_cancellations where agreement_id = v_a;
  perform pg_temp.chk('cancellation', 'the actor is server-derived from auth.uid()',
    ru::text, v_actor::text);
  select responder_provider_id into v_expected from public.barter_agreements where id = v_a;
  perform pg_temp.chk('cancellation', 'and the provider is read from the agreement',
    v_expected::text, v_provider::text);
  perform pg_temp.chk('cancellation', 'the reason is stored trimmed', 'ran out of time', v_reason);
  perform pg_temp.chk('cancellation', 'and the time is server-stamped', 'true',
    (v_t is not null)::text);

  -- IDEMPOTENT: a repeat by the same participant creates nothing and overwrites nothing.
  perform pg_temp.act(ru);
  select public.cancel_barter_agreement(v_a, 'a completely different reason') into v_res;
  perform pg_temp.chk('cancellation', 'a repeat by the same participant returns the same state',
    'cancelled_by_participant', v_res);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and creates no second row', '1', pg_temp.cx_acts(v_a)::text);
  select reason, created_at into v_reason, v_t2
    from public.barter_agreement_cancellations where agreement_id = v_a;
  perform pg_temp.chk('cancellation', 'and does not overwrite the original reason',
    'ran out of time', v_reason);
  perform pg_temp.chk('cancellation', 'nor the original time', v_t::text, v_t2::text);

  -- The SECOND participant's explicit act makes it mutual, and preserves the first.
  perform pg_temp.act(ou);
  select public.cancel_barter_agreement(v_a) into v_res;
  perform pg_temp.chk('cancellation', 'the second participant''s act makes it mutual',
    'mutually_cancelled', v_res);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and there are exactly two acts', '2',
    pg_temp.cx_acts(v_a)::text);
  select count(*) into v_n from public.barter_agreement_cancellations
   where agreement_id = v_a and actor_user_id = ru and reason = 'ran out of time'
     and created_at = v_t;
  perform pg_temp.chk('cancellation', 'the first act survives the second untouched',
    '1', v_n::text);
  select count(*) into v_n from public.barter_agreement_cancellations
   where agreement_id = v_a and actor_user_id = ou and reason is null;
  perform pg_temp.chk('cancellation', 'and the reason is optional', '1', v_n::text);

  -- A third act is impossible: there are only two participants, and each may act once.
  perform pg_temp.act(ou);
  select public.cancel_barter_agreement(v_a) into v_res;
  perform pg_temp.chk('cancellation', 'a repeat after mutual still reports mutual',
    'mutually_cancelled', v_res);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and never exceeds two acts', '2',
    pg_temp.cx_acts(v_a)::text);
end $$;

-- ── The first act closes delivery and receipt ──────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  v_b uuid := current_setting('b5b.cx_b')::uuid;
  v_own uuid; v_resp uuid; v_code text; v_res text; v_n integer;
begin
  perform pg_temp.act_service();
  v_own := pg_temp.cx_ob(v_b, 'offer_owner');
  v_resp := pg_temp.cx_ob(v_b, 'responder');

  perform pg_temp.act(ou);
  select public.cancel_barter_agreement(v_b, 'changed my mind') into v_res;
  perform pg_temp.chk('cancellation', 'one participant cancels', 'cancelled_by_participant', v_res);

  -- Neither obligation may now be delivered, by either deliverer.
  perform pg_temp.act(ou);
  begin
    perform public.mark_barter_obligation_delivered(v_own);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'the canceller cannot mark delivered afterwards',
    'PT409', v_code);
  perform pg_temp.act(ru);
  begin
    perform public.mark_barter_obligation_delivered(v_resp);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'and neither can the counterparty', 'PT409', v_code);

  -- Nor may either receiver answer. Both answers, both directions.
  perform pg_temp.act(ru);
  begin
    perform public.confirm_barter_obligation_received(v_own);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'a receiver cannot confirm receipt afterwards',
    'PT409', v_code);
  begin
    perform public.report_barter_obligation_not_received(v_own);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'nor report a non-receipt', 'PT409', v_code);
  perform pg_temp.act(ou);
  begin
    perform public.confirm_barter_obligation_received(v_resp);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'the other receiver is refused too', 'PT409', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_obligations
   where agreement_id = v_b and status = 'pending'
     and delivered_at is null and receipt_responded_at is null;
  perform pg_temp.chk('cancellation', 'and none of those refusals changed an obligation',
    '2', v_n::text);

  -- The counterparty may still record their own assent. That is the ONLY thing still possible.
  perform pg_temp.act(ru);
  select public.cancel_barter_agreement(v_b) into v_res;
  perform pg_temp.chk('cancellation', 'the counterparty may still agree after the first act',
    'mutually_cancelled', v_res);
end $$;

-- ── Nothing is destroyed, and the negotiation stays closed ─────────────────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  xu uuid := current_setting('b5b.cx_xu')::uuid;
  v_b uuid := current_setting('b5b.cx_b')::uuid;
  v_n integer; v_code text; v_pid uuid; v_int uuid;
begin
  perform pg_temp.act_service();
  select proposal_id, interest_id into v_pid, v_int from public.barter_agreements where id = v_b;

  perform pg_temp.chk('cancellation', 'the agreement survives cancellation', '1',
    (select count(*)::text from public.barter_agreements where id = v_b));
  perform pg_temp.chk('cancellation', 'both obligations survive', '2',
    (select count(*)::text from public.barter_obligations where agreement_id = v_b));
  perform pg_temp.chk('cancellation', 'the proposal survives', '1',
    (select count(*)::text from public.barter_proposals where id = v_pid));
  perform pg_temp.chk('cancellation', 'its versions and terms survive', 'true',
    ((select count(*) from public.barter_proposal_versions where proposal_id = v_pid) > 0
     and (select count(*) from public.barter_proposal_terms t
            join public.barter_proposal_versions v on v.id = t.version_id
           where v.proposal_id = v_pid) > 0)::text);
  perform pg_temp.chk('cancellation', 'the acceptances survive', '2',
    (select count(*)::text from public.barter_version_acceptances a
       join public.barter_proposal_versions v on v.id = a.version_id
      where v.proposal_id = v_pid));
  perform pg_temp.chk('cancellation', 'and the interest is untouched', 'accepted',
    (select status from public.barter_interests where id = v_int));

  -- Both participants read BOTH acts; an outsider reads none.
  perform pg_temp.act(ou);
  select count(*) into v_n from public.barter_agreement_cancellations where agreement_id = v_b;
  perform pg_temp.chk('cancellation', 'participant A reads both acts', '2', v_n::text);
  perform pg_temp.act(ru);
  select count(*) into v_n from public.barter_agreement_cancellations where agreement_id = v_b;
  perform pg_temp.chk('cancellation', 'participant B reads both acts', '2', v_n::text);
  perform pg_temp.act(xu);
  select count(*) into v_n from public.barter_agreement_cancellations where agreement_id = v_b;
  perform pg_temp.chk('cancellation', 'an unrelated user reads none', '0', v_n::text);
  perform pg_temp.act(ou);
  select count(*) into v_n from public.barter_obligations where agreement_id = v_b;
  perform pg_temp.chk('cancellation', 'a participant still reads the obligations after cancelling',
    '2', v_n::text);

  -- The negotiation stays closed: cancelling is not a reopen.
  perform pg_temp.act(ou);
  begin
    perform public.submit_barter_counter(v_pid, 'new', pg_temp.cx_due(7), null,
                                                'terms', pg_temp.cx_due(8), null);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'a counter after cancellation is still refused',
    'PT409', v_code);
  begin
    perform public.release_barter_interest(v_int);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'release is still unavailable', 'PT409', v_code);
  begin
    perform public.finalize_barter_agreement(v_pid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'and re-finalizing returns the same agreement, not a new one',
    'NO ERROR', v_code);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'still exactly one agreement for that negotiation', '1',
    (select count(*)::text from public.barter_agreements where proposal_id = v_pid));
end $$;

-- ── Delivery closes cancellation, permanently ──────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  v_c uuid := current_setting('b5b.cx_c')::uuid;
  v_own uuid; v_code text; v_status text;
begin
  perform pg_temp.act_service();
  v_own := pg_temp.cx_ob(v_c, 'offer_owner');

  perform pg_temp.act(ou);
  perform public.mark_barter_obligation_delivered(v_own);

  -- Neither participant may cancel now — not the deliverer, not the receiver.
  begin
    perform public.cancel_barter_agreement(v_c);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'the deliverer cannot cancel after delivering',
    '55000', v_code);
  perform pg_temp.act(ru);
  begin
    perform public.cancel_barter_agreement(v_c, 'they delivered but I want out');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'nor may the receiver', '55000', v_code);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and nothing was recorded', '0', pg_temp.cx_acts(v_c)::text);

  -- "Didn't receive" does NOT reopen the ordinary exit. PD-046 routes that to a later slice.
  perform pg_temp.act(ru);
  select public.report_barter_obligation_not_received(v_own) into v_status;
  perform pg_temp.chk('cancellation', 'the receiver says they did not receive it',
    'not_received', v_status);
  begin
    perform public.cancel_barter_agreement(v_c);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation',
    'a not-received answer does NOT re-open ordinary cancellation', '55000', v_code);
  perform pg_temp.act(ou);
  begin
    perform public.cancel_barter_agreement(v_c);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'for either participant', '55000', v_code);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and still nothing is recorded', '0',
    pg_temp.cx_acts(v_c)::text);
end $$;

-- ── De-approval, reason bounds, and direct-write refusal ───────────────────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  xu uuid := current_setting('b5b.cx_xu')::uuid;
  v_d uuid := current_setting('b5b.cx_d')::uuid;
  v_e uuid := current_setting('b5b.cx_e')::uuid;
  v_code text; v_res text; v_n integer; v_opid uuid;
begin
  -- An over-long reason is refused, and refuses the whole act.
  perform pg_temp.act(ou);
  begin
    perform public.cancel_barter_agreement(v_d, repeat('x', 201));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'an over-long reason is refused', '22023', v_code);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and records nothing', '0', pg_temp.cx_acts(v_d)::text);

  -- A participant de-approved AFTER the trade was confirmed can still get out of it.
  perform pg_temp.act_service();
  update public.providers set is_approved = false where user_id in (ou, ru);
  perform pg_temp.act(ou);
  select public.cancel_barter_agreement(v_d, repeat('y', 200)) into v_res;
  perform pg_temp.chk('cancellation', 'a de-approved participant can still cancel',
    'cancelled_by_participant', v_res);
  perform pg_temp.act(ru);
  select public.cancel_barter_agreement(v_d) into v_res;
  perform pg_temp.chk('cancellation', 'and the de-approved counterparty can still agree',
    'mutually_cancelled', v_res);
  perform pg_temp.act_service();
  update public.providers set is_approved = true where user_id in (ou, ru);

  -- Ordinary clients hold no write privilege on the act table at all.
  perform pg_temp.act(ou);
  begin
    insert into public.barter_agreement_cancellations
      (agreement_id, actor_user_id, actor_provider_id)
    values (v_e, ou, (select owner_provider_id from public.barter_agreements where id = v_e));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'an ordinary user cannot insert a cancellation directly',
    '42501', v_code);
  begin
    update public.barter_agreement_cancellations set reason = 'rewritten'
     where agreement_id = v_d;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'nor edit one', '42501', v_code);
  begin
    delete from public.barter_agreement_cancellations where agreement_id = v_d;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'nor withdraw one', '42501', v_code);

  -- With grants bypassed, the TRIGGERS are the authority.
  perform pg_temp.act_service();
  select owner_provider_id into v_opid from public.barter_agreements where id = v_e;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);
  begin
    update public.barter_agreement_cancellations set reason = 'rewritten' where agreement_id = v_d;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'a privileged edit is refused: the act is append-only',
    '23514', v_code);
  begin
    delete from public.barter_agreement_cancellations where agreement_id = v_d;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'and a privileged withdrawal is refused', '23514', v_code);
  -- A forged act naming a NON-participant is refused by the consistency trigger.
  begin
    insert into public.barter_agreement_cancellations
      (agreement_id, actor_user_id, actor_provider_id)
    values (v_e, xu, v_opid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'a forged act naming a non-participant is refused',
    '42501', v_code);
  -- A real participant attached to the WRONG provider is refused too.
  begin
    insert into public.barter_agreement_cancellations
      (agreement_id, actor_user_id, actor_provider_id)
    values (v_e, ou, (select responder_provider_id from public.barter_agreements where id = v_e));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation', 'and so is a participant with the wrong provider',
    '42501', v_code);

  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'the two acts on the mutual trade are unchanged', '2',
    pg_temp.cx_acts(v_d)::text);
  select count(*) into v_n from public.barter_agreement_cancellations
   where agreement_id = v_d and reason = 'rewritten';
  perform pg_temp.chk('cancellation', 'and no reason was rewritten', '0', v_n::text);
  perform pg_temp.chk('cancellation', 'the untouched trade has no acts', '0',
    pg_temp.cx_acts(v_e)::text);
end $$;

-- ── The delivery precondition is held by the database, not only the RPC ────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  v_c uuid := current_setting('b5b.cx_c')::uuid;
  v_code text;
begin
  -- Agreement C already has a delivered obligation. Even a privileged direct insert, which
  -- bypasses grants entirely, cannot record a cancellation against it.
  perform pg_temp.act_service();
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.barter_agreement_cancellations
      (agreement_id, actor_user_id, actor_provider_id)
    values (v_c, ou, (select owner_provider_id from public.barter_agreements where id = v_c));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation',
    'a privileged direct insert cannot cancel a trade that has a delivery', '55000', v_code);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and it stays uncancelled', '0', pg_temp.cx_acts(v_c)::text);
end $$;

-- ── Read models report the derived classification ──────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  xu uuid := current_setting('b5b.cx_xu')::uuid;
  v_a uuid := current_setting('b5b.cx_a')::uuid;
  v_e uuid := current_setting('b5b.cx_e')::uuid;
  v_int_a uuid; v_int_e uuid; v_n integer;
begin
  perform pg_temp.act_service();
  select interest_id into v_int_a from public.barter_agreements where id = v_a;
  select interest_id into v_int_e from public.barter_agreements where id = v_e;

  -- Trade A is MUTUALLY cancelled; trade E is not cancelled at all.
  perform pg_temp.act(ou);
  select count(*) into v_n from public.my_trade_activity
   where interest_id = v_int_a and i_cancelled and they_cancelled and cancelled_at is not null;
  perform pg_temp.chk('cancellation', 'Trade Activity reports a mutual cancellation to A',
    '1', v_n::text);
  perform pg_temp.act(ru);
  select count(*) into v_n from public.my_trade_activity
   where interest_id = v_int_a and i_cancelled and they_cancelled;
  perform pg_temp.chk('cancellation', 'and to B', '1', v_n::text);
  select count(*) into v_n from public.my_trade_activity
   where interest_id = v_int_e and not i_cancelled and not they_cancelled
     and cancelled_at is null;
  perform pg_temp.chk('cancellation', 'an uncancelled trade reports nothing cancelled',
    '1', v_n::text);

  -- The negotiation view carries the same three facts. The one-act split for each viewer is
  -- asserted in the next block, on a trade that has exactly one act.
  perform pg_temp.act(ou);
  select count(*) into v_n from public.my_barter_proposals
   where agreement_id = v_a and i_cancelled and they_cancelled;
  perform pg_temp.chk('cancellation', 'the negotiation view reports mutual to A', '1', v_n::text);
  perform pg_temp.act(xu);
  select count(*) into v_n from public.my_trade_activity where interest_id = v_int_a;
  perform pg_temp.chk('cancellation', 'and an outsider sees no row at all', '0', v_n::text);
end $$;

-- ── One-sided classification, from each side ───────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  v_e uuid := current_setting('b5b.cx_e')::uuid;
  v_int uuid; v_n integer;
begin
  perform pg_temp.act_service();
  select interest_id into v_int from public.barter_agreements where id = v_e;
  perform pg_temp.act(ou);
  perform public.cancel_barter_agreement(v_e, 'one-sided');

  -- The canceller sees their own act; the counterparty sees it as the other side's. Neither
  -- reads as mutual, and no actor id is exposed by either view.
  select count(*) into v_n from public.my_trade_activity
   where interest_id = v_int and i_cancelled and not they_cancelled;
  perform pg_temp.chk('cancellation', 'the canceller sees it as their own act', '1', v_n::text);
  perform pg_temp.act(ru);
  select count(*) into v_n from public.my_trade_activity
   where interest_id = v_int and they_cancelled and not i_cancelled;
  perform pg_temp.chk('cancellation', 'the counterparty sees it as the other side''s',
    '1', v_n::text);
  select count(*) into v_n from public.my_barter_proposals
   where agreement_id = v_e and they_cancelled and not i_cancelled;
  perform pg_temp.chk('cancellation', 'and the negotiation view agrees', '1', v_n::text);
  perform pg_temp.chk('cancellation', 'neither view exposes an actor id', '0',
    (select count(*)::text from information_schema.columns
      where table_schema = 'public'
        and table_name in ('my_trade_activity', 'my_barter_proposals')
        and column_name in ('actor_user_id', 'cancelled_by', 'actor_provider_id')));
end $$;

-- ── Security posture of everything 20261005000000 created or redefined ─────
do $$
declare v_n integer;
begin
  perform pg_temp.act_service();

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('cancel_barter_agreement',
                       'enforce_barter_cancellation_append_only',
                       'enforce_barter_cancellation_consistent',
                       'mark_barter_obligation_delivered',
                       'record_barter_obligation_receipt')
     and pg_get_userbyid(p.proowner) = 'postgres'
     and p.prosecdef
     and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%';
  perform pg_temp.chk('cancellation',
    'every cancellation function is postgres-owned, definer and search_path pinned',
    '5', v_n::text);

  perform pg_temp.chk('cancellation', 'anon cannot execute cancel_barter_agreement', 'false',
    has_function_privilege('anon', 'public.cancel_barter_agreement(uuid,text)', 'execute')::text);
  perform pg_temp.chk('cancellation', 'authenticated CAN execute it', 'true',
    has_function_privilege('authenticated',
      'public.cancel_barter_agreement(uuid,text)', 'execute')::text);
  perform pg_temp.chk('cancellation', 'neither role can execute the append-only guard', 'false',
    (has_function_privilege('anon',
       'public.enforce_barter_cancellation_append_only()', 'execute')
     or has_function_privilege('authenticated',
       'public.enforce_barter_cancellation_append_only()', 'execute'))::text);
  perform pg_temp.chk('cancellation', 'nor the consistency guard', 'false',
    (has_function_privilege('anon',
       'public.enforce_barter_cancellation_consistent()', 'execute')
     or has_function_privilege('authenticated',
       'public.enforce_barter_cancellation_consistent()', 'execute'))::text);

  perform pg_temp.chk('cancellation', 'the act table is owned by postgres', 'postgres',
    (select pg_get_userbyid(c.relowner) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relname = 'barter_agreement_cancellations' and n.nspname = 'public'));
  perform pg_temp.chk('cancellation', 'authenticated may only read it', 'true',
    (has_table_privilege('authenticated', 'public.barter_agreement_cancellations', 'select')
     and not has_table_privilege('authenticated', 'public.barter_agreement_cancellations', 'insert')
     and not has_table_privilege('authenticated', 'public.barter_agreement_cancellations', 'update')
     and not has_table_privilege('authenticated', 'public.barter_agreement_cancellations', 'delete'))::text);
  perform pg_temp.chk('cancellation', 'anon holds nothing on it', 'false',
    has_table_privilege('anon', 'public.barter_agreement_cancellations', 'select')::text);
  perform pg_temp.chk('cancellation', 'RLS is enabled on it', 'true',
    (select c.relrowsecurity::text from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relname = 'barter_agreement_cancellations' and n.nspname = 'public'));
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'barter_agreement_cancellations'
     and cmd = 'SELECT';
  perform pg_temp.chk('cancellation', 'the participant read policy exists', '1', v_n::text);
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'barter_agreement_cancellations'
     and cmd <> 'SELECT';
  perform pg_temp.chk('cancellation', 'and no write policy exists', '0', v_n::text);

  -- One act per participant, held by the index rather than only by the RPC's read.
  select count(*) into v_n from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public' and t.relname = 'barter_agreement_cancellations'
     and c.conname in ('barter_agreement_cancellations_one_per_actor',
                       'barter_agreement_cancellations_reason_check');
  perform pg_temp.chk('cancellation', 'the one-per-actor and reason constraints exist by name',
    '2', v_n::text);

  -- The views gained exactly the three derived facts, and nothing that names a participant.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'my_trade_activity'
     and column_name in ('i_cancelled', 'they_cancelled', 'cancelled_at');
  perform pg_temp.chk('cancellation', 'Trade Activity exposes the three derived facts',
    '3', v_n::text);
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'my_barter_proposals'
     and column_name in ('i_cancelled', 'they_cancelled', 'cancelled_at');
  perform pg_temp.chk('cancellation', 'and so does the negotiation view', '3', v_n::text);

  -- NOT in a realtime publication. The act table is not published today; pinning it stops a
  -- later `alter publication … add table` from quietly opening a delivery channel for records
  -- whose whole point is that only the two participants can read them.
  select count(*) into v_n from pg_publication_tables
   where schemaname = 'public' and tablename = 'barter_agreement_cancellations';
  perform pg_temp.chk('cancellation', 'the act table is in no realtime publication',
    '0', v_n::text);

  -- `create or replace view` PRESERVES the existing ACL, so replacing these two views must not
  -- have restored the write privileges 20260929000000 revoked. This slice depends on that
  -- silently; asserted so the dependency is not silent.
  perform pg_temp.chk('cancellation',
    'replacing the views did not restore write grants to authenticated', 'true',
    (not has_table_privilege('authenticated', 'public.my_trade_activity', 'insert')
     and not has_table_privilege('authenticated', 'public.my_trade_activity', 'update')
     and not has_table_privilege('authenticated', 'public.my_trade_activity', 'delete')
     and not has_table_privilege('authenticated', 'public.my_barter_proposals', 'insert')
     and not has_table_privilege('authenticated', 'public.my_barter_proposals', 'update')
     and not has_table_privilege('authenticated', 'public.my_barter_proposals', 'delete'))::text);
  perform pg_temp.chk('cancellation', 'and both views still read for authenticated', 'true',
    (has_table_privilege('authenticated', 'public.my_trade_activity', 'select')
     and has_table_privilege('authenticated', 'public.my_barter_proposals', 'select'))::text);
  perform pg_temp.chk('cancellation', 'and anon still reads neither', 'false',
    (has_table_privilege('anon', 'public.my_trade_activity', 'select')
     or has_table_privilege('anon', 'public.my_barter_proposals', 'select'))::text);

  -- NOT built in this slice. Asserted absent rather than assumed.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public'
     and table_name in ('barter_agreements', 'barter_obligations',
                        'barter_agreement_cancellations')
     and column_name in ('outcome', 'no_show_at', 'needs_attention_at', 'under_review_at',
                         'adjudicated_at', 'completed_at', 'confirm_deadline_at',
                         'fulfilment_state', 'review_state');
  perform pg_temp.chk('cancellation',
    'no no-show, timeout, review or terminal-outcome column was added', '0', v_n::text);
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('report_barter_no_show', 'adjudicate_barter_obligation',
                       'complete_barter_agreement', 'expire_barter_obligation',
                       'escalate_barter_agreement', 'resolve_barter_agreement');
  perform pg_temp.chk('cancellation',
    'no no-show, adjudication, completion or timeout function was added', '0', v_n::text);
  -- Cancelling produces no review opportunity and touches no reputation surface.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_agreement_cancellations'
     and column_name in ('rating', 'review_id', 'reliability_score');
  perform pg_temp.chk('cancellation', 'and cancellation carries no review or reputation field',
    '0', v_n::text);
end $$;

-- ── 20261006000000: the act is bound to the caller, and its time is the server's ──
-- Both properties are invisible to `authenticated`, which holds no INSERT on the table, so
-- they are asserted with grants bypassed and a real JWT subject — the only shape in which the
-- triggers, rather than the grants, are the authority.
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  v_e uuid := current_setting('b5b.cx_e')::uuid;
  v_code text; v_at timestamptz; v_n integer;
begin
  perform pg_temp.act_service();
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);

  -- SEC-TRIGGER-001. `ru` IS a participant of this agreement and this IS ru's provider, so
  -- the participant-pair check alone admitted this row. The caller is `ou`. Recording it
  -- would have fabricated ru's assent and turned a one-sided cancellation into a mutual one
  -- without ru ever acting — the one thing the product says can never be inferred.
  begin
    insert into public.barter_agreement_cancellations
      (agreement_id, actor_user_id, actor_provider_id)
    values (v_e, ru, (select responder_provider_id from public.barter_agreements where id = v_e));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('cancellation',
    'a participant cannot record the COUNTERPARTY''s cancellation', '42501', v_code);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'so the trade is still cancelled by one side only',
    '1', pg_temp.cx_acts(v_e)::text);

  -- SEC-DATA-001. A supplied created_at is discarded in favour of the server clock. Asserted
  -- before any slice measures a deadline from `cancelled_at`, where a backdatable timestamp
  -- would become an authorization boundary rather than a display fact.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ru::text, 'role', 'authenticated')::text, true);
  insert into public.barter_agreement_cancellations
    (agreement_id, actor_user_id, actor_provider_id, created_at)
  values (v_e, ru, (select responder_provider_id from public.barter_agreements where id = v_e),
          timestamptz '2020-01-01 00:00:00+00');
  perform pg_temp.act_service();
  select created_at into v_at from public.barter_agreement_cancellations
   where agreement_id = v_e and actor_user_id = ru;
  perform pg_temp.chk('cancellation', 'a supplied created_at is replaced by the server clock',
    'true', (v_at > now() - interval '5 minutes')::text);

  -- And the act that was legitimately recorded still counts, so the guard refuses forgeries
  -- without refusing the participant's own second act.
  perform pg_temp.chk('cancellation', 'the counterparty''s OWN act is still accepted', '2',
    pg_temp.cx_acts(v_e)::text);
  select count(*) into v_n from public.barter_agreement_cancellations
   where agreement_id = v_e and actor_user_id = ou;
  perform pg_temp.chk('cancellation', 'and the first act was not disturbed', '1', v_n::text);
end $$;

-- ── 20261007000000: the counterparty is TOLD, and the reason is SHARED ─────
-- Founder rulings on PR #58. The signal reuses the pre-agreement mechanism from
-- 20260910000000 -- a message whose author is nobody (`sender_id is null`) in the existing
-- canonical provider-pair conversation -- rather than introducing a second mechanism.
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  xu uuid := current_setting('b5b.cx_xu')::uuid;
  v_f uuid; v_conv uuid; v_n integer; v_txt text; v_res text;
begin
  perform pg_temp.act_service();
  -- The pair's ONE canonical thread. Inserted as service_role so the request-status clamp
  -- does not force it to 'pending'; the pair key is derived by the server either way.
  insert into public.conversation(client_id, provider_id, request_status, request_opened_at)
  values (ru, (select id from public.providers where user_id = ou), 'accepted', now())
  returning id into v_conv;
  perform pg_temp.chk('cancellation', 'the pair thread carries a canonical key', 'true',
    (select (provider_pair_key is not null)::text from public.conversation where id = v_conv));

  v_f := pg_temp.cx_agreement(ou, ru, 'f');

  -- FIRST ACT → exactly one system message, and it is authored by nobody.
  perform pg_temp.act(ou);
  select public.cancel_barter_agreement(v_f, 'double booked that weekend') into v_res;
  perform pg_temp.act_service();
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null
     and content like 'The trade for %was cancelled by one provider.';
  perform pg_temp.chk('cancellation',
    'the first cancellation writes exactly one system message', '1', v_n::text);
  perform pg_temp.chk('cancellation', 'and the thread''s last_message_at moved', 'true',
    (select (last_message_at is not null)::text from public.conversation where id = v_conv));

  -- IDEMPOTENT REPEAT → no second message. The already-acted branch returns before the insert.
  perform pg_temp.act(ou);
  perform public.cancel_barter_agreement(v_f, 'a different reason entirely');
  perform public.cancel_barter_agreement(v_f);
  perform pg_temp.act_service();
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null
     and content like 'The trade for %was cancelled by one provider.';
  perform pg_temp.chk('cancellation', 'a repeat by the same participant writes no duplicate',
    '1', v_n::text);

  -- SECOND PARTICIPANT'S ASSENT → exactly one mutual message.
  perform pg_temp.act(ru);
  select public.cancel_barter_agreement(v_f, 'agreed, no hard feelings') into v_res;
  perform pg_temp.chk('cancellation', 'the assent is classified mutual', 'mutually_cancelled',
    v_res);
  perform pg_temp.act_service();
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null
     and content like 'Both providers cancelled the trade for %';
  perform pg_temp.chk('cancellation',
    'the second act writes exactly one mutual-cancellation message', '1', v_n::text);

  -- REPEATED ASSENT → still one.
  perform pg_temp.act(ru);
  perform public.cancel_barter_agreement(v_f);
  perform pg_temp.act_service();
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null
     and content like 'Both providers cancelled the trade for %';
  perform pg_temp.chk('cancellation', 'a repeated assent writes no duplicate either',
    '1', v_n::text);
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null;
  perform pg_temp.chk('cancellation', 'two acts produced exactly two system messages',
    '2', v_n::text);

  -- THE FREE TEXT IS NOT IN THE THREAD. A conversation message is a different surface with
  -- different longevity, and the ruling keeps the reason out of it.
  select count(*) into v_n from public.messages
   where conversation_id = v_conv
     and (content like '%double booked%' or content like '%hard feelings%'
          or content like '%different reason%');
  perform pg_temp.chk('cancellation', 'no system message leaks the cancellation reason',
    '0', v_n::text);
  -- Nor does it name a participant, or claim a channel the product does not have.
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null
     and (content ilike '%Cx Owner%' or content ilike '%Cx Resp%'
          or content ilike '%notif%' or content ilike '%email%' or content ilike '%push%');
  perform pg_temp.chk('cancellation',
    'nor names a provider or claims a notification was sent', '0', v_n::text);
  -- Authored by the platform: a client cannot forge one, because the send policy pins
  -- sender_id = auth.uid() and null can never satisfy it.
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id in (ou, ru);
  perform pg_temp.chk('cancellation', 'and no system message is attributed to a participant',
    '0', v_n::text);

  -- READ BOUNDARY. The signal creates no new conversation identity and grants nobody new
  -- access: it is readable exactly by whoever could already read this thread.
  select count(*) into v_n from public.conversation
   where provider_pair_key = public.provider_pair_key(
     (select id from public.providers where user_id = ou),
     (select id from public.providers where user_id = ru));
  perform pg_temp.chk('cancellation', 'no second conversation was created for the pair',
    '1', v_n::text);
  perform pg_temp.act(ou);
  select count(*) into v_n from public.messages where conversation_id = v_conv;
  perform pg_temp.chk('cancellation', 'participant A reads the signal', '2', v_n::text);
  perform pg_temp.act(ru);
  select count(*) into v_n from public.messages where conversation_id = v_conv;
  perform pg_temp.chk('cancellation', 'participant B reads the signal', '2', v_n::text);
  perform pg_temp.act(xu);
  select count(*) into v_n from public.messages where conversation_id = v_conv;
  perform pg_temp.chk('cancellation', 'an unrelated user reads none of it', '0', v_n::text);

  -- ── RULING 2: the reason is participant-visible, to BOTH sides ───────────
  perform pg_temp.act(ou);
  select my_cancel_reason into v_txt from public.my_barter_proposals where agreement_id = v_f;
  perform pg_temp.chk('cancellation', 'participant A reads their own reason',
    'double booked that weekend', v_txt);
  select their_cancel_reason into v_txt from public.my_barter_proposals where agreement_id = v_f;
  perform pg_temp.chk('cancellation', 'and the counterparty''s reason',
    'agreed, no hard feelings', v_txt);
  perform pg_temp.act(ru);
  select my_cancel_reason into v_txt from public.my_barter_proposals where agreement_id = v_f;
  perform pg_temp.chk('cancellation', 'participant B reads their own reason',
    'agreed, no hard feelings', v_txt);
  select their_cancel_reason into v_txt from public.my_barter_proposals where agreement_id = v_f;
  perform pg_temp.chk('cancellation', 'and A''s, from the other side',
    'double booked that weekend', v_txt);
  -- Immutability survived the ruling: neither repeat overwrote the original text.
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_agreement_cancellations
   where agreement_id = v_f and reason in ('a different reason entirely');
  perform pg_temp.chk('cancellation', 'no repeat overwrote an original reason', '0', v_n::text);

  -- NON-PARTICIPANTS SEE NOTHING. Shared with the other provider is not shared with anyone.
  perform pg_temp.act(xu);
  select count(*) into v_n from public.my_barter_proposals where agreement_id = v_f;
  perform pg_temp.chk('cancellation', 'an unrelated user reads no reason', '0', v_n::text);
  select count(*) into v_n from public.barter_agreement_cancellations where agreement_id = v_f;
  perform pg_temp.chk('cancellation', 'nor the acts they came from', '0', v_n::text);
  -- anon is stopped one layer EARLIER than the outsider: it holds no grant on the table at
  -- all, so it is refused outright rather than shown an empty result.
  perform pg_temp.act(null, 'anon');
  begin
    select count(*) into v_n from public.barter_agreement_cancellations where agreement_id = v_f;
    v_txt := 'NO ERROR';
  exception when others then v_txt := sqlstate;
  end;
  -- Back to service_role BEFORE recording: anon cannot write the harness result table either.
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and anon is refused the table outright', '42501', v_txt);
end $$;

-- ── 20261008000000 / 20261009000000: the signal is addressed, and it can never
--    veto the act it announces ──────────────────────────────────────────────
-- Every property below was dropped by the first draft of the signal, which was hand-copied
-- from the SUPERSEDED release-signal body instead of the live one. They are asserted rather
-- than commented because a comment is exactly what failed to preserve them.
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  v_conv uuid; v_g uuid; v_h uuid; v_n integer; v_code text; v_res text;
  v_recipients text;
begin
  perform pg_temp.act_service();
  select id into v_conv from public.conversation
   where provider_pair_key = public.provider_pair_key(
     (select id from public.providers where user_id = ou),
     (select id from public.providers where user_id = ru));

  -- ADDRESSED TO THE COUNTERPARTY. Left null, system_recipient_id means "addressed to both",
  -- and lib/messageAuthorship.ts then counts the notice as unread FOR THE ACTOR — so the
  -- provider who cancelled is badged and in-app-notified about their own act.
  select string_agg(distinct
           case when system_recipient_id = ou then 'owner'
                when system_recipient_id = ru then 'responder'
                when system_recipient_id is null then 'BOTH'
                else 'OTHER' end, ',' order by
           case when system_recipient_id = ou then 'owner'
                when system_recipient_id = ru then 'responder'
                when system_recipient_id is null then 'BOTH'
                else 'OTHER' end)
    into v_recipients
    from public.messages where conversation_id = v_conv and sender_id is null;
  -- Agreement f: owner cancelled first (-> addressed to the responder), responder assented
  -- (-> addressed to the owner). One of each, and never null.
  perform pg_temp.chk('cancellation', 'each notice is addressed to the one who did NOT act',
    'owner,responder', v_recipients);
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null and system_recipient_id is null;
  perform pg_temp.chk('cancellation', 'and no notice is addressed to both', '0', v_n::text);

  -- THE NOTICE NAMES WHICH TRADE. One conversation carries a pair's whole relationship, so a
  -- context-free sentence cannot say which of several trades was cancelled.
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null and content like '%cx offering f%';
  perform pg_temp.chk('cancellation', 'and says which trade it was about', '2', v_n::text);

  -- A CLIENT CANNOT AUTHOR ONE. The claim the whole mechanism rests on, asserted directly
  -- rather than inferred from the absence of forged rows.
  perform pg_temp.act(ou);
  begin
    insert into public.messages (conversation_id, sender_id, content)
    values (v_conv, null, 'The trade for "x" for "y" was cancelled by one provider.');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'a participant cannot author a platform notice',
    '42501', v_code);
  begin
    perform pg_temp.act(ou);
    insert into public.messages (conversation_id, sender_id, content)
    values (v_conv, ru, 'posing as the other provider');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'nor post as the other provider', '42501', v_code);

  -- THE SIGNAL NEVER VETOES THE ACT. A thread the message trigger refuses must suppress the
  -- NOTICE and leave the cancellation recorded. Before 20261008000000 the trigger's
  -- check_violation aborted the whole RPC, so a participant could be permanently denied
  -- PD-046's only ordinary exit by a condition on a MESSAGING row they cannot see or fix --
  -- and lib/barterErrors.ts answered it with "That trade is no longer available", which was
  -- false.
  v_g := pg_temp.cx_agreement(ou, ru, 'g');
  perform pg_temp.act_service();
  update public.conversation set request_status = 'declined' where id = v_conv;
  perform pg_temp.act(ou);
  select public.cancel_barter_agreement(v_g, 'thread is closed') into v_res;
  perform pg_temp.chk('cancellation',
    'a refusing thread does not stop the cancellation', 'cancelled_by_participant', v_res);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and the act is recorded', '1', pg_temp.cx_acts(v_g)::text);
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null and content like '%cx offering g%';
  perform pg_temp.chk('cancellation', 'while the notice is suppressed, not forced', '0',
    v_n::text);

  -- Same for a pending thread, the other status the trigger refuses.
  v_h := pg_temp.cx_agreement(ou, ru, 'h');
  perform pg_temp.act_service();
  update public.conversation set request_status = 'pending' where id = v_conv;
  perform pg_temp.act(ru);
  select public.cancel_barter_agreement(v_h) into v_res;
  perform pg_temp.chk('cancellation', 'a pending thread does not stop it either',
    'cancelled_by_participant', v_res);
  perform pg_temp.act_service();
  perform pg_temp.chk('cancellation', 'and that act is recorded too', '1',
    pg_temp.cx_acts(v_h)::text);
  update public.conversation set request_status = 'accepted' where id = v_conv;

  -- NO THREAD AT ALL is not an error either. Made explicit so a reordering cannot silently
  -- lose it: agreements a-e were all cancelled before the thread above existed.
  perform pg_temp.chk('cancellation', 'and a pair with no thread cancelled fine earlier',
    'true', (pg_temp.cx_acts(current_setting('b5b.cx_a')::uuid) > 0)::text);

  -- THE NOTICE WRITER IS NOT CALLABLE BY A CLIENT. It writes a message nobody authored.
  perform pg_temp.chk('cancellation', 'anon cannot execute the notice writer', 'false',
    has_function_privilege('anon',
      'public.pair_conversation_notice(uuid,uuid,uuid,uuid,text,uuid)', 'execute')::text);
  perform pg_temp.chk('cancellation', 'nor can authenticated', 'false',
    has_function_privilege('authenticated',
      'public.pair_conversation_notice(uuid,uuid,uuid,uuid,text,uuid)', 'execute')::text);
  perform pg_temp.chk('cancellation', 'and it is postgres-owned, definer, search_path pinned',
    '1', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'pair_conversation_notice'
             and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
             and array_to_string(p.proconfig, ',') like '%search_path=%'));
end $$;

-- ── 20261010000000: no notice claims a meeting of minds that never happened ─
-- The second notice used to read "Both providers agreed to cancel …". True of one sequence
-- (A cancels, B reads it and taps "Agree to cancel"), FALSE of the other the server allows
-- (A and B cancel concurrently, neither having seen the other's act). Both reach two acts, so
-- both reached that sentence. The neutral form states only what the two acts PROVE.
--
-- The CLASSIFICATION is unchanged and still asserted above as 'mutually_cancelled': two
-- explicit acts is still Mutually Cancelled. Only the durable sentence changed.
do $$
declare
  ou uuid := current_setting('b5b.cx_ou')::uuid;
  ru uuid := current_setting('b5b.cx_ru')::uuid;
  v_conv uuid; v_i uuid; v_n integer; v_res text;
begin
  perform pg_temp.act_service();
  select id into v_conv from public.conversation
   where provider_pair_key = public.provider_pair_key(
     (select id from public.providers where user_id = ou),
     (select id from public.providers where user_id = ru));

  -- Agreement f above went A-cancels-then-B-assents, the sequence the old copy was written
  -- for. Even there the notice must not assert agreement, because the thread record cannot
  -- distinguish it from the concurrent case a reader is entitled to assume it might be.
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null
     and (content ilike '%agreed%' or content ilike '%consent%'
          or content ilike '%mutual%' or content ilike '%both of you%');
  perform pg_temp.chk('cancellation', 'no notice claims the providers agreed', '0', v_n::text);

  -- The neutral sentence, on a trade cancelled from the OTHER order (responder first), so the
  -- copy is proven independent of who moved first.
  v_i := pg_temp.cx_agreement(ou, ru, 'i');
  perform pg_temp.act(ru);
  perform public.cancel_barter_agreement(v_i, 'responder went first');
  perform pg_temp.act(ou);
  select public.cancel_barter_agreement(v_i) into v_res;
  perform pg_temp.chk('cancellation', 'two acts still classify as mutually cancelled',
    'mutually_cancelled', v_res);
  perform pg_temp.act_service();
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null
     and content = 'Both providers cancelled the trade for "cx offering i" for "cx seeking i".';
  perform pg_temp.chk('cancellation',
    'the second notice states the fact, verbatim and with its trade context', '1', v_n::text);

  -- EXACTLY ONCE survives the copy change, in both directions.
  perform pg_temp.act(ou);
  perform public.cancel_barter_agreement(v_i, 'repeat after mutual');
  perform pg_temp.act(ru);
  perform public.cancel_barter_agreement(v_i);
  perform pg_temp.act_service();
  select count(*) into v_n from public.messages
   where conversation_id = v_conv and sender_id is null and content like '%cx offering i%';
  perform pg_temp.chk('cancellation', 'and repeats by either participant add no notice',
    '2', v_n::text);

  -- The reason still never reaches the thread.
  select count(*) into v_n from public.messages
   where conversation_id = v_conv
     and (content like '%responder went first%' or content like '%repeat after mutual%');
  perform pg_temp.chk('cancellation', 'and no reason leaked through the new copy', '0',
    v_n::text);
end $$;
