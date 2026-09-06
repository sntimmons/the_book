-- B5B suite: agreement finalization.
--
-- Every assertion exercises real DB enforcement as the `authenticated` role. This harness runs
-- in ONE transaction and cannot stage a race; the races are proven by
-- scripts/negotiation-concurrency.mjs. What is pinned here is every invariant a race could
-- violate, plus the security posture of every object 20260927000000 created.

-- Shared cast: owner, responder, stranger; an accepted interest with a two-version negotiation.
create or replace function pg_temp.ag_due(p_days integer)
returns timestamptz
language sql
as $$
  select clock_timestamp() + make_interval(days => p_days)
$$;

create or replace function pg_temp.create_barter_proposal_timed(
  p_interest_id uuid,
  p_owner_gives text,
  p_responder_gives text
)
returns uuid
language sql
as $$
  select public.create_barter_proposal(
    p_interest_id,
    p_owner_gives, pg_temp.ag_due(7), null,
    p_responder_gives, pg_temp.ag_due(8), null
  )
$$;

create or replace function pg_temp.submit_barter_counter_timed(
  p_proposal_id uuid,
  p_owner_gives text,
  p_responder_gives text
)
returns integer
language sql
as $$
  select public.submit_barter_counter(
    p_proposal_id,
    p_owner_gives, pg_temp.ag_due(7), null,
    p_responder_gives, pg_temp.ag_due(8), null
  )
$$;

create or replace function pg_temp.expire_agreement_term_due(p_version_id uuid, p_side text)
returns void
language sql
as $$
  update public.barter_proposal_terms
     set created_at = clock_timestamp() - interval '2 days',
         due_at = clock_timestamp() - interval '1 minute',
         scheduled_at = null
   where version_id = p_version_id
     and provided_by = p_side
$$;

do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
  opid uuid; rpid uuid; xpid uuid; off1 uuid; int1 uuid; pid uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru), (xu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Agr Owner', 'agro_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Agr Resp', 'agrr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.providers(user_id, display_name, username)
    values (xu, 'Agr Other', 'agrx_'||substr(xu::text,1,8)) returning id into xpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'agr photography', 'agr training') returning id into off1;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (off1, rpid, ru, 'x', 'accepted') returning id into int1;

  perform pg_temp.act(ou);
  select pg_temp.create_barter_proposal_timed(int1, 'a photo session', 'four PT sessions') into pid;

  perform set_config('b5b.ag_ou', ou::text, true);
  perform set_config('b5b.ag_ru', ru::text, true);
  perform set_config('b5b.ag_xu', xu::text, true);
  perform set_config('b5b.ag_off1', off1::text, true);
  perform set_config('b5b.ag_int1', int1::text, true);
  perform set_config('b5b.ag_pid', pid::text, true);
  perform pg_temp.act(null, 'anon');
end $$;

-- ── Nothing short of two acceptances of the SAME CURRENT version finalizes ──
do $$
declare
  ou uuid := current_setting('b5b.ag_ou')::uuid;
  ru uuid := current_setting('b5b.ag_ru')::uuid;
  xu uuid := current_setting('b5b.ag_xu')::uuid;
  pid uuid := current_setting('b5b.ag_pid')::uuid;
  v1 uuid; v2 uuid; v_code text; v_n integer; v_no integer;
