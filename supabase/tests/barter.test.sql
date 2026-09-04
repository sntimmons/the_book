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
