-- B5B suite: barter proposal / versioning foundation (Slice 3a).
--
-- Every assertion exercises real DB enforcement -- RLS, grants, triggers, constraints and
-- SECURITY DEFINER RPCs -- as the `authenticated` role. Nothing here proves anything about
-- the UI, and nothing here proves concurrency: this harness runs the whole suite in ONE
-- transaction and cannot stage two simultaneous sessions. The invariants that a race would
-- violate are asserted structurally (unique constraints, the forward-only pointer); the race
-- itself is proven outside B5B. See MIGRATION_LEDGER.md for that proof.

-- Shared cast for the negotiation suite: an offer owner, an accepted responder, and an
-- uninvolved provider who must be able to reach none of it.
do $$
declare
  ou uuid := gen_random_uuid();   -- offer owner
  ru uuid := gen_random_uuid();   -- accepted responder
  xu uuid := gen_random_uuid();   -- uninvolved provider
  opid uuid; rpid uuid; xpid uuid;
  off1 uuid; int1 uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru), (xu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Neg Owner', 'nego_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Neg Resp', 'negr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.providers(user_id, display_name, username)
    values (xu, 'Neg Other', 'negx_'||substr(xu::text,1,8)) returning id into xpid;

  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service, notes)
    values (opid, ou, 'photography', 'training', 'original notes') returning id into off1;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (off1, rpid, ru, 'x', 'accepted') returning id into int1;

  perform set_config('b5b.ng_ou', ou::text, true);
  perform set_config('b5b.ng_ru', ru::text, true);
  perform set_config('b5b.ng_xu', xu::text, true);
  perform set_config('b5b.ng_off1', off1::text, true);
  perform set_config('b5b.ng_int1', int1::text, true);

  perform pg_temp.act(null, 'anon');
end $$;

-- The RPCs take CONTENT for the two sides; the server binds each to its participant. Nothing a
-- test could pass here names a provider. Timing is part of the versioned proposal too; provider
-- identity, participant identity, side identity and version number still never come from the
-- caller.
create or replace function pg_temp.ng_due(p_days integer)
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
    p_owner_gives, pg_temp.ng_due(7), null,
    p_responder_gives, pg_temp.ng_due(8), null
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
    p_owner_gives, pg_temp.ng_due(7), null,
    p_responder_gives, pg_temp.ng_due(8), null
  )
$$;

create or replace function pg_temp.expire_term_due(p_version_id uuid, p_side text)
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

create or replace function pg_temp.expire_term_scheduled(p_version_id uuid, p_side text)
returns void
language sql
as $$
  update public.barter_proposal_terms
     set created_at = clock_timestamp() - interval '2 days',
         due_at = clock_timestamp() + interval '7 days',
         scheduled_at = clock_timestamp() - interval '1 minute'
   where version_id = p_version_id
     and provided_by = p_side
$$;

-- ── Who may open a negotiation ─────────────────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  xu uuid := current_setting('b5b.ng_xu')::uuid;
  int1 uuid := current_setting('b5b.ng_int1')::uuid;
  v_code text; v_id uuid; v_n integer;
  pu uuid := gen_random_uuid(); ppid uuid; off2 uuid; int_pending uuid;
begin
  -- A stranger to the negotiation cannot create one, and is told so with a DISTINCT code from
  -- the state refusals: "not yours" and "not active" are different facts.
  perform pg_temp.act(xu);
  begin
    perform pg_temp.create_barter_proposal_timed(int1, 'a photo session', 'four PT sessions');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'an unrelated provider cannot open a negotiation',
    '42501', v_code);

  -- A PENDING interest is not a negotiation. No cold proposals.
  perform pg_temp.act_service();
  insert into auth.users(id) values (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'Pend Resp', 'negp_'||substr(pu::text,1,8)) returning id into ppid;
  select offer_id into off2 from public.barter_interests where id = int1;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (off2, ppid, pu, 'x', 'pending') returning id into int_pending;

  perform pg_temp.act(ou);
  begin
    perform pg_temp.create_barter_proposal_timed(int_pending, 'a photo session', 'four PT sessions');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a proposal requires an ACCEPTED interest',
    '55000', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposals where interest_id = int_pending;
  perform pg_temp.chk('negotiation', 'and no proposal row was left behind', '0', v_n::text);
end $$;

-- ── The happy path, and what it does NOT do ────────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  ru uuid := current_setting('b5b.ng_ru')::uuid;
  int1 uuid := current_setting('b5b.ng_int1')::uuid;
  v_pid uuid; v_vid uuid; v_n integer; v_code text; v_both boolean; v_snap jsonb;
begin
  perform pg_temp.act(ou);
  select pg_temp.create_barter_proposal_timed(int1, 'a photo session', 'four PT sessions') into v_pid;
  perform set_config('b5b.ng_pid', v_pid::text, true);

  perform pg_temp.chk('negotiation', 'the owner can open a negotiation on an accepted response',
    'true', (v_pid is not null)::text);

  perform pg_temp.act_service();
  select current_version_no into v_n from public.barter_proposals where id = v_pid;
  perform pg_temp.chk('negotiation', 'it starts at version 1', '1', v_n::text);

  select count(*) into v_n from public.barter_proposal_terms t
    join public.barter_proposal_versions v on v.id = t.version_id
   where v.proposal_id = v_pid;
  perform pg_temp.chk('negotiation', 'the terms are stored as ROWS, not a blob', '2', v_n::text);

  -- AUTHORING IS NOT ACCEPTANCE.
  select count(*) into v_n from public.barter_version_acceptances a
    join public.barter_proposal_versions v on v.id = a.version_id
   where v.proposal_id = v_pid;
  perform pg_temp.chk('negotiation', 'authoring a proposal does NOT accept it', '0', v_n::text);

  perform pg_temp.act(ou);
  select both_accepted into v_both from public.my_barter_proposals where proposal_id = v_pid;
  perform pg_temp.chk('negotiation', 'and the negotiation is not agreed', 'false', v_both::text);

  -- The snapshot captured the post as it stood.
  perform pg_temp.act_service();
  select post_snapshot into v_snap from public.barter_proposal_versions
   where proposal_id = v_pid and version_no = 1;
  perform pg_temp.chk('negotiation', 'the initial version snapshots the post terms',
    'photography', v_snap ->> 'offering_service');
  perform pg_temp.chk('negotiation', 'including the notes that were on the board',
    'original notes', v_snap ->> 'notes');

  -- A SECOND proposal on the same accepted interest is refused: one negotiation per response.
  perform pg_temp.act(ou);
  begin
    perform pg_temp.create_barter_proposal_timed(int1, 'a photo session', 'four PT sessions');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  -- 23505, not 55000. Sharing 55000 with "this negotiation is not active" told a provider
  -- whose negotiation is ALIVE — and now has terms on it — that it had ended.
  perform pg_temp.chk('negotiation', 'a duplicate initial proposal is refused', '23505', v_code);
