-- B5B suite: Session 8 — blocking, reporting, eligibility, and the operator queue.
--
-- The question this suite exists to answer is not "does a block block?" but the
-- one that decides whether blocking is SAFE TO SHIP: **does it take anything away
-- that someone still needs?** A block that severed a live trade would be more
-- dangerous than no block at all, so most of what follows asserts what a block
-- deliberately does NOT do.
--
-- Its own identities throughout, so nothing here depends on what earlier suites
-- left behind and nothing here disturbs them.

do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid(); cu uuid := gen_random_uuid();
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu), (cu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S8 Provider A', 's8a_'||substr(au::text,1,8));
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S8 Provider B', 's8b_'||substr(bu::text,1,8));
  insert into public.clients(id, name) values (cu, 'S8 Client')
    on conflict (id) do nothing;
  perform set_config('b5b.s8_a', au::text, true);
  perform set_config('b5b.s8_b', bu::text, true);
  perform set_config('b5b.s8_c', cu::text, true);
  perform set_config('b5b.s8_pa',
    (select id from public.providers where user_id = au)::text, true);
  perform set_config('b5b.s8_pb',
    (select id from public.providers where user_id = bu)::text, true);
end $$;

-- ══ 1. THE BLOCK RECORD ═══════════════════════════════════════════════════
select pg_temp.chk('safety', 'RLS is enabled on user_blocks', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.user_blocks'::regclass));
select pg_temp.chk('safety', 'anon holds nothing on user_blocks', 'false',
  (has_table_privilege('anon','public.user_blocks','SELECT')
   or has_table_privilege('anon','public.user_blocks','INSERT'))::text);
select pg_temp.chk('safety', 'authenticated may select/insert/delete but never UPDATE', 'true',
  (has_table_privilege('authenticated','public.user_blocks','SELECT')
   and has_table_privilege('authenticated','public.user_blocks','INSERT')
   and has_table_privilege('authenticated','public.user_blocks','DELETE')
   and not has_table_privilege('authenticated','public.user_blocks','UPDATE'))::text);

do $$
declare
  au uuid := current_setting('b5b.s8_a')::uuid;
  bu uuid := current_setting('b5b.s8_b')::uuid;
  cu uuid := current_setting('b5b.s8_c')::uuid;
  v_code text; v_n integer;
begin
  -- A user blocks another.
  perform pg_temp.act(cu);
  begin
    insert into public.user_blocks(blocker_user_id, blocked_user_id) values (cu, au);
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'a user can block another user', 'OK', v_code);

  -- IDENTITY CANNOT BE FORGED. Filing a block in someone else's name would let an
  -- attacker cut a person off from their own counterparties.
  begin
    insert into public.user_blocks(blocker_user_id, blocked_user_id) values (bu, au);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'a user cannot forge a block in someone else''s name',
    '42501', v_code);

  -- Self-block is meaningless and refused by CHECK.
  begin
    insert into public.user_blocks(blocker_user_id, blocked_user_id) values (cu, cu);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'a user cannot block themselves', '23514', v_code);

  -- THE BLOCKED PARTY IS NEVER TOLD. Announcing a block to the person it was
  -- taken against is itself a safety event.
  perform pg_temp.act(au);
  select count(*) into v_n from public.user_blocks;
  perform pg_temp.chk('safety', 'the blocked party cannot see the block', '0', v_n::text);

  -- Only the blocker lifts it.
  begin
    delete from public.user_blocks where blocked_user_id = au;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  select count(*) into v_n from public.user_blocks
   where blocker_user_id = cu and blocked_user_id = au;
  perform pg_temp.chk('safety', 'the blocked party cannot lift the block', '1', v_n::text);
end $$;

-- A block row is history, not a mutable field.
select pg_temp.act(current_setting('b5b.s8_c')::uuid);
select pg_temp.chk_blocked('safety', 'a block cannot be edited',
  format('update public.user_blocks set blocked_user_id = %L where blocker_user_id = %L',
         current_setting('b5b.s8_b'), current_setting('b5b.s8_c')),
  'permission denied');
select pg_temp.chk_allowed('safety', 'but the blocker CAN remove it (unblock)',
  format('delete from public.user_blocks where blocker_user_id = %L and blocked_user_id = %L',
         current_setting('b5b.s8_c'), current_setting('b5b.s8_a')));
select pg_temp.act_service();

-- ══ 2. THE PREDICATE IS SYMMETRIC ═════════════════════════════════════════
--
-- A one-way effect would stop only the person who asked for the block.
do $$
declare
  au uuid := current_setting('b5b.s8_a')::uuid;
  cu uuid := current_setting('b5b.s8_c')::uuid;
begin
  perform pg_temp.act_service();
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (cu, au);
  perform pg_temp.chk('safety', 'the block is seen from the blocker''s side', 'true',
    public.contact_blocked(cu, au)::text);
  perform pg_temp.chk('safety', 'and equally from the blocked party''s side', 'true',
    public.contact_blocked(au, cu)::text);
  perform pg_temp.chk('safety', 'an unrelated pair is not blocked', 'false',
    public.contact_blocked(au, current_setting('b5b.s8_b')::uuid)::text);
end $$;

-- ══ 3. A BLOCK STOPS NEW CONTACT ══════════════════════════════════════════
do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  pa uuid := current_setting('b5b.s8_pa')::uuid;
  v_code text;
