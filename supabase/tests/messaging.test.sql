-- B5B suite: pre-booking message-request trust boundaries.
-- Enforced by enforce_prebooking_message_rules (BEFORE INSERT on messages) plus the
-- messages/conversation RLS. Asserted here against the DB, not the UI.

-- ── Pending: exactly one initial message, client only ───────────────────────
select pg_temp.act(current_setting('b5b.cu2')::uuid);
select pg_temp.chk_allowed('messaging', 'client may send the ONE initial message while pending',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''first contact'')',
         current_setting('b5b.c_pend'), current_setting('b5b.cu2')));
select pg_temp.chk_blocked('messaging', 'a SECOND client message while pending is blocked',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''nudge'')',
         current_setting('b5b.c_pend'), current_setting('b5b.cu2')),
  'only one message');

-- The provider must accept before replying: silence is the gate, not a UI choice.
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_blocked('messaging', 'provider cannot message on a PENDING request',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''hi'')',
         current_setting('b5b.c_pend'), current_setting('b5b.pu')),
  'accept the request');

-- ── Declined: the conversation is closed to both sides ──────────────────────
select pg_temp.act(current_setting('b5b.cu4')::uuid);
select pg_temp.chk_blocked('messaging', 'client cannot message a DECLINED request',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''please reconsider'')',
         current_setting('b5b.c_dec'), current_setting('b5b.cu4')),
  'declined');
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_blocked('messaging', 'provider cannot message a DECLINED request',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''actually...'')',
         current_setting('b5b.c_dec'), current_setting('b5b.pu')),
  'declined');

-- ── Accepted: messaging opens for both parties ──────────────────────────────
select pg_temp.act(current_setting('b5b.cu3')::uuid);
select pg_temp.chk_allowed('messaging', 'client may message once ACCEPTED',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''thanks!'')',
         current_setting('b5b.c_acc'), current_setting('b5b.cu3')));
select pg_temp.chk_allowed('messaging', 'accepted conversations allow MORE than one message',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''one more thing'')',
         current_setting('b5b.c_acc'), current_setting('b5b.cu3')));
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_allowed('messaging', 'provider may reply once ACCEPTED',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''see you then'')',
         current_setting('b5b.c_acc'), current_setting('b5b.pu')));

-- ── One live request per client/provider pair ───────────────────────────────
-- Two simultaneous pending requests for the same pair must not both land. Enforced
-- by a UNIQUE index in the DB, so a race between two clients of the same user
-- cannot slip through the way an application-level check would.
select pg_temp.act(current_setting('b5b.cu2')::uuid);
select pg_temp.chk_blocked('messaging', 'a duplicate pending request for the same pair is rejected',
  format('insert into public.conversation(client_id, provider_id, request_status, request_opened_at)
          values (%L, %L, ''pending'', now())',
         current_setting('b5b.cu2'), current_setting('b5b.pid')),
  'duplicate key');

-- ── Participant authorization ───────────────────────────────────────────────
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk_blocked('messaging', 'an outsider cannot post into a conversation',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''intruding'')',
         current_setting('b5b.c_acc'), current_setting('b5b.ou')));
select pg_temp.chk_blocked('messaging', 'an outsider cannot impersonate the client as sender',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''spoofed'')',
         current_setting('b5b.c_acc'), current_setting('b5b.cu3')));
select pg_temp.chk('messaging', 'an outsider cannot READ the conversation', '0',
  (select count(*)::text from public.conversation
     where id = current_setting('b5b.c_acc')::uuid));
select pg_temp.chk('messaging', 'an outsider cannot READ its messages', '0',
  (select count(*)::text from public.messages
     where conversation_id = current_setting('b5b.c_acc')::uuid));

-- ── Conversation CREATION cannot be used to buy an open channel ─────────────
-- The message gate keys off request_status and booking_id, so the escalation path is
-- creating a conversation that is already open rather than sending into a closed one.
-- Untested, these are the assertions that would stay green if the INSERT clamp or the
-- booking-pair check were dropped (SEC-COVERAGE-001).
select pg_temp.act(current_setting('b5b.ou')::uuid);

-- A fabricated booking_id belonging to ANOTHER pair must not buy an open channel.
-- b_elig belongs to (cu, provider); this caller is `ou`. Run first, while `ou` still
-- has no conversation with this provider, so the unique-pair index cannot reject it
-- for an unrelated reason -- and require the trigger's own message so a rejection by
-- RLS or the index cannot masquerade as the booking-pair check.
select pg_temp.chk_blocked('messaging', 'a booking_id from another pair is rejected',
  format('insert into public.conversation(client_id, provider_id, booking_id)
          values (%L, %L, %L)', current_setting('b5b.ou'), current_setting('b5b.pid'),
          current_setting('b5b.b_elig')),
  'does not belong');

do $$
declare v_status text; v_opened timestamptz;
begin
  -- A client-supplied 'accepted' must be clamped to 'pending' and stamped server-side.
  insert into public.conversation(client_id, provider_id, request_status)
  values (current_setting('b5b.ou')::uuid, current_setting('b5b.pid')::uuid, 'accepted')
  returning request_status, request_opened_at into v_status, v_opened;
  perform pg_temp.chk('messaging', 'client-supplied request_status is clamped to pending',
                      'pending', v_status);
  perform pg_temp.chk('messaging', 'request_opened_at is server-stamped on create', 'true',
                      (v_opened is not null and v_opened > now() - interval '1 minute')::text);
end $$;