end $$;

-- ── Editing the post cannot rewrite a version ──────────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  off1 uuid := current_setting('b5b.ng_off1')::uuid;
  v_snap jsonb;
begin
  -- PD-047: the public post stays editable while active. Existing versions must not move.
  perform pg_temp.act(ou);
  update public.barter_offers
     set offering_service = 'EDITED photography', notes = 'EDITED notes'
   where id = off1;

  perform pg_temp.act_service();
  select post_snapshot into v_snap from public.barter_proposal_versions
   where proposal_id = pid and version_no = 1;
  perform pg_temp.chk('negotiation', 'editing the post does NOT rewrite an existing snapshot',
    'photography', v_snap ->> 'offering_service');
  perform pg_temp.chk('negotiation', 'nor its notes', 'original notes', v_snap ->> 'notes');
end $$;

-- ── Counters create versions; nothing rewrites one ─────────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  ru uuid := current_setting('b5b.ng_ru')::uuid;
  xu uuid := current_setting('b5b.ng_xu')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  v_no integer; v_code text; v_n integer; v_desc text; v_vid1 uuid;
begin
  perform pg_temp.act_service();
  select id into v_vid1 from public.barter_proposal_versions
   where proposal_id = pid and version_no = 1;
  perform set_config('b5b.ng_v1', v_vid1::text, true);

  -- Only participants may counter.
  perform pg_temp.act(xu);
  begin
    perform pg_temp.submit_barter_counter_timed(pid, 'x', 'y');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'an unrelated provider cannot counter', '42501', v_code);

  -- The responder counters. The version number is derived, never supplied.
  perform pg_temp.act(ru);
  select pg_temp.submit_barter_counter_timed(pid, 'a photo session', 'SIX PT sessions')
    into v_no;
  perform pg_temp.chk('negotiation', 'a counter creates the next version', '2', v_no::text);

  perform pg_temp.act_service();
  select current_version_no into v_n from public.barter_proposals where id = pid;
  perform pg_temp.chk('negotiation', 'and the current-version pointer advances', '2', v_n::text);

  -- Version 1's terms are untouched by version 2 existing.
  select service_description into v_desc from public.barter_proposal_terms
   where version_id = v_vid1 and provided_by = 'responder';
  perform pg_temp.chk('negotiation', 'the superseded version keeps its own terms',
    'four PT sessions', v_desc);

  select count(*) into v_n from public.barter_proposal_versions where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'both versions exist as history', '2', v_n::text);
end $$;

-- ── Timing changes are proposal changes ───────────────────────────────────
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; pid uuid; v1 uuid; v_no integer; v_n integer;
  v_old_due timestamptz; v_new_due timestamptz; v_both boolean;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Timing Owner', 'ngti_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Timing Resp', 'ngtj_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'timing offering', 'timing seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  perform pg_temp.act(ou);
  select public.create_barter_proposal(
    i,
    'same owner content', pg_temp.ng_due(5), null,
    'same responder content', pg_temp.ng_due(6), null
  ) into pid;
  perform pg_temp.act_service();
  select id into v1 from public.barter_proposal_versions where proposal_id = pid and version_no = 1;
  select due_at into v_old_due from public.barter_proposal_terms
   where version_id = v1 and provided_by = 'offer_owner';

  perform pg_temp.act(ru);
  perform public.accept_barter_version(v1);
  perform pg_temp.act(ou);
  select public.submit_barter_counter(
    pid,
    'same owner content', pg_temp.ng_due(9), null,
    'same responder content', pg_temp.ng_due(10), null
  ) into v_no;
  perform pg_temp.chk('negotiation', 'a timing-only counter creates a new version',
    '2', v_no::text);

  perform pg_temp.act_service();
  select current_version_no into v_n from public.barter_proposals where id = pid;
  perform pg_temp.chk('negotiation', 'and the timing-only version becomes current',
    '2', v_n::text);
  select due_at into v_new_due
    from public.barter_proposal_terms t
    join public.barter_proposal_versions v on v.id = t.version_id
   where v.proposal_id = pid and v.version_no = 2 and t.provided_by = 'offer_owner';
  perform pg_temp.chk('negotiation', 'the old timing is immutable history',
    'true', (v_old_due is distinct from v_new_due)::text);

  perform pg_temp.act(ru);
  select both_accepted into v_both from public.my_barter_proposals where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'prior acceptance does not satisfy changed timing',
    'false', v_both::text);
end $$;