begin
  perform pg_temp.act_service();
  select id into v1 from public.barter_proposal_versions where proposal_id = pid and version_no = 1;

  -- Zero acceptances. Authoring is not acceptance.
  perform pg_temp.act(ou);
  begin
    perform public.finalize_barter_agreement(pid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'cannot finalize with zero acceptances', '40001', v_code);

  -- One acceptance.
  perform public.accept_barter_version(v1);
  begin
    perform public.finalize_barter_agreement(pid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'cannot finalize with one acceptance', '40001', v_code);

  -- The responder COUNTERS instead of accepting: v1's acceptance is now of an OLD version.
  perform pg_temp.act(ru);
  select pg_temp.submit_barter_counter_timed(pid, 'a photo session', 'FIVE PT sessions') into v_no;
  perform pg_temp.act_service();
  select id into v2 from public.barter_proposal_versions where proposal_id = pid and version_no = 2;

  perform pg_temp.act(ou);
  begin
    perform public.finalize_barter_agreement(pid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'acceptance of an OLD version is insufficient', '40001', v_code);

  -- Both accept v2 — but a stranger cannot finalize.
  perform public.accept_barter_version(v2);
  perform pg_temp.act(ru);
  perform public.accept_barter_version(v2);
  perform pg_temp.act(xu);
  begin
    perform public.finalize_barter_agreement(pid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'an unrelated user cannot finalize', '42501', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_agreements where proposal_id = pid;
  perform pg_temp.chk('agreement', 'and none of those refusals created an agreement', '0', v_n::text);
end $$;

-- ── Finalization, and what it does atomically ──────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ag_ou')::uuid;
  ru uuid := current_setting('b5b.ag_ru')::uuid;
  xu uuid := current_setting('b5b.ag_xu')::uuid;
  pid uuid := current_setting('b5b.ag_pid')::uuid;
  off1 uuid := current_setting('b5b.ag_off1')::uuid;
  int1 uuid := current_setting('b5b.ag_int1')::uuid;
  v_ag uuid; v_ag2 uuid; v_active boolean; v_n integer; v_code text; v2 uuid; v_vref uuid;
begin
  perform pg_temp.act_service();
  select id into v2 from public.barter_proposal_versions where proposal_id = pid and version_no = 2;

  -- A PARTICIPANT may finalize (the responder here; either side may).
  perform pg_temp.act(ru);
  select public.finalize_barter_agreement(pid) into v_ag;
  perform pg_temp.chk('agreement', 'a participant can finalize', 'true', (v_ag is not null)::text);
  perform set_config('b5b.ag_id', v_ag::text, true);

  perform pg_temp.act_service();
  select accepted_version_id into v_vref from public.barter_agreements where id = v_ag;
  perform pg_temp.chk('agreement', 'the agreement references the accepted CURRENT version',
    v2::text, v_vref::text);

  -- ATOMIC POST CLOSURE.
  select is_active into v_active from public.barter_offers where id = off1;
  perform pg_temp.chk('agreement', 'the sourcing post closed in the same transaction',
    'false', v_active::text);

  -- IDEMPOTENT: the other participant calling again gets the SAME agreement.
  perform pg_temp.act(ou);
  select public.finalize_barter_agreement(pid) into v_ag2;
  perform pg_temp.chk('agreement', 'a repeat finalization returns the existing agreement',
    v_ag::text, v_ag2::text);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_agreements where proposal_id = pid;
  perform pg_temp.chk('agreement', 'and creates no duplicate', '1', v_n::text);

  -- Idempotence is participant-scoped: a stranger must not be able to discover the existing
  -- agreement id by calling finalize after the participants have confirmed it.
  perform pg_temp.act(xu);
  begin
    perform public.finalize_barter_agreement(pid);
    v_code := 'NO ERROR';
  exception when others then
    v_code := sqlstate;
    perform pg_temp.chk('agreement', 'stranger-after-agreement error does not leak the id',
      'false', (position(v_ag::text in sqlerrm) > 0)::text);
  end;
  perform pg_temp.chk('agreement', 'a stranger still cannot finalize after agreement exists',
    '42501', v_code);

  -- ONE AGREEMENT PER POST / PER PROPOSAL: a second insert collides on the constraints.
  perform pg_temp.act_service();
  begin
    insert into public.barter_agreements(proposal_id, accepted_version_id, offer_id, interest_id,
      owner_provider_id, owner_user_id, responder_provider_id, responder_user_id)
    select proposal_id, accepted_version_id, offer_id, interest_id,
      owner_provider_id, owner_user_id, responder_provider_id, responder_user_id
      from public.barter_agreements where id = v_ag;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'a second agreement for the same negotiation is refused',
    '23505', v_code);

  -- The post cannot be reopened by its owner (PD-051).
  perform pg_temp.act(ou);
  begin
    update public.barter_offers set is_active = true where id = off1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'the closed post cannot be reopened normally', '55000', v_code);
end $$;

-- ── After agreement: frozen terms, no release ──────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ag_ou')::uuid;
  ru uuid := current_setting('b5b.ag_ru')::uuid;
  pid uuid := current_setting('b5b.ag_pid')::uuid;
  int1 uuid := current_setting('b5b.ag_int1')::uuid;
  v_ag uuid := current_setting('b5b.ag_id')::uuid;
  v_code text; v_status text; v2 uuid; v_vref uuid; v_n integer;