-- The complementary branch: request_status OMITTED entirely (not merely a non-pending
-- value) must still be forced to 'pending' and stamped. Without this, a client could
-- craft a conversation with both booking_id and request_status null -- a "legacy/open"
-- row that the message gate lets through unconditionally, i.e. an ungated channel to
-- any provider. cu5 has no conversation with this provider, so the unique-pair index
-- cannot mask the trigger (SEC-COVERAGE-004).
select pg_temp.act(current_setting('b5b.cu5')::uuid);
do $$
declare v_status text; v_opened timestamptz;
begin
  insert into public.conversation(client_id, provider_id)
  values (current_setting('b5b.cu5')::uuid, current_setting('b5b.pid')::uuid)
  returning request_status, request_opened_at into v_status, v_opened;
  perform pg_temp.chk('messaging',
    'omitted request_status is forced to pending and stamped',
    'pending/true',
    coalesce(v_status, '(null)') || '/' || (v_opened is not null)::text);
end $$;

-- ── Accept / decline is the PROVIDER's decision alone ───────────────────────
select pg_temp.act(current_setting('b5b.cu2')::uuid);
select pg_temp.chk_blocked('messaging', 'a client cannot accept their own request',
  format('update public.conversation set request_status = ''accepted'' where id = %L',
         current_setting('b5b.c_pend')),
  'only the provider');
select pg_temp.chk_blocked('messaging', 'a client cannot decline their own request',
  format('update public.conversation set request_status = ''declined'' where id = %L',
         current_setting('b5b.c_pend')),
  'only the provider');
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_allowed('messaging', 'the PROVIDER can accept the request',
  format('update public.conversation set request_status = ''accepted'' where id = %L',
         current_setting('b5b.c_pend')));

-- ── Positive read: participants CAN see their own conversation ──────────────
select pg_temp.act(current_setting('b5b.cu3')::uuid);
select pg_temp.chk('messaging', 'a participant CAN read their own conversation', '1',
  (select count(*)::text from public.conversation
     where id = current_setting('b5b.c_acc')::uuid));

-- ── DDL invariant the whole request gate depends on ─────────────────────────
-- booking_id must have NO default: the reconstructed baseline gave it
-- gen_random_uuid(), which would make every pre-booking request look booking-linked
-- and therefore ungated. Dropped by 20260901000000; asserted here so a schema
-- regression cannot silently reopen the gate.
select pg_temp.chk('messaging', 'conversation.booking_id has no DEFAULT', 'true',
  (select (pg_get_expr(d.adbin, d.adrelid) is null)::text
     from pg_attribute a
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'public.conversation'::regclass and a.attname = 'booking_id'));

-- ── created_at is server-stamped (it is the pending-cycle boundary) ─────────
-- A client who could back-date created_at would keep the pending message count at
-- zero and defeat the one-message rule, so the trigger overwrites it.
select pg_temp.act(current_setting('b5b.cu3')::uuid);
do $$
declare v_created timestamptz;
begin
  insert into public.messages(conversation_id, sender_id, content, created_at)
  values (current_setting('b5b.c_acc')::uuid, current_setting('b5b.cu3')::uuid,
          'backdate attempt', now() - interval '10 years')
  returning created_at into v_created;
  perform pg_temp.chk('messaging', 'client-supplied created_at is overwritten by server time',
                      'true', (v_created > now() - interval '1 minute')::text);
end $$;

-- ── A booking-linked conversation is always open ────────────────────────────
select pg_temp.act_service();
do $$
declare cb uuid;
begin
  insert into public.conversation(client_id, provider_id, booking_id, request_status)
  values (current_setting('b5b.cu')::uuid, current_setting('b5b.pid')::uuid,
          current_setting('b5b.b_rep')::uuid, 'pending')
  returning id into cb;
  perform set_config('b5b.c_booking', cb::text, true);
end $$;
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk_allowed('messaging', 'a booking-linked conversation bypasses the pending gate',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''about our booking'')',
         current_setting('b5b.c_booking'), current_setting('b5b.cu')));
select pg_temp.chk_allowed('messaging', 'and permits more than one message',
  format('insert into public.messages(conversation_id, sender_id, content)
          values (%L, %L, ''running late'')',
         current_setting('b5b.c_booking'), current_setting('b5b.cu')));

-- Attach-once: a validated booking_id cannot later be pointed at a different booking,
-- which would move an open channel onto an unrelated pair.
select pg_temp.chk_blocked('messaging', 'a validated booking_id cannot be reassigned',
  format('update public.conversation set booking_id = %L where id = %L',
         current_setting('b5b.b_elig'), current_setting('b5b.c_booking')),
  'reassigned');

-- ════════════════════════════════════════════════════════════════════════════
-- Slice 2B — canonical provider<->provider conversation identity
-- ════════════════════════════════════════════════════════════════════════════
-- `client_id` is a USER id and `provider_id` is a PROVIDERS row id, so two providers can be
-- written either way round and conversation_unique_pair cannot tell the two rows apart. These
-- assertions pin that one pair resolves to exactly one conversation, that the invariant is
-- enforced by the database rather than by client discipline, and that ordinary
-- client<->provider messaging is untouched by it.