-- ── Timing must still be current when terms are accepted ──────────────────
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; pid uuid; v1 uuid; v2 uuid;
  v_code text; v_both boolean; v_n integer; v_old_due timestamptz; v_after_scheduled timestamptz;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Accept Time Owner', 'ngao_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Accept Time Resp', 'ngar_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'accept timing offering', 'accept timing seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  perform pg_temp.act(ou);
  select public.create_barter_proposal(
    i,
    'owner gives', pg_temp.ng_due(7), pg_temp.ng_due(6),
    'responder gives', pg_temp.ng_due(8), pg_temp.ng_due(6)
  ) into pid;
  perform pg_temp.act_service();
  select id into v1 from public.barter_proposal_versions where proposal_id = pid and version_no = 1;

  perform pg_temp.act(ru);
  select public.accept_barter_version(v1) into v_both;
  perform pg_temp.chk('negotiation', 'future due/scheduled timing can be accepted',
    'false', v_both::text);

  perform pg_temp.act_service();
  select due_at into v_old_due from public.barter_proposal_terms
   where version_id = v1 and provided_by = 'offer_owner';
  delete from public.barter_version_acceptances where version_id = v1 and participant_user_id = ru;
  perform pg_temp.expire_term_due(v1, 'offer_owner');
  perform pg_temp.act(ru);
  begin
    perform public.accept_barter_version(v1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'expired owner due_at cannot be accepted', 'PT410', v_code);

  perform pg_temp.act_service();
  perform pg_temp.expire_term_due(v1, 'responder');
  perform pg_temp.act(ru);
  begin
    perform public.accept_barter_version(v1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'expired responder due_at cannot be accepted', 'PT410', v_code);

  perform pg_temp.act_service();
  update public.barter_proposal_terms
     set created_at = clock_timestamp() - interval '2 days',
         due_at = clock_timestamp() + interval '7 days',
         scheduled_at = null
   where version_id = v1;
  perform pg_temp.expire_term_scheduled(v1, 'offer_owner');
  perform pg_temp.act(ru);
  begin
    perform public.accept_barter_version(v1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'expired owner scheduled_at cannot be accepted',
    'PT410', v_code);

  perform pg_temp.act_service();
  update public.barter_proposal_terms
     set created_at = clock_timestamp() - interval '2 days',
         due_at = clock_timestamp() + interval '7 days',
         scheduled_at = null
   where version_id = v1;
  perform pg_temp.expire_term_scheduled(v1, 'responder');
  perform pg_temp.act(ru);
  begin
    perform public.accept_barter_version(v1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'expired responder scheduled_at cannot be accepted',
    'PT410', v_code);

  perform pg_temp.act_service();
  select scheduled_at into v_after_scheduled from public.barter_proposal_terms
   where version_id = v1 and provided_by = 'responder';
  perform pg_temp.chk('negotiation', 'expired historical timing is not auto-extended',
    'true', (v_after_scheduled is not null and v_after_scheduled < clock_timestamp())::text);

  -- Direct insert with grants bypassed must still hit the same expiry guard, proving the rule
  -- is on the acceptance row boundary and not only inside the RPC.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ru::text, 'role', 'authenticated')::text, true);
  begin
    insert into public.barter_version_acceptances(version_id, participant_user_id)
    values (v1, ru);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'direct acceptance insert cannot bypass expired timing',
    'PT410', v_code);

  perform pg_temp.act(ou);
  select public.submit_barter_counter(
    pid,
    'owner gives', pg_temp.ng_due(9), null,
    'responder gives', pg_temp.ng_due(10), null
  ) into v_n;
  perform pg_temp.chk('negotiation', 'a new version with future timing restores acceptability',
    '2', v_n::text);
  perform pg_temp.act_service();
  select id into v2 from public.barter_proposal_versions where proposal_id = pid and version_no = 2;
  perform pg_temp.act(ru);
  begin
    perform public.accept_barter_version(v2);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'the future-timed replacement can be accepted',
    'NO ERROR', v_code);
end $$;

-- ── History is append-only, and version numbers cannot be forged ───────────
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  v1 uuid := current_setting('b5b.ng_v1')::uuid;
  v_code text; v_n integer;
begin
  perform pg_temp.act(ou);

  -- TWO LAYERS, asserted separately, because they fail in different SHAPES.
  --
  -- Layer 1 -- grants and RLS. There is no UPDATE or DELETE grant and no write policy, so a
  -- direct write is refused at the grant layer. Had only RLS been there, the write would have
  -- been FILTERED to zero rows and raised NOTHING -- which is why the assertion below checks
  -- the stored value too, and does not rely on an exception alone.
  begin
    update public.barter_proposal_versions set version_no = 99 where id = v1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a direct version update is refused at the grant layer',
    '42501', v_code);

  begin
    update public.barter_proposal_terms set service_description = 'FORGED' where version_id = v1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'so is a direct term update', '42501', v_code);

  begin
    delete from public.barter_proposal_versions where id = v1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'and a direct delete', '42501', v_code);

  -- ...and nothing moved, which is the guarantee that actually matters to a user. Asserted
  -- independently of the error, so this still holds if a future grant ever admits the write.
  perform pg_temp.act_service();
  select version_no into v_n from public.barter_proposal_versions where id = v1;
  perform pg_temp.chk('negotiation', 'version 1 is still version 1', '1', v_n::text);
  select count(*) into v_n from public.barter_proposal_versions where id = v1;
  perform pg_temp.chk('negotiation', 'and still exists', '1', v_n::text);

  -- BACK TO THE PARTICIPANT. The assertions above needed the service context to READ the
  -- stored row; running the refusals below in that context would test nothing, because
  -- service_role bypasses RLS and is exempt from the guards. _fixtures.sql states the rule:
  -- test assertions must never run in the service context.
  perform pg_temp.act(ou);

  -- DIRECT WRITES CANNOT BYPASS THE RPCs. There is no insert policy and no insert grant, so
  -- an authenticated caller inserting a version of their own affects nothing.
  begin
    insert into public.barter_proposal_versions(proposal_id, version_no, author_user_id,
      post_snapshot) values (pid, 3, ou, '{}'::jsonb);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a direct version insert is refused', '42501', v_code);

  begin
    insert into public.barter_proposals(interest_id, offer_id, owner_user_id,
      responder_user_id, current_version_no)
    values (gen_random_uuid(), gen_random_uuid(), ou, gen_random_uuid(), 1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a direct proposal insert is refused', '42501', v_code);

  -- The pointer: refused at the grant layer for a direct write, and the value is unchanged.
  perform pg_temp.act(ou);
  begin
    update public.barter_proposals set current_version_no = 1 where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a direct pointer write is refused', '42501', v_code);

  perform pg_temp.act_service();
  select current_version_no into v_n from public.barter_proposals where id = pid;
  perform pg_temp.chk('negotiation', 'and it is still where the server put it', '2', v_n::text);
end $$;

-- ── Acceptance: caller-bound, version-bound, idempotent ────────────────────
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  ru uuid := current_setting('b5b.ng_ru')::uuid;
  xu uuid := current_setting('b5b.ng_xu')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  v1 uuid := current_setting('b5b.ng_v1')::uuid;
  v2 uuid; v_code text; v_both boolean; v_n integer; v_actor uuid;
begin
  perform pg_temp.act_service();
  select id into v2 from public.barter_proposal_versions
   where proposal_id = pid and version_no = 2;
  perform set_config('b5b.ng_v2', v2::text, true);

  -- A SUPERSEDED version cannot be accepted.
  perform pg_temp.act(ou);
  begin
    perform public.accept_barter_version(v1);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  -- 40001, NOT 55000. "These terms were replaced" and "this negotiation has ended" are
  -- different facts needing opposite advice: one is terminal, the other means read the new
  -- terms and accept again. A single code would describe one of them wrongly.
  perform pg_temp.chk('negotiation', 'a superseded version cannot be accepted', '40001', v_code);

  -- A stranger cannot accept.
  perform pg_temp.act(xu);
  begin
    perform public.accept_barter_version(v2);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'an unrelated provider cannot accept', '42501', v_code);

  -- The owner accepts the current version. One side is not agreement.
  perform pg_temp.act(ou);
  select public.accept_barter_version(v2) into v_both;
  perform pg_temp.chk('negotiation', 'one participant accepting is not agreement',
    'false', v_both::text);

  -- The acceptance is bound to the CALLER, not to anything supplied.
  perform pg_temp.act_service();
  select participant_user_id into v_actor from public.barter_version_acceptances
   where version_id = v2;
  perform pg_temp.chk('negotiation', 'the acceptance is stamped with the caller',
    ou::text, v_actor::text);

  -- Repeating it is idempotent.
  perform pg_temp.act(ou);
  select public.accept_barter_version(v2) into v_both;
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_version_acceptances where version_id = v2;
  perform pg_temp.chk('negotiation', 'a repeated acceptance adds no second row', '1', v_n::text);

  -- Both sides accept the SAME version -> the fact is reported.
  perform pg_temp.act(ru);
  select public.accept_barter_version(v2) into v_both;
  perform pg_temp.chk('negotiation', 'both participants accepting the same version agrees it',
    'true', v_both::text);

  -- ...and the seam is a DERIVED fact only. Nothing was finalised: no agreement row exists
  -- anywhere, and the sourcing post was not closed by this slice.
  perform pg_temp.act(ou);
  select both_accepted into v_both from public.my_barter_proposals where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'the view reports agreement on the current version',
    'true', v_both::text);