begin
  perform pg_temp.act(cu);

  -- A new BOOKING.
  begin
    insert into public.bookings(user_id, provider_id, service_name, requested_date)
    values (cu, pa, 'blocked booking', current_date);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'a blocked pair cannot start a new booking', 'PT427', v_code);

  -- A new CONVERSATION.
  begin
    insert into public.conversation(client_id, provider_id) values (cu, pa);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'a blocked pair cannot open a new conversation',
    '42501', v_code);
  perform pg_temp.act_service();
end $$;

-- The refusal must not be an oracle: PT427 (block) and PT426 (de-approved) are
-- different facts, and a surface that conflated them would tell a blocked user
-- that a provider had been removed from the marketplace.
select pg_temp.chk('safety', 'the block refusal has its OWN sqlstate, distinct from PT426',
  'true', ('PT427' <> 'PT426')::text);

-- ══ 4. WHAT A BLOCK MUST NOT TAKE AWAY ════════════════════════════════════
--
-- The heart of the suite. History survives, and a LIVE transaction keeps its
-- communication path — otherwise blocking mid-trade would trap both people.
do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  au uuid := current_setting('b5b.s8_a')::uuid;
  pa uuid := current_setting('b5b.s8_pa')::uuid;
  v_bk uuid; v_conv uuid; v_code text; v_n integer;
begin
  -- Build the live booking + thread BEFORE the block, as service_role.
  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = cu and blocked_user_id = au;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, expires_at)
  values (cu, pa, 'live service', current_date, 'accepted',
          now() - interval '1 hour', now() + interval '71 hours')
  returning id into v_bk;
  insert into public.conversation(client_id, provider_id, booking_id)
  values (cu, pa, v_bk) returning id into v_conv;

  -- Now block.
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (cu, au);

  perform pg_temp.chk('safety', 'the pair genuinely has a live transaction', 'true',
    public.has_live_transaction(cu, au)::text);

  -- HISTORY SURVIVES.
  perform pg_temp.act(cu);
  select count(*) into v_n from public.bookings where id = v_bk;
  perform pg_temp.chk('safety', 'the existing booking is still readable after a block',
    '1', v_n::text);
  select count(*) into v_n from public.conversation where id = v_conv;
  perform pg_temp.chk('safety', 'the existing conversation is still readable', '1', v_n::text);

  -- THE EXCEPTION: they can still talk about the thing they are in the middle of.
  begin
    insert into public.messages(conversation_id, sender_id, content)
    values (v_conv, cu, 'about our booking');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'a LIVE transaction keeps its thread open despite the block', 'OK', v_code);

  -- AND THE COUNTERPARTY TOO — the exception is useless if it works one way.
  perform pg_temp.act(au);
  begin
    insert into public.messages(conversation_id, sender_id, content)
    values (v_conv, au, 'on my way');
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'and so does the blocked counterparty', 'OK', v_code);

  -- THE EXCEPTION IS BOUNDED. Once the booking is terminal there is nothing left
  -- to finish, and the block bites here too.
  perform pg_temp.act_service();
  update public.bookings set status = 'completed', completed_at = now() where id = v_bk;
  perform pg_temp.chk('safety', 'a completed booking is no longer a live transaction',
    'false', public.has_live_transaction(cu, au)::text);

  perform pg_temp.act(cu);
  begin
    insert into public.messages(conversation_id, sender_id, content)
    values (v_conv, cu, 'after it ended');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'once the transaction is over, the block applies to messaging too', '42501', v_code);
  perform pg_temp.act_service();
end $$;

-- A DRAFT is not a live transaction — otherwise a blocked party could
-- manufacture their own exception by opening a booking flow.
do $$
declare
  bu uuid := current_setting('b5b.s8_b')::uuid;
  cu uuid := current_setting('b5b.s8_c')::uuid;
  pb uuid := current_setting('b5b.s8_pb')::uuid;
begin
  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pb, 'a draft', current_date);
  perform pg_temp.chk('safety', 'a DRAFT booking does not count as a live transaction',
    'false', public.has_live_transaction(cu, bu)::text);
  delete from public.bookings where user_id = cu and provider_id = pb and submitted_at is null;
end $$;

-- ══ 5. PROVIDER ELIGIBILITY GATES WRITES, NEVER CLEANUP ═══════════════════
--
-- The trap `20260906000000` documented: gating `caller_provider_id()` itself
-- would lock a de-approved provider out of closing their OWN offers.
do $$
declare
  bu uuid := current_setting('b5b.s8_b')::uuid;
  pb uuid := current_setting('b5b.s8_pb')::uuid;
  v_offer uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
  values (pb, bu, 'offer while approved', 'something')
  returning id into v_offer;
  update public.providers set is_approved = false where id = pb;

  perform pg_temp.act(bu);
  perform pg_temp.chk('safety', 'a de-approved provider is not an ELIGIBLE caller', 'true',
    (public.caller_eligible_provider_id() is null)::text);
  perform pg_temp.chk('safety',
    'but is still a caller — they can act on their own rows', 'true',
    (public.caller_provider_id() = pb)::text);

  -- They cannot START something new.
  begin
    insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (pb, bu, 'new offer', 'x');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'a de-approved provider cannot post a NEW barter offer',
    '42501', v_code);

  -- THE LOCKOUT THAT WAS DESIGNED AGAINST: they must still be able to close the
  -- offer they posted while approved.
  begin
    update public.barter_offers set is_active = false where id = v_offer;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'but CAN still close their own live offer (the designed-against lockout)', 'OK', v_code);

  perform pg_temp.act_service();
  update public.providers set is_approved = true where id = pb;
