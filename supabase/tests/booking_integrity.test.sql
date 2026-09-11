-- B5B suite: Booking & Onboarding Integrity.
--
-- The question here is not "does a booking work" but the one a client would ask
-- if they ever had to rely on it: **is what I agreed to still what the record
-- says I agreed to, a year from now, after the provider changed their contract?**

do $$
declare
  cu uuid := gen_random_uuid();   -- the client
  pu uuid := gen_random_uuid();   -- the provider's owner
  ou uuid := gen_random_uuid();   -- an unrelated user
  pid uuid; cid uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu), (ou);
  insert into public.providers(user_id, display_name, username, is_approved)
    values (pu, 'BI Provider', 'bi_'||substr(pu::text,1,8), true) returning id into pid;
  insert into public.clients(id, name) values (cu, 'BI Client'), (ou, 'BI Stranger')
    on conflict (id) do nothing;
  insert into public.contracts(provider_id, user_id, title, body, contract_type)
    values (pid, pu, 'Service Agreement', 'ORIGINAL TERMS v1', 'text') returning id into cid;
  perform set_config('b5b.bi_c', cu::text, true);
  perform set_config('b5b.bi_p', pu::text, true);
  perform set_config('b5b.bi_o', ou::text, true);
  perform set_config('b5b.bi_pid', pid::text, true);
  perform set_config('b5b.bi_cid', cid::text, true);
end $$;

-- ══ 1. A VERSION EXISTS THE MOMENT A CONTRACT DOES ════════════════════════
select pg_temp.chk('bookingintegrity', 'creating a contract snapshots version 1', '1',
  (select count(*)::text from public.contract_versions
    where contract_id = current_setting('b5b.bi_cid')::uuid and version_no = 1));

-- ══ 2. THE ACCEPTANCE BINDS, AND THE PROVIDER CANNOT REWRITE IT ═══════════
--
-- The whole requirement, in one block. A client accepts v1; the provider then
-- edits their contract; the acceptance must still say v1 and still carry v1's
-- words.
do $$
declare
  cu uuid := current_setting('b5b.bi_c')::uuid;
  pu uuid := current_setting('b5b.bi_p')::uuid;
  pid uuid := current_setting('b5b.bi_pid')::uuid;
  cid uuid := current_setting('b5b.bi_cid')::uuid;
  v_bk uuid; v_v1 uuid; v_rec record; v_n integer; v_code text;
begin
  perform pg_temp.act_service();
  select id into v_v1 from public.contract_versions where contract_id = cid and version_no = 1;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, expires_at)
  values (cu, pid, 'a service', current_date + 5, 'pending',
          now() - interval '1 hour', now() + interval '71 hours')
  returning id into v_bk;
  insert into public.contract_signatures(contract_id, contract_version_id, booking_id,
                                         client_user_id, signed_at, status)
  values (cid, v_v1, v_bk, cu, now(), 'signed');
  perform set_config('b5b.bi_bk', v_bk::text, true);
  perform set_config('b5b.bi_v1', v_v1::text, true);

  -- THE PROVIDER CHANGES THEIR CONTRACT.
  update public.contracts set body = 'REWRITTEN TERMS v2' where id = cid;
  perform pg_temp.chk('bookingintegrity', 'editing a contract creates a SECOND version', '2',
    (select count(*)::text from public.contract_versions where contract_id = cid));
  perform pg_temp.chk('bookingintegrity', 'and the contract row now holds the new text',
    'REWRITTEN TERMS v2', (select body from public.contracts where id = cid));

  -- THE ACCEPTANCE IS UNMOVED.
  perform pg_temp.act(cu);
  select * into v_rec from public.booking_contract_record(v_bk);
  perform pg_temp.chk('bookingintegrity',
    'the client revisits the version they ACCEPTED, not the current one',
    'ORIGINAL TERMS v1', v_rec.body);
  perform pg_temp.chk('bookingintegrity', 'and it is still version 1', '1',
    v_rec.version_no::text);
  perform pg_temp.chk('bookingintegrity', 'with its acceptance timestamp intact', 'true',
    (v_rec.accepted_at is not null)::text);
  -- AUDITABILITY: the record says the provider has changed their agreement since,
  -- rather than leaving two people to diff two documents.
  perform pg_temp.chk('bookingintegrity',
    'and it reports that the provider has changed their contract since', 'true',
    v_rec.provider_contract_changed_since::text);

  -- THE PROVIDER SEES THE SAME RECORD. An acceptance only one side can read is
  -- not something either side can rely on.
  perform pg_temp.act(pu);
  select * into v_rec from public.booking_contract_record(v_bk);
  perform pg_temp.chk('bookingintegrity', 'the PROVIDER revisits the same accepted version',
    'ORIGINAL TERMS v1', v_rec.body);
  perform pg_temp.chk('bookingintegrity', 'and sees who accepted it', cu::text,
    v_rec.client_user_id::text);

  -- NOBODY ELSE DOES.
  perform pg_temp.act(current_setting('b5b.bi_o')::uuid);
  select count(*) into v_n from public.booking_contract_record(v_bk);
  perform pg_temp.chk('bookingintegrity',
    'an unrelated user cannot read another booking''s contract record', '0', v_n::text);
  perform pg_temp.act_service();