end $$;

-- ── A new version invalidates the acceptance of the old one ────────────────
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  ru uuid := current_setting('b5b.ng_ru')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  v2 uuid := current_setting('b5b.ng_v2')::uuid;
  v_no integer; v_both boolean; v_n integer;
begin
  -- Version 2 is fully accepted. A material change supersedes it.
  perform pg_temp.act(ou);
  select pg_temp.submit_barter_counter_timed(pid, 'TWO photo sessions', 'six PT sessions')
    into v_no;
  perform pg_temp.chk('negotiation', 'a counter after agreement creates version 3', '3', v_no::text);

  select both_accepted into v_both from public.my_barter_proposals where proposal_id = pid;
  perform pg_temp.chk('negotiation',
    'and the negotiation is NO LONGER agreed: the new version has no acceptances',
    'false', v_both::text);

  -- The old acceptances are HISTORY, not deleted -- "who accepted what" survives.
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_version_acceptances where version_id = v2;
  perform pg_temp.chk('negotiation', 'the prior acceptances remain as history', '2', v_n::text);
end $$;

-- ── Layer 2: the append-only trigger, reached and proven to fire ───────────
-- The grants above mean no authenticated caller can reach these triggers, so asserting them
-- through a normal session would be vacuous -- the refusal would come from the grant every
-- time and the trigger could be missing entirely. Here the JWT claim is set WITHOUT assuming
-- the `authenticated` database role: `auth.uid()` is a real user, so the maintenance escape
-- does not apply, but RLS and grants are bypassed. That reaches the trigger and nothing else.
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  v1 uuid := current_setting('b5b.ng_v1')::uuid;
  v_code text; v_n integer;
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);

  begin
    update public.barter_proposal_versions set version_no = 99 where id = v1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation',
    'the append-only trigger REFUSES a version edit that reaches it', '23514', v_code);

  begin
    delete from public.barter_proposal_terms where version_id = v1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'and a term delete that reaches it', '23514', v_code);

  begin
    update public.barter_version_acceptances set participant_user_id = ou
     where version_id = current_setting('b5b.ng_v2')::uuid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'and an acceptance rewrite', '23514', v_code);

  -- The proposal guard is narrower: the pointer may advance, everything else may not.
  begin
    update public.barter_proposals set interest_id = gen_random_uuid() where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a proposal cannot be re-pointed at another response',
    '23514', v_code);

  begin
    update public.barter_proposals set current_version_no = 1 where id = pid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'and the pointer cannot move backwards', '23514', v_code);

  perform pg_temp.act_service();
  select version_no into v_n from public.barter_proposal_versions where id = v1;
  perform pg_temp.chk('negotiation', 'nothing moved', '1', v_n::text);
end $$;

-- ── anon holds nothing ─────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['barter_proposals', 'barter_proposal_versions',
                           'barter_proposal_terms', 'barter_version_acceptances'] loop
    perform pg_temp.chk('negotiation', 'anon cannot read ' || t,
      'false', has_table_privilege('anon', 'public.' || t, 'select')::text);
    perform pg_temp.chk('negotiation', 'anon cannot write ' || t,
      'false', has_table_privilege('anon', 'public.' || t, 'insert')::text);
    -- The layer that was missing on the first pass: authenticated must hold SELECT and
    -- nothing else, so grants and RLS are two independent refusals rather than one.
    perform pg_temp.chk('negotiation', 'authenticated may only read ' || t,
      'true', (has_table_privilege('authenticated', 'public.' || t, 'select')
               and not has_table_privilege('authenticated', 'public.' || t, 'insert')
               and not has_table_privilege('authenticated', 'public.' || t, 'update')
               and not has_table_privilege('authenticated', 'public.' || t, 'delete'))::text);
  end loop;

  perform pg_temp.chk('negotiation', 'anon cannot execute the proposal RPCs', 'false',
    (has_function_privilege('anon',
       'public.create_barter_proposal(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)',
       'execute')
     or has_function_privilege('anon',
       'public.submit_barter_counter(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)',
       'execute')
     or has_function_privilege('anon', 'public.accept_barter_version(uuid)', 'execute'))::text);
  perform pg_temp.chk('negotiation', 'anon cannot read the negotiation view', 'false',
    has_table_privilege('anon', 'public.my_barter_proposals', 'select')::text);
  perform pg_temp.chk('negotiation', 'the negotiation view is security_invoker', 'true',
    (select 'security_invoker=true' = any(c.reloptions) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relname = 'my_barter_proposals' and n.nspname = 'public')::text);
end $$;

-- ── Read isolation: a third provider sees none of it ───────────────────────
do $$
declare
  xu uuid := current_setting('b5b.ng_xu')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  v_n integer;
begin
  perform pg_temp.act(xu);
  select count(*) into v_n from public.barter_proposals where id = pid;
  perform pg_temp.chk('negotiation', 'an unrelated provider cannot READ the proposal',
    '0', v_n::text);
  select count(*) into v_n from public.barter_proposal_versions where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'nor its versions', '0', v_n::text);
  select count(*) into v_n from public.barter_proposal_terms t
    join public.barter_proposal_versions v on v.id = t.version_id where v.proposal_id = pid;
  perform pg_temp.chk('negotiation', 'nor its terms', '0', v_n::text);
  select count(*) into v_n from public.barter_version_acceptances a
    join public.barter_proposal_versions v on v.id = a.version_id where v.proposal_id = pid;
  perform pg_temp.chk('negotiation', 'nor who accepted what', '0', v_n::text);
  select count(*) into v_n from public.my_barter_proposals where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'nor anything through the view', '0', v_n::text);

  -- Both participants DO see it, which is what makes the zeroes above meaningful.
  perform pg_temp.act(current_setting('b5b.ng_ou')::uuid);
  select count(*) into v_n from public.my_barter_proposals where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'the owner sees the negotiation', '1', v_n::text);
  perform pg_temp.act(current_setting('b5b.ng_ru')::uuid);
  select count(*) into v_n from public.my_barter_proposals where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'and so does the responder', '1', v_n::text);
