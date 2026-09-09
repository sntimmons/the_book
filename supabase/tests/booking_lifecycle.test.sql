-- B5B suite: Correction 3 — the booking request lifecycle.
--
-- Items B (72-hour server-authoritative expiry), J (the booking exists before the
-- contract), K (one intent = one request) and H (a de-approved provider takes no
-- NEW bookings while keeping every existing one).

-- ── 1. THE DRAFT IS INVISIBLE TO THE PROVIDER ─────────────────────────────
--
-- The whole reason the row can be created early. Without this, every abandoned
-- half-finished booking flow would appear in the provider's request queue.

select pg_temp.act(current_setting('b5b.cu5')::uuid);
select pg_temp.chk_allowed('bookinglifecycle', 'a client can open a draft request',
  format('insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
          values (%L, %L, ''draft svc'', current_date, ''pending'')',
         current_setting('b5b.cu5'), current_setting('b5b.pid')));

select pg_temp.chk('bookinglifecycle', 'the draft has no submitted_at and no deadline', 'true',
  (select (submitted_at is null and expires_at is null)::text
     from public.bookings
    where user_id = current_setting('b5b.cu5')::uuid and service_name = 'draft svc'));

-- The provider cannot see it. This is the assertion the whole design rests on.
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk('bookinglifecycle', 'the provider cannot see an unsubmitted draft', '0',
  (select count(*)::text from public.bookings where service_name = 'draft svc'));

-- The client can, which is what makes resuming possible.
select pg_temp.act(current_setting('b5b.cu5')::uuid);
select pg_temp.chk('bookinglifecycle', 'the client CAN see their own draft', '1',
  (select count(*)::text from public.bookings where service_name = 'draft svc'));

-- ── 2. ONE INTENT = ONE REQUEST (item K) ──────────────────────────────────
--
-- A second draft for the same pair is refused by a partial unique index, so a
-- dropped network or a re-entered flow cannot mint a parallel request. The client
-- finds its existing draft and resumes it.

select pg_temp.chk_blocked('bookinglifecycle', 'a second draft for the same pair is refused',
  format('insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
          values (%L, %L, ''second draft'', current_date, ''pending'')',
         current_setting('b5b.cu5'), current_setting('b5b.pid')),
  'bookings_one_draft_per_pair');

-- A draft is editable — that is what "resume the same row" means in practice.
select pg_temp.chk_allowed('bookinglifecycle', 'the client can revise their own draft',
  format('update public.bookings set service_name = ''draft svc revised'',
                 requested_time = ''2:00 PM'' where user_id = %L and submitted_at is null',
         current_setting('b5b.cu5')));

-- ── 3. SUBMIT: SERVER-STAMPED, ONCE, CLIENT ONLY ──────────────────────────

