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
