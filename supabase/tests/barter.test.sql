-- B5B suite: barter integrity (Slice 1).
--
-- Every assertion exercises real DB enforcement -- RLS, triggers, partial unique indexes,
-- grants -- as the `authenticated` role. Nothing here proves anything about the UI.
--
-- Seeds its own cast rather than extending _fixtures.sql, because barter needs a SECOND
-- provider (offer owner + responder) and the shared fixture has one.

do $$
declare
  ou uuid := gen_random_uuid();   -- offer owner (auth user)
  ru uuid := gen_random_uuid();   -- responder (auth user)
  tu uuid := gen_random_uuid();   -- third provider, uninvolved
  nu uuid := gen_random_uuid();   -- non-provider authenticated user
  opid uuid; rpid uuid; tpid uuid;
  off1 uuid; off2 uuid; off3 uuid; off3x uuid;
  int1 uuid;
begin
  perform pg_temp.act_service();

  insert into auth.users(id) values (ou), (ru), (tu), (nu);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'B5B Offer Owner', 'b5bo_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'B5B Responder', 'b5br_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.providers(user_id, display_name, username)
    values (tu, 'B5B Third', 'b5bt_'||substr(tu::text,1,8)) returning id into tpid;

  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'photography', 'training') returning id into off1;
  -- A second offer owned by the SAME owner, used for the accepted-interest assertions so
  -- off1 stays free of state other tests depend on.
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'video', 'makeup') returning id into off2;
  -- An offer with NO interests, so the delete guard's allow-path is provable.
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'lighting', 'styling') returning id into off3;
  -- A fourth offer reserved for the withdraw allow-path, so it is not consumed by the
  -- delete-guard assertions above.
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'assisting', 'editing') returning id into off3x;

  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id, message)
    values (off2, rpid, ru, 'original message') returning id into int1;

  perform set_config('b5b.bt_ou', ou::text, true);
  perform set_config('b5b.bt_ru', ru::text, true);
  perform set_config('b5b.bt_tu', tu::text, true);
  perform set_config('b5b.bt_nu', nu::text, true);
  perform set_config('b5b.bt_opid', opid::text, true);
  perform set_config('b5b.bt_rpid', rpid::text, true);
  perform set_config('b5b.bt_tpid', tpid::text, true);
  perform set_config('b5b.bt_off1', off1::text, true);
  perform set_config('b5b.bt_off2', off2::text, true);
  perform set_config('b5b.bt_off3', off3::text, true);
  perform set_config('b5b.bt_off3x', off3x::text, true);
  perform set_config('b5b.bt_int1', int1::text, true);

  -- Leave the session UNAUTHENTICATED and off the owner role, per _fixtures.sql. An RLS
  -- assertion that ran in the leaked service context would bypass RLS and pass vacuously.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);
end $$;

-- ── Grants / reachability ───────────────────────────────────────────────────
select pg_temp.chk('barter', 'anon cannot EXECUTE caller_provider_id', 'false',
  has_function_privilege('anon', 'public.caller_provider_id()', 'EXECUTE')::text);
select pg_temp.chk('barter', 'PUBLIC cannot EXECUTE caller_provider_id', 'false',
  has_function_privilege('public', 'public.caller_provider_id()', 'EXECUTE')::text);
select pg_temp.chk('barter', 'authenticated CAN EXECUTE caller_provider_id', 'true',
  has_function_privilege('authenticated', 'public.caller_provider_id()', 'EXECUTE')::text);
select pg_temp.chk('barter', 'caller_provider_id is SECURITY DEFINER', 'true',
  (select p.prosecdef::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'caller_provider_id' and n.nspname = 'public'));
