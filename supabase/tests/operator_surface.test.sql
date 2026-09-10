-- B5B suite: Session 8B — the operator surface, and the authority it required.
--
-- Session 8 built the queue's backend and PD-068 was amended to PARTIALLY
-- SATISFIED, because working a case needed a `psql` session. Finishing it meant
-- widening `is_operator()`, which `20261023000000` had deliberately NARROWED —
-- so the question this suite answers is not "can an operator work a case" but
-- **"what did widening the authority cost?"**
--
-- Almost everything below is therefore a REFUSAL, asserted as an ordinary
-- signed-in user who is not an operator. The lesson from Session 8 is written
-- into the shape: exercise the predicate AS THE ROLE THAT WOULD ATTACK IT, not
-- as the one that cannot fail.

do $$
declare
  opu uuid := gen_random_uuid();   -- an allow-listed operator
  usr uuid := gen_random_uuid();   -- an ordinary signed-in user
  pu  uuid := gen_random_uuid();   -- a provider's owner
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (opu), (usr), (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'S8B Provider', 's8b_'||substr(pu::text,1,8));
  insert into public.clients(id, name) values (usr, 'S8B User') on conflict (id) do nothing;
  insert into public.operators(user_id, granted_by_user_id, note)
    values (opu, null, 'suite fixture');
  perform set_config('b5b.s8b_op', opu::text, true);
  perform set_config('b5b.s8b_usr', usr::text, true);
  perform set_config('b5b.s8b_pu', pu::text, true);
  perform set_config('b5b.s8b_prov',
    (select id from public.providers where user_id = pu)::text, true);
end $$;

-- ══ 1. THE ALLOW-LIST IS NOT WRITABLE, READABLE, OR ENUMERABLE ════════════
--
-- The single most important property here. A surface that can grant its own
-- authority is not an authority, so no client role holds ANYTHING on this table.
select pg_temp.chk('operator', 'RLS is on for the operator allow-list', 'true',
  (select relrowsecurity::text from pg_class where oid = 'public.operators'::regclass));
select pg_temp.chk('operator', 'authenticated cannot WRITE the allow-list', 'false',
  (has_table_privilege('authenticated','public.operators','INSERT')
   or has_table_privilege('authenticated','public.operators','UPDATE')
   or has_table_privilege('authenticated','public.operators','DELETE'))::text);
-- Not even READ. The roster of who can act on reports is not enumerable from a
-- client, and no screen needs it — a screen needs to know about ITS OWN caller.
select pg_temp.chk('operator', 'and cannot READ it either', 'false',
  has_table_privilege('authenticated','public.operators','SELECT')::text);
select pg_temp.chk('operator', 'anon holds nothing at all', 'false',
  (has_table_privilege('anon','public.operators','SELECT')
   or has_table_privilege('anon','public.operators','INSERT'))::text);
-- And RLS denies independently of the grant, so neither is the only refusal.
select pg_temp.chk('operator', 'no policy admits a client to the allow-list', '0',
  (select count(*)::text from pg_policies
    where schemaname = 'public' and tablename = 'operators'));

-- AN OPERATOR CANNOT PROMOTE ANYONE, INCLUDING THEMSELVES.
do $$
declare
  opu uuid := current_setting('b5b.s8b_op')::uuid;
  usr uuid := current_setting('b5b.s8b_usr')::uuid;
  v_code text;
begin
  perform pg_temp.act(opu);
  begin
    insert into public.operators(user_id) values (usr);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator', 'an operator cannot make another operator', '42501', v_code);

  perform pg_temp.act(usr);
  begin
    insert into public.operators(user_id) values (usr);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator', 'and a user cannot promote themselves', '42501', v_code);
  perform pg_temp.act_service();
end $$;