end $$;

-- ══ 3. A VERSION IS IMMUTABLE, AND SO IS THE BINDING ══════════════════════
do $$
declare
  pu uuid := current_setting('b5b.bi_p')::uuid;
  cu uuid := current_setting('b5b.bi_c')::uuid;
  v1 uuid := current_setting('b5b.bi_v1')::uuid;
  v_code text;
begin
  perform pg_temp.act(pu);
  begin
    update public.contract_versions set body = 'tampered' where id = v1;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookingintegrity', 'a recorded version cannot be edited',
    '42501', v_code);

  -- And the acceptance cannot be re-pointed at a different version, which would
  -- rewrite what was agreed without touching either document.
  perform pg_temp.act(cu);
  begin
    update public.contract_signatures
       set contract_version_id = (select id from public.contract_versions
                                   where contract_id = current_setting('b5b.bi_cid')::uuid
                                     and version_no = 2)
     where booking_id = current_setting('b5b.bi_bk')::uuid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookingintegrity',
    'an acceptance cannot be moved to another version', '23514', v_code);
  perform pg_temp.act_service();
end $$;

-- An acceptance must NAME a version: a record with no document attached records
-- nothing, so the server refuses rather than trusting the client to remember.
do $$
declare
  cu uuid := current_setting('b5b.bi_c')::uuid;
  pid uuid := current_setting('b5b.bi_pid')::uuid;
  cid uuid := current_setting('b5b.bi_cid')::uuid;
  v_bk2 uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pid, 'second', current_date + 9) returning id into v_bk2;
  perform pg_temp.act(cu);
  begin
    insert into public.contract_signatures(contract_id, booking_id, client_user_id,
                                           signed_at, status)
    values (cid, v_bk2, cu, now(), 'signed');
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookingintegrity',
    'an acceptance naming no version is refused', '23514', v_code);
  perform pg_temp.act_service();
  delete from public.bookings where id = v_bk2;
end $$;

-- ══ 4. REFERENCE PHOTOS REACH THE PROVIDER ════════════════════════════════
--
-- The control existed before any of this did and the files went nowhere. These
-- assert the two halves that make it honest: they persist, and the PROVIDER —
-- the person they are for — can read them.
do $$
declare
  cu uuid := current_setting('b5b.bi_c')::uuid;
  pu uuid := current_setting('b5b.bi_p')::uuid;
  ou uuid := current_setting('b5b.bi_o')::uuid;
  bk uuid := current_setting('b5b.bi_bk')::uuid;
  v_n integer; v_code text;
begin
  perform pg_temp.act(cu);
  insert into public.booking_reference_photos(booking_id, storage_path, uploaded_by_user_id)
  values (bk, cu::text || '/' || bk::text || '/a.jpg', cu);
  perform pg_temp.chk('bookingintegrity', 'a client can attach a reference photo', '1',
    (select count(*)::text from public.booking_reference_photos where booking_id = bk));

  perform pg_temp.act(pu);
  select count(*) into v_n from public.booking_reference_photos where booking_id = bk;
  perform pg_temp.chk('bookingintegrity',
    'and the PROVIDER can see it before deciding', '1', v_n::text);
  -- The storage read is object-bound and resolved through the booking, so the
  -- provider can read a file the client uploaded without the path naming them.
  perform pg_temp.chk('bookingintegrity', 'the provider may read the object itself', 'true',
    public.can_read_booking_photo(cu::text || '/' || bk::text || '/a.jpg')::text);

  perform pg_temp.act(ou);
  select count(*) into v_n from public.booking_reference_photos where booking_id = bk;
  perform pg_temp.chk('bookingintegrity', 'a stranger sees none of it', '0', v_n::text);
  perform pg_temp.chk('bookingintegrity', 'nor may they read the object', 'false',
    public.can_read_booking_photo(cu::text || '/' || bk::text || '/a.jpg')::text);

  -- A provider cannot ADD "reference photos" to a client's request: that would be
  -- putting words in their mouth on a record the client is relying on.
  perform pg_temp.act(pu);
  begin
    insert into public.booking_reference_photos(booking_id, storage_path, uploaded_by_user_id)
    values (bk, 'forged.jpg', pu);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookingintegrity', 'a provider cannot attach photos to a request',
    '42501', v_code);

  -- Three is the server's limit, not the screen's.
  perform pg_temp.act(cu);
  insert into public.booking_reference_photos(booking_id, storage_path, uploaded_by_user_id)
  values (bk, 'b.jpg', cu), (bk, 'c.jpg', cu);
  begin
    insert into public.booking_reference_photos(booking_id, storage_path, uploaded_by_user_id)
    values (bk, 'd.jpg', cu);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookingintegrity', 'a fourth photo is refused by the server',
    '23514', v_code);
  perform pg_temp.act_service();