select pg_temp.chk_blocked('bookinglifecycle', 'a client cannot set their own deadline',
  format('update public.bookings set expires_at = now() + interval ''30 days''
           where user_id = %L and submitted_at is null', current_setting('b5b.cu5')),
  'not user-editable');

-- The submit act. The value the client sends is irrelevant: the trigger stamps
-- server time and computes the deadline from it.
select pg_temp.chk_allowed('bookinglifecycle', 'the client submits their request',
  format('update public.bookings set submitted_at = ''2000-01-01''::timestamptz
           where user_id = %L and submitted_at is null', current_setting('b5b.cu5')));

select pg_temp.chk('bookinglifecycle', 'submitted_at is server time, not the value sent', 'true',
  (select (submitted_at > now() - interval '5 minutes')::text
     from public.bookings where user_id = current_setting('b5b.cu5')::uuid
       and service_name = 'draft svc revised'));

-- THE 72-HOUR RULE. `appointment_time` is null on this row, so the deadline is
-- exactly submitted_at + 72h.
select pg_temp.chk('bookinglifecycle', 'the deadline is 72 hours after submission', 'true',
  (select (expires_at = submitted_at + interval '72 hours')::text
     from public.bookings where user_id = current_setting('b5b.cu5')::uuid
       and service_name = 'draft svc revised'));

select pg_temp.chk_blocked('bookinglifecycle', 'a request cannot be re-submitted',
  format('update public.bookings set submitted_at = now()
           where user_id = %L and service_name = ''draft svc revised''',
         current_setting('b5b.cu5')),
  'may not be re-submitted');

-- Frozen after submission: the provider answers the request they were shown.
select pg_temp.chk_blocked('bookinglifecycle', 'a submitted request may not be edited',
  format('update public.bookings set requested_time = ''9:00 AM''
           where user_id = %L and service_name = ''draft svc revised''',
         current_setting('b5b.cu5')),
  'may not be edited');

-- And now the provider CAN see it.
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk('bookinglifecycle', 'the provider sees the request once submitted', '1',
  (select count(*)::text from public.bookings where service_name = 'draft svc revised'));

-- ── 4. THE APPOINTMENT CLAMP ──────────────────────────────────────────────
--
-- A request for a slot sooner than 72 hours away cannot sit answerable past the
-- service time. One `least()`, no scheduling system.

select pg_temp.act_service();
do $$
declare v_b uuid;
begin
  insert into public.bookings(user_id, provider_id, service_name, requested_date,
                              status, appointment_time)
  values (current_setting('b5b.cu2')::uuid, current_setting('b5b.pid')::uuid,
          'soon svc', current_date, 'pending', now() + interval '6 hours')
  returning id into v_b;
  perform set_config('b5b.b_soon', v_b::text, true);
end $$;

select pg_temp.act(current_setting('b5b.cu2')::uuid);
select pg_temp.chk_allowed('bookinglifecycle', 'a soon-appointment request submits',
  format('update public.bookings set submitted_at = now() where id = %L',
         current_setting('b5b.b_soon')));
select pg_temp.chk('bookinglifecycle', 'its deadline clamps to the appointment, not 72h', 'true',
  (select (expires_at = appointment_time and expires_at < submitted_at + interval '72 hours')::text
     from public.bookings where id = current_setting('b5b.b_soon')::uuid));

-- ── 5. EXPIRY IS A REAL BOUNDARY, NOT A LABEL ─────────────────────────────
--
-- Nothing flips the row when the deadline passes — the state is derived per read.
-- What the deadline actually does is stop the provider ACCEPTING.

select pg_temp.act_service();
update public.bookings
   set submitted_at = now() - interval '80 hours',
       expires_at = now() - interval '8 hours'
 where id = current_setting('b5b.b_soon')::uuid;

select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_blocked('bookinglifecycle', 'a provider cannot accept an expired request',
  format('update public.bookings set status = ''accepted'' where id = %L',
         current_setting('b5b.b_soon')),
  'expired');

-- Declining stays available: closing out a stale request is not a thing to stop.
select pg_temp.chk_allowed('bookinglifecycle', 'a provider CAN still decline an expired request',
  format('update public.bookings set status = ''cancelled_by_provider'',
                 cancellation_actor = ''provider'', cancelled_at = now() where id = %L',
         current_setting('b5b.b_soon')));

-- The row is still there. Expired requests are not deleted and not hidden.
select pg_temp.chk('bookinglifecycle', 'the expired request survives in history', '1',
  (select count(*)::text from public.bookings where id = current_setting('b5b.b_soon')::uuid));

-- ── 6. THE DERIVED URGENCY STATE ──────────────────────────────────────────
--
-- 24h nudge, 48h stronger, then expired. Read per query, moved by nothing.
-- It is NOT a notification: no push, device or email channel exists.

select pg_temp.chk('bookinglifecycle', 'urgency: fresh request is none', 'none',
  public.booking_request_urgency(now() - interval '1 hour', now() + interval '71 hours', now()));
select pg_temp.chk('bookinglifecycle', 'urgency: 24 hours in is nudge', 'nudge',
  public.booking_request_urgency(now() - interval '25 hours', now() + interval '47 hours', now()));
select pg_temp.chk('bookinglifecycle', 'urgency: 48 hours in is urgent', 'urgent',
  public.booking_request_urgency(now() - interval '49 hours', now() + interval '23 hours', now()));
select pg_temp.chk('bookinglifecycle', 'urgency: past the deadline is expired', 'expired',
  public.booking_request_urgency(now() - interval '80 hours', now() - interval '8 hours', now()));
select pg_temp.chk('bookinglifecycle', 'urgency: an unsubmitted draft is draft', 'draft',
  public.booking_request_urgency(null, null, now()));
-- The boundary is inclusive at 24h, the same discipline as the PD-057 window.
select pg_temp.chk('bookinglifecycle', 'urgency: exactly 24 hours is already nudge', 'nudge',
  public.booking_request_urgency(now() - interval '24 hours', now() + interval '48 hours', now()));

-- ── 7. A DE-APPROVED PROVIDER (item H) ────────────────────────────────────
--
-- New activity stops; history does not. The distinction is the whole item.

select pg_temp.act_service();
update public.providers set is_approved = false where id = current_setting('b5b.pid')::uuid;

select pg_temp.act(current_setting('b5b.cu3')::uuid);
select pg_temp.chk_blocked('bookinglifecycle', 'no NEW booking with an unapproved provider',
  format('insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
          values (%L, %L, ''blocked svc'', current_date, ''pending'')',
         current_setting('b5b.cu3'), current_setting('b5b.pid')),
  'not currently available');

-- EXISTING history survives and stays readable by both sides. This is the half
-- that must not be sacrificed to the half above.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk('bookinglifecycle', 'the client still reads their existing bookings', 'true',
  (select (count(*) > 0)::text from public.bookings
    where provider_id = current_setting('b5b.pid')::uuid));
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk('bookinglifecycle', 'the provider still reads their existing bookings', 'true',
  (select (count(*) > 0)::text from public.bookings
    where provider_id = current_setting('b5b.pid')::uuid));
-- And can still complete work already in flight.
select pg_temp.chk_allowed('bookinglifecycle', 'an unapproved provider can still finish existing work',
  format('update public.bookings set status = ''accepted'' where id = %L',
         current_setting('b5b.b_pend')));

select pg_temp.act_service();
update public.providers set is_approved = true where id = current_setting('b5b.pid')::uuid;

-- ── 8. THE RULES 20261041000000 RESTORED ──────────────────────────────────
--
-- `20261037000000` rebuilt this trigger from the wrong live body and silently
-- dropped two guards. B5B caught it. Pinned here as well as in reviews.test.sql,
-- because the next redefinition of this function will be reading THIS suite.

select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_blocked('bookinglifecycle', 'completed_at is still immutable once set',
  format('update public.bookings set status = ''completed'', completed_at = now() - interval ''30 days''
           where id = %L', current_setting('b5b.b_elig')),
  'immutable');
select pg_temp.chk_blocked('bookinglifecycle', 'a completed booking still cannot be marked no_show',
  format('update public.bookings set status = ''no_show'', no_show_flag = true where id = %L',
         current_setting('b5b.b_elig')),
  'cannot be marked no_show');

-- ── 9. AVAILABILITY IS A REAL FILTER (item M) ─────────────────────────────
--
-- The search screen's "Available today" chip filtered nothing at all. It is now
-- `providers_open_today()`, over the provider's own published hours.
--
-- REWRITTEN after review. This section first tested a PostgREST computed column,
-- `available_today(providers)` — and passed, while the feature was completely
-- broken for every real caller, because every assertion ran as `service_role`.
-- See § 12, which runs the same question as the roles that actually call it.

-- `pg_temp.open_today` — is this provider in the set right now?
create or replace function pg_temp.open_today(p_pid uuid)
returns boolean language sql as $$
  select exists (select 1 from public.providers_open_today() t where t = p_pid)
$$;

select pg_temp.act_service();
delete from public.provider_availability where provider_id = current_setting('b5b.pid')::uuid;
delete from public.provider_blocked_dates where provider_id = current_setting('b5b.pid')::uuid;

select pg_temp.chk('bookinglifecycle', 'no published hours today -> not open today', 'false',
  pg_temp.open_today(current_setting('b5b.pid')::uuid)::text);

select pg_temp.act_service();
insert into public.provider_availability(provider_id, weekday, start_time, end_time, is_available, timezone)
values (current_setting('b5b.pid')::uuid,
        extract(dow from (now() at time zone 'America/Chicago'))::int,
        '09:00', '17:00', true, 'America/Chicago');

select pg_temp.chk('bookinglifecycle', 'published hours today -> open today', 'true',
  pg_temp.open_today(current_setting('b5b.pid')::uuid)::text);

-- A blocked date wins over published hours: the provider said they are away.
select pg_temp.act_service();
insert into public.provider_blocked_dates(provider_id, date)
values (current_setting('b5b.pid')::uuid, (now() at time zone 'America/Chicago')::date);

select pg_temp.chk('bookinglifecycle', 'a blocked date overrides published hours', 'false',
  pg_temp.open_today(current_setting('b5b.pid')::uuid)::text);

-- Hours marked unavailable are not availability either.
select pg_temp.act_service();
delete from public.provider_blocked_dates where provider_id = current_setting('b5b.pid')::uuid;
update public.provider_availability set is_available = false
 where provider_id = current_setting('b5b.pid')::uuid;

select pg_temp.chk('bookinglifecycle', 'hours switched off are not availability', 'false',
  pg_temp.open_today(current_setting('b5b.pid')::uuid)::text);

-- Restored so § 12's role-scoped checks run against a provider who IS open.
select pg_temp.act_service();
update public.provider_availability set is_available = true
 where provider_id = current_setting('b5b.pid')::uuid;

-- ══ § 10. WHAT A DRAFT IS NOT ════════════════════════════════════════════
--
-- Added after review. Every object `20261037000000` changed was tested in
-- isolation and passed; what nothing asked was **what the new kind of row meant
-- to boundaries that were not changed**. Three of them tested only "a booking
-- exists for this pair", written when that could only mean a request the provider
-- had been shown — and a draft satisfied all three.
--
-- These assertions are the question that was missing: when a migration widens
-- what an existing row type can MEAN, what else tests for its existence?

do $$
declare
  cu uuid := current_setting('b5b.cu5')::uuid;
  pid uuid := current_setting('b5b.pid')::uuid;
  pu uuid := current_setting('b5b.pu')::uuid;
  v_draft uuid; v_conv uuid; v_code text; v_n integer;
begin
  -- A live draft: exactly what a client holds after reaching the contract step.
  perform pg_temp.act(cu);
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pid, 'draft not a relationship', current_date)
  returning id into v_draft;
  perform pg_temp.act_service();
  perform pg_temp.chk('bookinglifecycle', 'the fixture really is a draft', 'true',
    (select (submitted_at is null)::text from public.bookings where id = v_draft));

  -- 1. IT MAY NOT BUY AN UNGATED CONVERSATION. This is the authorization bypass:
  -- a draft is unthrottled (the rate limit is checked at SUBMIT), so without this
  -- an ordinary account could open a chat with any approved provider and skip the
  -- message-request gate entirely.
  perform pg_temp.act(cu);
  begin
    insert into public.conversation(client_id, provider_id, booking_id)
    values (cu, pid, v_draft);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookinglifecycle',
    'a DRAFT cannot be used to open a conversation', '23514', v_code);
end $$;

do $$
declare
  cu uuid := current_setting('b5b.cu5')::uuid;
  pid uuid := current_setting('b5b.pid')::uuid;
  v_draft uuid; v_real uuid; v_conv uuid; v_code text; v_status text;
begin
  perform pg_temp.act_service();
  select id into v_draft from public.bookings
   where user_id = cu and provider_id = pid and submitted_at is null limit 1;
  -- One conversation per pair is a hard constraint, and the fixtures may already
  -- have seeded one for this pair; start from a known state.
  delete from public.conversation where client_id = cu and provider_id = pid;

  -- 2. IT MAY NOT REVERSE A PROVIDER'S DECLINE. The supersede branch opens a
  -- conversation whenever a booking is attached, so a draft would have let the
  -- declined party reopen a thread the provider had closed.
  insert into public.conversation(client_id, provider_id, request_status, request_opened_at)
  values (cu, pid, 'declined', now() - interval '1 day')
  returning id into v_conv;

  perform pg_temp.act(cu);
  begin
    update public.conversation
       set booking_id = v_draft, request_status = 'accepted'
     where id = v_conv;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookinglifecycle',
    'a DRAFT cannot reopen a declined conversation', '23514', v_code);
  perform pg_temp.act_service();
  select request_status into v_status from public.conversation where id = v_conv;
  perform pg_temp.chk('bookinglifecycle', 'and the decline still stands',
    'declined', v_status);

  -- THE COMPLEMENT, so this is a rule about drafts and not a blanket refusal that
  -- would have broken the booking-supersedes-request behaviour PD-013 depends on.
  -- A SUBMITTED booking must still open the same thread.
  perform pg_temp.act(cu);
  update public.bookings set submitted_at = now() where id = v_draft;
  begin
    update public.conversation
       set booking_id = v_draft, request_status = 'accepted'
     where id = v_conv;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookinglifecycle',
    'a SUBMITTED booking still supersedes a declined request', 'OK', v_code);
  perform pg_temp.act_service();
  delete from public.conversation where id = v_conv;