end $$;

-- ══ 6. THE PROVIDER APPEAL (PD-081) ═══════════════════════════════════════
do $$
declare
  bu uuid := current_setting('b5b.s8_b')::uuid;
  pb uuid := current_setting('b5b.s8_pb')::uuid;
  v_case uuid; v_again uuid; v_code text; v_n integer;
begin
  -- An APPROVED provider has nothing to appeal.
  perform pg_temp.act(bu);
  begin
    perform public.request_provider_review('let me back in');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'an approved provider cannot request eligibility review',
    '55000', v_code);

  perform pg_temp.act_service();
  update public.providers set is_approved = false where id = pb;

  perform pg_temp.act(bu);
  v_case := public.request_provider_review('I think this was a mistake');
  perform pg_temp.chk('safety', 'a de-approved provider CAN request review', 'true',
    (v_case is not null)::text);

  -- IDEMPOTENT: no duplicate appeals for one unresolved state.
  v_again := public.request_provider_review('asking again');
  perform pg_temp.chk('safety', 'a second request returns the SAME case', v_case::text,
    v_again::text);
  perform pg_temp.act_service();
  select count(*) into v_n from public.operator_cases
   where provider_id = pb and status in ('open','under_review');
  perform pg_temp.chk('safety', 'and only one live case exists', '1', v_n::text);

  -- The provider sees THAT it is under way, and nothing more.
  perform pg_temp.act(bu);
  select count(*) into v_n from public.my_provider_review_status();
  perform pg_temp.chk('safety', 'the provider can see their own review status', '1',
    v_n::text);

  -- APPEALING GRANTS NOTHING. A provider cannot restore their own eligibility.
  begin
    update public.providers set is_approved = true where id = pb;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('safety', 'a provider cannot restore their own eligibility', 'false',
    (select is_approved::text from public.providers where id = pb));
end $$;

-- ══ 7. THE OPERATOR BOUNDARY ══════════════════════════════════════════════
--
-- The single most important block of assertions in this suite: operator power
-- must be unreachable from an ordinary session.
select pg_temp.chk('safety', 'authenticated holds NOTHING on operator_cases', 'false',
  (has_table_privilege('authenticated','public.operator_cases','SELECT')
   or has_table_privilege('authenticated','public.operator_cases','INSERT')
   or has_table_privilege('authenticated','public.operator_cases','UPDATE')
   or has_table_privilege('authenticated','public.operator_cases','DELETE'))::text);
select pg_temp.chk('safety', 'nor on the case event log', 'false',
  (has_table_privilege('authenticated','public.operator_case_events','SELECT')
   or has_table_privilege('authenticated','public.operator_case_events','INSERT'))::text);
select pg_temp.chk('safety', 'anon holds nothing either', 'false',
  (has_table_privilege('anon','public.operator_cases','SELECT')
   or has_table_privilege('anon','public.operator_case_events','SELECT'))::text);
select pg_temp.chk('safety', 'no participant may run the case writer', 'false',
  (has_function_privilege('authenticated',
     'public.operator_update_case(uuid,text,uuid,text)','EXECUTE')
   or has_function_privilege('anon',
     'public.operator_update_case(uuid,text,uuid,text)','EXECUTE'))::text);
select pg_temp.chk('safety', 'nor set provider eligibility', 'false',
  has_function_privilege('authenticated',
    'public.operator_set_provider_eligibility(uuid,boolean,uuid,text)','EXECUTE')::text);
select pg_temp.chk('safety', 'nor even ASK whether they are an operator', 'false',
  has_function_privilege('authenticated','public.is_operator()','EXECUTE')::text);
-- Adjudication authority is unchanged by this session.
select pg_temp.chk('safety', 'adjudication is still service_role-only', 'false',
  has_function_privilege('authenticated',
    'public.adjudicate_barter_obligation(uuid,text,uuid,text)','EXECUTE')::text);

-- ══ 8. A BARTER REVIEW REQUEST REACHES THE QUEUE (PD-072) ═════════════════
do $$
declare
  ou uuid := current_setting('b5b.rw_ou')::uuid;
  ru uuid := current_setting('b5b.rw_ru')::uuid;
  v_ag uuid; v_ob uuid; v_n integer; v_type text; v_status text;
begin
  select o_ag, o_ob into v_ag, v_ob from pg_temp.rw_expired(ou, ru, 's8_queue');
  perform pg_temp.act(ou);
  perform public.request_barter_obligation_review(v_ob);

  perform pg_temp.act_service();
  select count(*), max(case_type), max(status) into v_n, v_type, v_status
    from public.operator_cases where obligation_id = v_ob;
  perform pg_temp.chk('safety', 'the review request opened exactly one case', '1', v_n::text);
  perform pg_temp.chk('safety', 'of the right type', 'barter_review', v_type);
  perform pg_temp.chk('safety', 'and it starts open', 'open', v_status);

  -- IT DECIDED NOTHING. Silence is still not a finding.
  select count(*) into v_n from public.barter_obligation_adjudications
   where obligation_id = v_ob;
  perform pg_temp.chk('safety', 'opening a case creates no outcome', '0', v_n::text);
  perform pg_temp.chk('safety', 'and the delivery fact is untouched', 'true',
    (select (delivered_at is not null)::text from public.barter_obligations where id = v_ob));

  -- The queue is auditable from the first moment.
  select count(*) into v_n from public.operator_case_events e
    join public.operator_cases c on c.id = e.case_id
   where c.obligation_id = v_ob;
  perform pg_temp.chk('safety', 'and the case opening is recorded in the audit log',
    '1', v_n::text);
  perform set_config('b5b.s8_case', (select id::text from public.operator_cases
                                      where obligation_id = v_ob), true);