begin
  perform pg_temp.act(ou);
  begin
    perform pg_temp.submit_barter_counter_timed(pid, 'new', 'terms');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'a counter after agreement is refused', 'PT409', v_code);

  perform pg_temp.act_service();
  select id into v2 from public.barter_proposal_versions where proposal_id = pid and version_no = 2;
  perform pg_temp.act(ru);
  begin
    perform public.accept_barter_version(v2);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'a new acceptance after agreement is refused', 'PT409', v_code);

  perform pg_temp.act(ru);
  begin
    perform public.release_barter_interest(int1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'release is unavailable after agreement', 'PT409', v_code);

  perform pg_temp.act_service();
  select status into v_status from public.barter_interests where id = int1;
  perform pg_temp.chk('agreement', 'and the interest is still accepted', 'accepted', v_status);

  -- Direct-marker proof: even the internal pre-agreement release marker cannot release a
  -- confirmed trade. This proves the trigger owns the rule, not only the RPC wrapper.
  perform pg_temp.act(ou);
  perform set_config('app.barter_release', int1::text, true);
  begin
    update public.barter_interests
       set status = 'released', released_at = now(), released_by = ou,
           release_reason = 'owner_ended_negotiation'
     where id = int1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform set_config('app.barter_release', '', true);
  perform pg_temp.chk('agreement', 'direct marker release is refused after agreement',
    'PT409', v_code);
  perform pg_temp.act_service();
  select status into v_status from public.barter_interests where id = int1;
  perform pg_temp.chk('agreement', 'and direct marker release leaves it accepted',
    'accepted', v_status);

  -- The accepted-version reference is immutable, even with grants bypassed.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);
  begin
    update public.barter_agreements set accepted_version_id = gen_random_uuid() where id = v_ag;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'the accepted-version reference cannot be changed',
    '23514', v_code);
  begin
    delete from public.barter_agreements where id = v_ag;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'and the agreement cannot be deleted', '23514', v_code);

  perform pg_temp.act_service();
  select accepted_version_id into v_vref from public.barter_agreements where id = v_ag;
  perform pg_temp.chk('agreement', 'the reference is unchanged', v2::text, v_vref::text);
  select count(*) into v_n from public.barter_agreements where id = v_ag;
  perform pg_temp.chk('agreement', 'and the row survives', '1', v_n::text);
end $$;

-- ── A released negotiation cannot finalize; a stale ready-state is refused ─
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; pid uuid; v1 uuid; v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Rel Owner', 'agrl_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Rel Resp', 'agrm_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'rel offering', 'rel seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;
  perform pg_temp.act(ou);
  select pg_temp.create_barter_proposal_timed(i, 'a', 'b') into pid;
  perform pg_temp.act_service();
  select id into v1 from public.barter_proposal_versions where proposal_id = pid;
  perform pg_temp.act(ou); perform public.accept_barter_version(v1);
  perform pg_temp.act(ru); perform public.accept_barter_version(v1);

  -- Both accepted -- then the owner ends it BEFORE anyone confirms.
  perform pg_temp.act(ou);
  perform public.release_barter_interest(i);
  begin
    perform public.finalize_barter_agreement(pid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'a released negotiation cannot finalize, even if both accepted',
    '55000', v_code);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_agreements where proposal_id = pid;
  perform pg_temp.chk('agreement', 'and no agreement was created', '0', v_n::text);
end $$;