-- prosecdef alone is not enough: a DEFINER function that lost `set search_path = ''` is the
-- classic hijack shape and would still report true above.
select pg_temp.chk('barter', 'caller_provider_id pins an empty search_path', 'true',
  (select ('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'caller_provider_id' and n.nspname = 'public'));
-- Every barter trigger function must pin it too -- a DEFINER function that lost the empty
-- search_path is the classic hijack shape, and there are five more of them.
select pg_temp.chk('barter', 'all barter trigger functions pin an empty search_path', 'true',
  (select bool_and('search_path=""' = any(coalesce(p.proconfig, array[]::text[])))::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'enforce\_barter%'));
select pg_temp.chk('barter', 'caller_provider_id is owned by postgres', 'postgres',
  (select r.rolname from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     join pg_roles r on r.oid = p.proowner
    where p.proname = 'caller_provider_id' and n.nspname = 'public'));

-- SEC-DATA-005 guard: pin the column set, so a column added by a later slice fails HERE
-- rather than being born mutable by an offer owner on a counterparty's row.
select pg_temp.chk('barter', 'barter_interests column set is unchanged',
  'created_at,id,interested_provider_id,interested_user_id,message,offer_id,status',
  (select string_agg(attname, ',' order by attname) from pg_attribute
    where attrelid = 'public.barter_interests'::regclass and attnum > 0 and not attisdropped));

-- anon holds nothing on either table.
select pg_temp.chk('barter', 'anon holds no privilege on barter_offers', 'false',
  (has_table_privilege('anon','public.barter_offers','SELECT')
   or has_table_privilege('anon','public.barter_offers','INSERT')
   or has_table_privilege('anon','public.barter_offers','UPDATE')
   or has_table_privilege('anon','public.barter_offers','DELETE'))::text);
select pg_temp.chk('barter', 'anon holds no privilege on barter_interests', 'false',
  (has_table_privilege('anon','public.barter_interests','SELECT')
   or has_table_privilege('anon','public.barter_interests','INSERT')
   or has_table_privilege('anon','public.barter_interests','UPDATE')
   or has_table_privilege('anon','public.barter_interests','DELETE'))::text);

select pg_temp.chk('barter', 'RLS is enabled on both barter tables', 'true',
  (select bool_and(relrowsecurity)::text from pg_class
    where oid in ('public.barter_offers'::regclass, 'public.barter_interests'::regclass)));

-- ── caller_provider_id fails closed ─────────────────────────────────────────
select pg_temp.act(null);
select pg_temp.chk('barter', 'null auth.uid() -> caller_provider_id is null', 'true',
  (public.caller_provider_id() is null)::text);

select pg_temp.act(current_setting('b5b.bt_nu')::uuid);
select pg_temp.chk('barter', 'non-provider -> caller_provider_id is null', 'true',
  (public.caller_provider_id() is null)::text);

select pg_temp.act(current_setting('b5b.bt_ru')::uuid);
select pg_temp.chk('barter', 'provider -> caller_provider_id is own provider row', 'true',
  (public.caller_provider_id() = current_setting('b5b.bt_rpid')::uuid)::text);

-- ── SEC-AUTHZ-002: offer identity cannot be forged ──────────────────────────
select pg_temp.act(current_setting('b5b.bt_ru')::uuid);
select pg_temp.chk_blocked('barter', 'cannot post an offer as ANOTHER provider',
  format($q$insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
           values (%L, %L, 'forged', 'forged')$q$,
         current_setting('b5b.bt_opid'), current_setting('b5b.bt_ru')));

select pg_temp.chk_blocked('barter', 'cannot post an offer attributed to another user_id',
  format($q$insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
           values (%L, %L, 'forged', 'forged')$q$,
         current_setting('b5b.bt_rpid'), current_setting('b5b.bt_ou')));

select pg_temp.chk_allowed('barter', 'CAN post an offer as self',
  format($q$insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
           values (%L, %L, 'own offer', 'own seek')$q$,
         current_setting('b5b.bt_rpid'), current_setting('b5b.bt_ru')));

-- A non-provider cannot post at all (caller_provider_id() is null -> equality fails).
select pg_temp.act(current_setting('b5b.bt_nu')::uuid);
select pg_temp.chk_blocked('barter', 'non-provider cannot post an offer',
  format($q$insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
           values (%L, %L, 'x', 'y')$q$,
         current_setting('b5b.bt_opid'), current_setting('b5b.bt_nu')));

-- provider_id cannot be repointed AFTER insert (the second impersonation route).
select pg_temp.act(current_setting('b5b.bt_ou')::uuid);
select pg_temp.chk_blocked('barter', 'cannot repoint an offer at another provider',
  format($q$update public.barter_offers set provider_id = %L where id = %L$q$,
         current_setting('b5b.bt_rpid'), current_setting('b5b.bt_off1')));

-- ── SEC-AUTHZ-002: interest identity cannot be forged ───────────────────────
select pg_temp.act(current_setting('b5b.bt_tu')::uuid);
select pg_temp.chk_blocked('barter', 'cannot respond as ANOTHER provider',
  format($q$insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
           values (%L, %L, %L)$q$,
         current_setting('b5b.bt_off1'), current_setting('b5b.bt_rpid'),
         current_setting('b5b.bt_tu')));

select pg_temp.chk_allowed('barter', 'CAN respond as self',
  format($q$insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id, message)
           values (%L, %L, %L, 'genuine')$q$,
         current_setting('b5b.bt_off1'), current_setting('b5b.bt_tpid'),
         current_setting('b5b.bt_tu')));

-- ── Self-interest is server-rejected ────────────────────────────────────────
select pg_temp.act(current_setting('b5b.bt_ou')::uuid);
select pg_temp.chk_blocked('barter', 'owner cannot respond to their own offer',
  format($q$insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
           values (%L, %L, %L)$q$,
         current_setting('b5b.bt_off1'), current_setting('b5b.bt_opid'),
         current_setting('b5b.bt_ou')),
  'your own offer');

-- ── Status is clamped to pending at insert ──────────────────────────────────
select pg_temp.act(current_setting('b5b.bt_ru')::uuid);
do $$
declare v_status text;
begin
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id, status)
  values (current_setting('b5b.bt_off1')::uuid, current_setting('b5b.bt_rpid')::uuid,
          current_setting('b5b.bt_ru')::uuid, 'accepted');
  select status into v_status from public.barter_interests
   where offer_id = current_setting('b5b.bt_off1')::uuid
     and interested_user_id = current_setting('b5b.bt_ru')::uuid;
  perform pg_temp.chk('barter', 'client-supplied status is clamped to pending', 'pending', v_status);
end $$;

-- ── SEC-DATA-006: created_at is server-stamped, not client-supplied ─────────
select pg_temp.act(current_setting('b5b.bt_tu')::uuid);
do $$
declare v_created timestamptz;
begin
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service, created_at)
  values (current_setting('b5b.bt_tpid')::uuid, current_setting('b5b.bt_tu')::uuid,
          'backdate', 'attempt', now() - interval '30 days');
  select created_at into v_created from public.barter_offers
   where user_id = current_setting('b5b.bt_tu')::uuid and offering_service = 'backdate';
  perform pg_temp.chk('barter', 'backdated offer created_at is overwritten by the server',
    'true', (v_created > now() - interval '1 minute')::text);
end $$;

-- ── SEC-AUTHZ-001: foreign-authored fields are immutable to the offer owner ─
select pg_temp.act(current_setting('b5b.bt_ou')::uuid);
select pg_temp.chk_blocked('barter', 'owner cannot rewrite a responder''s message',
  format($q$update public.barter_interests set message = 'rewritten' where id = %L$q$,
         current_setting('b5b.bt_int1')),
  'only the status');
select pg_temp.chk_blocked('barter', 'owner cannot re-attribute a response to another user',
  format($q$update public.barter_interests set interested_user_id = %L where id = %L$q$,
         current_setting('b5b.bt_tu'), current_setting('b5b.bt_int1')),
  'only the status');
