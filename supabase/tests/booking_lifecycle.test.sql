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
-- The search screen's "Available today" chip filtered nothing at all. It is now a
-- PostgREST computed column over the provider's own published hours.

select pg_temp.chk('bookinglifecycle', 'available_today is callable by anon and authenticated', 'true',
  (has_function_privilege('anon','public.available_today(public.providers)','EXECUTE')
   and has_function_privilege('authenticated','public.available_today(public.providers)','EXECUTE'))::text);

select pg_temp.act_service();
delete from public.provider_availability where provider_id = current_setting('b5b.pid')::uuid;
delete from public.provider_blocked_dates where provider_id = current_setting('b5b.pid')::uuid;

select pg_temp.chk('bookinglifecycle', 'no published hours today -> not available', 'false',
  (select public.available_today(p.*)::text from public.providers p
    where p.id = current_setting('b5b.pid')::uuid));

select pg_temp.act_service();
insert into public.provider_availability(provider_id, weekday, start_time, end_time, is_available, timezone)
values (current_setting('b5b.pid')::uuid,
        extract(dow from (now() at time zone 'America/Chicago'))::int,
        '09:00', '17:00', true, 'America/Chicago');

select pg_temp.chk('bookinglifecycle', 'published hours today -> available', 'true',
  (select public.available_today(p.*)::text from public.providers p
    where p.id = current_setting('b5b.pid')::uuid));

-- A blocked date wins over published hours: the provider said they are away.
select pg_temp.act_service();
insert into public.provider_blocked_dates(provider_id, date)
values (current_setting('b5b.pid')::uuid, (now() at time zone 'America/Chicago')::date);

select pg_temp.chk('bookinglifecycle', 'a blocked date overrides published hours', 'false',
  (select public.available_today(p.*)::text from public.providers p
    where p.id = current_setting('b5b.pid')::uuid));

-- Hours marked unavailable are not availability either.
select pg_temp.act_service();
delete from public.provider_blocked_dates where provider_id = current_setting('b5b.pid')::uuid;
update public.provider_availability set is_available = false
 where provider_id = current_setting('b5b.pid')::uuid;

select pg_temp.chk('bookinglifecycle', 'hours switched off are not availability', 'false',
  (select public.available_today(p.*)::text from public.providers p
    where p.id = current_setting('b5b.pid')::uuid));