-- ── 1 & 3. Both orientations resolve to ONE conversation, idempotently ───────
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; c_ab uuid; c_ba uuid; c_again uuid; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2B A', 's2b_a_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2B B', 's2b_b_'||substr(bu::text,1,8)) returning id into bpid;

  perform pg_temp.act(au);
  select public.resolve_conversation(au, bpid) into c_ab;   -- A -> B
  perform pg_temp.chk('messaging', 'A->B resolves to a conversation',
    'true', (c_ab is not null)::text);

  perform pg_temp.act(bu);
  select public.resolve_conversation(bu, apid) into c_ba;   -- B -> A, opposite orientation
  perform pg_temp.chk('messaging', 'B->A resolves to the SAME conversation as A->B',
    c_ab::text, c_ba::text);

  -- Idempotence: repeating either direction returns the same row and creates nothing.
  perform pg_temp.act(au);
  select public.resolve_conversation(au, bpid) into c_again;
  perform pg_temp.chk('messaging', 'repeated resolve is idempotent', c_ab::text, c_again::text);

  perform pg_temp.act_service();
  select count(*) into v_n from public.conversation
   where (client_id = au and provider_id = bpid) or (client_id = bu and provider_id = apid);
  perform pg_temp.chk('messaging', 'exactly ONE conversation exists for the pair',
    '1', v_n::text);
end $$;

-- ── 2 & 4. The DATABASE refuses the second row, whoever asks ────────────────
-- Requirement 2 is a concurrency property. A single-transaction harness cannot run two real
-- sessions, so this asserts the INVARIANT that makes concurrency safe rather than staging a
-- race: the second insert for a pair is rejected by a unique index, not by client discipline.
-- Two racing sessions therefore cannot both succeed -- one commits and the other gets 23505,
-- which is exactly what resolve_conversation catches and recovers from.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; c1 uuid; v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2B Dup A', 's2bd_a_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2B Dup B', 's2bd_b_'||substr(bu::text,1,8)) returning id into bpid;

  perform pg_temp.act(au);
  select public.resolve_conversation(au, bpid) into c1;

  -- B now tries to create the REVERSE orientation DIRECTLY, bypassing the RPC entirely.
  perform pg_temp.act(bu);
  begin
    insert into public.conversation(client_id, provider_id, created_at)
    values (bu, apid, now());
    v_code := 'NO ERROR';
  exception when unique_violation then v_code := '23505';
             when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('messaging',
    'a direct reverse-orientation insert is REFUSED by the database', '23505', v_code);

  perform pg_temp.act_service();
  select count(*) into v_n from public.conversation
   where (client_id = au and provider_id = bpid) or (client_id = bu and provider_id = apid);
  perform pg_temp.chk('messaging', 'the bypass attempt left exactly one conversation',
    '1', v_n::text);
end $$;

-- ── The pair key is SERVER-OWNED ────────────────────────────────────────────
-- A supplied value must be discarded, or a caller could null the key and slip past the index.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; c1 uuid; v_key text; v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'S2B Key A', 's2bk_a_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'S2B Key B', 's2bk_b_'||substr(bu::text,1,8)) returning id into bpid;

  perform pg_temp.act(au);
  -- Supply a deliberately wrong key on insert.
  insert into public.conversation(client_id, provider_id, provider_pair_key, created_at)
  values (au, bpid, 'forged-key', now()) returning id, provider_pair_key into c1, v_key;
  perform pg_temp.chk('messaging', 'a supplied pair key is DISCARDED on insert',
    least(apid,bpid)::text||':'||greatest(apid,bpid)::text, v_key);

  -- And nulling it by update must not free the pair from the index.
  update public.conversation set provider_pair_key = null where id = c1;
  select provider_pair_key into v_key from public.conversation where id = c1;
  perform pg_temp.chk('messaging', 'the pair key is RECOMPUTED on update, not nullable',
    least(apid,bpid)::text||':'||greatest(apid,bpid)::text, v_key);

  -- So the reverse orientation is still refused after the attempt.
  perform pg_temp.act(bu);
  begin
    insert into public.conversation(client_id, provider_id, created_at) values (bu, apid, now());
    v_code := 'NO ERROR';
  exception when unique_violation then v_code := '23505';
             when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('messaging',
    'nulling the key does not free the pair from the invariant', '23505', v_code);
end $$;

-- ── 5. Ordinary client <-> provider messaging is UNCHANGED ──────────────────
-- A non-provider client's conversation has a NULL key, so it is not in the partial index and
-- is governed exactly as before by conversation_unique_pair. Two different clients must still
-- each get their own thread with the same provider.
do $$
declare
  c1u uuid := gen_random_uuid(); c2u uuid := gen_random_uuid(); pu uuid := gen_random_uuid();
  ppid uuid; k1 uuid; k2 uuid; v_key text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (c1u), (c2u), (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'S2B Plain P', 's2bp_'||substr(pu::text,1,8)) returning id into ppid;

  perform pg_temp.act(c1u);
  select public.resolve_conversation(c1u, ppid) into k1;
  perform pg_temp.act(c2u);
  select public.resolve_conversation(c2u, ppid) into k2;

  perform pg_temp.chk('messaging', 'two ordinary clients get DIFFERENT threads with a provider',
    'true', (k1 is distinct from k2)::text);

  perform pg_temp.act_service();
  select provider_pair_key into v_key from public.conversation where id = k1;
  perform pg_temp.chk('messaging', 'an ordinary client<->provider thread has a NULL pair key',
    'true', (v_key is null)::text);

  select count(*) into v_n from public.conversation where provider_id = ppid;
  perform pg_temp.chk('messaging', 'both client threads exist (index does not constrain them)',
    '2', v_n::text);
end $$;