select pg_temp.chk_blocked('barter', 'owner cannot re-attribute a response to another provider',
  format($q$update public.barter_interests set interested_provider_id = %L where id = %L$q$,
         current_setting('b5b.bt_tpid'), current_setting('b5b.bt_int1')),
  'only the status');
select pg_temp.chk_blocked('barter', 'owner cannot move a response to another offer',
  format($q$update public.barter_interests set offer_id = %L where id = %L$q$,
         current_setting('b5b.bt_off1'), current_setting('b5b.bt_int1')),
  'only the status');
select pg_temp.chk_blocked('barter', 'owner cannot rewrite a response created_at',
  format($q$update public.barter_interests set created_at = now() - interval '9 days' where id = %L$q$,
         current_setting('b5b.bt_int1')),
  'only the status');

-- A non-owner UPDATE is stopped by the RLS USING clause, which FILTERS the row rather than
-- raising -- the statement affects zero rows and reports no error. chk_blocked would record
-- ALLOWED, so these three assert the observable outcome instead: the row does not change.
-- (Read back as service_role, because the actor cannot necessarily see the row.)
select pg_temp.act(current_setting('b5b.bt_ru')::uuid);
do $$
declare v_msg text;
begin
  update public.barter_interests set message = 'edited later'
   where id = current_setting('b5b.bt_int1')::uuid;
  perform pg_temp.act_service();
  select message into v_msg from public.barter_interests
   where id = current_setting('b5b.bt_int1')::uuid;
  perform pg_temp.chk('barter', 'author cannot edit their own response message',
    'original message', v_msg);
end $$;

-- ── State transitions are allow-listed and owner-only ───────────────────────
select pg_temp.act(current_setting('b5b.bt_ru')::uuid);
do $$
declare v_status text;
begin
  update public.barter_interests set status = 'accepted'
   where id = current_setting('b5b.bt_int1')::uuid;
  perform pg_temp.act_service();
  select status into v_status from public.barter_interests
   where id = current_setting('b5b.bt_int1')::uuid;
  perform pg_temp.chk('barter', 'responder cannot accept their own response',
    'pending', v_status);
end $$;

select pg_temp.act(current_setting('b5b.bt_tu')::uuid);
do $$
declare v_status text;
begin
  update public.barter_interests set status = 'accepted'
   where id = current_setting('b5b.bt_int1')::uuid;
  perform pg_temp.act_service();
  select status into v_status from public.barter_interests
   where id = current_setting('b5b.bt_int1')::uuid;
  perform pg_temp.chk('barter', 'an uninvolved provider cannot accept a response',
    'pending', v_status);
end $$;

select pg_temp.act(current_setting('b5b.bt_ou')::uuid);
select pg_temp.chk_allowed('barter', 'owner CAN accept a pending response',
  format($q$update public.barter_interests set status = 'accepted' where id = %L$q$,
         current_setting('b5b.bt_int1')));
select pg_temp.chk_blocked('barter', 'accepted cannot revert to pending',
  format($q$update public.barter_interests set status = 'pending' where id = %L$q$,
         current_setting('b5b.bt_int1')),
  'pending to accepted or declined');
select pg_temp.chk_blocked('barter', 'accepted cannot flip to declined',
  format($q$update public.barter_interests set status = 'declined' where id = %L$q$,
         current_setting('b5b.bt_int1')),
  'pending to accepted or declined');

-- ── SEC-AUTHZ-008: at most one accepted response per offer ──────────────────
do $$
declare v_second uuid;
begin
  perform pg_temp.act_service();
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
  values (current_setting('b5b.bt_off2')::uuid, current_setting('b5b.bt_tpid')::uuid,
          current_setting('b5b.bt_tu')::uuid) returning id into v_second;
  perform set_config('b5b.bt_int2', v_second::text, true);
end $$;
select pg_temp.act(current_setting('b5b.bt_ou')::uuid);
select pg_temp.chk_blocked('barter', 'a second response cannot also be accepted',
  format($q$update public.barter_interests set status = 'accepted' where id = %L$q$,
         current_setting('b5b.bt_int2')));

-- ── Duplicate protection keys on the non-forgeable column ───────────────────
select pg_temp.act(current_setting('b5b.bt_tu')::uuid);
select pg_temp.chk_blocked('barter', 'cannot respond twice to one offer',
  format($q$insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
           values (%L, %L, %L)$q$,
         current_setting('b5b.bt_off1'), current_setting('b5b.bt_tpid'),
         current_setting('b5b.bt_tu')));

-- The assertion above is satisfied by the PRE-EXISTING (offer_id, interested_provider_id)
-- key as well, so on its own it does not prove the new index exists. This one varies the
-- provider id while holding the user id, which ONLY the new key rejects. It must be seeded
-- as service_role because section 3 now makes that combination unreachable for a client.
do $$
declare v_blocked boolean := false; v_msg text;
begin
  perform pg_temp.act_service();
  begin
    -- (off1, opid) is an unused pair, so the legacy (offer, provider) key cannot fire and
    -- only the new (offer, user) key can reject this. Seeded as service_role because
    -- section 3 makes this combination unreachable for a client.
    insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
    values (current_setting('b5b.bt_off1')::uuid, current_setting('b5b.bt_opid')::uuid,
            current_setting('b5b.bt_tu')::uuid);
  exception when others then
    v_blocked := true; v_msg := sqlerrm;
  end;
  perform pg_temp.chk('barter',
    'duplicate is caught by the non-forgeable (offer, user) key specifically',
    'true',
    (v_blocked and position('one_per_offer_per_user' in coalesce(v_msg,'')) > 0)::text);
end $$;