-- ══ 2. is_operator() ANSWERS ONLY ABOUT ITS CALLER ════════════════════════
--
-- Granting this to `authenticated` is safe for one reason and one only: IT TAKES
-- NO ARGUMENTS. `contact_blocked(uuid, uuid)` was granted the same way and
-- became an oracle, because it answered about anyone (20261055000000). If a
-- parameter is ever added here, this assertion is the thing that should stop it.
select pg_temp.chk('operator', 'is_operator takes no arguments', '0',
  (select pronargs::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_operator'));
select pg_temp.chk('operator', 'is_operator is callable by authenticated', 'true',
  has_function_privilege('authenticated','public.is_operator()','EXECUTE')::text);
select pg_temp.chk('operator', 'but never by anon', 'false',
  has_function_privilege('anon','public.is_operator()','EXECUTE')::text);

do $$
declare
  opu uuid := current_setting('b5b.s8b_op')::uuid;
  usr uuid := current_setting('b5b.s8b_usr')::uuid;
begin
  perform pg_temp.act(opu);
  perform pg_temp.chk('operator', 'an allow-listed user IS an operator', 'true',
    public.is_operator()::text);
  perform pg_temp.act(usr);
  perform pg_temp.chk('operator', 'an ordinary signed-in user is NOT', 'false',
    public.is_operator()::text);
  perform pg_temp.act_service();
  -- THE TWO ORIGINAL ARMS SURVIVE. Migrations, ops scripts and every erasure
  -- cascade depend on them; 20261053000000 exists because that was forgotten once.
  perform pg_temp.chk('operator', 'service_role is still an operator', 'true',
    public.is_operator()::text);
end $$;

-- ══ 3. CASE DATA IS OPERATOR-ONLY ═════════════════════════════════════════
do $$
declare
  opu uuid := current_setting('b5b.s8b_op')::uuid;
  usr uuid := current_setting('b5b.s8b_usr')::uuid;
  prov uuid := current_setting('b5b.s8b_prov')::uuid;
  pu uuid := current_setting('b5b.s8b_pu')::uuid;
  v_case uuid; v_n integer; v_code text;
begin
  perform pg_temp.act_service();
  update public.providers set is_approved = false where id = prov;
  delete from public.operator_cases where provider_id = prov;
  insert into public.operator_cases (case_type, provider_id, requested_by_user_id, status,
                                     operator_notes)
  values ('provider_appeal', prov, pu, 'open', 'INTERNAL: do not show a participant')
  returning id into v_case;
  insert into public.operator_case_events(case_id, actor_user_id, action, to_status, note)
  values (v_case, pu, 'opened', 'open', 'please look again');

  -- The operator sees it.
  perform pg_temp.act(opu);
  select count(*) into v_n from public.operator_cases where id = v_case;
  perform pg_temp.chk('operator', 'an operator can read a case', '1', v_n::text);
  select count(*) into v_n from public.operator_case_events where case_id = v_case;
  perform pg_temp.chk('operator', 'and its history', '1', v_n::text);

  -- NOBODY ELSE DOES — including the provider whose own appeal it is. They have
  -- my_provider_review_status() for that, which returns a status and never notes.
  perform pg_temp.act(pu);
  select count(*) into v_n from public.operator_cases where id = v_case;
  perform pg_temp.chk('operator',
    'the SUBJECT of a case cannot read the case', '0', v_n::text);
  select count(*) into v_n from public.operator_case_events where case_id = v_case;
  perform pg_temp.chk('operator', 'nor its internal history', '0', v_n::text);

  perform pg_temp.act(usr);
  select count(*) into v_n from public.operator_cases where id = v_case;
  perform pg_temp.chk('operator', 'nor can an unrelated user', '0', v_n::text);

  -- READ ONLY, EVEN FOR AN OPERATOR. Every change goes through the audited RPCs;
  -- a direct UPDATE would alter a case with no record of who did it or why.
  perform pg_temp.act(opu);
  begin
    update public.operator_cases set status = 'resolved' where id = v_case;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator',
    'an operator cannot UPDATE a case directly', '42501', v_code);
  begin
    insert into public.operator_case_events(case_id, action) values (v_case, 'noted');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator',
    'nor forge a history entry', '42501', v_code);
  perform pg_temp.act_service();
end $$;