-- ── The key is a CACHED derivation — it must not go stale ───────────────────
-- The highest-value case in this file. `conversation_pair_key` resolves client_id -> providers
-- at the moment the CONVERSATION is written, so a conversation written while that user was
-- still an ordinary client carries a NULL key. When they later go live as a provider -- an
-- approved, mainstream path -- the pair was left with no key reserving it. Both halves of the
-- resulting defect are asserted here: the invariant was defeatable (a second thread could be
-- created), and resolve_conversation returned NULL, which blanks every Message button.
-- NOTE THE ORDERING: the conversation is created BEFORE the second providers row. Every other
-- case in this file creates providers first, which is the only ordering in which the naive
-- implementation is correct.
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid();
  ppid uuid; cpid uuid; c_old uuid; r1 uuid; r2 uuid; v_n integer; v_key text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'Stale P', 'stale_p_'||substr(pu::text,1,8)) returning id into ppid;

  -- C is an ORDINARY CLIENT here, so a NULL key is CORRECT at this point.
  insert into public.conversation(client_id, provider_id, created_at)
    values (cu, ppid, now()) returning id into c_old;
  select provider_pair_key into v_key from public.conversation where id = c_old;
  perform pg_temp.chk('messaging', 'a client<->provider conversation starts with a NULL key',
    'true', (v_key is null)::text);

  -- C GOES LIVE AS A PROVIDER. The pair is now a provider pair, and the key must catch up.
  insert into public.providers(user_id, display_name, username)
    values (cu, 'Stale C', 'stale_c_'||substr(cu::text,1,8)) returning id into cpid;
  select provider_pair_key into v_key from public.conversation where id = c_old;
  perform pg_temp.chk('messaging',
    'the key is RE-DERIVED when the client becomes a provider (not left stale)',
    least(cpid,ppid)::text||':'||greatest(cpid,ppid)::text, coalesce(v_key,'NULL'));

  -- It must resolve, in both orientations, to the pre-existing row -- never NULL.
  perform pg_temp.act(cu);
  select public.resolve_conversation(cu, ppid) into r1;
  perform pg_temp.chk('messaging', 'the pre-existing thread still resolves (same orientation)',
    c_old::text, coalesce(r1::text,'NULL'));

  perform pg_temp.act(pu);
  select public.resolve_conversation(pu, cpid) into r2;
  perform pg_temp.chk('messaging', 'the pre-existing thread resolves in the REVERSE orientation',
    c_old::text, coalesce(r2::text,'NULL'));

  perform pg_temp.act_service();
  select count(*) into v_n from public.conversation
   where (client_id = cu and provider_id = ppid) or (client_id = pu and provider_id = cpid);
  perform pg_temp.chk('messaging', 'no second thread was created for the pair', '1', v_n::text);
end $$;

-- ── A booking attaches to the pair's canonical thread, either direction ─────
-- The canonical row's orientation is fixed by uuid order, so it need not match the direction a
-- booking was made in. Checking only the literal orientation meant the attach was refused and
-- the Message button died silently.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
  apid uuid; bpid uuid; xpid uuid; c1 uuid; bk uuid; bk_other uuid; v_res uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu), (xu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'Attach A', 'atta_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'Attach B', 'attb_'||substr(bu::text,1,8)) returning id into bpid;
  insert into public.providers(user_id, display_name, username)
    values (xu, 'Attach X', 'attx_'||substr(xu::text,1,8)) returning id into xpid;

  -- Canonical thread in orientation (A client, B provider), no booking yet.
  insert into public.conversation(client_id, provider_id, created_at)
    values (au, bpid, now()) returning id into c1;
  -- B books A -- the OPPOSITE direction to the thread's orientation.
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (bu, apid, 'Attach svc', current_date, 'accepted') returning id into bk;
  -- And a booking belonging to a DIFFERENT pair, which must still be refused.
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (xu, apid, 'Other svc', current_date, 'accepted') returning id into bk_other;

  perform pg_temp.act(bu);
  select public.resolve_conversation(bu, apid, bk) into v_res;
  perform pg_temp.chk('messaging', 'a booking resolves to the pair''s canonical thread',
    c1::text, coalesce(v_res::text,'NULL'));

  begin
    update public.conversation set booking_id = bk, request_status = 'accepted' where id = c1;
    v_code := 'ATTACHED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('messaging',
    'a reverse-direction booking ATTACHES to the canonical thread', 'ATTACHED', v_code);

  -- The widening must be exactly two orientations, not "any booking involving either person".
  perform pg_temp.act_service();
  update public.conversation set booking_id = null where id = c1;
  perform pg_temp.act(bu);
  begin
    update public.conversation set booking_id = bk_other where id = c1;
    v_code := 'ATTACHED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('messaging',
    'a booking belonging to a DIFFERENT pair is still refused', 'REFUSED', v_code);
end $$;

-- ── resolve_conversation grants nothing: cross-user negative authorization ──
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid(); tu uuid := gen_random_uuid();
  ppid uuid; v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu), (tu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'Authz P', 'authz_p_'||substr(pu::text,1,8)) returning id into ppid;
  select count(*) into v_n from public.conversation;

  -- T is a stranger to this pair and owns neither side.
  perform pg_temp.act(tu);
  begin
    perform public.resolve_conversation(cu, ppid);
    v_code := 'CREATED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('messaging',
    'a stranger cannot create a conversation between two other people', 'REFUSED', v_code);

  perform pg_temp.act_service();
  perform pg_temp.chk('messaging', 'the refused call created nothing',
    v_n::text, (select count(*)::text from public.conversation));
end $$;

-- ── The invariant is actually indexed, with the shape intended ─────────────
-- `create unique index if not exists` silently succeeds if an index of that NAME already
-- exists with a DIFFERENT definition, which would leave the key maintained and nothing
-- enforcing it. Assert the shape rather than the name.
do $$
declare v_def text;
begin
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'conversation_one_per_provider_pair';
  perform pg_temp.chk('messaging', 'the pair index is UNIQUE',
    'true', (v_def like 'CREATE UNIQUE INDEX%')::text);
  perform pg_temp.chk('messaging', 'the pair index is on provider_pair_key',
    'true', (v_def like '%(provider_pair_key)%')::text);
  perform pg_temp.chk('messaging', 'the pair index is PARTIAL (client threads unconstrained)',
    'true', (v_def like '%WHERE (provider_pair_key IS NOT NULL)%')::text);