-- ── SEC-DATA-009: counterparty history survives ─────────────────────────────
select pg_temp.act(current_setting('b5b.bt_ou')::uuid);
select pg_temp.chk_blocked('barter', 'owner cannot delete an offer that has responses',
  format($q$delete from public.barter_offers where id = %L$q$, current_setting('b5b.bt_off1')),
  'cannot be deleted');
select pg_temp.chk_allowed('barter', 'owner CAN delete an offer with no responses',
  format($q$delete from public.barter_offers where id = %L$q$, current_setting('b5b.bt_off3')));
select pg_temp.chk_allowed('barter', 'owner CAN close an offer instead (is_active = false)',
  format($q$update public.barter_offers set is_active = false where id = %L$q$,
         current_setting('b5b.bt_off1')));

select pg_temp.act(current_setting('b5b.bt_ru')::uuid);
select pg_temp.chk_blocked('barter', 'author cannot delete an ACCEPTED response',
  format($q$delete from public.barter_interests where id = %L$q$, current_setting('b5b.bt_int1')),
  'pending response');

-- The matching ALLOW path. Without it a regression that refused every delete would look like
-- success -- the failure mode _helpers.sql warns about.
do $$
declare v_pend uuid;
begin
  perform pg_temp.act_service();
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
  values (current_setting('b5b.bt_off3x')::uuid, current_setting('b5b.bt_rpid')::uuid,
          current_setting('b5b.bt_ru')::uuid) returning id into v_pend;
  perform set_config('b5b.bt_pend', v_pend::text, true);
end $$;
select pg_temp.act(current_setting('b5b.bt_ru')::uuid);
select pg_temp.chk_allowed('barter', 'author CAN withdraw a PENDING response',
  format($q$delete from public.barter_interests where id = %L$q$, current_setting('b5b.bt_pend')));

-- Offer identity/creation time are immutable on UPDATE too, not only stamped on INSERT.
select pg_temp.act(current_setting('b5b.bt_ou')::uuid);
select pg_temp.chk_blocked('barter', 'owner cannot rewrite an offer created_at',
  format($q$update public.barter_offers set created_at = now() - interval '30 days' where id = %L$q$,
         current_setting('b5b.bt_off2')),
  'not editable');

-- ── Read scope: a non-participant cannot read another pair's responses ──────
select pg_temp.act(current_setting('b5b.bt_tu')::uuid);
select pg_temp.chk('barter', 'non-participant cannot read a foreign response', '0',
  (select count(*)::text from public.barter_interests
    where id = current_setting('b5b.bt_int1')::uuid));

-- ── SQLSTATEs the client branches on ────────────────────────────────────────
-- Four user-facing messages in app/community/ distinguish "permanent" from "retry" purely by
-- SQLSTATE. A raise that lost its `using errcode` would default to P0001, every branch would
-- silently fall through to "Please try again", and nothing above would fail. Pin the codes.
do $$
declare v_code text; v_off uuid; v_int uuid;
begin
  perform pg_temp.act_service();
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
  values (current_setting('b5b.bt_opid')::uuid, current_setting('b5b.bt_ou')::uuid,
          'sqlstate', 'probe') returning id into v_off;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
  values (v_off, current_setting('b5b.bt_rpid')::uuid, current_setting('b5b.bt_ru')::uuid)
    returning id into v_int;

  -- deleteOffer -> "This offer has responses" must be 23514, not P0001.
  perform pg_temp.act(current_setting('b5b.bt_ou')::uuid);
  begin
    delete from public.barter_offers where id = v_off;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('barter', 'delete-with-responses raises 23514 (client branches on it)',
    '23514', v_code);

  -- decline of an already-answered response -> "Already answered" must be 23514.
  perform pg_temp.act_service();
  update public.barter_interests set status = 'accepted' where id = v_int;
  perform pg_temp.act(current_setting('b5b.bt_ou')::uuid);
  begin
    update public.barter_interests set status = 'declined' where id = v_int;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('barter', 'illegal status transition raises 23514 (client branches on it)',
    '23514', v_code);

  -- second accept on one offer -> "Already matched" must be 23505.
  perform pg_temp.act_service();
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
  values (v_off, current_setting('b5b.bt_tpid')::uuid, current_setting('b5b.bt_tu')::uuid)
    returning id into v_int;
  perform pg_temp.act(current_setting('b5b.bt_ou')::uuid);
  begin
    update public.barter_interests set status = 'accepted' where id = v_int;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('barter', 'second accept raises 23505 (client branches on it)',
    '23505', v_code);

  -- duplicate response -> "Already sent" must be 23505.
  perform pg_temp.act(current_setting('b5b.bt_ru')::uuid);
  begin
    insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
    values (v_off, current_setting('b5b.bt_rpid')::uuid, current_setting('b5b.bt_ru')::uuid);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('barter', 'duplicate response raises 23505 (client branches on it)',
    '23505', v_code);
end $$;