end $$;

do $$
declare
  cu uuid := current_setting('b5b.cu4')::uuid;
  pid uuid := current_setting('b5b.pid')::uuid;
  pu uuid := current_setting('b5b.pu')::uuid;
  v_draft uuid; v_n integer;
begin
  -- 3. IT DOES NOT DISCLOSE THE CLIENT'S IDENTITY. Reaching the contract step and
  -- backing out is not a relationship the client chose to create with anyone.
  perform pg_temp.act_service();
  delete from public.conversation where client_id = cu and provider_id = pid;
  delete from public.bookings where user_id = cu and provider_id = pid;
  -- `clients_provider` reads from `public.clients`, which the shared fixtures do
  -- not seed. Without this row BOTH assertions below return 0 and the pair passes
  -- vacuously — which is exactly what the first draft of this test did.
  insert into public.clients(id, name, neighborhood)
  values (cu, 'B5B Draft Client', 'Midtown')
  on conflict (id) do nothing;
  perform pg_temp.act(cu);
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pid, 'invisible', current_date) returning id into v_draft;

  perform pg_temp.act(pu);
  select count(*) into v_n from public.clients_provider where id = cu;
  perform pg_temp.chk('bookinglifecycle',
    'a draft alone does not expose the client to the provider', '0', v_n::text);

  -- Submitting it IS the act that creates the relationship.
  perform pg_temp.act(cu);
  update public.bookings set submitted_at = now() where id = v_draft;
  perform pg_temp.act(pu);
  select count(*) into v_n from public.clients_provider where id = cu;
  perform pg_temp.chk('bookinglifecycle',
    'submitting it does expose them, as it always has', '1', v_n::text);
  perform pg_temp.act_service();