end $$;

-- ── find_conversation is canonical too ──────────────────────────────────────
-- The lookup that decides "open the thread" vs "compose a new request". If it misses a thread
-- stored in the other orientation, the user is sent to compose and the send is then refused by
-- the pair index -- a dead end with a database error in it.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid(); cu uuid := gen_random_uuid();
  apid uuid; bpid uuid; ppid uuid; c1 uuid; v_found uuid; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu), (cu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'Find A', 'find_a_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'Find B', 'find_b_'||substr(bu::text,1,8)) returning id into bpid;
  insert into public.providers(user_id, display_name, username)
    values (cu, 'Find P', 'find_p_'||substr(cu::text,1,8)) returning id into ppid;

  perform pg_temp.act(au);
  select public.resolve_conversation(au, bpid) into c1;

  -- B looks for their thread with A from the OTHER side.
  perform pg_temp.act(bu);
  select f.id into v_found from public.find_conversation(bu, apid) f;
  perform pg_temp.chk('messaging',
    'find_conversation finds the pair''s thread from the reverse orientation',
    c1::text, coalesce(v_found::text,'NULL'));

  -- And it must not invent one where none exists, nor create anything. Both counts are taken
  -- as service_role: an authenticated count is RLS-filtered and would not be comparable.
  perform pg_temp.act_service();
  select count(*) into v_n from public.conversation;
  perform pg_temp.act(au);
  select f.id into v_found from public.find_conversation(au, ppid) f;
  perform pg_temp.chk('messaging', 'find_conversation returns nothing for a pair with no thread',
    'NULL', coalesce(v_found::text,'NULL'));
  perform pg_temp.act_service();
  perform pg_temp.chk('messaging', 'find_conversation creates nothing',
    v_n::text, (select count(*)::text from public.conversation));
end $$;

-- ── The booking widening is EXACTLY two orientations, nothing wider ─────────
-- The attach predicate accepts a booking made in either direction between the same two
-- people. These are the negatives: a booking that involves ONE of them and a third provider
-- must still be refused, and so must a conversation whose provider slot references no
-- providers row at all (there is no FK on conversation.provider_id).
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
  apid uuid; bpid uuid; xpid uuid; c1 uuid; bk_third uuid; c_ghost uuid; bk_a uuid;
  v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu), (xu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'Arm A', 'arm_a_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'Arm B', 'arm_b_'||substr(bu::text,1,8)) returning id into bpid;
  insert into public.providers(user_id, display_name, username)
    values (xu, 'Arm X', 'arm_x_'||substr(xu::text,1,8)) returning id into xpid;

  insert into public.conversation(client_id, provider_id, created_at)
    values (au, bpid, now()) returning id into c1;

  -- B (the counterparty on this thread) books a THIRD provider. Half of arm 2 is satisfied
  -- -- b.user_id is the owner of this row's provider slot -- but the other half is not.
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (bu, xpid, 'Third svc', current_date, 'accepted') returning id into bk_third;

  perform pg_temp.act(bu);
  begin
    update public.conversation set booking_id = bk_third where id = c1;
    v_code := 'ATTACHED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('messaging',
    'a booking with a THIRD provider is refused (arm 2 needs BOTH halves)',
    'REFUSED', v_code);

  -- A conversation whose provider slot points at no providers row must not attach anything.
  perform pg_temp.act_service();
  insert into public.conversation(client_id, provider_id, created_at)
    values (au, gen_random_uuid(), now()) returning id into c_ghost;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (au, bpid, 'Ghost svc', current_date, 'accepted') returning id into bk_a;
  perform pg_temp.act(au);
  begin
    update public.conversation set booking_id = bk_a where id = c_ghost;
    v_code := 'ATTACHED';
  exception when others then v_code := 'REFUSED';
  end;
  perform pg_temp.chk('messaging',
    'a conversation with a dangling provider slot attaches nothing', 'REFUSED', v_code);
end $$;

-- ── The new functions are not reachable by anon ─────────────────────────────
do $$
begin
  perform pg_temp.chk('messaging', 'anon cannot execute resolve_conversation',
    'false', has_function_privilege('anon',
      'public.resolve_conversation(uuid,uuid,uuid)', 'execute')::text);
  perform pg_temp.chk('messaging', 'anon cannot execute find_conversation',
    'false', has_function_privilege('anon',
      'public.find_conversation(uuid,uuid)', 'execute')::text);
  perform pg_temp.chk('messaging', 'authenticated CAN execute resolve_conversation',
    'true', has_function_privilege('authenticated',
      'public.resolve_conversation(uuid,uuid,uuid)', 'execute')::text);
  perform pg_temp.chk('messaging', 'anon cannot execute the pair-key trigger function',
    'false', has_function_privilege('anon',
      'public.conversation_pair_key()', 'execute')::text);
end $$;