-- ── Rate limit is enforced in the write path, not by the client ─────────────
do $$
declare i integer; v_blocked boolean := false;
begin
  -- Fresh provider so the 24h window is this test's alone.
  perform pg_temp.act_service();
  declare
    lu uuid := gen_random_uuid(); lpid uuid; lo uuid;
  begin
    insert into auth.users(id) values (lu);
    insert into public.providers(user_id, display_name, username)
      values (lu, 'B5B Limiter', 'b5bl_'||substr(lu::text,1,8)) returning id into lpid;
    perform set_config('b5b.bt_lu', lu::text, true);
    perform set_config('b5b.bt_lpid', lpid::text, true);
    -- 20 distinct offers by the original owner to respond to.
    for i in 1..20 loop
      insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
      values (current_setting('b5b.bt_opid')::uuid, current_setting('b5b.bt_ou')::uuid,
              'lim'||i, 'seek'||i) returning id into lo;
      perform set_config('b5b.bt_lo'||i, lo::text, true);
    end loop;
  end;

  perform pg_temp.act(current_setting('b5b.bt_lu')::uuid);
  for i in 1..20 loop
    begin
      insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
      values (current_setting('b5b.bt_lo'||i)::uuid, current_setting('b5b.bt_lpid')::uuid,
              current_setting('b5b.bt_lu')::uuid);
    exception when others then
      v_blocked := true;
      exit;
    end;
  end loop;
  perform pg_temp.chk('barter', 'interest rate limit is enforced by the database',
    'true', v_blocked::text);
  perform pg_temp.chk('barter', 'rate limit allows the first 15 responses', '15',
    (select count(*)::text from public.barter_interests
      where interested_user_id = current_setting('b5b.bt_lu')::uuid));

  -- The limiter counts rate_limit_log, not the content rows, precisely so that withdrawing
  -- responses cannot buy more budget. Delete every pending response and try again.
  delete from public.barter_interests
   where interested_user_id = current_setting('b5b.bt_lu')::uuid;
  perform pg_temp.chk('barter', 'withdrawing responses actually deleted them', '0',
    (select count(*)::text from public.barter_interests
      where interested_user_id = current_setting('b5b.bt_lu')::uuid));
  -- submitInterest -> "Daily limit reached" must be 23514.
  declare v_code text;
  begin
    begin
      insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
      values (current_setting('b5b.bt_lo1')::uuid, current_setting('b5b.bt_lpid')::uuid,
              current_setting('b5b.bt_lu')::uuid);
      v_code := 'NO ERROR';
    exception when others then v_code := sqlstate;
    end;
    perform pg_temp.chk('barter', 'daily limit raises 23514 (client branches on it)',
      '23514', v_code);
  end;
  perform pg_temp.chk_blocked('barter',
    'deleting responses does NOT reset the daily limit',
    format($q$insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
             values (%L, %L, %L)$q$,
           current_setting('b5b.bt_lo1'), current_setting('b5b.bt_lpid'),
           current_setting('b5b.bt_lu')),
    'daily limit');

  -- And the limited user can neither read nor clear their own limit ledger.
  perform pg_temp.chk('barter', 'limited user cannot read their own rate_limit_log rows', '0',
    (select count(*)::text from public.rate_limit_log
      where user_id = current_setting('b5b.bt_lu')::uuid));
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Slice 2 — atomic accept → conversation handoff
-- ════════════════════════════════════════════════════════════════════════════

-- Grants: the RPC is the only barter function a client may call.
select pg_temp.chk('barter', 'anon cannot EXECUTE accept_barter_interest', 'false',
  has_function_privilege('anon', 'public.accept_barter_interest(uuid)', 'EXECUTE')::text);
select pg_temp.chk('barter', 'PUBLIC cannot EXECUTE accept_barter_interest', 'false',
  has_function_privilege('public', 'public.accept_barter_interest(uuid)', 'EXECUTE')::text);
select pg_temp.chk('barter', 'authenticated CAN EXECUTE accept_barter_interest', 'true',
  has_function_privilege('authenticated', 'public.accept_barter_interest(uuid)', 'EXECUTE')::text);
select pg_temp.chk('barter', 'accept_barter_interest is DEFINER with empty search_path', 'true',
  (select (p.prosecdef and 'search_path=""' = any(coalesce(p.proconfig, array[]::text[])))::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='accept_barter_interest'));

-- SCHEMA TRIPWIRE for barter_offers. barter_interests already has one; this is the sibling
-- guard, added BEFORE any agreement column lands. barter_offers uses a DENY-list, so a new
-- column is born mutable by its author -- acceptable while every column is author-owned, and
-- NOT acceptable for a column a counterparty depends on. This assertion makes that moment
-- loud instead of silent.
select pg_temp.chk('barter', 'barter_offers column set is unchanged',
  'created_at,id,is_active,notes,offering_service,offering_value,provider_id,seeking_service,user_id',
  (select string_agg(attname, ',' order by attname) from pg_attribute
    where attrelid = 'public.barter_offers'::regclass and attnum > 0 and not attisdropped));

-- ── Happy path: one accepted response AND a usable conversation ─────────────
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; off uuid; int1 uuid; v_conv uuid; v_conv2 uuid;
  v_status text; v_req text; v_msgs integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'S2 Owner', 's2o_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'S2 Responder', 's2r_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'photography', 'training') returning id into off;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
    values (off, rpid, ru) returning id into int1;

  perform pg_temp.act(ou);
  v_conv := public.accept_barter_interest(int1);

  perform pg_temp.act_service();
  select status into v_status from public.barter_interests where id = int1;
  perform pg_temp.chk('barter', 'RPC accepts the response', 'accepted', v_status);
  perform pg_temp.chk('barter', 'RPC returns a conversation id', 'true',
    (v_conv is not null)::text);
  select request_status into v_req from public.conversation where id = v_conv;
  -- "Usable" is null OR 'accepted', not 'accepted' specifically. enforce_prebooking_message_rules
  -- treats a NULL request_status as an open conversation, and whether the new row is clamped to
  -- 'pending' (then opened) or left NULL depends on which party the canonical uuid ordering puts
  -- in the client slot. Asserting the literal 'accepted' made this test pass or fail on the roll
  -- of a random uuid -- which is worse than not asserting it, because it looks deterministic.
  perform pg_temp.chk('barter', 'the conversation is USABLE (open for messaging)',
    'true', (v_req is null or v_req = 'accepted')::text);
  select count(*) into v_msgs from public.messages where conversation_id = v_conv;
  perform pg_temp.chk('barter', 'a match message was actually delivered', '1', v_msgs::text);
  perform pg_temp.chk('barter', 'exactly one accepted response on the offer', '1',
    (select count(*)::text from public.barter_interests
      where offer_id = off and status = 'accepted'));

  -- IDEMPOTENCE: the same accept again returns the SAME conversation and adds no message.
  perform pg_temp.act(ou);
  v_conv2 := public.accept_barter_interest(int1);
  perform pg_temp.act_service();
  perform pg_temp.chk('barter', 'repeated accept is idempotent (same conversation)',
    v_conv::text, v_conv2::text);
  select count(*) into v_msgs from public.messages where conversation_id = v_conv;
  perform pg_temp.chk('barter', 'repeated accept does not duplicate the match message',
    '1', v_msgs::text);

  perform set_config('b5b.s2_off', off::text, true);
  perform set_config('b5b.s2_ou', ou::text, true);
  perform set_config('b5b.s2_opid', opid::text, true);