end $$;

-- ══ § 11. A CANCELLED DRAFT MUST NOT LOCK THE CLIENT OUT ═════════════════
--
-- The worst defect review found. `bookings_one_draft_per_pair` had no status
-- term, so a cancelled draft kept the single slot forever while the client's own
-- UPDATE policy no longer admitted it. Every later attempt found that row, wrote
-- to it, was FILTERED to zero rows with no error, and reported success — a
-- "BOOKING REQUEST SENT" screen for a request that did not exist, permanently,
-- for that provider.
do $$
declare
  cu uuid := current_setting('b5b.cu3')::uuid;
  pid uuid := current_setting('b5b.pid')::uuid;
  v_first uuid; v_second uuid; v_code text; v_n integer;
begin
  perform pg_temp.act_service();
  delete from public.bookings where user_id = cu and provider_id = pid;

  perform pg_temp.act(cu);
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pid, 'abandoned', current_date) returning id into v_first;
  update public.bookings
     set status = 'cancelled_by_client', cancellation_actor = 'client'
   where id = v_first;

  -- THE SLOT IS FREE AGAIN. Without the narrowed index this insert raises 23505
  -- and the client can never start another request with this provider.
  begin
    insert into public.bookings(user_id, provider_id, service_name, requested_date)
    values (cu, pid, 'second attempt', current_date) returning id into v_second;
    v_code := 'OK';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookinglifecycle',
    'a cancelled draft frees the one-draft slot', 'OK', v_code);

  -- And the new one is fully usable: editable, then submittable. This is the pair
  -- of writes that silently affected zero rows before.
  update public.bookings set service_name = 'revised' where id = v_second;
  perform pg_temp.act_service();
  perform pg_temp.chk('bookinglifecycle', 'the replacement draft is editable',
    'revised', (select service_name from public.bookings where id = v_second));
  perform pg_temp.act(cu);
  update public.bookings set submitted_at = now() where id = v_second;
  perform pg_temp.act_service();
  perform pg_temp.chk('bookinglifecycle', 'and it can actually be submitted', 'true',
    (select (submitted_at is not null)::text from public.bookings where id = v_second));

  -- STILL ONE LIVE DRAFT AT A TIME. The narrowing must not have removed the rule.
  perform pg_temp.act(cu);
  insert into public.bookings(user_id, provider_id, service_name, requested_date)
  values (cu, pid, 'live draft', current_date);
  begin
    insert into public.bookings(user_id, provider_id, service_name, requested_date)
    values (cu, pid, 'second live draft', current_date);
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('bookinglifecycle',
    'but two LIVE drafts for one pair are still refused', '23505', v_code);
  perform pg_temp.act_service();