-- ══ 4. THE READ FUNCTIONS REFUSE A NON-OPERATOR ═══════════════════════════
do $$
declare
  opu uuid := current_setting('b5b.s8b_op')::uuid;
  usr uuid := current_setting('b5b.s8b_usr')::uuid;
  prov uuid := current_setting('b5b.s8b_prov')::uuid;
  v_case uuid; v_n integer; v_code text; v_json jsonb;
begin
  perform pg_temp.act_service();
  select id into v_case from public.operator_cases where provider_id = prov limit 1;

  perform pg_temp.act(opu);
  select count(*) into v_n from public.operator_list_cases(null, null);
  perform pg_temp.chk('operator', 'an operator sees the queue', 'true', (v_n > 0)::text);

  -- ZERO ROWS, not an error: a queue is a list, and the honest answer to "what
  -- may you work on" is an empty one.
  perform pg_temp.act(usr);
  select count(*) into v_n from public.operator_list_cases(null, null);
  perform pg_temp.chk('operator', 'a non-operator sees an EMPTY queue', '0', v_n::text);

  -- But asking for a SPECIFIC case is a different act and is refused out loud.
  begin
    v_json := public.operator_case_detail(v_case);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator',
    'and is refused outright when naming one case', '42501', v_code);

  -- The detail carries the operator-only note for the operator...
  perform pg_temp.act(opu);
  v_json := public.operator_case_detail(v_case);
  perform pg_temp.chk('operator', 'the detail includes the internal note for an operator',
    'INTERNAL: do not show a participant', v_json->>'operator_notes');
  perform pg_temp.chk('operator', 'and the facts behind the case', 'false',
    v_json->'facts'->>'is_approved');
  perform pg_temp.act_service();
end $$;

-- ══ 5. THE AUDITED ACTIONS ════════════════════════════════════════════════
select pg_temp.chk('operator', 'operator_update_case is callable by authenticated', 'true',
  has_function_privilege('authenticated',
    'public.operator_update_case(uuid,text,uuid,text)', 'EXECUTE')::text);
select pg_temp.chk('operator', 'but never by anon', 'false',
  has_function_privilege('anon',
    'public.operator_update_case(uuid,text,uuid,text)', 'EXECUTE')::text);

do $$
declare
  opu uuid := current_setting('b5b.s8b_op')::uuid;
  usr uuid := current_setting('b5b.s8b_usr')::uuid;
  prov uuid := current_setting('b5b.s8b_prov')::uuid;
  v_case uuid; v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  select id into v_case from public.operator_cases where provider_id = prov limit 1;

  -- THE GRANT IS NOT THE GATE. An ordinary user can CALL it and is refused by
  -- is_operator() inside — which is the layer that matters, because a grant can
  -- be widened by accident and the in-function check cannot be reached around.
  perform pg_temp.act(usr);
  begin
    perform public.operator_update_case(v_case, 'claimed', usr, 'let me in');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator',
    'a non-operator calling the RPC is refused by is_operator()', '42501', v_code);

  perform pg_temp.act(opu);
  perform public.operator_update_case(v_case, 'claimed', opu, 'looking at this');
  perform pg_temp.chk('operator', 'an operator can claim a case', 'under_review',
    (select status from public.operator_cases where id = v_case));
  select count(*) into v_n from public.operator_case_events
   where case_id = v_case and action = 'claimed' and actor_user_id = opu;
  perform pg_temp.chk('operator', 'and the act is recorded against them', '1', v_n::text);

  -- Restoring eligibility is the appeal's resolution AND closes the case, through
  -- the one audited path (20261054000000).
  perform public.operator_set_provider_eligibility(prov, true, opu, 'circumstances changed');
  perform pg_temp.chk('operator', 'restoring eligibility works from an operator session',
    'true', (select is_approved from public.providers where id = prov)::text);
  perform pg_temp.chk('operator', 'and closes the case it answers', 'resolved',
    (select status from public.operator_cases where id = v_case));
  perform pg_temp.act_service();
end $$;