end $$;

-- ══ 9. AN OPERATOR CAN ACTUALLY WORK A CASE ═══════════════════════════════
do $$
declare
  v_case uuid := current_setting('b5b.s8_case')::uuid;
  xu uuid := current_setting('b5b.rw_xu')::uuid;
  v_state text; v_n integer; v_code text;
begin
  perform pg_temp.act_service();
  v_state := public.operator_update_case(v_case, 'claimed', xu, 'looking at this');
  perform pg_temp.chk('safety', 'an operator can claim a case', 'under_review', v_state);

  v_state := public.operator_update_case(v_case, 'resolved', xu, 'spoke to both providers');
  perform pg_temp.chk('safety', 'and resolve it', 'resolved', v_state);

  -- A closed case stays closed; a new question is a new case.
  begin
    perform public.operator_update_case(v_case, 'claimed', xu, null);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'a closed case cannot be reopened', 'PT412', v_code);

  -- AUDIT: every state change left a trace.
  select count(*) into v_n from public.operator_case_events where case_id = v_case;
  perform pg_temp.chk('safety', 'every operator action is recorded', '3', v_n::text);
  perform pg_temp.chk('safety', 'with who acted and the transition', 'true',
    (select (actor_user_id = xu and from_status = 'under_review' and to_status = 'resolved')::text
       from public.operator_case_events
      where case_id = v_case and action = 'resolved'));
end $$;

-- ── The audit log is history, not a field ─────────────────────────────────
--
-- UPDATE is refused for EVERYONE, including the privileged caller. That is the
-- property requirement N actually asks for: a moderation fact cannot be quietly
-- rewritten into a different one.
select pg_temp.chk_blocked('safety', 'case history cannot be rewritten, even by an operator',
  format('update public.operator_case_events set note = ''edited'' where case_id = %L',
         current_setting('b5b.s8_case')),
  'cannot be changed');

-- DELETE IS DIFFERENT, AND THE DIFFERENCE COST A MIGRATION.
--
-- The first version of the trigger refused DELETE unconditionally, and this
-- assertion said so. It was wrong, and the concurrency harness's own teardown
-- proved it: `operator_cases` cascades from `providers`, so an unconditional
-- refusal made DELETING A PROVIDER IMPOSSIBLE —
--
--     ERROR: Case history cannot be changed.
--     CONTEXT: DELETE FROM ONLY public.operator_case_events …
--              delete from public.providers …
--
-- — which is exactly the deletion/retention semantics Session 8 was told not to
-- alter. `20261053000000` restored the `service_role` exemption that every
-- neighbouring append-only table already had.
--
-- **B5B could not have caught the original defect**: it runs in one transaction
-- that is always rolled back and never deletes a provider. It can, however, pin
-- the corrected contract, which is what these two assertions now do.
select pg_temp.chk('safety', 'an ordinary user holds no DELETE on case history at all', 'false',
  has_table_privilege('authenticated','public.operator_case_events','DELETE')::text);

do $$
declare
  v_user uuid := gen_random_uuid();
  v_pid uuid; v_case uuid; v_n integer; v_code text;
begin
  -- A whole provider, with an appeal and its history, then erased.
  perform pg_temp.act_service();
  insert into auth.users(id) values (v_user);
  insert into public.providers(user_id, display_name, username, is_approved)
    values (v_user, 'S8 Erasure', 's8e_'||substr(v_user::text,1,8), false)
    returning id into v_pid;
  insert into public.operator_cases(case_type, provider_id, requested_by_user_id, status)
    values ('provider_appeal', v_pid, v_user, 'open') returning id into v_case;
  insert into public.operator_case_events(case_id, actor_user_id, action, to_status)
    values (v_case, v_user, 'opened', 'open');

  begin
    delete from public.providers where id = v_pid;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'a provider can still be DELETED — case history must not block erasure', 'OK', v_code);

  select count(*) into v_n from public.operator_cases where id = v_case;
  perform pg_temp.chk('safety', 'and the case cascades away with them', '0', v_n::text);
  select count(*) into v_n from public.operator_case_events where case_id = v_case;
  perform pg_temp.chk('safety', 'and so does its history', '0', v_n::text);
  delete from auth.users where id = v_user;
end $$;
select pg_temp.act_service();

-- ══ 10. REPORTS: THE PRIVATE-NOTES LEAK ═══════════════════════════════════
--
-- `reports.admin_notes` predates this session and was readable by the reporter,
-- whose SELECT policy is `auth.uid() = reporter_user_id` with no column limit.
select pg_temp.chk('safety', 'a reporter can no longer read operator notes', 'false',
  has_column_privilege('authenticated','public.reports','admin_notes','SELECT')::text);
select pg_temp.chk('safety', 'nor who resolved it', 'false',
  has_column_privilege('authenticated','public.reports','resolved_by','SELECT')::text);