-- ── Timing must still be current when an agreement is created ─────────────
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; pid uuid; vid uuid; ag uuid; v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Final Time Owner', 'agto_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Final Time Resp', 'agtr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'final timing offering', 'final timing seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  perform pg_temp.act(ou);
  select public.create_barter_proposal(
    i,
    'owner gives', pg_temp.ag_due(7), pg_temp.ag_due(6),
    'responder gives', pg_temp.ag_due(8), null
  ) into pid;
  perform pg_temp.act_service();
  select id into vid from public.barter_proposal_versions where proposal_id = pid and version_no = 1;
  perform pg_temp.act(ou); perform public.accept_barter_version(vid);
  perform pg_temp.act(ru); perform public.accept_barter_version(vid);

  perform pg_temp.act_service();
  perform pg_temp.expire_agreement_term_due(vid, 'offer_owner');
  perform pg_temp.act(ru);
  begin
    perform public.finalize_barter_agreement(pid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement',
    'two valid acceptances do not finalize after timing expires', 'PT410', v_code);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_agreements where proposal_id = pid;
  perform pg_temp.chk('agreement', 'expired terms cannot create an official agreement',
    '0', v_n::text);

  -- Direct insert with grants bypassed must still hit the agreement boundary. This proves
  -- expiry is not only inside finalize_barter_agreement.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ru::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.barter_agreements(proposal_id, accepted_version_id, offer_id, interest_id,
      owner_provider_id, owner_user_id, responder_provider_id, responder_user_id)
    values (pid, vid, o, i, opid, ou, rpid, ru);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'direct agreement insert cannot bypass expired timing',
    'PT410', v_code);

  -- A separate still-future negotiation proves the guard is not deny-all.
  perform pg_temp.act_service();
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'valid final offering', 'valid final seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;
  perform pg_temp.act(ou);
  select pg_temp.create_barter_proposal_timed(i, 'a', 'b') into pid;
  perform pg_temp.act_service();
  select id into vid from public.barter_proposal_versions where proposal_id = pid and version_no = 1;
  perform pg_temp.act(ou); perform public.accept_barter_version(vid);
  perform pg_temp.act(ru); perform public.accept_barter_version(vid);
  select public.finalize_barter_agreement(pid) into ag;
  perform pg_temp.chk('agreement', 'finalization with still-valid timing succeeds',
    'true', (ag is not null)::text);
end $$;

-- ── Security posture of every object 20260927000000 created ────────────────
do $$
declare
  fn text; t text; v_n integer;
