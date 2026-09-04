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