-- ── A providers reassignment leaves no stale key behind ────────────────────
-- service_role-only today, so this is a correctness guard rather than a boundary. Re-keying
-- only the NEW owner would leave the OLD owner's conversations carrying a key derived from a
-- providers row they no longer own, which can later refuse the new owner's legitimate write.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); xu uuid := gen_random_uuid();
  pid uuid; xpid uuid; c1 uuid; v_key text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (u1), (u2), (xu);
  insert into public.providers(user_id, display_name, username)
    values (xu, 'Reassign X', 'rx_'||substr(xu::text,1,8)) returning id into xpid;
  insert into public.providers(user_id, display_name, username)
    values (u1, 'Reassign P', 'rp_'||substr(u1::text,1,8)) returning id into pid;

  -- U1 (a provider) holds a conversation in the client slot, so it carries a real key.
  insert into public.conversation(client_id, provider_id, created_at)
    values (u1, xpid, now()) returning id into c1;
  select provider_pair_key into v_key from public.conversation where id = c1;
  perform pg_temp.chk('messaging', 'the reassignment fixture starts with a derived key',
    least(pid,xpid)::text||':'||greatest(pid,xpid)::text, coalesce(v_key,'NULL'));

  -- Reassign the providers row to U2. U1 now owns no provider.
  update public.providers set user_id = u2 where id = pid;
  select provider_pair_key into v_key from public.conversation where id = c1;
  perform pg_temp.chk('messaging',
    'the OLD owner''s conversation key is re-derived, not left stale',
    'NULL', coalesce(v_key,'NULL'));
end $$;

-- ── Message authorship is pinned, and a platform notice is markable read ────
-- The old policy's `sender_id = sender_id` was a TAUTOLOGY over the NEW row (a policy cannot
-- reference OLD), so it pinned nothing — and it was NULL for a null sender, which made a
-- platform notice permanently unreadable-as-read. Both halves are asserted here.
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid();
  ppid uuid; c uuid; m_user uuid; m_sys uuid; v_code text; v_read boolean; v_sender uuid;
  v_content text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'Pin P', 'pinp_'||substr(pu::text,1,8)) returning id into ppid;
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (cu, ppid, 'accepted', now()) returning id into c;
  insert into public.messages(conversation_id, sender_id, content, is_read, created_at)
    values (c, pu, 'from the provider', false, now()) returning id into m_user;
  insert into public.messages(conversation_id, sender_id, content, is_read, created_at)
    values (c, null, 'This trade negotiation was ended by the post owner.', false, now())
    returning id into m_sys;

  -- A participant CANNOT rewrite the text of a message.
  perform pg_temp.act(cu);
  begin
    update public.messages set content = 'rewritten' where id = m_user;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'a participant cannot rewrite a message''s content',
    'true', (position('Only the read state' in v_code) > 0)::text);

  -- A participant CANNOT re-attribute authorship — including claiming a platform notice.
  begin
    update public.messages set sender_id = cu where id = m_sys;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'a participant cannot claim a platform notice as their own',
    'true', (position('Only the read state' in v_code) > 0)::text);

  begin
    update public.messages set sender_id = cu where id = m_user;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'a participant cannot re-attribute another''s message',
    'true', (position('Only the read state' in v_code) > 0)::text);

  -- But a participant CAN mark a platform notice read. This is what was impossible before:
  -- the null sender made the policy's WITH CHECK evaluate to NULL, which is not TRUE.
  update public.messages set is_read = true where id = m_sys;
  perform pg_temp.act_service();
  select is_read, sender_id, content into v_read, v_sender, v_content
    from public.messages where id = m_sys;
  perform pg_temp.chk('messaging', 'a platform notice CAN be marked read', 'true', v_read::text);
  perform pg_temp.chk('messaging', 'marking read left the author untouched',
    'true', (v_sender is null)::text);
  perform pg_temp.chk('messaging', 'marking read left the text untouched',
    'This trade negotiation was ended by the post owner.', v_content);

  -- And an ordinary message is still markable read.
  perform pg_temp.act(cu);
  update public.messages set is_read = true where id = m_user;
  perform pg_temp.act_service();
  select count(*) into v_n from public.messages where conversation_id = c and is_read;
  perform pg_temp.chk('messaging', 'both messages are now read', '2', v_n::text);
end $$;

-- ── A request-gated thread cannot veto a release ───────────────────────────
-- The signal must never take the release down with it. Reachable for a pre-Slice-2 accepted
-- interest whose pair already held a pre-booking request.
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; c uuid; v_reason text; v_status text; v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Gate Owner', 'gto_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Gate Resp', 'gtr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'Gate O', 'Gate S') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;
  -- A DECLINED pre-booking thread for the same pair: no message may be written into it.
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (ru, opid, 'declined', now()) returning id into c;

  perform pg_temp.act(ru);
  select public.release_barter_interest(i) into v_reason;
  perform pg_temp.chk('messaging', 'a request-gated thread does not block the release',
    'responder_withdrew', v_reason);

  perform pg_temp.act_service();
  select status into v_status from public.barter_interests where id = i;
  perform pg_temp.chk('messaging', 'the release actually persisted', 'released', v_status);
  select count(*) into v_n from public.messages where conversation_id = c;
  perform pg_temp.chk('messaging', 'no notice was written into the gated thread', '0', v_n::text);
end $$;

-- ── A participant cannot DESTROY a platform notice either ──────────────────
-- The authorship trigger closes rewriting. Deletion is a different verb, and the review asked
-- whether it is open. It is not: RLS is enabled on `messages` and there is NO delete policy, so
-- a participant's DELETE matches zero rows -- it does NOT raise. Asserted as zero-rows, which
-- is the only correct way to assert an RLS-filtered write.
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid();
  ppid uuid; c uuid; m_sys uuid; v_n integer; v_left integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'Del P', 'delp_'||substr(pu::text,1,8)) returning id into ppid;
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (cu, ppid, 'accepted', now()) returning id into c;
  insert into public.messages(conversation_id, sender_id, content, is_read, created_at)
    values (c, null, 'This trade negotiation was ended by the post owner.', false, now())
    returning id into m_sys;

  perform pg_temp.act(cu);
  delete from public.messages where id = m_sys;
  get diagnostics v_n = row_count;
  perform pg_temp.chk('messaging',
    'a participant cannot delete a platform notice (RLS filters, zero rows)', '0', v_n::text);

  perform pg_temp.act(pu);
  delete from public.messages where id = m_sys;
  get diagnostics v_n = row_count;
  perform pg_temp.chk('messaging',
    'the other participant cannot delete it either', '0', v_n::text);

  perform pg_temp.act_service();
  select count(*) into v_left from public.messages where id = m_sys;
  perform pg_temp.chk('messaging', 'the notice survives both delete attempts', '1', v_left::text);