end $$;

-- ══ 5. BOOKABLE MEANS BOOKABLE ════════════════════════════════════════════
do $$
declare
  pid uuid := current_setting('b5b.bi_pid')::uuid;
  pu uuid := current_setting('b5b.bi_p')::uuid;
begin
  perform pg_temp.act_service();
  delete from public.provider_availability where provider_id = pid;
  delete from public.provider_services where provider_id = pid;

  perform pg_temp.chk('bookingintegrity',
    'a provider with no service and no hours is NOT bookable', 'false',
    public.provider_is_bookable(pid)::text);

  insert into public.provider_services(provider_id, name, price, duration_minutes)
  values (pid, 'A service', 50, 60);
  perform pg_temp.chk('bookingintegrity',
    'a service alone does not make them bookable — a client still lands on an empty calendar',
    'false', public.provider_is_bookable(pid)::text);

  insert into public.provider_availability(provider_id, weekday, start_time, end_time,
                                           is_available)
  values (pid, 1, '09:00', '17:00', true);
  perform pg_temp.chk('bookingintegrity',
    'service plus availability makes them bookable', 'true',
    public.provider_is_bookable(pid)::text);

  -- De-approval still wins, and for a different reason (item H / PD-076).
  update public.providers set is_approved = false where id = pid;
  perform pg_temp.chk('bookingintegrity', 'a de-approved provider is not bookable either',
    'false', public.provider_is_bookable(pid)::text);
  update public.providers set is_approved = true where id = pid;

  -- OPTIONAL MEANS OPTIONAL: no portfolio, no reels, still bookable. Requirement
  -- G is explicit that media is not a booking or ranking requirement, and a test
  -- is how that survives someone's good intentions later.
  perform pg_temp.chk('bookingintegrity',
    'and media is NOT part of it — no portfolio, no reels, still bookable', 'true',
    public.provider_is_bookable(pid)::text);
end $$;
select pg_temp.act_service();

-- ══ 6. THE CORRECTIONS THE SECURITY REVIEW OF THIS BRANCH FOUND ═══════════
--
-- All four were introduced by this branch, and two sat inside the requirement
-- it is named for.

-- 6a. THE "WHEN" IS THE SERVER'S. It was `new Date().toISOString()` from the
-- phone — the one field in a record whose stated purpose is to say what was true
-- at a moment that the client could choose. A backdated acceptance can be made
-- to look older than the version it actually post-dates, which is exactly the
-- comparison the record exists to support.
do $$
declare
  cu uuid := current_setting('b5b.bi_c')::uuid;
  pid uuid := current_setting('b5b.bi_pid')::uuid;
  cid uuid := current_setting('b5b.bi_cid')::uuid;
  v_bk uuid; v_when timestamptz; v_code text;
begin
  perform pg_temp.act_service();
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status,
                              submitted_at, expires_at)
  values (cu, pid, 'stamped', current_date + 11, 'pending', now(), now() + interval '71 hours')
  returning id into v_bk;

  perform pg_temp.act(cu);
  insert into public.contract_signatures(contract_id, contract_version_id, booking_id,
                                         client_user_id, signed_at, status)
  values (cid, current_setting('b5b.bi_v1')::uuid, v_bk, cu,
          now() - interval '30 days', 'signed');
  select signed_at into v_when from public.contract_signatures where booking_id = v_bk;
  perform pg_temp.chk('bookingintegrity',
    'a client-supplied acceptance time does not survive', 'true',
    (v_when > now() - interval '1 minute')::text);

  begin
    update public.contract_signatures set signed_at = now() - interval '5 days'
     where booking_id = v_bk;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookingintegrity', 'and it cannot be changed afterwards',
    '23514', v_code);
  perform pg_temp.act_service();