end $$;

-- ── A negotiation outlives its post (PD-049/PD-052) ────────────────────────
-- The closed-post rules govern answering PENDING responses. An accepted negotiation continues,
-- so proposing and accepting terms must keep working after the post leaves the board.
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  off1 uuid := current_setting('b5b.ng_off1')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  v_no integer; v_code text; v_snap jsonb;
begin
  perform pg_temp.act(ou);
  update public.barter_offers set is_active = false where id = off1;

  begin
    select pg_temp.submit_barter_counter_timed(pid, 'one photo session', 'five PT sessions')
      into v_no;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'terms can still be proposed after the post closes',
    'NO ERROR', v_code);
  perform pg_temp.chk('negotiation', 'and it is version 4', '4', v_no::text);

  -- The snapshot records the post as CLOSED at that moment -- history, not a live read.
  perform pg_temp.act_service();
  select post_snapshot into v_snap from public.barter_proposal_versions
   where proposal_id = pid and version_no = 4;
  perform pg_temp.chk('negotiation', 'and the snapshot records the post was closed by then',
    'false', v_snap ->> 'is_active');
end $$;

-- ── A released negotiation is closed to everything ─────────────────────────
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; pid uuid; vid uuid;
  v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Rel Owner', 'nrlo_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Rel Resp', 'nrlr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'rel offering', 'rel seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  perform pg_temp.act(ou);
  select pg_temp.create_barter_proposal_timed(i, 'a photo session', 'four PT sessions') into pid;
  perform pg_temp.act_service();
  select id into vid from public.barter_proposal_versions where proposal_id = pid;

  -- End the negotiation through the ONE exit primitive the contract already has (PD-049).
  -- This slice deliberately adds no second way to end a negotiation.
  perform pg_temp.act(ou);
  perform public.release_barter_interest(i);

  begin
    perform pg_temp.submit_barter_counter_timed(pid, 'x', 'y');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a released negotiation cannot be countered',
    '55000', v_code);

  begin
    perform public.accept_barter_version(vid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'nor accepted', '55000', v_code);

  -- Nor can a fresh negotiation be opened on the released response.
  begin
    perform pg_temp.create_barter_proposal_timed(i, 'a photo session', 'four PT sessions');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'nor reopened', '55000', v_code);

  -- The history survives: releasing ends the negotiation, it does not erase what was proposed.
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposal_versions where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'and its history survives the release', '1', v_n::text);
end $$;

-- ── The rolling submission cap ─────────────────────────────────────────────
-- 20 versions per PARTICIPANT, per NEGOTIATION, per rolling 24 hours. Counted from the version
-- rows themselves, which is safe here for a structural reason: versions are append-only and no
-- authenticated caller holds a delete path, so the window cannot be reset by deleting history.
-- (The interest limiter counts rate_limit_log instead, precisely because interests CAN be
-- deleted and resent.)
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; pid uuid;
  v_code text; v_n integer; k integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Cap Owner', 'ncpo_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Cap Resp', 'ncpr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'cap offering', 'cap seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  -- The owner opens the negotiation: that is their 1st version.
  perform pg_temp.act(ou);
  select pg_temp.create_barter_proposal_timed(i, 'a photo session', 'four PT sessions') into pid;

  -- 19 more from the same participant reaches exactly 20.
  for k in 2..20 loop
    perform pg_temp.submit_barter_counter_timed(pid, 'own ' || k, 'theirs ' || k);
  end loop;

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposal_versions
   where proposal_id = pid and author_user_id = ou;
  perform pg_temp.chk('negotiation', 'a participant may send 20 versions in 24h', '20', v_n::text);

  perform pg_temp.act(ou);
  begin
    perform pg_temp.submit_barter_counter_timed(pid, 'over', 'limit');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  -- 54000, not 23514: a spent daily budget and a malformed proposal are both reachable from
  -- one button and need opposite advice (wait vs fix and resend).
  perform pg_temp.chk('negotiation', 'the 21st is refused', '54000', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposal_versions
   where proposal_id = pid and author_user_id = ou;
  perform pg_temp.chk('negotiation', 'and no 21st version was written', '20', v_n::text);

  -- PER PARTICIPANT: the other provider still has their own full budget, so one party cannot
  -- exhaust the negotiation for both.
  perform pg_temp.act(ru);
  begin
    perform pg_temp.submit_barter_counter_timed(pid, 'their turn', 'my turn');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'the counterparty keeps their own budget',
    'NO ERROR', v_code);

  -- PER NEGOTIATION: a second negotiation is unaffected by the first being exhausted.
  perform pg_temp.act_service();
  update public.barter_offers set is_active = true where id = o;
  declare
    ru2 uuid := gen_random_uuid(); r2pid uuid; o2 uuid; i2 uuid;
  begin
    insert into auth.users(id) values (ru2);
    insert into public.providers(user_id, display_name, username)
      values (ru2, 'Cap Resp2', 'ncp2_'||substr(ru2::text,1,8)) returning id into r2pid;
    insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
      values (opid, ou, 'cap offering 2', 'cap seeking 2') returning id into o2;
    insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
      message, status) values (o2, r2pid, ru2, 'x', 'accepted') returning id into i2;
    perform pg_temp.act(ou);
    begin
      perform pg_temp.create_barter_proposal_timed(i2, 'a photo session', 'four PT sessions');
      v_code := 'NO ERROR';
    exception when others then v_code := sqlstate;
    end;
    perform pg_temp.chk('negotiation', 'and a different negotiation has its own budget',
      'NO ERROR', v_code);
  end;
end $$;