-- ══ 6. ADJUDICATION: ONE DEFINITION OF AUTHORITY, AND THE RULES SURVIVE ═══
--
-- `adjudicate_barter_obligation` carried an INLINE COPY of two of
-- is_operator()'s three arms, so the two could drift and widening one would
-- silently fail to widen the other. 20261059000000 consolidated it — which means
-- the participant check below is now load-bearing against A REAL SIGNED-IN
-- PERSON who may be a party to the trade they are looking at, not merely against
-- a mistaken server process.
select pg_temp.chk('operator', 'adjudication no longer carries its own role check', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adjudicate_barter_obligation'
      and p.prosrc like '%auth.role()%'));
select pg_temp.chk('operator', 'and defers to is_operator() instead', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adjudicate_barter_obligation'
      and p.prosrc like '%is_operator()%'));
-- THE DISJUNCT A COPY-FORWARD WOULD HAVE DELETED. The ledger named
-- 20261023000000 as this function's live definition until 2026-09-10; it was
-- 20261039000000, which added PD-072's third route into Under Review. Writing
-- the new body from the ledger's answer would have removed it for the SECOND
-- time — the first is recorded in 20261042000000's header.
select pg_temp.chk('operator', 'PD-072 review requests still make a trade adjudicable', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adjudicate_barter_obligation'
      and p.prosrc like '%barter_obligation_review_requests%'));
-- And the participant check, made twice by design.
select pg_temp.chk('operator', 'a participant still cannot adjudicate their own trade', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adjudicate_barter_obligation'
      and p.prosrc like '%A participant cannot adjudicate their own trade%'));

-- THE GATE, EXERCISED RATHER THAN READ. Everything above this point inspects
-- `prosrc`, which proves the code CONTAINS a check and not that the check FIRES.
-- `is_operator()` runs before the obligation is even looked up, so a made-up id
-- is enough to prove which refusal comes first — and that is the assertion two
-- other suites now defer to.
do $$
declare
  opu uuid := current_setting('b5b.s8b_op')::uuid;
  usr uuid := current_setting('b5b.s8b_usr')::uuid;
  v_code text;
begin
  perform pg_temp.act(usr);
  begin
    perform public.adjudicate_barter_obligation(
      gen_random_uuid(), 'fulfilled', usr, 'let me decide this');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator',
    'an ordinary user is refused adjudication before anything is looked up',
    '42501', v_code);

  -- The same call as an OPERATOR gets past the gate and fails on the FACTS,
  -- which is how we know the gate was the only thing refusing the first caller.
  perform pg_temp.act(opu);
  begin
    perform public.adjudicate_barter_obligation(
      gen_random_uuid(), 'fulfilled', opu, 'deciding a trade that does not exist');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('operator',
    'an operator gets past the gate and is stopped by the facts instead',
    '23514', v_code);
  perform pg_temp.act_service();
end $$;

-- THE DELETE CARVE-OUT IS *NOT* WIDENED. An operator may RECORD an outcome and
-- may never delete one; only service_role and a no-claims session may, so
-- account erasure still cascades. "Extend is_operator() everywhere" must not be
-- read as covering this.
select pg_temp.chk('operator', 'an outcome cannot be deleted by an operator session', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_barter_adjudication_append_only'
      and p.prosrc like '%is_operator()%'));

-- ══ 7. SCOPE PIN — Session 8B added a surface, not a platform ═════════════
--
-- The founder's constraint, made testable: no generic admin capability crept in
-- alongside the queue.
select pg_temp.chk('operator', 'no operator function reads message contents', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'operator\_%'
      and p.prosrc like '%public.messages%'));
select pg_temp.chk('operator', 'no operator function can delete anything', '0',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'operator\_%'
      and p.prosrc ilike '%delete from%'));
-- No case field invites a judgement about what a trade was WORTH (PD-069),
-- and no SLA field appeared with the surface (PD-068).
select pg_temp.chk('operator', 'still no value, SLA or priority field on a case', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name in ('operator_cases','operators')
      and (column_name ilike '%value%' or column_name ilike '%amount%'
           or column_name ilike '%price%' or column_name ilike '%sla%'
           or column_name ilike '%due%' or column_name ilike '%priority%')));
select pg_temp.act_service();