end $$;

-- ══ § 12. "OPEN TODAY" MUST BE REACHABLE BY THE ROLES THAT NEED IT ═══════
--
-- The assertion that was missing, and its absence is why a broken discovery feed
-- passed review: `available_today` was a PostgREST COMPUTED COLUMN, which renders
-- as a WHOLE-ROW reference, and Correction 2 left anon/authenticated with 28
-- NAMED column grants. Every behavioural check ran as `service_role` — the one
-- role that holds table-level SELECT — so the suite could not see it.
--
-- These run as the roles that actually call it.
select pg_temp.chk('bookinglifecycle', 'the whole-row computed column is gone', '0',
  (select count(*)::text from pg_proc
    where proname = 'available_today' and pronamespace = 'public'::regnamespace));
-- Captured under each role and RECORDED afterwards: `_results` is granted to
-- `authenticated` and not to `anon`, so an assertion written while acting as anon
-- fails on the scratch table rather than on the thing being tested.
do $$
declare
  v_anon text; v_auth text; v_compose text;
begin
  perform pg_temp.act(null, 'anon');
  begin
    perform count(*) from public.providers_open_today();
    v_anon := 'OK';
  exception when others then v_anon := sqlstate;
  end;

  perform pg_temp.act(current_setting('b5b.cu')::uuid);
  begin
    perform count(*) from public.providers_open_today();
    v_auth := 'OK';
  exception when others then v_auth := sqlstate;
  end;

  -- The composition the search actually performs: filter `providers` by that id
  -- set. This is the shape that failed with 42501 when it was a computed column,
  -- because a whole-row reference needs SELECT on every column and these roles
  -- hold 28 named ones.
  begin
    perform id from public.providers
     where id = any(array(select public.providers_open_today())) limit 1;
    v_compose := 'OK';
  exception when others then v_compose := sqlstate;
  end;

  perform pg_temp.act_service();
  perform pg_temp.chk('bookinglifecycle', 'anon CAN evaluate open-today', 'OK', v_anon);
  perform pg_temp.chk('bookinglifecycle', 'and so can an authenticated client', 'OK', v_auth);
  perform pg_temp.chk('bookinglifecycle',
    'and it composes with a providers query under the column grant', 'OK', v_compose);
end $$;