-- ── Malformed terms are refused, not reshaped ──────────────────────────────
-- Two directed terms, content only. The server binds each side to its participant; the client
-- cannot name a side, a provider, or a value.
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Bad Owner', 'nbdo_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Bad Resp', 'nbdr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'bad offering', 'bad seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  perform pg_temp.act(ou);

  -- MISSING SIDE, either way round.
  begin
    perform pg_temp.create_barter_proposal_timed(i, 'only the owner', '');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a missing responder side is refused', '22023', v_code);

  begin
    perform pg_temp.create_barter_proposal_timed(i, '   ', 'only the responder');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a missing owner side is refused', '22023', v_code);

  begin
    perform pg_temp.create_barter_proposal_timed(i, null, null);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'null sides are refused', '22023', v_code);

  begin
    perform pg_temp.create_barter_proposal_timed(i, repeat('x', 201), 'b');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'an over-long side is refused', '22023', v_code);

  -- Every refusal above must have written NOTHING.
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposals where interest_id = i;
  perform pg_temp.chk('negotiation', 'and no partial proposal survives a refusal',
    '0', v_n::text);
end $$;

-- ── Proposal timing rules ─────────────────────────────────────────────────
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; v_code text; v_n integer; v_pid uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Time Owner', 'ngto_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Time Resp', 'ngtr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'timed offering', 'timed seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  perform pg_temp.act(ou);
  begin
    perform public.create_barter_proposal(
      i,
      'owner gives', null, null,
      'responder gives', pg_temp.ng_due(8), null
    );
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'owner due_at is required', '22023', v_code);

  begin
    perform public.create_barter_proposal(
      i,
      'owner gives', pg_temp.ng_due(7), null,
      'responder gives', null, null
    );
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'responder due_at is required', '22023', v_code);

  begin
    perform public.create_barter_proposal(
      i,
      'owner gives', clock_timestamp() - interval '1 minute', null,
      'responder gives', pg_temp.ng_due(8), null
    );
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'past due_at is refused', '22023', v_code);

  begin
    perform public.create_barter_proposal(
      i,
      'owner gives', pg_temp.ng_due(7), clock_timestamp() - interval '1 minute',
      'responder gives', pg_temp.ng_due(8), null
    );
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'past scheduled_at is refused', '22023', v_code);

  begin
    perform public.create_barter_proposal(
      i,
      'owner gives', pg_temp.ng_due(7), pg_temp.ng_due(9),
      'responder gives', pg_temp.ng_due(8), null
    );
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'scheduled_at after due_at is refused', '22023', v_code);

  select public.create_barter_proposal(
    i,
    'owner gives', pg_temp.ng_due(7), pg_temp.ng_due(6),
    'responder gives', pg_temp.ng_due(8), null
  ) into v_pid;
  perform pg_temp.chk('negotiation', 'valid scheduled_at is accepted',
    'true', (v_pid is not null)::text);

  perform pg_temp.act_service();
  select count(*) into v_n
    from public.barter_proposal_terms t
    join public.barter_proposal_versions v on v.id = t.version_id
   where v.proposal_id = v_pid
     and t.due_at > clock_timestamp()
     and (t.scheduled_at is null or t.scheduled_at > clock_timestamp())
     and (t.scheduled_at is null or t.scheduled_at <= t.due_at);
  perform pg_temp.chk('negotiation', 'stored timing stays future and internally consistent',
    '2', v_n::text);
end $$;

-- ── Participant identity is server-owned ───────────────────────────────────
-- The RPC payload carries no identity at all, so "swap the sides" and "inject a third
-- provider" have no parameter to go through. These prove what is STORED: each side is bound to
-- the participant the accepted interest says it is, whoever authored the content.
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  ru uuid := current_setting('b5b.ng_ru')::uuid;
  xu uuid := current_setting('b5b.ng_xu')::uuid;
  pid uuid := current_setting('b5b.ng_pid')::uuid;
  off1 uuid := current_setting('b5b.ng_off1')::uuid;
  int1 uuid := current_setting('b5b.ng_int1')::uuid;
  v_no integer; v_vid uuid; v_n integer; v_code text;
  v_owner_user uuid; v_resp_user uuid; v_owner_prov uuid; v_resp_prov uuid;
  v_exp_owner_prov uuid; v_exp_resp_prov uuid;
begin
  -- The RESPONDER authors both sides' content. They do not become both providers.
  perform pg_temp.act(ru);
  select pg_temp.submit_barter_counter_timed(pid, 'owner side by responder', 'responder side by responder')
    into v_no;

  perform pg_temp.act_service();
  select id into v_vid from public.barter_proposal_versions
   where proposal_id = pid and version_no = v_no;
  select o.provider_id, i.interested_provider_id into v_exp_owner_prov, v_exp_resp_prov
    from public.barter_offers o join public.barter_interests i on i.offer_id = o.id
   where i.id = int1;

  select provider_user_id, provider_id into v_owner_user, v_owner_prov
    from public.barter_proposal_terms where version_id = v_vid and provided_by = 'offer_owner';
  select provider_user_id, provider_id into v_resp_user, v_resp_prov
    from public.barter_proposal_terms where version_id = v_vid and provided_by = 'responder';

  perform pg_temp.chk('negotiation', 'the owner side is bound to the OFFER OWNER',
    ou::text, v_owner_user::text);
  perform pg_temp.chk('negotiation', 'and to the owner''s provider row',
    v_exp_owner_prov::text, v_owner_prov::text);
  perform pg_temp.chk('negotiation', 'the responder side is bound to the RESPONDER',
    ru::text, v_resp_user::text);
  perform pg_temp.chk('negotiation', 'and to the responder''s provider row',
    v_exp_resp_prov::text, v_resp_prov::text);
  perform pg_temp.chk('negotiation', 'authoring both sides did not make the author both providers',
    'true', (v_owner_user <> v_resp_user)::text);

  -- EXACTLY TWO, one per side.
  select count(*) into v_n from public.barter_proposal_terms where version_id = v_vid;
  perform pg_temp.chk('negotiation', 'a version has exactly two terms', '2', v_n::text);
  select count(distinct provided_by) into v_n from public.barter_proposal_terms
   where version_id = v_vid;
  perform pg_temp.chk('negotiation', 'one per side', '2', v_n::text);

  -- A writer that reaches the table with grants bypassed and the marker held still cannot
  -- inject a third provider, duplicate a side, or re-point a side at the wrong participant.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ou::text, 'role', 'authenticated')::text, true);

  -- A fresh version with NO terms yet, so the shape guards (not write-once) are what decide.
  insert into public.barter_proposal_versions(proposal_id, version_no, author_user_id, post_snapshot)
  values (pid, 900, ou, '{}'::jsonb) returning id into v_vid;
  perform set_config('app.barter_terms_write', v_vid::text, true);

  -- Third provider on a side.
  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v_vid, 'offer_owner', 'x', (select id from public.providers where user_id = xu),
              xu, pg_temp.ng_due(7)),
           (v_vid, 'responder', 'y', v_exp_resp_prov, ru, pg_temp.ng_due(8));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a third provider cannot be bound to a side', '42501', v_code);

  -- Sides swapped: the owner's identity on the responder side and vice versa.
  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v_vid, 'offer_owner', 'x', v_exp_resp_prov, ru, pg_temp.ng_due(7)),
           (v_vid, 'responder', 'y', v_exp_owner_prov, ou, pg_temp.ng_due(8));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'the two identities cannot be swapped', '42501', v_code);

  -- Same provider on both sides.
  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v_vid, 'offer_owner', 'x', v_exp_owner_prov, ou, pg_temp.ng_due(7)),
           (v_vid, 'responder', 'y', v_exp_owner_prov, ou, pg_temp.ng_due(8));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'one provider cannot hold both sides', '42501', v_code);

  -- Duplicate side.
  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v_vid, 'offer_owner', 'x', v_exp_owner_prov, ou, pg_temp.ng_due(7)),
           (v_vid, 'offer_owner', 'y', v_exp_owner_prov, ou, pg_temp.ng_due(8));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a duplicate owner side is refused', '23505', v_code);

  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v_vid, 'responder', 'x', v_exp_resp_prov, ru, pg_temp.ng_due(7)),
           (v_vid, 'responder', 'y', v_exp_resp_prov, ru, pg_temp.ng_due(8));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a duplicate responder side is refused', '23505', v_code);

  -- Only one side.
  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v_vid, 'offer_owner', 'x', v_exp_owner_prov, ou, pg_temp.ng_due(7));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'a lone side is refused', '22023', v_code);

  perform set_config('app.barter_terms_write', '', true);
  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposal_terms where version_id = v_vid;
  perform pg_temp.chk('negotiation', 'and none of those refusals wrote anything', '0', v_n::text);
  delete from public.barter_proposal_versions where id = v_vid;

  -- estimated_value is GONE from the authoritative model, not merely unused.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'barter_proposal_terms'
     and column_name in ('estimated_value', 'sort_order');
  perform pg_temp.chk('negotiation', 'no value or ordering column remains on terms',
    '0', v_n::text);