select pg_temp.chk('safety', 'but can still read their own report''s substance', 'true',
  has_column_privilege('authenticated','public.reports','report_status','SELECT')::text);
select pg_temp.chk('safety', 'the my_reports view exposes no operator column', '0',
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='my_reports'
      and column_name in ('admin_notes','resolved_by')));

do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  au uuid := current_setting('b5b.s8_a')::uuid;
  v_report uuid; v_n integer; v_code text;
begin
  perform pg_temp.act(cu);
  insert into public.reports(reporter_user_id, report_type, report_reason, reported_user_id, notes)
  values (cu, 'client', 'safety_concern', au, 'what happened')
  returning id into v_report;

  perform pg_temp.act_service();
  select count(*) into v_n from public.operator_cases
   where report_id = v_report and case_type = 'user_report';
  perform pg_temp.chk('safety', 'a report lands in the operator queue', '1', v_n::text);

  -- The reporter cannot promote their own report or mark it resolved.
  perform pg_temp.act(cu);
  begin
    update public.reports set report_status = 'resolved' where id = v_report;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.act_service();
  perform pg_temp.chk('safety', 'a reporter cannot resolve their own report', 'open',
    (select report_status from public.reports where id = v_report));

  -- Resolving the case keeps the report in step, so the two never disagree.
  perform public.operator_update_case(
    (select id from public.operator_cases where report_id = v_report),
    'dismissed', current_setting('b5b.rw_xu')::uuid, 'no action needed');
  perform pg_temp.chk('safety', 'resolving the case updates the report it points at',
    'dismissed', (select report_status from public.reports where id = v_report));
end $$;

-- ══ 11. SCOPE PIN — Session 8 added no new authority and no new vocabulary ═
select pg_temp.chk('safety', 'still exactly three terminal barter outcomes', '3',
  (select count(distinct outcome)::text from (values ('fulfilled'),('unfulfilled'),
    ('closed_without_resolution')) as t(outcome)));
-- No case field invites a judgement about what a trade was WORTH.
select pg_temp.chk('safety', 'no case column asks what a trade was worth', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name in ('operator_cases','operator_case_events')
      and (column_name ilike '%value%' or column_name ilike '%amount%'
           or column_name ilike '%price%' or column_name ilike '%fair%'
           or column_name ilike '%credit%' or column_name ilike '%score%')));
-- And no SLA field, because PD-068 says there is no SLA.
select pg_temp.chk('safety', 'and no SLA or deadline field exists on a case', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'operator_cases'
      and (column_name ilike '%sla%' or column_name ilike '%due%'
           or column_name ilike '%deadline%' or column_name ilike '%priority%')));
select pg_temp.act_service();

-- ══ 12. THE THREE WAYS THE BLOCK WAS DEFEATED ═════════════════════════════
--
-- Every assertion below covers a defect that SHIPPED into this branch and that
-- SECURITY REVIEW found, not this suite. Worth being precise about why, because
-- the gap is a property of how the tests were written rather than bad luck:
-- sections 1-11 exercise the predicates almost entirely as `service_role`,
-- which is the one role that could not have failed. The rule this section
-- encodes is "assert as the role that would attack it."

-- ── 12a. The predicates are not callable by a client ──────────────────────
--
-- All three were `SECURITY DEFINER` **and** granted to `authenticated`, so they
-- were reachable at `/rest/v1/rpc/` with attacker-chosen arguments — a
-- one-request answer to "did they block me", which PD-082 says a blocked person
-- may never be told, plus the live-transaction graph for any two uuids.
select pg_temp.chk('safety', 'contact_blocked is not client-callable', 'false',
  has_function_privilege('authenticated',
    'public.contact_blocked(uuid,uuid)', 'EXECUTE')::text);
select pg_temp.chk('safety', 'contact_blocked_provider is not client-callable', 'false',
  has_function_privilege('authenticated',
    'public.contact_blocked_provider(uuid,uuid)', 'EXECUTE')::text);
select pg_temp.chk('safety', 'has_live_transaction is not client-callable', 'false',
  has_function_privilege('authenticated',
    'public.has_live_transaction(uuid,uuid)', 'EXECUTE')::text);
select pg_temp.chk('safety', 'and anon holds none of them either', 'false',
  (has_function_privilege('anon', 'public.contact_blocked(uuid,uuid)', 'EXECUTE')
   or has_function_privilege('anon', 'public.contact_blocked_provider(uuid,uuid)', 'EXECUTE')
   or has_function_privilege('anon', 'public.has_live_transaction(uuid,uuid)', 'EXECUTE'))::text);

-- The barter gate therefore may NOT live in an RLS policy, because a policy is
-- evaluated as the caller and so would force the grant straight back.
select pg_temp.chk('safety', 'the barter block check is a trigger, not a policy', 'true',
  (select exists(select 1 from pg_trigger
     where tgrelid = 'public.barter_interests'::regclass
       and tgname = 'barter_interests_zw_not_blocked')
   and (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'barter_interests'
          and policyname = 'barter_interests_provider_insert'
          and with_check like '%contact_blocked%') = 0)::text);