end $$;

-- ── The pin holds on every column and every write route ────────────────────
-- Three of the five pinned columns had no test, the UPDATE policy's USING scope was untested
-- against a non-participant, and the UPSERT route -- the one the old tautological policy did
-- NOT block, because ON CONFLICT DO UPDATE reaches the UPDATE path -- was untested entirely.
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid(); ou uuid := gen_random_uuid();
  ppid uuid; opid uuid; c uuid; c2 uuid; m uuid; v_code text; v_n integer; v_content text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu), (ou);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'Pin2 P', 'pin2p_'||substr(pu::text,1,8)) returning id into ppid;
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Pin2 O', 'pin2o_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (cu, ppid, 'accepted', now()) returning id into c;
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (cu, opid, 'accepted', now()) returning id into c2;
  insert into public.messages(conversation_id, sender_id, content, is_read, created_at)
    values (c, pu, 'original', false, now()) returning id into m;

  perform pg_temp.act(cu);

  -- conversation_id: previously a participant could MOVE a message between two threads they
  -- belong to, because the old WITH CHECK only required the NEW thread be one of theirs.
  begin
    update public.messages set conversation_id = c2 where id = m;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'a message cannot be moved to another thread',
    'true', (position('Only the read state' in v_code) > 0)::text);

  -- created_at is the enforcement boundary for the one-pending-message rule, so backdating it
  -- would be a replay route.
  begin
    update public.messages set created_at = now() - interval '10 days' where id = m;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'a message cannot be backdated',
    'true', (position('Only the read state' in v_code) > 0)::text);

  begin
    update public.messages set id = gen_random_uuid() where id = m;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'a message id cannot be reassigned',
    'true', (position('Only the read state' in v_code) > 0)::text);

  -- THE UPSERT ROUTE. `on conflict do update` reaches the UPDATE path, which the old
  -- tautological policy never blocked. This is the strongest single proof the pin moved to a
  -- layer that actually holds.
  -- NOTE the sender_id: it must be the CALLER's, or the INSERT policy's
  -- `sender_id = auth.uid()` refuses first and the assertion would pass without ever reaching
  -- the trigger -- proving the wrong mechanism. With the caller as sender, the INSERT check
  -- passes, the conflict routes to DO UPDATE, and the trigger is the thing that must refuse.
  begin
    insert into public.messages(id, conversation_id, sender_id, content, is_read, created_at)
    values (m, c, cu, 'rewritten via upsert', false, now())
    on conflict (id) do update set content = excluded.content;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'the UPSERT route cannot rewrite a message (trigger refuses)',
    'true', (position('Only the read state' in v_code) > 0)::text);

  perform pg_temp.act_service();
  select content into v_content from public.messages where id = m;
  perform pg_temp.chk('messaging', 'the message text survived every attempt',
    'original', v_content);

  -- A NON-PARTICIPANT is filtered by the policy's USING clause: zero rows, no exception.
  perform pg_temp.act(ou);
  update public.messages set is_read = true where id = m;
  get diagnostics v_n = row_count;
  perform pg_temp.chk('messaging',
    'a non-participant''s mark-read affects zero rows (RLS filters)', '0', v_n::text);
end $$;

-- ── The pin's own posture ──────────────────────────────────────────────────
do $$
begin
  perform pg_temp.chk('messaging', 'enforce_message_immutability is DEFINER, empty search_path',
    'true', (select (p.prosecdef and p.proconfig @> array['search_path=""'])::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'enforce_message_immutability' and n.nspname = 'public'));
  perform pg_temp.chk('messaging', 'enforce_message_immutability is owned by postgres',
    'postgres', (select pg_get_userbyid(p.proowner) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'enforce_message_immutability' and n.nspname = 'public'));
  perform pg_temp.chk('messaging', 'anon cannot execute enforce_message_immutability',
    'false', has_function_privilege('anon',
      'public.enforce_message_immutability()', 'execute')::text);
  -- The allow-list must stay an allow-list: a future column is immutable by default only if
  -- the set difference names exactly one exclusion.
  perform pg_temp.chk('messaging', 'the pin is an ALLOW-list over is_read only',
    'true', (select (position('to_jsonb(new) - ''is_read''' in prosrc) > 0)::text
       from pg_proc where proname = 'enforce_message_immutability'));
end $$;

-- ── The pair-key READER matches what the WRITER actually wrote ─────────────
-- provider_pair_key() is a named reader, not the single source of truth: the trigger
-- conversation_pair_key() still carries the literal format, as do resolve_conversation() and
-- find_conversation(). This is the assertion that makes a drift between them LOUD. Without it,
-- a format change would silently break the release lookup: it would miss, fall through, and the
-- counterparty would simply never be told, with no error anywhere.
do $$
declare
  au uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  apid uuid; bpid uuid; c uuid; v_written text; v_read text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu);
  insert into public.providers(user_id, display_name, username)
    values (au, 'Key A', 'keya_'||substr(au::text,1,8)) returning id into apid;
  insert into public.providers(user_id, display_name, username)
    values (bu, 'Key B', 'keyb_'||substr(bu::text,1,8)) returning id into bpid;

  -- The TRIGGER writes the key here.
  insert into public.conversation(client_id, provider_id, created_at)
    values (au, bpid, now()) returning id into c;
  select provider_pair_key into v_written from public.conversation where id = c;

  -- The READER computes it independently.
  v_read := public.provider_pair_key(apid, bpid);

  perform pg_temp.chk('messaging',
    'provider_pair_key() equals what conversation_pair_key() WROTE', v_written, v_read);

  -- And it is orientation-free, which is the property the whole canonical-pair design rests on.
  perform pg_temp.chk('messaging', 'the reader is orientation-free',
    public.provider_pair_key(apid, bpid), public.provider_pair_key(bpid, apid));