end $$;

-- ── The write boundary: grants, and a guard that does not depend on them ───
-- The defect this closes: `write_barter_proposal_terms` is SECURITY DEFINER with NO
-- authorization, and was revoked only `from public, anon` -- leaving intact the EXECUTE that
-- ALTER DEFAULT PRIVILEGES grants `authenticated`. Any signed-in user could append terms to any
-- version they could read, including one the counterparty had already accepted: not an UPDATE
-- or DELETE, so the append-only trigger never fired; the pointer did not move, so nothing was
-- superseded; and `both_accepted` kept reporting true over changed content.
--
-- The class, not the instance: every function this slice created is pinned, so the next helper
-- added without a revoke fails here rather than in a review.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.write_barter_proposal_terms(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)',
    'public.assert_barter_version_budget(uuid, uuid)',
    'public.barter_post_snapshot(public.barter_offers)',
    'public.barter_negotiation_role(public.barter_interests, public.barter_offers, uuid)',
    'public.assert_barter_proposal_version_timing_current(uuid)',
    'public.enforce_barter_acceptance_timing_current()',
    'public.enforce_barter_negotiation_append_only()',
    'public.enforce_barter_proposal_immutable()',
    'public.enforce_barter_terms_write()'
  ] loop
    perform pg_temp.chk('negotiation', 'internal helper is not executable by authenticated: ' || fn,
      'false', has_function_privilege('authenticated', fn, 'execute')::text);
    perform pg_temp.chk('negotiation', 'nor by anon: ' || fn,
      'false', has_function_privilege('anon', fn, 'execute')::text);
  end loop;

  -- ...and the three that ARE the public surface still work.
  foreach fn in array array[
    'public.create_barter_proposal(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)',
    'public.submit_barter_counter(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)',
    'public.accept_barter_version(uuid)'
  ] loop
    perform pg_temp.chk('negotiation', 'the public RPC is executable by authenticated: ' || fn,
      'true', has_function_privilege('authenticated', fn, 'execute')::text);
    perform pg_temp.chk('negotiation', 'and not by anon: ' || fn,
      'false', has_function_privilege('anon', fn, 'execute')::text);
  end loop;
end $$;

-- The guard, proven independently of the grant. If the grant were ever restored, this is what
-- still refuses -- so neither layer is load-bearing alone.
do $$
declare
  ou uuid := current_setting('b5b.ng_ou')::uuid;
  ru uuid := current_setting('b5b.ng_ru')::uuid;
  xu uuid := current_setting('b5b.ng_xu')::uuid;
  v1 uuid := current_setting('b5b.ng_v1')::uuid;
  v_code text; v_n integer; v_before integer;