end $$;

-- ── Both canonical orientations ─────────────────────────────────────────────
-- The client slot is chosen by uuid order, and which party lands there decides whether
-- enforce_conversation_insert clamps the new row to 'pending' or leaves it NULL. Those are
-- different code paths, and random uuids exercise only one per run. This drives BOTH
-- deliberately, so the pass is not a coin flip.
do $$
declare
  lo uuid; hi uuid; lpid uuid; hpid uuid; off uuid; i uuid; c uuid; v_req text; v_msgs integer;
  ord text;
begin
  for ord in select unnest(array['owner_lower','owner_higher']) loop
    perform pg_temp.act_service();
    -- Force the ordering rather than hoping for it.
    lo := ('00000000-0000-4000-8000-' || lpad(md5(ord||'a'), 12, '0'))::uuid;
    hi := ('ffffffff-0000-4000-8000-' || lpad(md5(ord||'b'), 12, '0'))::uuid;
    insert into auth.users(id) values (lo), (hi);
    insert into public.providers(user_id, display_name, username)
      values (lo, 'Ord Lo', 'ordlo_'||ord) returning id into lpid;
    insert into public.providers(user_id, display_name, username)
      values (hi, 'Ord Hi', 'ordhi_'||ord) returning id into hpid;

    if ord = 'owner_lower' then
      insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
        values (lpid, lo, 'ord', 'probe') returning id into off;
      insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
        values (off, hpid, hi) returning id into i;
      perform pg_temp.act(lo);
    else
      insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
        values (hpid, hi, 'ord', 'probe') returning id into off;
      insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
        values (off, lpid, lo) returning id into i;
      perform pg_temp.act(hi);
    end if;

    c := public.accept_barter_interest(i);
    perform pg_temp.act_service();
    select request_status into v_req from public.conversation where id = c;
    select count(*) into v_msgs from public.messages where conversation_id = c;
    perform pg_temp.chk('barter', 'accept works when ' || ord || ' (thread usable)',
      'true', (v_req is null or v_req = 'accepted')::text);
    perform pg_temp.chk('barter', 'accept works when ' || ord || ' (message delivered)',
      '1', v_msgs::text);
    perform pg_temp.chk('barter', 'accept works when ' || ord || ' (canonical client slot)',
      lo::text, (select client_id::text from public.conversation where id = c));
  end loop;
end $$;

-- ── One winner: a second response on a matched offer cannot be accepted ─────
do $$
declare tu uuid := gen_random_uuid(); tpid uuid; int2 uuid; v_code text; v_status text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (tu);
  insert into public.providers(user_id, display_name, username)
    values (tu, 'S2 Third', 's2t_'||substr(tu::text,1,8)) returning id into tpid;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
    values (current_setting('b5b.s2_off')::uuid, tpid, tu) returning id into int2;

  perform pg_temp.act(current_setting('b5b.s2_ou')::uuid);
  begin
    perform public.accept_barter_interest(int2);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('barter', 'a second accept on a matched offer is refused',
    '23505', v_code);
  perform pg_temp.act_service();
  select status into v_status from public.barter_interests where id = int2;
  perform pg_temp.chk('barter', 'the refused response stays pending', 'pending', v_status);
end $$;

-- ── Only the offer owner may accept ─────────────────────────────────────────
do $$
declare
  xu uuid := gen_random_uuid(); xpid uuid; off2 uuid; i2 uuid; v_code text; v_status text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (xu);
  insert into public.providers(user_id, display_name, username)
    values (xu, 'S2 Outsider', 's2x_'||substr(xu::text,1,8)) returning id into xpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (current_setting('b5b.s2_opid')::uuid, current_setting('b5b.s2_ou')::uuid,
            'second', 'offer') returning id into off2;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
    values (off2, xpid, xu) returning id into i2;

  perform pg_temp.act(xu);   -- the RESPONDER, not the owner
  begin
    perform public.accept_barter_interest(i2);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  -- 42501, not the generic 23514: a distinct code exists so the client can say "not your
  -- offer" instead of asserting something false about the response's status.
  perform pg_temp.chk('barter', 'a non-owner cannot accept', '42501', v_code);
  perform pg_temp.act_service();
  select status into v_status from public.barter_interests where id = i2;
  perform pg_temp.chk('barter', 'a non-owner attempt leaves the response pending',
    'pending', v_status);
  perform set_config('b5b.s2_off2', off2::text, true);
  perform set_config('b5b.s2_i2', i2::text, true);
  perform set_config('b5b.s2_xu', xu::text, true);
  perform set_config('b5b.s2_xpid', xpid::text, true);
end $$;

