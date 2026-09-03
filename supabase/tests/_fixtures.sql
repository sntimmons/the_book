-- B5B harness — the standard cast, created once and shared by every suite.
--
-- Seeded as service_role so terminal booking states persist exactly as written
-- (enforce_booking_write_integrity rewrites non-service_role INSERTs to
-- status='pending', completed_at=null). Ids are stashed in transaction-local GUCs
-- so suites can reference them by name.
--
-- Every row is created inside the runner's transaction and disappears on ROLLBACK.

do $$
declare
  cu uuid := gen_random_uuid();   -- client (reviews + the booking-linked conversation)
  pu uuid := gen_random_uuid();   -- provider (auth user)
  ou uuid := gen_random_uuid();   -- outsider: neither party
  -- conversation has a UNIQUE (client_id, provider_id) index, so each request state
  -- needs its own client rather than three conversations for one pair.
  cu2 uuid := gen_random_uuid();  -- pending request
  cu3 uuid := gen_random_uuid();  -- accepted request
  cu4 uuid := gen_random_uuid();  -- declined request
  -- No conversation is seeded for cu5: it is reserved for the create-path assertion
  -- that inserts one itself, so conversation_unique_pair cannot pre-empt the trigger.
  cu5 uuid := gen_random_uuid();  -- fresh client, no conversation with this provider
  pid uuid;                        -- providers.id
  b_elig uuid; b_sub uuid; b_win uuid; b_ur uuid; b_ns uuid; b_pend uuid; b_rep uuid;
  c_pend uuid; c_acc uuid; c_dec uuid;
begin
  perform pg_temp.act_service();

  insert into auth.users(id) values (cu), (pu), (ou), (cu2), (cu3), (cu4), (cu5);
  insert into public.providers(user_id, display_name, username)
    values (pu, 'B5B Provider', 'b5b_'||substr(pu::text,1,8)) returning id into pid;

  -- Bookings, one per review state we need to prove.
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status, completed_at, under_review)
    values (cu, pid, 'svc', current_date, 'completed', now() - interval '1 day', false) returning id into b_elig;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status, completed_at, under_review)
    values (cu, pid, 'svc', current_date, 'completed', now() - interval '1 day', false) returning id into b_sub;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status, completed_at, under_review)
    values (cu, pid, 'svc', current_date, 'completed', now() - interval '8 days', false) returning id into b_win;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status, completed_at, under_review)
    values (cu, pid, 'svc', current_date, 'completed', now() - interval '1 day', true) returning id into b_ur;
  -- A GENUINE no_show: never completed, so completed_at is null.
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status, completed_at, no_show_flag)
    values (cu, pid, 'svc', current_date, 'no_show', null, true) returning id into b_ns;
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
    values (cu, pid, 'svc', current_date, 'pending') returning id into b_pend;
  -- Repeat booking: same client + provider pair, independently reviewable.
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status, completed_at, under_review)
    values (cu, pid, 'svc', current_date, 'completed', now() - interval '1 day', false) returning id into b_rep;

  -- b_sub already has the CLIENT's review, so it reads already_submitted for the
  -- client while staying eligible for the provider (blindness).
  insert into public.provider_reviews(booking_id, provider_id, reviewer_user_id, rating)
    values (b_sub, pid, cu, 5);

  -- Pre-booking conversations, one per request state.
  insert into public.conversation(client_id, provider_id, request_status, request_opened_at)
    values (cu2, pid, 'pending', now() - interval '1 hour') returning id into c_pend;
  insert into public.conversation(client_id, provider_id, request_status, request_opened_at)
    values (cu3, pid, 'accepted', now() - interval '1 hour') returning id into c_acc;
  insert into public.conversation(client_id, provider_id, request_status, request_opened_at)
    values (cu4, pid, 'declined', now() - interval '1 hour') returning id into c_dec;

  perform set_config('b5b.cu', cu::text, true);
  perform set_config('b5b.cu2', cu2::text, true);
  perform set_config('b5b.cu3', cu3::text, true);
  perform set_config('b5b.cu4', cu4::text, true);
  perform set_config('b5b.cu5', cu5::text, true);
  perform set_config('b5b.pu', pu::text, true);
  perform set_config('b5b.ou', ou::text, true);
  perform set_config('b5b.pid', pid::text, true);
  perform set_config('b5b.b_elig', b_elig::text, true);
  perform set_config('b5b.b_sub',  b_sub::text,  true);
  perform set_config('b5b.b_win',  b_win::text,  true);
  perform set_config('b5b.b_ur',   b_ur::text,   true);
  perform set_config('b5b.b_ns',   b_ns::text,   true);
  perform set_config('b5b.b_pend', b_pend::text, true);
  perform set_config('b5b.b_rep',  b_rep::text,  true);
  perform set_config('b5b.c_pend', c_pend::text, true);
  perform set_config('b5b.c_acc',  c_acc::text,  true);
  perform set_config('b5b.c_dec',  c_dec::text,  true);

  -- Leave the session UNAUTHENTICATED (and back on the owner role, so the sanity
  -- checks below can read). A suite that forgets to call pg_temp.act() then fails
  -- closed rather than silently inheriting service_role.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);
end $$;

-- Fixture sanity. If the seed is silently rewritten (e.g. the write-integrity
-- trigger runs), these fail LOUDLY instead of every downstream case passing
-- vacuously against the wrong state.
select pg_temp.chk('fixtures', 'eligible booking is completed with completed_at set',
  'completed/true',
  (select status||'/'||(completed_at is not null)::text from public.bookings
     where id = current_setting('b5b.b_elig')::uuid));
select pg_temp.chk('fixtures', 'no_show booking never completed (completed_at is null)',
  'no_show/true',
  (select status||'/'||(completed_at is null)::text from public.bookings
     where id = current_setting('b5b.b_ns')::uuid));
select pg_temp.chk('fixtures', 'session is unauthenticated after seeding',
  'true', (auth.uid() is null)::text);

-- Harness integrity. If act() ever stops assuming the `authenticated` role, RLS is
-- silently bypassed and every policy assertion in every suite passes vacuously.
-- These two checks make that failure loud instead of invisible.
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk('fixtures', 'act() assumes the authenticated role, so RLS is enforced',
  'authenticated', current_user::text);
select pg_temp.chk('fixtures', 'row-level security is active for the test role', 'true',
  (select (not rolbypassrls) from pg_roles where rolname = current_user)::text);
select pg_temp.act_service();
select pg_temp.chk('fixtures', 'act_service() returns to the owner role for seeding',
  'true', (current_user <> 'authenticated')::text);
-- Back to unauthenticated for the suites.
select set_config('request.jwt.claims', '', true);
select set_config('role', 'none', true);