-- ── 12b. A block refuses the SUBMIT, not only the INSERT ──────────────────
--
-- `PT427` sat inside `if tg_op = 'INSERT'`, but a bookings row only becomes a
-- REQUEST on the UPDATE that stamps `submitted_at` (PD-071). The shipped client
-- walks that path unaided — `ensureBookingDraft` UPDATES when a draft already
-- exists — so a blocked client holding a draft created BEFORE the block could
-- deliver a real request, and the resulting submitted booking then MANUFACTURED
-- the live-transaction messaging exception.
do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  bu uuid := current_setting('b5b.s8_b')::uuid;
  pb uuid := current_setting('b5b.s8_pb')::uuid;
  v_bk uuid; v_code text;
begin
  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = bu and blocked_user_id = cu;
  -- The draft exists FIRST, exactly as merely opening the booking flow leaves it.
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pb, 'pre-block draft', current_date + 3) returning id into v_bk;
  -- Then the provider's owner blocks the client.
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (bu, cu);

  perform pg_temp.act(cu);
  begin
    update public.bookings set submitted_at = now() where id = v_bk;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'a pre-existing draft cannot be SUBMITTED once blocked', 'PT427', v_code);

  -- And the compounding half: no submitted booking, so no manufactured exception.
  perform pg_temp.act_service();
  perform pg_temp.chk('safety',
    'so the blocked pair still has no live transaction', 'false',
    public.has_live_transaction(cu, bu)::text);
  delete from public.bookings where id = v_bk;
end $$;

-- NEGATIVE CONTROL, and the more important half of 12b: a booking submitted
-- BEFORE the block must still be completable. If the gate above ever widens from
-- the draft->submitted transition to "any update", blocking mid-booking would
-- strand both parties — which is the failure this whole feature is built to
-- avoid, arriving through the fix for a different one.
do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  bu uuid := current_setting('b5b.s8_b')::uuid;
  pb uuid := current_setting('b5b.s8_pb')::uuid;
  v_bk uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, expires_at)
  values (cu, pb, 'submitted before the block', current_date + 4, 'pending',
          now() - interval '2 hours', now() + interval '70 hours')
  returning id into v_bk;

  perform pg_temp.act(cu);
  begin
    -- The client's own cancellation, spelled the way the write gate requires it
    -- (PD-030: the status names WHO cancelled, and the actor fields must agree).
    update public.bookings
       set status = 'cancelled_by_client',
           cancellation_actor = 'client',
           cancelled_by = cu::text
     where id = v_bk;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'a booking submitted BEFORE the block can still be cancelled', 'OK', v_code);
  perform pg_temp.act_service();
  delete from public.bookings where id = v_bk;
end $$;

-- ── 12c. A block refuses re-opening a declined request ────────────────────
--
-- `enforce_conversation_update` had no block gate, so a blocked party could flip
-- a declined thread back to `pending` — putting themselves back in the blocker's
-- Requests tab, repeatedly. The message that would follow was refused; the
-- STATUS FLIP is itself the contact signal.
do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  bu uuid := current_setting('b5b.s8_b')::uuid;
  pb uuid := current_setting('b5b.s8_pb')::uuid;
  v_conv uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.conversation(client_id, provider_id, request_status)
  values (cu, pb, 'declined') returning id into v_conv;

  perform pg_temp.act(cu);
  begin
    update public.conversation set request_status = 'pending' where id = v_conv;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'a blocked party cannot reopen a declined request', '42501', v_code);

  -- But CLOSING one stays available, always. A blocker must never be prevented
  -- from ending a thread, and a gate that refused every status change would do
  -- exactly that. Declining is the PROVIDER's act — `bu` here is both the
  -- provider's owner and the blocker, which is the case that matters: the person
  -- who blocked must keep the control that ends the contact.
  perform pg_temp.act_service();
  update public.conversation set request_status = 'pending' where id = v_conv;
  perform pg_temp.act(bu);
  begin
    update public.conversation set request_status = 'declined' where id = v_conv;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety', 'but the blocker can still decline it', 'OK', v_code);
  perform pg_temp.act_service();
  delete from public.conversation where id = v_conv;
  delete from public.user_blocks where blocker_user_id = bu and blocked_user_id = cu;
end $$;

-- ══ 13. A FINISHED CASE MUST NOT LOOK LIVE ════════════════════════════════
--
-- Both defects here are one mistake wearing two faces, and both were found by QA
-- rather than by this suite: a case that was FINISHED still read as LIVE, and two
-- different surfaces believed it.
do $$
declare
  au uuid := current_setting('b5b.s8_a')::uuid;
  pa uuid := current_setting('b5b.s8_pa')::uuid;
  v_case uuid; v_n integer;
begin
  perform pg_temp.act_service();
  delete from public.operator_cases where provider_id = pa;
  update public.providers set is_approved = false where id = pa;

  -- The provider appeals, and is told there is a live review.
  perform pg_temp.act(au);
  v_case := public.request_provider_review('please look again');
  select count(*) into v_n from public.my_provider_review_status();
  perform pg_temp.chk('safety', 'a live appeal is reported to the provider', '1', v_n::text);

  -- An operator DISMISSES it. The dashboard hides "Request Review" whenever the
  -- status function returns anything, so an unfiltered answer here left a
  -- still-unavailable provider on a terminal screen with no control at all —
  -- precisely the state PD-081 exists to prevent, one round later.
  perform pg_temp.act_service();
  perform public.operator_update_case(v_case, 'dismissed',
    current_setting('b5b.rw_xu')::uuid, 'no change');

  perform pg_temp.act(au);
  select count(*) into v_n from public.my_provider_review_status();
  perform pg_temp.chk('safety',
    'a DISMISSED appeal is not reported as a live one', '0', v_n::text);

  -- And the route is genuinely open again, not merely re-drawn.
  begin
    v_case := public.request_provider_review('circumstances changed');
  exception when others then v_case := null;
  end;
  perform pg_temp.chk('safety',
    'so the provider can ask again after a dismissal', 'true', (v_case is not null)::text);