-- ── ATOMICITY, proven by fault injection ────────────────────────────────────
-- The requirement is "if conversation setup cannot succeed, acceptance must not commit".
-- Nothing in the normal path fails on demand, so a CHECK is added for the duration of this
-- assertion to make the match-message insert fail. The whole harness runs in one rolled-back
-- transaction, so the constraint never outlives the test. This proves the property
-- end-to-end rather than arguing it from the function body.
do $$
declare v_code text; v_status text; v_convs integer;
begin
  perform pg_temp.act_service();
  alter table public.messages
    add constraint b5b_force_message_failure check (content not like '%FORCEFAIL%');

  perform pg_temp.act(current_setting('b5b.s2_ou')::uuid);
  begin
    -- The offer's text is interpolated into the match message, so this trips the constraint
    -- AFTER the accept and the conversation work have already happened inside the function.
    perform pg_temp.act_service();
    update public.barter_offers set offering_service = 'FORCEFAIL service'
     where id = current_setting('b5b.s2_off2')::uuid;
    perform pg_temp.act(current_setting('b5b.s2_ou')::uuid);
    perform public.accept_barter_interest(current_setting('b5b.s2_i2')::uuid);
    v_code := 'NO ERROR';
  exception when others then v_code := 'RAISED';
  end;

  perform pg_temp.act_service();
  alter table public.messages drop constraint b5b_force_message_failure;

  perform pg_temp.chk('barter', 'message-setup failure raises rather than half-succeeding',
    'RAISED', v_code);
  select status into v_status from public.barter_interests
   where id = current_setting('b5b.s2_i2')::uuid;
  perform pg_temp.chk('barter',
    'NO acceptance persists when conversation setup fails', 'pending', v_status);
  -- Scoped to the pair whose accept failed, in both orientations. A broader count would
  -- also catch the legitimate thread created by the happy-path accept above and report a
  -- leak that is not one.
  select count(*) into v_convs from public.conversation
   where (client_id = current_setting('b5b.s2_xu')::uuid
          and provider_id = current_setting('b5b.s2_opid')::uuid)
      or (client_id = current_setting('b5b.s2_ou')::uuid
          and provider_id = current_setting('b5b.s2_xpid')::uuid);
  perform pg_temp.chk('barter',
    'no orphan conversation is left behind by the failed accept', '0', v_convs::text);
end $$;

-- ── A previously DECLINED pre-booking conversation becomes usable ───────────
-- The variant that silently stranded matches before Slice 2: the pair already had a declined
-- request, the message insert was rejected by the messaging trigger, and the old code
-- navigated anyway. The accept must now either produce a usable thread or fail atomically.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; off uuid; i uuid; c uuid; v_conv uuid; v_req text; v_msgs integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2 DeclOwner', 's2do_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2 DeclResp', 's2dr_'||substr(bu::text,1,8)) returning id into bpid;
  -- B previously messaged A as a client and was DECLINED.
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (bu, apid, 'declined', now()) returning id into c;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (apid, au, 'declined-path', 'probe') returning id into off;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id)
    values (off, bpid, bu) returning id into i;

  perform pg_temp.act(au);
  v_conv := public.accept_barter_interest(i);

  perform pg_temp.act_service();
  perform pg_temp.chk('barter', 'declined pre-booking thread is REUSED, not duplicated',
    c::text, v_conv::text);
  select request_status into v_req from public.conversation where id = v_conv;
  perform pg_temp.chk('barter', 'the declined thread is opened by the barter match',
    'accepted', v_req);
  select count(*) into v_msgs from public.messages where conversation_id = v_conv;
  perform pg_temp.chk('barter', 'the match message is delivered on the reused thread',
    '1', v_msgs::text);
  perform pg_temp.chk('barter', 'no duplicate conversation was created for the pair', '1',
    (select count(*)::text from public.conversation
      where (client_id = bu and provider_id = apid) or (client_id = au and provider_id = bpid)));
end $$;

-- ── The carve-out is EVIDENCE-gated, not caller-gated ───────────────────────
-- Opening a declined request must require a real accepted barter match. A participant must
-- not be able to reach it by simply asking.
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid();
  ppid uuid; c uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'S2 NoMatch', 's2nm_'||substr(pu::text,1,8)) returning id into ppid;
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (cu, ppid, 'declined', now()) returning id into c;

  perform pg_temp.act(pu);   -- the provider on the row, with NO barter match
  begin
    update public.conversation set request_status = 'accepted' where id = c;
    v_code := 'NO ERROR';
  exception when others then v_code := 'RAISED';
  end;
  perform pg_temp.chk('barter',
    'declined -> accepted is refused without an accepted barter match', 'RAISED', v_code);
end $$;


-- ── The carve-out is reachable ONLY from the handoff RPC ────────────────────
-- SEC-AUTHZ-001 regression. Evidence-gating alone is not enough: an accepted barter match is
-- permanent (Slice 1 forbids reverting it), so a pair-scoped carve-out would confer the
-- ability to reopen ANY declined request between them, forever, on the party who was
-- declined. `decline` is the only refusal primitive this product ships -- there is no
-- blocking -- so that must not be defeasible by the refused party. These three cases pin the
-- narrowing: the RPC may do it, a direct UPDATE by either participant may not.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; o uuid; i uuid; c2 uuid; v_code text; v_req text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2 Narrow A', 's2na_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2 Narrow B', 's2nb_'||substr(bu::text,1,8)) returning id into bpid;

  -- A real, accepted barter match between A and B.
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (apid, au, 'Narrow O', 'Narrow S') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, bpid, bu, 'narrow', 'accepted') returning id into i;

  -- A SEPARATE pre-booking thread in the OTHER orientation, which B has declined. A is the
  -- client here: A asked, B said no.
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (au, bpid, 'declined', now()) returning id into c2;

  -- 1. The declined party (A, the client) cannot reopen it by asking directly.
  perform pg_temp.act(au);
  begin
    update public.conversation set request_status = 'accepted' where id = c2;
    v_code := 'NO ERROR';
  exception when others then v_code := 'RAISED';
  end;
  perform pg_temp.chk('barter',
    'a matched pair CANNOT reopen a declined request outside the RPC (client)',
    'RAISED', v_code);

  -- 2. Nor can the provider who declined, by the same route.
  perform pg_temp.act(bu);
  begin
    update public.conversation set request_status = 'accepted' where id = c2;
    v_code := 'NO ERROR';
  exception when others then v_code := 'RAISED';
  end;
  perform pg_temp.chk('barter',
    'a matched pair CANNOT reopen a declined request outside the RPC (provider)',
    'RAISED', v_code);

  perform pg_temp.act_service();
  select request_status into v_req from public.conversation where id = c2;
  perform pg_temp.chk('barter', 'the declined request is still declined after both attempts',
    'declined', v_req);