end $$;

-- ── Owner-authored text cannot pose as platform speech ─────────────────────
-- The release notice is written with sender_id IS NULL and rendered centred and unattributed,
-- so anything inside it reads as OUR words. Both offer columns are 200 chars of free text and
-- stay owner-mutable by design, so an unbounded, unterminated append handed one participant
-- ~400 characters of platform voice aimed at the other.
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; c uuid; v_copy text; v_recipient uuid;
  v_evil text := 'x' || chr(10) || 'THE BOOK SUPPORT: verify your account at evil.example';
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Inj Owner', 'injo_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Inj Resp', 'injr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'Photography', v_evil) returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'pending') returning id into i;

  perform pg_temp.act(ou);
  select public.accept_barter_interest(i) into c;
  perform public.release_barter_interest(i);

  perform pg_temp.act_service();
  select content into v_copy from public.messages
   where conversation_id = c and sender_id is null order by created_at desc limit 1;

  perform pg_temp.chk('messaging', 'the notice strips control characters from offer text',
    'true', (position(chr(10) in v_copy) = 0)::text);
  perform pg_temp.chk('messaging', 'the owner-authored terms are QUOTED, so the boundary shows',
    'true', (position('"' in v_copy) > 0)::text);
  perform pg_temp.chk('messaging',
    'the platform''s own words CLOSE the sentence, leaving no trailing position to occupy',
    'true', (v_copy like '%No trade was agreed.')::text);
  -- The cap bounds LENGTH, which is the real guarantee: owner text cannot dominate the notice
  -- or run past the platform's closing words. Asserting a phrase's ABSENCE would be a weaker
  -- test pretending to be a stronger one -- a 40-char cap cannot remove a phrase that starts
  -- inside it, and writing the assertion that way would have claimed a property we do not have.
  perform pg_temp.chk('messaging', 'the notice stays bounded regardless of offer length',
    'true', (length(v_copy) < 160)::text);
  perform pg_temp.chk('messaging', 'and the evil string is NOT delivered whole',
    'true', (position('evil.example' in v_copy) = 0)::text);
end $$;

-- ── system_recipient_id is server-set, as the comment now truthfully claims ─
do $$
declare
  cu uuid := gen_random_uuid(); pu uuid := gen_random_uuid();
  ppid uuid; c uuid; m uuid; v_rec uuid; v_code text;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (pu);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'Addr P', 'addrp_'||substr(pu::text,1,8)) returning id into ppid;
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (cu, ppid, 'accepted', now()) returning id into c;

  -- A participant supplies an addressing value on an ordinary message. Before the clamp this
  -- silenced the counterparty's badge and notification: a silent-delivery channel.
  perform pg_temp.act(cu);
  insert into public.messages(conversation_id, sender_id, content, is_read, system_recipient_id)
  values (c, cu, 'ordinary message', false, cu) returning id into m;

  perform pg_temp.act_service();
  select system_recipient_id into v_rec from public.messages where id = m;
  perform pg_temp.chk('messaging', 'a client-supplied recipient is DISCARDED on insert',
    'true', (v_rec is null)::text);

  -- And it stays immutable on update, via the message allow-list.
  perform pg_temp.act(cu);
  begin
    update public.messages set system_recipient_id = cu where id = m;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlerrm;
  end;
  perform pg_temp.chk('messaging', 'and it cannot be set by a later update',
    'true', (position('Only the read state' in v_code) > 0)::text);
end $$;

-- ── The view resolves a conversation whose cached key is stale ─────────────
do $$
declare
  ou uuid := gen_random_uuid(); ru uuid := gen_random_uuid();
  opid uuid; rpid uuid; o uuid; i uuid; c uuid; v_conv uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (ou), (ru);
  insert into public.providers(user_id, display_name, username)
    values (ou, 'Stale O', 'stlo_'||substr(ou::text,1,8)) returning id into opid;
  insert into public.providers(user_id, display_name, username)
    values (ru, 'Stale R', 'stlr_'||substr(ru::text,1,8)) returning id into rpid;
  insert into public.barter_offers(provider_id, user_id, offering_service, seeking_service)
    values (opid, ou, 'S O', 'S S') returning id into o;
  insert into public.barter_interests(offer_id, interested_provider_id, interested_user_id,
    message, status) values (o, rpid, ru, 'x', 'accepted') returning id into i;
  -- A thread in the literal orientation whose cached key never got derived. The trigger
  -- recomputes on write, so it is forced null directly to model the stale row.
  insert into public.conversation(client_id, provider_id, request_status, created_at)
    values (ru, opid, 'accepted', now()) returning id into c;
  update public.conversation set provider_pair_key = null where id = c;

  perform pg_temp.act(ru);
  select conversation_id into v_conv from public.my_trade_activity where interest_id = i;
  perform pg_temp.chk('messaging',
    'the view falls back to the literal orientation, like every other resolver',
    c::text, coalesce(v_conv::text,'NULL'));
end $$;
