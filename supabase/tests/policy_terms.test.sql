-- B5B suite: the PUBLIC booking terms read.
--
-- `provider_booking_preferences` is owner-only and must stay that way: the same
-- row carries vacation_mode, max_bookings_per_day, buffer_minutes,
-- minimum_notice_hours, requires_manual_approval and timezone. A client is
-- entitled to two fields out of it — the cancellation window and the lateness
-- grace — because they are asked to agree to them.
--
-- The question here is not "can a client see the terms" but the one the defect
-- asked: **is what the client is shown actually this provider's, and is it ONLY
-- the two fields?**

do $$
declare
  cu uuid := gen_random_uuid();   -- a client
  ou uuid := gen_random_uuid();   -- an unrelated user
  pu uuid := gen_random_uuid();   -- the provider's owner
  qu uuid := gen_random_uuid();   -- a second provider's owner, no prefs row
  pid uuid; qid uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (cu), (ou), (pu), (qu);
  insert into public.providers(user_id, display_name, username, is_approved)
    values (pu, 'PT Provider', 'pt_'||substr(pu::text,1,8), true) returning id into pid;
  insert into public.providers(user_id, display_name, username, is_approved)
    values (qu, 'PT Silent', 'pts_'||substr(qu::text,1,8), true) returning id into qid;
  insert into public.clients(id, name) values (cu, 'PT Client'), (ou, 'PT Stranger')
    on conflict (id) do nothing;
  -- Deliberately NOT the column defaults (24 / 60), and not DEFAULT_POLICY's
  -- 24 / 15 either — so a substituted constant cannot pass as the real value.
  insert into public.provider_booking_preferences(
    provider_id, cancellation_window_hours, lateness_grace_minutes,
    vacation_mode, max_bookings_per_day, buffer_minutes)
    values (pid, 48, 7, true, 3, 45);
  perform set_config('b5b.pt_c', cu::text, true);
  perform set_config('b5b.pt_o', ou::text, true);
  perform set_config('b5b.pt_p', pu::text, true);
  perform set_config('b5b.pt_pid', pid::text, true);
  perform set_config('b5b.pt_qid', qid::text, true);
end $$;


-- ══ 0. IS THE MIGRATION EVEN HERE? ════════════════════════════════════════
--
-- The whole harness runs inside ONE transaction, so a missing function would
-- raise and abort every other suite's results with it. Every block below that
-- calls the function resolves its name at RUNTIME and skips when it is absent —
-- and this assertion is what stops that skipping from passing vacuously. If this
-- row fails, `20261137000000` has not been applied to this database yet.
select pg_temp.chk('policyterms', 'migration 20261137000000 is applied here', 'true',
  (to_regprocedure('public.provider_public_booking_terms(uuid)') is not null)::text);

-- ══ 1. THE TABLE ITSELF STAYS SHUT ════════════════════════════════════════
--
-- This is the property the RPC exists to preserve. If this ever passes with a
-- non-zero count, the narrow function has been made pointless by a widened
-- policy somewhere else.
do $$
begin
  perform pg_temp.act(current_setting('b5b.pt_c')::uuid);
  perform pg_temp.chk('policyterms', 'a client cannot read the preferences table', '0',
    (select count(*)::text from public.provider_booking_preferences
      where provider_id = current_setting('b5b.pt_pid')::uuid));
  perform pg_temp.act(current_setting('b5b.pt_o')::uuid);
  perform pg_temp.chk('policyterms', 'nor can an unrelated user', '0',
    (select count(*)::text from public.provider_booking_preferences
      where provider_id = current_setting('b5b.pt_pid')::uuid));
  perform pg_temp.act(current_setting('b5b.pt_p')::uuid);
  perform pg_temp.chk('policyterms', 'the owning provider still reads their own row', '1',
    (select count(*)::text from public.provider_booking_preferences
      where provider_id = current_setting('b5b.pt_pid')::uuid));
end $$;

-- ══ 2. THE CLIENT GETS THE REAL VALUES, NOT A DEFAULT ═════════════════════
do $$
declare v_c integer; v_g integer;
begin
  if to_regprocedure('public.provider_public_booking_terms(uuid)') is null then return; end if;
  perform pg_temp.act(current_setting('b5b.pt_c')::uuid);
  execute 'select cancellation_window_hours, lateness_grace_minutes'
       || ' from public.provider_public_booking_terms($1)'
    into v_c, v_g using current_setting('b5b.pt_pid')::uuid;
  perform pg_temp.chk('policyterms', 'a client reads the real cancellation window', '48', v_c::text);
  perform pg_temp.chk('policyterms', 'a client reads the real lateness grace', '7', v_g::text);
  -- The two constants the defect used to serve. Neither may come back.
  perform pg_temp.chk('policyterms', 'the window is not the platform default', 'false',
    (v_c = 24)::text);
  perform pg_temp.chk('policyterms', 'the grace is neither default (15 app / 60 column)', 'false',
    (v_g = 15 or v_g = 60)::text);