end $$;

-- ── pending -> accepted stays PROVIDER-ONLY, match or no match ──────────────
-- CODE-TEST-106. The pre-existing rule is that only the provider resolves a pending request.
-- The carve-out must not relax that for a matched pair outside the handoff; messaging.test.sql
-- already covers the no-match case, so this covers the case a barter match is present.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; o uuid; c2 uuid; v_code text; v_req text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2 Pend A', 's2pa_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2 Pend B', 's2pb_'||substr(bu::text,1,8)) returning id into bpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (apid, au, 'Pend O', 'Pend S') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, bpid, bu, 'pend', 'accepted');
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (au, bpid, 'pending', now()) returning id into c2;

  perform pg_temp.act(au);   -- A is the CLIENT on this row, and IS barter-matched with B
  begin
    update public.conversation set request_status = 'accepted' where id = c2;
    v_code := 'NO ERROR';
  exception when others then v_code := 'RAISED';
  end;
  perform pg_temp.chk('barter',
    'a matched CLIENT still cannot accept their own pending request', 'RAISED', v_code);

  perform pg_temp.act_service();
  select request_status into v_req from public.conversation where id = c2;
  perform pg_temp.chk('barter', 'the pending request is untouched by the refused attempt',
    'pending', v_req);
end $$;

-- ── The match evidence cannot be borrowed by a THIRD party ──────────────────
-- The EXISTS join pins BOTH conversation slots to the two parties of the interest. A provider
-- who is matched with one of them must gain nothing on a thread they are not part of, and
-- nothing on their own thread with the other.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid(); tu uuid := gen_random_uuid();
  apid uuid; bpid uuid; tpid uuid; o uuid; c3 uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu), (tu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2 Third A', 's2ta_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2 Third B', 's2tb_'||substr(bu::text,1,8)) returning id into bpid;
  insert into public.providers(user_id, display_name, username)
    values (tu, 'S2 Third T', 's2tt_'||substr(tu::text,1,8)) returning id into tpid;

  -- T is matched with A. T has NO match with B.
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (apid, au, 'Third O', 'Third S') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, tpid, tu, 'third', 'accepted');

  -- T's own declined thread with B, on which T is the client.
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (tu, bpid, 'declined', now()) returning id into c3;

  perform pg_temp.act(tu);
  begin
    update public.conversation set request_status = 'accepted' where id = c3;
    v_code := 'NO ERROR';
  exception when others then v_code := 'RAISED';
  end;
  perform pg_temp.chk('barter',
    'a match with A confers nothing on a declined thread with B', 'RAISED', v_code);
end $$;

-- ── Ordinary client <-> provider messaging is untouched ─────────────────────
-- The carve-out requires old.client_id to BE some providers.user_id in either orientation, so
-- a conversation whose client is an ordinary (non-provider) user can never satisfy it. True
-- by construction today; asserted so it stays true.
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid(); ou uuid := gen_random_uuid();
  ppid uuid; opid uuid; o uuid; c uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu), (ou);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'S2 Plain P', 's2pp_'||substr(pu::text,1,8)) returning id into ppid;
  insert into public.providers(user_id, display_name, username)
    values (ou, 'S2 Plain O', 's2po_'||substr(ou::text,1,8)) returning id into opid;
  -- The provider IS barter-matched, just with somebody else entirely.
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'Plain O', 'Plain S') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, ppid, pu, 'plain', 'accepted');

  -- An ordinary client's declined request to that provider.
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (cu, ppid, 'declined', now()) returning id into c;

  perform pg_temp.act(cu);
  begin
    update public.conversation set request_status = 'accepted' where id = c;
    v_code := 'NO ERROR';
  exception when others then v_code := 'RAISED';
  end;
  perform pg_temp.chk('barter',
    'an ordinary client cannot reopen their declined request (carve-out unsatisfiable)',
    'RAISED', v_code);
end $$;

-- ── Sensitivity: the MARKER is what refuses those attempts ──────────────────
-- The four assertions above are only meaningful if they fail for the intended reason. A test
-- that would pass anyway (because RLS refused, or because the evidence join missed) proves
-- nothing about the narrowing. Here the ONLY thing that changes is the marker: same pair,
-- same match, same participant, same statement. It succeeds. So the refusals above are
-- attributable to the marker and not to some other gate that happened to be in the way.
--
-- This also states the narrowing's actual threat model plainly: anyone who can set this GUC
-- in the same transaction as their own UPDATE defeats it. PostgREST runs each request in its
-- own transaction and exposes only API-schema functions over /rpc/, so an API client cannot.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; o uuid; c2 uuid; v_req text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2 Sens A', 's2sa_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2 Sens B', 's2sb_'||substr(bu::text,1,8)) returning id into bpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (apid, au, 'Sens O', 'Sens S') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, bpid, bu, 'sens', 'accepted');
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (au, bpid, 'declined', now()) returning id into c2;

  perform pg_temp.act(au);
  perform set_config('app.barter_handoff', c2::text, true);   -- the ONLY difference
  update public.conversation set request_status = 'accepted' where id = c2;
  perform set_config('app.barter_handoff', '', true);

  perform pg_temp.act_service();
  select request_status into v_req from public.conversation where id = c2;
  perform pg_temp.chk('barter',
    'with the marker set, the SAME update succeeds (refusals above are the marker)',
    'accepted', v_req);
end $$;