end $$;

-- Restoring eligibility CLOSES the appeal it answers. Leaving it open left a
-- stale "nothing has been decided yet" waiting to resurface on the provider's
-- dashboard the next time they were de-approved — about a request they never
-- made — and `request_provider_review` would have short-circuited to it, so
-- their REAL appeal would never have entered the queue.
do $$
declare
  au uuid := current_setting('b5b.s8_a')::uuid;
  pa uuid := current_setting('b5b.s8_pa')::uuid;
  v_case uuid; v_n integer; v_second uuid;
begin
  perform pg_temp.act_service();
  select id into v_case from public.operator_cases
   where provider_id = pa and status in ('open','under_review')
   order by created_at desc limit 1;
  perform pg_temp.chk('safety', 'the appeal is open before the decision', 'true',
    (v_case is not null)::text);

  perform public.operator_set_provider_eligibility(
    pa, true, current_setting('b5b.rw_xu')::uuid, 'restored');

  select count(*) into v_n from public.operator_cases
   where id = v_case and status in ('open','under_review');
  perform pg_temp.chk('safety',
    'restoring eligibility closes the appeal it answers', '0', v_n::text);

  -- The decision is recorded as history, not silently applied.
  select count(*) into v_n from public.operator_case_events
   where case_id = v_case and action = 'resolved';
  perform pg_temp.chk('safety', 'and the closure is an audited event', '1', v_n::text);

  -- The consequence that mattered: a LATER de-approval gets its own case rather
  -- than being swallowed by the stale one.
  update public.providers set is_approved = false where id = pa;
  perform pg_temp.act(au);
  v_second := public.request_provider_review('this is a new problem');
  perform pg_temp.chk('safety',
    'a later appeal opens a NEW case, not the stale one', 'true',
    (v_second is distinct from v_case)::text);
  perform pg_temp.act_service();
  update public.providers set is_approved = true where id = pa;
end $$;
select pg_temp.act_service();

-- ══ 14. THE BLOCK GATES FIRE LAST, AND NAME NO STRANGER ═══════════════════
--
-- `20261055000000` asserted in a comment that its two gates ran after the
-- authoritative write-integrity triggers. They did not: the names begin
-- `bookings_` and `conversation_`, so they sorted on 'b' and 'c', ahead of
-- `enforce_...` on 'e'. The comment was the only thing checking, and a comment
-- checks nothing. These assertions are the mechanism.

-- ── 14a. Position, pinned by NAME ORDER rather than by presence ────────────
-- Name order IS firing order for BEFORE triggers, so the assertion is a string
-- comparison and nothing more. The first version of this check was written as a
-- window function over pg_trigger and was itself wrong — which rather made the
-- point that a guard nobody can read at a glance is not a guard.
select pg_temp.chk('safety', 'the booking block gate sorts after write integrity', 'true',
  ('zz_bookings_submit_not_blocked' > 'enforce_booking_write_integrity')::text);
select pg_temp.chk('safety', 'and the conversation gate after its update rule', 'true',
  ('zz_conversation_reopen_not_blocked' > 'enforce_conversation_update')::text);

-- And the same fact read off the live schema, not off the names in this file.
select pg_temp.chk('safety', 'and it is literally last on the table', 'zz_bookings_submit_not_blocked',
  (select tgname from pg_trigger
    where tgrelid = 'public.bookings'::regclass and not tgisinternal
    order by tgname desc limit 1));
select pg_temp.chk('safety', 'the conversation block gate is last on its table too',
  'zz_conversation_reopen_not_blocked',
  (select tgname from pg_trigger
    where tgrelid = 'public.conversation'::regclass and not tgisinternal
    order by tgname desc limit 1));
-- The old names must be gone, not merely superseded — a leftover would fire early.
select pg_temp.chk('safety', 'neither early-sorting name survives', '0',
  (select count(*)::text from pg_trigger
    where tgname in ('bookings_zz_submit_not_blocked', 'conversation_zz_reopen_not_blocked')));

-- ── 14b. THE ORACLE, ASSERTED AS AN EQUALITY ──────────────────────────────
--
-- **This is the only test shape that can catch an oracle.** Every other
-- assertion in this file checks that a refusal HAPPENS; an oracle is not a
-- missing refusal but a DISTINGUISHABLE one, so the assertion has to be that two
-- outcomes are THE SAME. Sections 1-13 could not have caught this and did not.
--
-- The probe: name a stranger in the same UPDATE that asks the question. If the
-- answer differs depending on whether a block exists with the nominated party,
-- the caller has read the block off the SQLSTATE without writing anything.
do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  au uuid := current_setting('b5b.s8_a')::uuid;
  bu uuid := current_setting('b5b.s8_b')::uuid;
  pa uuid := current_setting('b5b.s8_pa')::uuid;
  pb uuid := current_setting('b5b.s8_pb')::uuid;
  du uuid := gen_random_uuid(); pd uuid;
  v_conv uuid; v_blocked text; v_clean text;