end $$;

-- ══ 3. NO ROW MEANS NO ROW — NOT A FILLED-IN DEFAULT ══════════════════════
do $$
declare v_silent integer; v_unknown integer;
begin
  if to_regprocedure('public.provider_public_booking_terms(uuid)') is null then return; end if;
  perform pg_temp.act(current_setting('b5b.pt_c')::uuid);
  execute 'select count(*) from public.provider_public_booking_terms($1)'
    into v_silent using current_setting('b5b.pt_qid')::uuid;
  perform pg_temp.chk('policyterms',
    'a provider who never set terms returns nothing, not a default', '0', v_silent::text);
  execute 'select count(*) from public.provider_public_booking_terms($1)'
    into v_unknown using gen_random_uuid();
  perform pg_temp.chk('policyterms', 'an unknown provider id returns nothing', '0', v_unknown::text);
end $$;

-- ══ 4. ONLY THE TWO FIELDS LEAVE ══════════════════════════════════════════
--
-- Asserted on the function's SIGNATURE, not on a sample row: a future edit that
-- adds `buffer_minutes` to the returns clause would still produce a passing row
-- test, and this is the assertion that would fail.
select pg_temp.chk('policyterms', 'the function returns exactly two columns', '2',
  array_length(string_to_array(pg_get_function_result(p.oid), ','), 1)::text)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'provider_public_booking_terms';

select pg_temp.chk('policyterms', 'and names only the window and the grace', 'true',
  (pg_get_function_result(p.oid) like '%cancellation_window_hours%'
   and pg_get_function_result(p.oid) like '%lateness_grace_minutes%'
   and pg_get_function_result(p.oid) not like '%vacation_mode%'
   and pg_get_function_result(p.oid) not like '%max_bookings_per_day%'
   and pg_get_function_result(p.oid) not like '%buffer_minutes%'
   and pg_get_function_result(p.oid) not like '%minimum_notice%'
   and pg_get_function_result(p.oid) not like '%timezone%'
   and pg_get_function_result(p.oid) not like '%requires_manual_approval%')::text)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'provider_public_booking_terms';

-- ══ 5. THE FUNCTION IS BUILT THE WAY A DEFINER MUST BE ════════════════════
select pg_temp.chk('policyterms', 'it is SECURITY DEFINER with a fixed search_path', 'true',
  (p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%')::text)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'provider_public_booking_terms';

select pg_temp.chk('policyterms', 'it is stable, so it can have no side effects', 's',
  p.provolatile::text)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'provider_public_booking_terms';

-- ══ 6. ANON MAY NOT CALL IT ═══════════════════════════════════════════════
select pg_temp.chk('policyterms', 'anon has no execute grant', 'false',
  has_function_privilege('anon', p.oid, 'execute')::text)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'provider_public_booking_terms';

select pg_temp.chk('policyterms', 'authenticated does', 'true',
  has_function_privilege('authenticated', p.oid, 'execute')::text)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'provider_public_booking_terms';

-- ══ 7. A DEPARTED PROVIDER'S TERMS STOP BEING SERVED ══════════════════════
--
-- Through `provider_content_hidden`, on the same clock as their services,
-- availability, blocked dates and policies — not a second erasure rule.
do $$
declare v_n integer;
begin
  if to_regprocedure('public.provider_public_booking_terms(uuid)') is null then return; end if;
  perform pg_temp.act_service();
  -- account_unavailable(null) is true, which is how the erasure engine leaves an
  -- emptied provider shell. The harness rolls this back with everything else.
  update public.providers set user_id = null
    where id = current_setting('b5b.pt_pid')::uuid;
  perform pg_temp.act(current_setting('b5b.pt_c')::uuid);
  execute 'select count(*) from public.provider_public_booking_terms($1)'
    into v_n using current_setting('b5b.pt_pid')::uuid;
  perform pg_temp.chk('policyterms',
    'terms are withheld once the provider is unavailable', '0', v_n::text);
end $$;