begin
  perform pg_temp.act_service();
  select count(*) into v_before from public.barter_proposal_terms where version_id = v1;

  -- A participant, with the grant bypassed (postgres role, real auth.uid()) -- exactly the
  -- profile of a future definer function, and of the attack if the grant came back.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', ru::text, 'role', 'authenticated')::text, true);
  begin
    perform public.write_barter_proposal_terms(
      v1,
      'injected', pg_temp.ng_due(7), null,
      'injected', pg_temp.ng_due(8), null
    );
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation',
    'a participant cannot append terms to a version, even with grants bypassed',
    '42501', v_code);

  -- And a direct INSERT is refused by the same guard, not merely by the missing grant.
  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v1, 'offer_owner', 'forged', (select provider_id from public.barter_offers
      where id = current_setting('b5b.ng_off1')::uuid), ou, pg_temp.ng_due(7));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation', 'nor insert a term row directly', '42501', v_code);

  -- The structural backstop: even holding the marker, a second write to the same version is
  -- refused -- by the one-per-side index for a duplicate side, and by the statement-level
  -- written-once guard for anything else.
  perform set_config('app.barter_terms_write', v1::text, true);
  begin
    insert into public.barter_proposal_terms(version_id, provided_by, service_description,
      provider_id, provider_user_id, due_at)
    values (v1, 'offer_owner', 'second write', (select provider_id from public.barter_offers
      where id = current_setting('b5b.ng_off1')::uuid), ou, pg_temp.ng_due(7));
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform set_config('app.barter_terms_write', '', true);
  perform pg_temp.chk('negotiation',
    'a version''s terms are written ONCE, even with the marker held', '23505', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposal_terms where version_id = v1;
  perform pg_temp.chk('negotiation', 'and the accepted terms are unchanged',
    v_before::text, v_n::text);
end $$;

-- ── The locks are pinned in source ─────────────────────────────────────────
-- This harness runs in ONE transaction and cannot observe a race, so the locks that make
-- counters and acceptances serialisable have no behavioural test here. The repo has already
-- lost a `for update` to a `create or replace` with no error, no diff and no failing test; a
-- comment-stripped source pin is the only mechanism that survives the next rewrite.
do $$
declare
  v_src text;
begin
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'submit_barter_counter' and n.nspname = 'public';
  -- Matches only if a barter_proposals select reaches `for update` BEFORE its terminating
  -- semicolon. `substring(... from ...)` returned the FIRST such statement, which is the
  -- unlocked read — so the pin was checking the wrong one and reported a present lock as
  -- missing. `[^;]*` is what ties the lock to the same statement.
  perform pg_temp.chk('negotiation', 'submit_barter_counter LOCKS the proposal row',
    'true', (lower(v_src) ~ 'from\s+public\.barter_proposals[^;]*for update')::text);

  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'accept_barter_version' and n.nspname = 'public';
  perform pg_temp.chk('negotiation', 'accept_barter_version re-reads the pointer UNDER LOCK',
    'true', (lower(v_src) ~ 'from\s+public\.barter_proposals[^;]*for update')::text);

  -- create_barter_proposal's OWN locks. The interest lock is what makes "creation races with
  -- release" decidable, and the lock-ORDER pin below matches the statements' `from` text, so it
  -- would still pass with both locks removed. The agreement slice will redefine this function.
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'create_barter_proposal' and n.nspname = 'public';
  perform pg_temp.chk('negotiation', 'create_barter_proposal LOCKS the offer row',
    'true', (lower(v_src) ~ 'from\s+public\.barter_offers o[^;]*for update')::text);
  perform pg_temp.chk('negotiation', 'and LOCKS the interest row',
    'true', (lower(v_src) ~ 'from\s+public\.barter_interests i[^;]*for update')::text);

  -- Lock ORDER: every RPC takes the offer before the interest, matching the pre-existing
  -- release/accept RPCs. Taking them in opposite orders is what deadlocks.
  --
  -- Compares the two LOCK STATEMENTS, not identifiers. An earlier version of this pin compared
  -- `position('barter_offers')` against `position('barter_interests i')`, and the first match
  -- for 'barter_offers' is the DECLARE block -- so a declaration always preceded the first
  -- interest statement and the assertion passed whichever order the locks were actually taken
  -- in. That is the same defect as the `substring` bug two pins above: a check that reports
  -- the wrong thing as verified.
  declare
    fn text; v_off integer; v_int integer;
  begin
    foreach fn in array array['create_barter_proposal', 'submit_barter_counter',
                              'accept_barter_version'] loop
      select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname = fn and n.nspname = 'public';
      v_off := position('from public.barter_offers o' in v_src);
      v_int := position('from public.barter_interests i' in v_src);
      perform pg_temp.chk('negotiation',
        fn || ' locks the OFFER before the interest',
        'true', (v_off > 0 and v_int > 0 and v_off < v_int)::text);
    end loop;
  end;
end $$;

-- ── The denormalised participants still agree with their sources ───────────
-- 20260917000000 claims "B5B pins that they still agree". It did not. This is that assertion.
do $$
declare
  v_n integer;
begin
  perform pg_temp.act_service();
  select count(*) into v_n
    from public.barter_proposals p
    join public.barter_interests i on i.id = p.interest_id
    join public.barter_offers o on o.id = p.offer_id
   where p.owner_user_id <> o.user_id or p.responder_user_id <> i.interested_user_id;
  perform pg_temp.chk('negotiation',
    'no proposal disagrees with its offer and interest about who the participants are',
    '0', v_n::text);
end $$;

-- ── Account erasure is not blocked by a negotiation ────────────────────────
-- The RESTRICT regression this fixed was invisible to a fully green suite. These pin both the
-- constraint shape and the behaviour, so its return fails here rather than in a review.
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; pid uuid; vid uuid;
  v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Del Owner', 'ndlo_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Del Resp', 'ndlr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'del offering', 'del seeking') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;

  perform pg_temp.act(ou);
  select pg_temp.create_barter_proposal_timed(i, 'a photo session', 'four PT sessions') into pid;
  perform pg_temp.act_service();
  select id into vid from public.barter_proposal_versions where proposal_id = pid;
  perform pg_temp.act(ru);
  perform public.accept_barter_version(vid);

  -- The GoTrue account-deletion profile: no JWT at all, so every barter guard early-returns.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    delete from auth.users where id = ru;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('negotiation',
    'a participant with a live negotiation can still be erased', 'NO ERROR', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.barter_proposals where id = pid;
  perform pg_temp.chk('negotiation', 'and the negotiation cascades with them', '0', v_n::text);
  select count(*) into v_n from public.barter_proposal_versions where proposal_id = pid;
  perform pg_temp.chk('negotiation', 'leaving no orphan versions', '0', v_n::text);
  select count(*) into v_n from public.barter_version_acceptances where version_id = vid;
  perform pg_temp.chk('negotiation', 'nor orphan acceptances', '0', v_n::text);
end $$;

-- Every FK on the negotiation chain cascades. A future RESTRICT would re-break erasure.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n
    from pg_constraint c
   where c.contype = 'f'
     and c.conrelid::regclass::text in ('barter_proposals', 'barter_proposal_versions',
         'barter_proposal_terms', 'barter_version_acceptances')
     and c.confdeltype <> 'c';
  perform pg_temp.chk('negotiation',
    'every negotiation foreign key is ON DELETE CASCADE', '0', v_n::text);
end $$;

-- ── The client-asserted-side signatures are GONE, and stay gone ────────────
-- 20260925000000 dropped the (uuid, jsonb) overloads because an overload that still accepted a
-- client-chosen side would be exactly the path it closes. A re-apply of a superseded file
-- (20260922 / 20260924 still contain `create or replace ... (uuid, jsonb)` + a grant) would
-- resurrect one silently; this is what notices.
do $$
declare
  fn text;
begin
  foreach fn in array array['create_barter_proposal', 'submit_barter_counter',
                            'write_barter_proposal_terms'] loop
    perform pg_temp.chk('negotiation', 'no (uuid, jsonb) overload of ' || fn || ' exists',
      'true', (to_regprocedure('public.' || fn || '(uuid, jsonb)') is null)::text);
    perform pg_temp.chk('negotiation', 'exactly one overload of ' || fn,
      '1', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = fn)::text);
  end loop;
end $$;