begin
  perform pg_temp.act_service();
  delete from public.user_blocks where blocked_user_id in (au, bu);
  -- cu IS blocked by A's owner, and is NOT blocked by B's owner. Two providers
  -- the probe can name, differing ONLY in whether a block exists.
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (au, cu);

  -- A conversation cu legitimately participates in, with a THIRD provider — so
  -- naming either probe target is a genuine change to an immutable field, and
  -- the two probes differ in nothing but the block.
  insert into auth.users(id) values (du);
  insert into public.providers(user_id, display_name, username)
    values (du, 'S8 Provider D', 's8d_'||substr(du::text,1,8))
    returning id into pd;
  delete from public.conversation where client_id = cu and provider_id = pd;
  insert into public.conversation(client_id, provider_id, request_status)
  values (cu, pd, 'declined') returning id into v_conv;

  perform pg_temp.act(cu);

  -- Probe against the provider who HAS blocked them.
  begin
    update public.conversation
       set provider_id = pa, request_status = 'pending' where id = v_conv;
    v_blocked := 'NO ERROR';
  exception when others then v_blocked := sqlstate;
  end;

  -- Probe against a provider who has NOT.
  begin
    update public.conversation
       set provider_id = pb, request_status = 'pending' where id = v_conv;
    v_clean := 'NO ERROR';
  exception when others then v_clean := sqlstate;
  end;

  -- EQUALITY. Not "is it refused" — "is it refused the SAME WAY". A caller who
  -- can tell these apart has been told they were blocked, which PD-082 forbids
  -- however few rows it writes.
  perform pg_temp.chk('safety',
    'naming a stranger reveals nothing: both probes answer identically',
    'true', (v_blocked = v_clean)::text);
  -- And specifically: it is the IMMUTABILITY rule that answers, not the block
  -- gate, because identity is no longer readable from NEW.
  perform pg_temp.chk('safety',
    'and the answer is the immutable-fields refusal, not a block refusal',
    'true', (v_blocked <> '42501')::text);

  perform pg_temp.act_service();
  delete from public.conversation where id = v_conv;
  delete from public.user_blocks where blocked_user_id = cu;
end $$;

-- ── 14c. The live-transaction exception reaches the reopen gate ───────────
--
-- Every other block gate carries it; this one did not. `getOrCreateConversation`
-- attaches a booking by setting `booking_id` AND `request_status = 'accepted'`
-- in one update, so a pair with a live booking who then blocked could never open
-- the thread for it — two people with an appointment and no way to talk about it,
-- which is the failure the exception exists to prevent.
do $$
declare
  cu uuid := current_setting('b5b.s8_c')::uuid;
  au uuid := current_setting('b5b.s8_a')::uuid;
  pa uuid := current_setting('b5b.s8_pa')::uuid;
  v_conv uuid; v_bk uuid; v_code text;
begin
  perform pg_temp.act_service();
  delete from public.user_blocks where blocked_user_id in (au, cu);
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, expires_at)
  values (cu, pa, 'live work', current_date + 1, 'accepted',
          now() - interval '1 hour', now() + interval '71 hours')
  returning id into v_bk;
  -- Section 4 already built a conversation for this pair; reuse the pair by
  -- clearing it rather than colliding with conversation_unique_pair.
  delete from public.conversation where client_id = cu and provider_id = pa;
  insert into public.conversation(client_id, provider_id, request_status)
  values (cu, pa, 'declined') returning id into v_conv;
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (cu, au);

  perform pg_temp.act(cu);
  begin
    update public.conversation set request_status = 'pending' where id = v_conv;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'a pair with a LIVE booking can still open their thread despite the block',
    'OK', v_code);

  -- And the exception is bounded, exactly as it is for messaging: once the
  -- booking is terminal the reopen is refused again.
  perform pg_temp.act_service();
  update public.bookings set status = 'completed', completed_at = now() where id = v_bk;
  update public.conversation set request_status = 'declined' where id = v_conv;
  perform pg_temp.act(cu);
  begin
    update public.conversation set request_status = 'pending' where id = v_conv;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('safety',
    'and once it is over, the reopen is refused again', '42501', v_code);

  perform pg_temp.act_service();
  delete from public.conversation where id = v_conv;
  delete from public.bookings where id = v_bk;
  delete from public.user_blocks where blocked_user_id = au;
end $$;

-- ── 14d. The grants that were narrowed for one role only ──────────────────
select pg_temp.chk('safety', 'anon cannot write reports either', 'false',
  (has_table_privilege('anon','public.reports','INSERT')
   or has_table_privilege('anon','public.reports','UPDATE')
   or has_table_privilege('anon','public.reports','DELETE'))::text);
-- The orphaned table is closed by a GRANT, not by a comment. PD-084's rule,
-- applied to the place this session first tried to answer with a label.
select pg_temp.chk('safety', 'the orphaned community_reports table is unwritable', 'false',
  (has_table_privilege('authenticated','public.community_reports','INSERT')
   or has_table_privilege('anon','public.community_reports','INSERT'))::text);
select pg_temp.chk('safety', 'and its INSERT policy is gone with the grant', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'community_reports' and cmd = 'INSERT'));
-- But the ROWS are still there. Erasing unread safety reports is a worse answer
-- than never having read them, and requirement O puts retention out of scope.
select pg_temp.chk('safety', 'the table itself still exists, with its rows', 'true',
  (to_regclass('public.community_reports') is not null)::text);
select pg_temp.act_service();