begin
  -- Helpers and trigger functions: NOT executable by authenticated (the Slice 3a BLOCKER).
  foreach fn in array array[
    'public.enforce_barter_agreement_immutable()',
    'public.enforce_barter_agreement_consistent()',
    'public.enforce_barter_agreement_timing_current()',
    'public.enforce_barter_acceptance_timing_current()',
    'public.assert_barter_proposal_version_timing_current(uuid)',
    'public.enforce_no_change_after_agreement()',
    'public.enforce_no_release_after_agreement()'
  ] loop
    perform pg_temp.chk('agreement', 'not executable by authenticated: ' || fn,
      'false', has_function_privilege('authenticated', fn, 'execute')::text);
    perform pg_temp.chk('agreement', 'nor by anon: ' || fn,
      'false', has_function_privilege('anon', fn, 'execute')::text);
  end loop;
  perform pg_temp.chk('agreement', 'the finalize RPC IS executable by authenticated', 'true',
    has_function_privilege('authenticated', 'public.finalize_barter_agreement(uuid)', 'execute')::text);
  perform pg_temp.chk('agreement', 'and not by anon', 'false',
    has_function_privilege('anon', 'public.finalize_barter_agreement(uuid)', 'execute')::text);

  -- Every function: definer, owned by postgres, empty search_path.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('finalize_barter_agreement', 'enforce_barter_agreement_immutable',
                       'enforce_barter_agreement_consistent', 'enforce_no_change_after_agreement',
                       'enforce_no_release_after_agreement',
                       'enforce_barter_agreement_timing_current',
                       'enforce_barter_acceptance_timing_current',
                       'assert_barter_proposal_version_timing_current')
     and (not p.prosecdef or pg_get_userbyid(p.proowner) <> 'postgres'
          or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%');
  perform pg_temp.chk('agreement', 'every new function is definer, postgres-owned, search_path pinned',
    '0', v_n::text);

  -- Table: authenticated may SELECT and nothing else; anon nothing; RLS on; no write policy.
  perform pg_temp.chk('agreement', 'barter_agreements is owned by postgres', 'postgres',
    (select pg_get_userbyid(c.relowner) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relname = 'barter_agreements' and n.nspname = 'public'));
  perform pg_temp.chk('agreement', 'authenticated may only read barter_agreements', 'true',
    (has_table_privilege('authenticated', 'public.barter_agreements', 'select')
     and not has_table_privilege('authenticated', 'public.barter_agreements', 'insert')
     and not has_table_privilege('authenticated', 'public.barter_agreements', 'update')
     and not has_table_privilege('authenticated', 'public.barter_agreements', 'delete'))::text);
  perform pg_temp.chk('agreement', 'anon holds nothing on barter_agreements', 'false',
    has_table_privilege('anon', 'public.barter_agreements', 'select')::text);
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'barter_agreements' and cmd <> 'SELECT';
  perform pg_temp.chk('agreement', 'no write policy exists on barter_agreements', '0', v_n::text);

  -- Views: security_invoker, anon nothing.
  foreach t in array array['my_barter_agreements', 'my_barter_proposals', 'my_trade_activity'] loop
    perform pg_temp.chk('agreement', t || ' is security_invoker', 'true',
      (select ('security_invoker=true' = any(c.reloptions))::text from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where c.relname = t and n.nspname = 'public'));
    perform pg_temp.chk('agreement', 'anon cannot read ' || t, 'false',
      has_table_privilege('anon', 'public.' || t, 'select')::text);
    perform pg_temp.chk('agreement', 'authenticated cannot insert ' || t, 'false',
      has_table_privilege('authenticated', 'public.' || t, 'insert')::text);
    perform pg_temp.chk('agreement', 'authenticated cannot update ' || t, 'false',
      has_table_privilege('authenticated', 'public.' || t, 'update')::text);
    perform pg_temp.chk('agreement', 'authenticated cannot delete ' || t, 'false',
      has_table_privilege('authenticated', 'public.' || t, 'delete')::text);
  end loop;

  -- Source pin, comment-stripped like the other concurrency/lock pins: idempotence must stay
  -- AFTER participant validation, or a stranger could use finalize as an agreement-id oracle.
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into t
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'finalize_barter_agreement' and n.nspname = 'public';
  perform pg_temp.chk('agreement', 'finalize idempotence lookup stays after participant validation',
    'true', (position('barter_negotiation_role' in t) > 0
             and position('select a.id into v_existing' in t)
                 > position('barter_negotiation_role' in t))::text);
end $$;

-- ── Direct writes and read isolation ───────────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ag_ou')::uuid;
  ru uuid := current_setting('b5b.ag_ru')::uuid;
  xu uuid := current_setting('b5b.ag_xu')::uuid;
  pid uuid := current_setting('b5b.ag_pid')::uuid;
  v_ag uuid := current_setting('b5b.ag_id')::uuid;
  v_code text; v_n integer; v_version uuid; v_offer uuid; v_interest uuid;
begin
  perform pg_temp.act(ou);
  begin
    insert into public.barter_agreements(proposal_id, accepted_version_id, offer_id, interest_id,
      owner_provider_id, owner_user_id, responder_provider_id, responder_user_id)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      gen_random_uuid(), ou, gen_random_uuid(), gen_random_uuid());
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'a direct agreement insert is refused', '42501', v_code);

  begin
    update public.barter_agreements set officialized_at = clock_timestamp() where id = v_ag;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'authenticated UPDATE on barter_agreements is refused',
    '42501', v_code);

  begin
    delete from public.barter_agreements where id = v_ag;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'authenticated DELETE on barter_agreements is refused',
    '42501', v_code);

  -- Bypass ordinary table grants, but not triggers. A future privileged writer still cannot
  -- insert an agreement whose references disagree with the proposal.
  perform pg_temp.act_service();
  select accepted_version_id, offer_id, interest_id
    into v_version, v_offer, v_interest
    from public.barter_agreements where id = v_ag;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.barter_agreements(proposal_id, accepted_version_id, offer_id, interest_id,
      owner_provider_id, owner_user_id, responder_provider_id, responder_user_id)
    select pid, v_version, v_offer, v_interest,
           owner_provider_id, xu, responder_provider_id, ru
      from public.barter_agreements where id = v_ag;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'inconsistent privileged agreement insert is rejected',
    '42501', v_code);

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.barter_version_acceptances(version_id, participant_user_id)
    values (gen_random_uuid(), ou);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('agreement', 'unresolvable agreement guard dispatch fails closed',
    'XX000', v_code);

  -- Participants read it; a stranger sees nothing, through the table or the view.
  select count(*) into v_n from public.my_barter_agreements where agreement_id = v_ag;
  perform pg_temp.chk('agreement', 'the owner sees the agreement', '1', v_n::text);
  perform pg_temp.act(xu);
  select count(*) into v_n from public.barter_agreements where id = v_ag;
  perform pg_temp.chk('agreement', 'a stranger cannot read the agreement row', '0', v_n::text);
  select count(*) into v_n from public.my_barter_agreements where agreement_id = v_ag;
  perform pg_temp.chk('agreement', 'nor through the view', '0', v_n::text);
  select count(*) into v_n from public.my_barter_proposals where proposal_id = pid;
  perform pg_temp.chk('agreement', 'nor the negotiation', '0', v_n::text);
end $$;