end $$;

-- 6b. A DRAFT'S PHOTOS AND CONTRACT RECORD ARE NOT THE PROVIDER'S TO SEE.
-- Photos upload BEFORE the request is sent, so a send refused by a block, a
-- de-approval or a write failure leaves them on a draft that never went. The
-- definer helper bypassed the `submitted_at is not null` rule the bookings
-- policy already applies to providers: the TABLE said no and the BUCKET said yes.
do $$
declare
  cu uuid := current_setting('b5b.bi_c')::uuid;
  pu uuid := current_setting('b5b.bi_p')::uuid;
  pid uuid := current_setting('b5b.bi_pid')::uuid;
  v_draft uuid; v_path text; v_n integer;
begin
  perform pg_temp.act_service();
  delete from public.bookings where user_id = cu and provider_id = pid and submitted_at is null;
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pid, 'never sent', current_date + 13) returning id into v_draft;
  v_path := cu::text || '/' || v_draft::text || '/0.jpg';
  insert into public.booking_reference_photos(booking_id, storage_path, uploaded_by_user_id)
  values (v_draft, v_path, cu);

  -- The client still sees their own draft's attachments: they chose them.
  perform pg_temp.act(cu);
  perform pg_temp.chk('bookingintegrity',
    'the client can still read photos on their own unsent draft', 'true',
    public.can_read_booking_photo(v_path)::text);

  -- The provider cannot, because the request was never sent to them.
  perform pg_temp.act(pu);
  perform pg_temp.chk('bookingintegrity',
    'the provider cannot read photos on a draft that was never sent', 'false',
    public.can_read_booking_photo(v_path)::text);
  select count(*) into v_n from public.booking_contract_record(v_draft);
  perform pg_temp.chk('bookingintegrity',
    'nor its contract record', '0', v_n::text);
  perform pg_temp.act_service();
end $$;

-- 6c. AN ACCEPTED AGREEMENT CANNOT BE DELETED OUT FROM UNDER THE CLIENT.
-- Before this branch, a provider deleting their contract cascaded away every
-- client's acceptance row. The version trigger started refusing it by accident,
-- with a message naming the wrong object; now it is deliberate and says so.
do $$
declare
  pu uuid := current_setting('b5b.bi_p')::uuid;
  cid uuid := current_setting('b5b.bi_cid')::uuid;
  pid uuid := current_setting('b5b.bi_pid')::uuid;
  v_code text; v_msg text; v_spare uuid;
begin
  perform pg_temp.act(pu);
  begin
    delete from public.contracts where id = cid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.chk('bookingintegrity',
    'a provider cannot delete an agreement a client has accepted', '23514', v_code);
  perform pg_temp.chk('bookingintegrity', 'and the message says why', 'true',
    (v_msg like '%accepted by a client%')::text);

  -- An agreement nobody has accepted is still freely deletable: the rule
  -- protects evidence, it does not trap providers.
  --
  -- A SECOND PROVIDER, because `contracts_provider_id_key` allows one contract
  -- per provider — which is also why the refusal above matters so much: editing
  -- is a provider's ONLY path once a client has accepted, and the error message
  -- says exactly that.
  perform pg_temp.act_service();
  declare
    v_su uuid := gen_random_uuid(); v_sp uuid;
  begin
    insert into auth.users(id) values (v_su);
    insert into public.providers(user_id, display_name, username)
      values (v_su, 'BI Spare', 'bis_'||substr(v_su::text,1,8)) returning id into v_sp;
    insert into public.contracts(provider_id, user_id, title, body, contract_type)
    values (v_sp, v_su, 'Unused', 'nobody accepted this', 'text') returning id into v_spare;
    perform pg_temp.act(v_su);
  end;
  begin
    delete from public.contracts where id = v_spare;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookingintegrity',
    'but an agreement nobody accepted can still be deleted', 'OK', v_code);
  perform pg_temp.act_service();
end $$;

-- 6d. The service_role escape that 20261069000000 removed without saying so.
select pg_temp.chk('bookingintegrity',
  'the signature immutability trigger keeps its service_role escape', '1',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_signature_target_immutable'
      and p.prosrc like '%service_role%'));
select pg_temp.act_service();
