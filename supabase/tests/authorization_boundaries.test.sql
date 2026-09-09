-- B5B suite: Pre-Beta Correction 2 — provider column surface, contract ownership,
-- the prospective-client contract read, posts-media object ownership, and
-- least-privilege defaults.
--
-- Every defect pinned here was REPRODUCED against the non-production project
-- before it was fixed, not inferred from reading policies. These assertions exist
-- so it cannot come back quietly: four of the five were invisible to every
-- existing suite, and three of them looked correct in the application code.

-- ══ 1. PROVIDER PUBLIC SURFACE ═════════════════════════════════════════════
--
-- An anonymous caller holding only the public anon key read ALL 49 columns of
-- `providers`, including `verification_notes` ("Private admin moderation notes"),
-- `stripe_account_id`, `no_show_count` and `late_count`. RLS decides which ROWS a
-- caller may read and cannot hide a COLUMN, so the fix is a column grant.
--
-- `has_column_privilege` is the right instrument: it asks the privilege system
-- the same question PostgREST's query will ask, rather than trusting a policy to
-- have covered it.

select pg_temp.chk('authz', 'anon CAN read the public marketplace columns', 'true',
  (select bool_and(has_column_privilege('anon', 'public.providers', c, 'SELECT'))::text
     from unnest(array[
       'id','user_id','display_name','business_name','username','category_id',
       'custom_category','bio','location','neighborhood','profile_photo_url',
       'cover_image_url','rating','average_rating','review_count','total_bookings',
       'completed_count','repeat_client_rate','follower_count','next_available',
       'is_trending','is_featured','is_approved','is_demo','is_mobile',
       'years_experience','specialties','created_at']) as c));

-- The whole point of the slice. Listed one by one rather than as a set so a
-- failure names the column that came back.
select pg_temp.chk('authz', 'anon cannot read providers.verification_notes', 'false',
  has_column_privilege('anon', 'public.providers', 'verification_notes', 'SELECT')::text);
select pg_temp.chk('authz', 'anon cannot read providers.stripe_account_id', 'false',
  has_column_privilege('anon', 'public.providers', 'stripe_account_id', 'SELECT')::text);
select pg_temp.chk('authz', 'anon cannot read providers.no_show_count', 'false',
  has_column_privilege('anon', 'public.providers', 'no_show_count', 'SELECT')::text);
select pg_temp.chk('authz', 'anon cannot read providers.late_count', 'false',
  has_column_privilege('anon', 'public.providers', 'late_count', 'SELECT')::text);
select pg_temp.chk('authz', 'anon cannot read providers.business_verified', 'false',
  has_column_privilege('anon', 'public.providers', 'business_verified', 'SELECT')::text);

-- AUTHENTICATED IS HELD TO THE SAME LINE. A signed-in stranger is not a
-- privileged reader of another provider's moderation notes or payout config.
select pg_temp.chk('authz', 'authenticated cannot read the withheld columns either', 'false',
  (select bool_or(has_column_privilege('authenticated', 'public.providers', c, 'SELECT'))::text
     from unnest(array[
       'verification_notes','stripe_account_id','stripe_onboarding_complete',
       'stripe_charges_enabled','stripe_payouts_enabled','stripe_details_submitted',
       'stripe_account_updated_at','no_show_count','late_count','payment_mode',
       'deposit_type','deposit_value','issue_window_hours','verification_status',
       'identity_verified','business_verified','verification_submitted_at',
       'bookings_this_week','bookings_this_month','profile_style']) as c));

-- service_role remains the one reader, so operator tooling still has a path.
select pg_temp.chk('authz', 'service_role can still read the withheld columns', 'true',
  (select bool_and(has_column_privilege('service_role', 'public.providers', c, 'SELECT'))::text
     from unnest(array['verification_notes','stripe_account_id','no_show_count']) as c));

-- Security Batch 3a's write grants must survive the revoke-and-regrant in
-- `20261030000000` § 1. A narrowed write surface would break go-live silently.
select pg_temp.chk('authz', 'Batch 3a provider write grants survive', 'true',
  (has_column_privilege('authenticated','public.providers','display_name','UPDATE')
   and has_column_privilege('authenticated','public.providers','user_id','INSERT')
   and has_column_privilege('authenticated','public.providers','is_mobile','UPDATE'))::text);
select pg_temp.chk('authz', 'a provider still cannot self-grant is_approved / is_featured', 'false',
  (has_column_privilege('authenticated','public.providers','is_approved','UPDATE')
   or has_column_privilege('authenticated','public.providers','is_featured','UPDATE')
   or has_column_privilege('authenticated','public.providers','average_rating','UPDATE'))::text);

-- A guard that only ever proves denial would pass on a table nobody can use.
-- This is the real discovery-feed shape, run as a signed-in caller.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk_allowed('authz', 'the real discovery-feed query still runs',
  'select id, display_name, average_rating, is_featured from public.providers
    where is_approved = true order by is_featured desc, average_rating desc, id limit 5');
select pg_temp.chk_blocked('authz', 'a signed-in caller cannot select a withheld column',
  'select verification_notes from public.providers limit 1', 'permission denied');

-- ══ 2. CONTRACT OWNERSHIP ══════════════════════════════════════════════════
--
-- Reproduced: provider B inserted a contract whose `provider_id` was provider A's
-- row. It succeeded, and because `contracts_provider_id_key` is UNIQUE it then
-- DENIED provider A their own contract slot. The INSERT policy asserted only that
-- the caller was SOME provider; UPDATE had no WITH CHECK at all.

-- A second provider, created inside this transaction. The whole harness runs in
-- one transaction that is always rolled back, so this leaves no residue.
do $$
declare v_pu2 uuid := gen_random_uuid(); v_pid2 uuid;
begin
  -- Seeding runs as service_role, exactly as `_fixtures.sql` does: assertions must
  -- never run in this context, but creating the cast must not be blocked by the
  -- very policies under test.
  perform pg_temp.act_service();
  insert into auth.users(id) values (v_pu2);
  insert into public.providers (user_id, display_name, username)
  values (v_pu2, 'B5B Authz Provider 2', 'b5b_authz_p2_'||substr(v_pu2::text,1,8))
  returning id into v_pid2;
  perform set_config('b5b.pu2', v_pu2::text, true);
  perform set_config('b5b.pid2', v_pid2::text, true);
end $$;

select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk_allowed('authz', 'provider CAN create a contract for their own provider row',
  format('insert into public.contracts(provider_id, user_id, title, body, contract_type, is_active)
          values (%L, %L, ''Own agreement'', ''terms'', ''text'', true)',
         current_setting('b5b.pid'), current_setting('b5b.pu')));

select pg_temp.chk_blocked('authz', 'provider cannot create a contract for ANOTHER provider',
  format('insert into public.contracts(provider_id, user_id, title, body, contract_type, is_active)
          values (%L, %L, ''Forged'', ''x'', ''text'', true)',
         current_setting('b5b.pid2'), current_setting('b5b.pu')),
  'row-level security');

select pg_temp.chk_blocked('authz', 'provider cannot reassign their contract to another provider',
  format('update public.contracts set provider_id = %L where provider_id = %L',
         current_setting('b5b.pid2'), current_setting('b5b.pid')),
  'row-level security');

-- The counterparty direction: provider 2 may not reach provider 1's row either.
select pg_temp.act(current_setting('b5b.pu2')::uuid);
select pg_temp.chk_blocked('authz', 'the other provider cannot claim the first provider''s slot',
  format('insert into public.contracts(provider_id, user_id, title, body, contract_type, is_active)
          values (%L, %L, ''Forged the other way'', ''x'', ''text'', true)',
         current_setting('b5b.pid'), current_setting('b5b.pu2')),
  'row-level security');

-- A client is not a provider and has no contract slot at all.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk_blocked('authz', 'an unrelated non-provider user cannot create a contract',
  format('insert into public.contracts(provider_id, user_id, title, body, contract_type, is_active)
          values (%L, %L, ''Client forged'', ''x'', ''text'', true)',
         current_setting('b5b.pid'), current_setting('b5b.cu')),
  'row-level security');

select pg_temp.chk('authz', 'contracts write policies are scoped to authenticated, not public', 'true',
  (select bool_and(roles::text = '{authenticated}')::text from pg_policies
    where schemaname='public' and tablename='contracts'
      and policyname in ('contracts_provider_insert','contracts_provider_update','contracts_provider_delete')));
select pg_temp.chk('authz', 'anon holds nothing on contracts or contract_signatures', 'false',
  (has_table_privilege('anon','public.contracts','SELECT')
   or has_table_privilege('anon','public.contracts','INSERT')
   or has_table_privilege('anon','public.contract_signatures','SELECT'))::text);

-- ══ 3. THE CONTRACT READ, NOW SCOPED TO THE TRANSACTION ═══════════════════
--
-- Reproduced in Correction 2: a first-time client's read of the contract they
-- are about to sign returned ZERO ROWS AND NO ERROR, because the table policy is
-- owner-or-signer and a first-time client is neither. The flow reported "no
-- contract exists" and skipped the signing gate — for every client, always.
--
-- Correction 2 unblocked it with `provider_contract_for_booking(provider_id)` and
-- recorded honestly that it could not be booking-scoped, because the booking did
-- not exist yet at that point in the flow. `20261037000000` creates the booking
-- first, so `20261038000000` replaced it with `contract_for_booking(booking_id)`
-- and DROPPED the broad path. These assertions moved with it.

select pg_temp.chk('authz', 'the broad provider-scoped contract read is gone', '0',
  (select count(*)::text from pg_proc
    where proname='provider_contract_for_booking' and pronamespace='public'::regnamespace));

select pg_temp.chk('authz', 'contract_for_booking is SECURITY DEFINER with a pinned search_path', 'true',
  (select (prosecdef and coalesce(proconfig::text,'') like '%search_path=%')::text
     from pg_proc where proname='contract_for_booking' and pronamespace='public'::regnamespace));
select pg_temp.chk('authz', 'anon cannot EXECUTE contract_for_booking', 'false',
  has_function_privilege('anon','public.contract_for_booking(uuid)','EXECUTE')::text);
select pg_temp.chk('authz', 'PUBLIC cannot EXECUTE contract_for_booking', 'false',
  has_function_privilege('public','public.contract_for_booking(uuid)','EXECUTE')::text);
select pg_temp.chk('authz', 'authenticated CAN EXECUTE contract_for_booking', 'true',
  has_function_privilege('authenticated','public.contract_for_booking(uuid)','EXECUTE')::text);
select pg_temp.chk('authz', 'contract_for_booking returns no user_id column', 'false',
  (select ('user_id' = any(proargnames))::text
     from pg_proc where proname='contract_for_booking' and pronamespace='public'::regnamespace));

-- THE CLIENT WHO OWNS THE BOOKING reads the contract governing it. `b_pend` is
-- the fixture's pending request from `cu` to this provider.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk('authz', 'the booking''s own client reads the governing contract', '1',
  (select count(*)::text from public.contract_for_booking(current_setting('b5b.b_pend')::uuid)));
select pg_temp.chk('authz', 'the contracts TABLE stays closed to that same non-signer', '0',
  (select count(*)::text from public.contracts where provider_id = current_setting('b5b.pid')::uuid));

-- A STRANGER HOLDING THE BOOKING ID GETS NOTHING. This is the whole narrowing:
-- the old function took a provider id anyone could read off the public feed, so
-- any authenticated user could read any live provider's contract. Now the caller
-- must own the transaction.
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk('authz', 'a stranger cannot read a contract through someone else''s booking', '0',
  (select count(*)::text from public.contract_for_booking(current_setting('b5b.b_pend')::uuid)));
select pg_temp.act(current_setting('b5b.pu2')::uuid);
select pg_temp.chk('authz', 'an unrelated provider cannot either', '0',
  (select count(*)::text from public.contract_for_booking(current_setting('b5b.b_pend')::uuid)));

-- The owning provider still reads their own contract from the table.
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk('authz', 'owner provider still reads it directly from the table', '1',
  (select count(*)::text from public.contracts where provider_id = current_setting('b5b.pid')::uuid));

-- A DE-APPROVED PROVIDER STILL HONOURS EXISTING BOOKINGS. Correction 2's QA
-- review found that its `and p.is_approved` conjunct reproduced the very defect
-- the RPC existed to fix: for a de-approved provider it returned zero rows and no
-- error, so the gate silently skipped again. Item H is explicit that history and
-- existing relationships survive de-approval; only NEW activity stops. There is
-- no is_approved term in the booking-scoped function, and this proves it.
select pg_temp.act_service();
update public.providers set is_approved = false where id = current_setting('b5b.pid')::uuid;
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk('authz', 'a de-approved provider''s existing booking can still be signed', '1',
  (select count(*)::text from public.contract_for_booking(current_setting('b5b.b_pend')::uuid)));
select pg_temp.act_service();
update public.providers set is_approved = true where id = current_setting('b5b.pid')::uuid;

-- ══ 4. POSTS-MEDIA OBJECT OWNERSHIP ════════════════════════════════════════
--
-- Reproduced: provider B uploaded a file into provider A's folder in the public
-- `posts-media` bucket, because the INSERT policy checked `bucket_id` and nothing
-- else. There was also NO update and NO delete policy, so a delete returned
-- success and removed nothing — the worst shape a retention promise can have.

select pg_temp.chk('authz', 'the unbound posts-media upload policy is gone', '0',
  (select count(*)::text from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname = 'posts_media_authenticated_upload'));

select pg_temp.chk('authz', 'posts-media INSERT is bound to the caller''s own folder', 'true',
  (select (with_check like '%foldername(name))[1] = (auth.uid())::text%')::text
     from pg_policies where schemaname='storage' and tablename='objects'
       and policyname='posts_media_owner_insert'));

select pg_temp.chk('authz', 'posts-media UPDATE binds the row before AND after', 'true',
  (select (qual like '%foldername(name))[1] = (auth.uid())::text%'
           and with_check like '%foldername(name))[1] = (auth.uid())::text%')::text
     from pg_policies where schemaname='storage' and tablename='objects'
       and policyname='posts_media_owner_update'));

select pg_temp.chk('authz', 'posts-media DELETE is owner-bound and now exists', 'true',
  (select (qual like '%foldername(name))[1] = (auth.uid())::text%')::text
     from pg_policies where schemaname='storage' and tablename='objects'
       and policyname='posts_media_owner_delete'));

-- Public read is a deliberate posture, not an oversight: the discovery feed and
-- the reels player render these objects by public URL. Pinned so a later tidy-up
-- cannot remove it believing it was left behind.
select pg_temp.chk('authz', 'posts-media public read is preserved on purpose', '1',
  (select count(*)::text from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='posts_media_public_read' and cmd='SELECT'));

-- ── Correction 3 item L: the provider can delete their own media ROW ──────
--
-- The storage half above has been owner-bound since Correction 2. The `posts`
-- table it describes had NO DELETE POLICY AT ALL and no delete control on any
-- screen, so provider-authored media — publicly readable the moment it is
-- inserted — could never be removed by the person who posted it. These assertions
-- pin both halves of the fix: that a provider may now delete their own row, and
-- that the boundary is the OWNER, not merely "any authenticated caller".
do $$
declare
  pu uuid := current_setting('b5b.pu')::uuid;
  pu2 uuid := current_setting('b5b.pu2')::uuid;
  pid uuid := current_setting('b5b.pid')::uuid;
  v_post uuid; v_n integer;
begin
  perform pg_temp.act_service();
  insert into public.posts(provider_id, media_url, media_type, content_type,
                           visibility, is_active, is_demo, sort_order)
  values (pid, 'https://example.test/b5b-owner-delete.jpg', 'image', 'portfolio',
          'public', true, false, 0)
  returning id into v_post;
  perform set_config('b5b.post_l', v_post::text, true);

  -- ANOTHER PROVIDER CANNOT. RLS filters rather than raising, so the check is on
  -- the ROW COUNT: a delete that silently affects nothing is exactly what an
  -- optimistic client would report as success.
  perform pg_temp.act(pu2);
  delete from public.posts where id = v_post;
  perform pg_temp.act_service();
  select count(*) into v_n from public.posts where id = v_post;
  perform pg_temp.chk('authz', 'another provider cannot delete this provider''s media',
    '1', v_n::text);

  -- THE OWNER CAN.
  perform pg_temp.act(pu);
  delete from public.posts where id = v_post;
  perform pg_temp.act_service();
  select count(*) into v_n from public.posts where id = v_post;
  perform pg_temp.chk('authz', 'the owning provider CAN delete their own media', '0', v_n::text);
end $$;

-- A CLIENT holds the grant (it is table-level) and must still be filtered by the
-- policy to zero rows. The grant is not the boundary; the policy is.
do $$
declare
  cu uuid := current_setting('b5b.cu')::uuid;
  pid uuid := current_setting('b5b.pid')::uuid;
  v_post uuid; v_n integer;
begin
  perform pg_temp.act_service();
  insert into public.posts(provider_id, media_url, media_type, content_type,
                           visibility, is_active, is_demo, sort_order)
  values (pid, 'https://example.test/b5b-client-delete.jpg', 'image', 'portfolio',
          'public', true, false, 1)
  returning id into v_post;

  perform pg_temp.act(cu);
  delete from public.posts where id = v_post;
  perform pg_temp.act_service();
  select count(*) into v_n from public.posts where id = v_post;
  perform pg_temp.chk('authz', 'a client cannot delete a provider''s media', '1', v_n::text);
  delete from public.posts where id = v_post;
end $$;

-- `anon` holds nothing on this table, so an unauthenticated delete cannot even be
-- attempted — a second, independent refusal beneath the policy.
select pg_temp.chk('authz', 'anon holds no DELETE on posts', 'false',
  has_table_privilege('anon', 'public.posts', 'DELETE')::text);
select pg_temp.chk('authz', 'authenticated holds DELETE, so the policy is what decides', 'true',
  has_table_privilege('authenticated', 'public.posts', 'DELETE')::text);
select pg_temp.chk('authz', 'exactly one DELETE policy governs posts', 'posts_delete_own',
  (select string_agg(policyname, ',' order by policyname) from pg_policies
    where schemaname='public' and tablename='posts' and cmd='DELETE'));

-- THE ADJACENT DEFECT `20261043000000` also closed. `posts_update_own` had a
-- USING clause and no WITH CHECK: USING decides which rows may be updated, WITH
-- CHECK decides what they may be updated INTO. Without the second half a provider
-- could take their own row and set `provider_id` to another provider, publishing
-- their media onto a stranger's public profile under that stranger's name.
select pg_temp.chk('authz', 'the posts UPDATE policy now binds the row AFTER the write too', 'true',
  (select (qual is not null and with_check is not null)::text from pg_policies
    where schemaname='public' and tablename='posts' and policyname='posts_update_own'));
do $$
declare
  pu uuid := current_setting('b5b.pu')::uuid;
  pid uuid := current_setting('b5b.pid')::uuid;
  v_other uuid; v_post uuid; v_owner uuid;
begin
  perform pg_temp.act_service();
  select p.id into v_other from public.providers p where p.id <> pid limit 1;
  insert into public.posts(provider_id, media_url, media_type, content_type,
                           visibility, is_active, is_demo, sort_order)
  values (pid, 'https://example.test/b5b-reassign.jpg', 'image', 'portfolio',
          'public', true, false, 2)
  returning id into v_post;

  perform pg_temp.act(pu);
  begin
    update public.posts set provider_id = v_other where id = v_post;
  exception when others then null;
  end;
  perform pg_temp.act_service();
  select provider_id into v_owner from public.posts where id = v_post;
  perform pg_temp.chk('authz', 'a provider cannot reassign their media to another provider',
    pid::text, v_owner::text);
  delete from public.posts where id = v_post;
end $$;

-- posts-media now matches the provider-media posture Batch 2a established, which
-- is the whole claim this migration makes.
-- Asserts the COUNT on each side, not merely that they are equal: `0 = 0` would
-- have passed if both policy families were dropped, which is the one outcome
-- this check exists to notice.
select pg_temp.chk('authz', 'posts-media has the same four policies as provider-media', '4/4',
  (select (count(*) filter (where policyname like 'posts_media%'))::text || '/' ||
          (count(*) filter (where policyname like 'provider_media%'))::text
     from pg_policies where schemaname='storage' and tablename='objects'
       and (policyname like 'posts_media%' or policyname like 'provider_media%')));

-- ══ 5. LEAST-PRIVILEGE DEFAULTS ════════════════════════════════════════════
--
-- `pg_default_acl` granted anon and authenticated `arwdDxtm` — every privilege —
-- on every FUTURE table created by a migration, plus EXECUTE on every future
-- function. The backlog that left behind: anon held INSERT/UPDATE/DELETE on 32-33
-- of 48 tables and TRUNCATE on 33. **TRUNCATE is not filtered by row-level
-- security**, so RLS was never covering it; only PostgREST's refusal to issue one
-- was, and that is a property of the gateway, not the database.
--
-- Asserted against the catalog, so no test object is created and no residue is
-- possible.

select pg_temp.chk('authz', 'future postgres-owned tables grant nothing to anon or authenticated', 'false',
  (select bool_or(defaclacl::text like '%anon=%' or defaclacl::text like '%authenticated=%')::text
     from pg_default_acl
    where defaclnamespace='public'::regnamespace
      and defaclobjtype='r'
      and pg_get_userbyid(defaclrole)='postgres'));

select pg_temp.chk('authz', 'future postgres-owned functions are not EXECUTE-able by anon or authenticated', 'false',
  (select bool_or(defaclacl::text like '%anon=%' or defaclacl::text like '%authenticated=%')::text
     from pg_default_acl
    where defaclnamespace='public'::regnamespace
      and defaclobjtype='f'
      and pg_get_userbyid(defaclrole)='postgres'));

select pg_temp.chk('authz', 'future postgres-owned sequences are not reachable by anon', 'false',
  (select bool_or(defaclacl::text like '%anon=%')::text
     from pg_default_acl
    where defaclnamespace='public'::regnamespace
      and defaclobjtype='S'
      and pg_get_userbyid(defaclrole)='postgres'));

select pg_temp.chk('authz', 'service_role keeps its default table privileges', 'true',
  (select bool_or(defaclacl::text like '%service_role=%')::text
     from pg_default_acl
    where defaclnamespace='public'::regnamespace
      and defaclobjtype='r'
      and pg_get_userbyid(defaclrole)='postgres'));

-- The backlog sweep. Named per privilege so a regression says which one returned.
select pg_temp.chk('authz', 'anon holds INSERT on no table in public', '0',
  (select count(*)::text from pg_class c where c.relnamespace='public'::regnamespace
     and c.relkind='r' and has_table_privilege('anon', c.oid, 'INSERT')));
select pg_temp.chk('authz', 'anon holds UPDATE on no table in public', '0',
  (select count(*)::text from pg_class c where c.relnamespace='public'::regnamespace
     and c.relkind='r' and has_table_privilege('anon', c.oid, 'UPDATE')));
select pg_temp.chk('authz', 'anon holds DELETE on no table in public', '0',
  (select count(*)::text from pg_class c where c.relnamespace='public'::regnamespace
     and c.relkind='r' and has_table_privilege('anon', c.oid, 'DELETE')));
select pg_temp.chk('authz', 'anon holds TRUNCATE on no table in public', '0',
  (select count(*)::text from pg_class c where c.relnamespace='public'::regnamespace
     and c.relkind='r' and has_table_privilege('anon', c.oid, 'TRUNCATE')));
-- authenticated keeps the writes its policies govern, but never TRUNCATE, which
-- no policy can constrain.
select pg_temp.chk('authz', 'authenticated holds TRUNCATE on no table in public', '0',
  (select count(*)::text from pg_class c where c.relnamespace='public'::regnamespace
     and c.relkind='r' and has_table_privilege('authenticated', c.oid, 'TRUNCATE')));

-- Signed-out discovery is a beta posture this slice did not change: anon keeps
-- SELECT where a deliberate public-read policy exists. Pinned as a floor so a
-- later sweep does not silently take the marketplace offline for anon.
select pg_temp.chk('authz', 'anon keeps SELECT on the deliberately public tables', 'true',
  (select bool_and(has_table_privilege('anon', t, 'SELECT'))::text
     from unnest(array['public.categories','public.provider_availability',
                       'public.provider_blocked_dates','public.provider_policies']) as t));

-- RLS remains on everywhere. A revoke sweep must never become a reason to relax it.
select pg_temp.chk('authz', 'RLS is still enabled on every table in public', '0',
  (select count(*)::text from pg_class
    where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity));

-- ══ 6. SIGNATURE OWNERSHIP BINDING ═════════════════════════════════════════
--
-- Found by the codebase audit OF this slice, then reproduced: a stranger inserted
-- a `contract_signatures` row against ANOTHER CLIENT'S booking — the policy
-- checked only `auth.uid() = client_user_id` and left `contract_id` and
-- `booking_id` free. Because `contract_signatures_booking_id_key` is UNIQUE, the
-- real client was then refused with `23505` and could never sign their own
-- booking. `20261031000000` had hardened `contracts` and reached into this table
-- to revoke `anon`, but never looked at its write policies.

select pg_temp.chk('authz', 'contract_governs_booking is SECURITY DEFINER with a pinned search_path', 'true',
  (select (prosecdef and coalesce(proconfig::text,'') like '%search_path=%')::text
     from pg_proc where proname='contract_governs_booking'
       and pronamespace='public'::regnamespace));
select pg_temp.chk('authz', 'anon cannot EXECUTE contract_governs_booking', 'false',
  has_function_privilege('anon','public.contract_governs_booking(uuid,uuid)','EXECUTE')::text);
select pg_temp.chk('authz', 'signature write policies are scoped to authenticated', 'true',
  (select bool_and(roles::text = '{authenticated}')::text from pg_policies
    where schemaname='public' and tablename='contract_signatures'));
select pg_temp.chk('authz', 'the signature UPDATE policy now carries a WITH CHECK', 'true',
  (select (with_check is not null)::text from pg_policies
    where schemaname='public' and tablename='contract_signatures'
      and policyname='signatures_client_update'));

-- THE CONTRACT ID IS CAPTURED AS A LITERAL, and that detail is the assertion.
-- An earlier version of the stranger test below drove the insert from
-- `select c.id from contracts where provider_id = …`. For an outsider that
-- subquery returns ZERO ROWS — contracts RLS is owner-or-signer — so the INSERT
-- inserted nothing, succeeded trivially, and `chk_blocked` reported ALLOWED. The
-- test failed for the right reason and would have passed for the wrong one once
-- the policy was fixed. A denial test whose statement can become a no-op proves
-- nothing, so the id is resolved once, privileged, and used verbatim.
select pg_temp.act_service();
select set_config('b5b.ctr',
  (select id::text from public.contracts where provider_id = current_setting('b5b.pid')::uuid), true);

-- The legitimate path must still work. A harness that only proved denial would
-- pass on a signing flow nobody can complete — which is how this slice's own
-- Finding 3 stayed hidden.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk_allowed('authz', 'the booking''s own client CAN sign the governing contract',
  format('insert into public.contract_signatures(contract_id, booking_id, client_user_id, signature_url, signed_at, status)
          values (%L, %L, %L, null, now(), ''signed'')',
         current_setting('b5b.ctr'), current_setting('b5b.b_pend'), current_setting('b5b.cu')));

-- The reproduced attack, from the outsider's seat: their own booking would be the
-- realistic vector, but even the blunt form — someone else's booking — must fail.
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk_blocked('authz', 'a stranger cannot sign someone else''s booking',
  format('insert into public.contract_signatures(contract_id, booking_id, client_user_id, signature_url, signed_at, status)
          values (%L, %L, %L, null, now(), ''signed'')',
         current_setting('b5b.ctr'), current_setting('b5b.b_elig'), current_setting('b5b.ou')),
  'row-level security');

-- THE ACTUAL ATTACK THE SECURITY REVIEW TRACED: the forger uses a booking they
-- legitimately own, with a contract belonging to a provider they have no
-- relationship with. Binding the signer alone would have let this through.
select pg_temp.act_service();
do $$
declare v_b uuid;
begin
  insert into public.bookings(user_id, provider_id, service_name, requested_date, status)
  values (current_setting('b5b.ou')::uuid, current_setting('b5b.pid2')::uuid,
          'outsider own booking', current_date, 'pending')
  returning id into v_b;
  perform set_config('b5b.b_ou', v_b::text, true);
end $$;
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk_blocked('authz', 'a forger cannot pair their OWN booking with a stranger''s contract',
  format('insert into public.contract_signatures(contract_id, booking_id, client_user_id, signature_url, signed_at, status)
          values (%L, %L, %L, null, now(), ''signed'')',
         current_setting('b5b.ctr'), current_setting('b5b.b_ou'), current_setting('b5b.ou')),
  'row-level security');

-- And the two downstream reads the forgery would have unlocked stay shut. This is
-- what made the finding HIGH rather than cosmetic: becoming a signer grants
-- `contracts_provider_read` (the provider''s auth uid) and `can_read_contract_pdf`
-- (an object in the PRIVATE contract-pdfs bucket).
select pg_temp.chk('authz', 'the forger cannot read the contract row', '0',
  (select count(*)::text from public.contracts where id = current_setting('b5b.ctr')::uuid));
select pg_temp.chk('authz', 'the forger is not a contract signer', 'false',
  public.is_contract_signer(current_setting('b5b.ctr')::uuid)::text);

-- An existing signer may not re-point their row at a different contract or booking.
-- Re-pointing is refused by a TRIGGER, not by the policy, and the distinction is
-- the finding: both the old and the new booking belong to this same client with
-- the same provider, so the ownership predicate is satisfied either way. B5B
-- caught that the binding was right and the immutability was missing.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk_blocked('authz', 'a signer cannot re-point their signature at another booking',
  format('update public.contract_signatures set booking_id = %L where client_user_id = %L',
         current_setting('b5b.b_elig'), current_setting('b5b.cu')),
  'cannot be moved');
-- No expected message here, deliberately: TWO independent guards refuse this one.
-- The trigger refuses the move, and the policy's WITH CHECK refuses it separately
-- because a random contract id does not govern the booking. Pinning either
-- message would make the assertion fail the day the other guard wins the race to
-- raise, which would be a test breaking on defence in depth.
select pg_temp.chk_blocked('authz', 'a signer cannot re-point their signature at another contract',
  format('update public.contract_signatures set contract_id = gen_random_uuid() where client_user_id = %L',
         current_setting('b5b.cu')));

-- ── The PDF a client is asked to sign must be readable (SEC-STORAGE-001) ───
-- The gate was unblocked for text contracts and left unreadable for PDFs, so a
-- client could tick "I have read and agree" over a document storage would refuse
-- them. Asserted through the storage helper, which is what the bucket policy calls.
select pg_temp.act_service();
update public.contracts set contract_type = 'pdf',
       pdf_url = 'https://example.invalid/storage/v1/object/contract-pdfs/'
                 || current_setting('b5b.pu') || '/contract_b5b.pdf'
 where id = current_setting('b5b.ctr')::uuid;

-- The prospective signer is now the client who HOLDS A BOOKING with this
-- provider, not merely any authenticated user — `20261038000000` narrowed the
-- disjunct to the transaction.
--
-- `cu5` gets a booking of their own here, deliberately, because `cu` has ALREADY
-- SIGNED earlier in this suite and would therefore satisfy the signer arm — the
-- assertion would pass without ever exercising the prospective arm it is named
-- for. A fresh booking with no signature is the only way to isolate it.
select pg_temp.act_service();
insert into public.bookings(user_id, provider_id, service_name, requested_date,
                            status, submitted_at, expires_at)
values (current_setting('b5b.cu5')::uuid, current_setting('b5b.pid')::uuid, 'svc',
        current_date, 'pending', now() - interval '1 hour', now() + interval '71 hours');

select pg_temp.act(current_setting('b5b.cu5')::uuid);
select pg_temp.chk('authz', 'a prospective signer with a booking CAN read the PDF', 'true',
  public.can_read_contract_pdf(current_setting('b5b.pu') || '/contract_b5b.pdf')::text);
select pg_temp.act(current_setting('b5b.ou')::uuid);
select pg_temp.chk('authz', 'an authenticated stranger with no booking CANNOT read the PDF', 'false',
  public.can_read_contract_pdf(current_setting('b5b.pu') || '/contract_b5b.pdf')::text);
select pg_temp.act(current_setting('b5b.pu')::uuid);
select pg_temp.chk('authz', 'the owning provider can still read their own PDF', 'true',
  public.can_read_contract_pdf(current_setting('b5b.pu') || '/contract_b5b.pdf')::text);
select pg_temp.act(null);
select pg_temp.chk('authz', 'an unauthenticated caller cannot read the PDF', 'false',
  public.can_read_contract_pdf(current_setting('b5b.pu') || '/contract_b5b.pdf')::text);

-- The widening is bounded by the same conjunct the RPC uses, not left open.
select pg_temp.act_service();
update public.contracts set is_active = false where id = current_setting('b5b.ctr')::uuid;
select pg_temp.act(current_setting('b5b.cu5')::uuid);
select pg_temp.chk('authz', 'an inactive contract''s PDF is not readable by a prospective signer', 'false',
  public.can_read_contract_pdf(current_setting('b5b.pu') || '/contract_b5b.pdf')::text);
select pg_temp.act_service();
update public.contracts set is_active = true where id = current_setting('b5b.ctr')::uuid;

-- ── The sequence 20261034000000's own rule missed (SEC-MIGRATION-001) ──────
select pg_temp.chk('authz', 'anon holds nothing on any sequence in public', '0',
  (select count(*)::text from pg_class c
    where c.relnamespace='public'::regnamespace and c.relkind='S'
      and (has_sequence_privilege('anon', c.oid, 'USAGE')
        or has_sequence_privilege('anon', c.oid, 'SELECT')
        or has_sequence_privilege('anon', c.oid, 'UPDATE'))));

-- Binding the booking alone is not enough: the contract must govern it. Here the
-- caller owns the booking but names a contract belonging to a different provider.
select pg_temp.act(current_setting('b5b.cu')::uuid);
select pg_temp.chk_blocked('authz', 'a client cannot sign a contract that does not govern their booking',
  format('insert into public.contract_signatures(contract_id, booking_id, client_user_id, signature_url, signed_at, status)
          values (gen_random_uuid(), %L, %L, null, now(), ''signed'')',
         current_setting('b5b.b_elig'), current_setting('b5b.cu')),
  'row-level security');

-- ══ 7. THE GAPS THE SECURITY REVIEW OF THIS SLICE NAMED ═══════════════════

-- (a) THE `supabase_admin` DEFAULT ACL IS A KNOWN, ACCEPTED EXCEPTION, not an
-- oversight — `20261034000000` discloses it and cannot alter it, because it is
-- platform-managed and governs objects that role creates rather than objects our
-- migrations create. Pinned so it is VISIBLE rather than silently excluded by the
-- `grantor = postgres` filter above: if it ever changes, that is worth knowing.
select pg_temp.chk('authz', 'the supabase_admin default ACL is still the known exception', 'true',
  (select bool_or(defaclacl::text like '%anon=%')::text
     from pg_default_acl
    where defaclnamespace='public'::regnamespace
      and defaclobjtype='r'
      and pg_get_userbyid(defaclrole)='supabase_admin'));

-- (b) `has_table_privilege` DOES NOT SEE COLUMN-LEVEL GRANTS, and neither does a
-- table-level REVOKE remove one. So the anon write sweep above has a blind spot a
-- future `grant insert (col) … to anon` would hide in. Closed from the catalog.
-- Asked through `has_column_privilege`, not by pattern-matching the ACL text. An
-- earlier version matched `attacl like '%anon=%a%'` and reported 28 offenders —
-- the `a` it was finding was inside the word "authenticated" further along the
-- same ACL string. A privilege question deserves the privilege function.
select pg_temp.chk('authz', 'anon holds no column-level write grant anywhere in public', '0',
  (select count(*)::text
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
    where c.relnamespace='public'::regnamespace and c.relkind='r'
      and a.attnum > 0 and not a.attisdropped
      and (has_column_privilege('anon', c.oid, a.attnum, 'INSERT')
        or has_column_privilege('anon', c.oid, a.attnum, 'UPDATE'))));

-- (c) THE ANON PATH IS EXERCISED BEHAVIOURALLY, not only through
-- `has_column_privilege`. Every other behavioural assertion in § 1 runs as
-- `authenticated`; signed-out discovery is the surface the column grant is
-- supposed to preserve, so it is proven from the anon seat.
-- `_helpers.sql` grants the scratch results table to `authenticated` only, because
-- until now no suite ever assumed the `anon` role. Extended here for the duration
-- of this transaction, which the runner always rolls back.
select pg_temp.act_service();
grant select, insert on _results to anon;
grant usage, select on sequence _results_id_seq to anon;

select pg_temp.act(null, 'anon');
select pg_temp.chk_allowed('authz', 'anon can still run the discovery feed query',
  'select id, display_name, average_rating from public.providers
    where is_approved = true order by is_featured desc, average_rating desc, id limit 3');
select pg_temp.chk_blocked('authz', 'anon cannot select a withheld column',
  'select verification_notes from public.providers limit 1', 'permission denied');
select pg_temp.chk_blocked('authz', 'anon cannot select stripe_account_id',
  'select stripe_account_id from public.providers limit 1', 'permission denied');

-- (d) THE GO-LIVE UPSERT IS THE ONE WRITE SHAPE THE REVOKE-AND-REGRANT MUST NOT
-- HAVE NARROWED. `20261030000000` § 1 wipes the role's ACL for this table before
-- restating Batch 3a's grants; if a column had been dropped from either list, the
-- provider onboarding write would fail — and nothing else in this suite would
-- notice. Run in its literal shape, conflict target included.
-- THE STATEMENT PostgREST USED TO SEND, pinned as REFUSED. `.upsert(…, {
-- onConflict: 'user_id' })` emits `DO UPDATE SET user_id = excluded.user_id`,
-- and `user_id` is INSERT-granted but not UPDATE-granted, because reassigning it
-- would hand the whole provider row to another user. PostgreSQL refuses the
-- statement whether or not a conflict occurs — which is why provider go-live had
-- been failing with 42501 for every real provider since Security Batch 3a. Batch
-- 3a's own compatibility test passed because it exercised a hand-written
-- `DO UPDATE SET display_name`, not the statement the client actually sends.
select pg_temp.act(current_setting('b5b.pu2')::uuid);
select pg_temp.chk_blocked('authz', 'the old upsert shape (SET user_id) is still refused',
  format('insert into public.providers (user_id, display_name, username)
          values (%L, ''Go Live'', ''b5b_gl_%s'')
          on conflict (user_id) do update set user_id = excluded.user_id',
         current_setting('b5b.pu2'), substr(current_setting('b5b.pu2'), 1, 8)),
  'permission denied');

-- THE SHAPE THE APP USES NOW: insert, and on conflict update everything EXCEPT
-- user_id. Both halves are proven, because a fix that only avoided the error
-- without still writing the profile would be no fix at all.
select pg_temp.chk_allowed('authz', 'go-live: the conflict path updates without touching user_id',
  format('update public.providers set display_name = ''Go Live Edited'',
                 bio = ''edited'', updated_at = now() where user_id = %L',
         current_setting('b5b.pu2')));
select pg_temp.chk('authz', 'go-live: the conflict path actually wrote', 'Go Live Edited',
  (select display_name from public.providers where user_id = current_setting('b5b.pu2')::uuid));
select pg_temp.chk_blocked('authz', 'a provider still cannot transfer ownership of their row',
  format('update public.providers set user_id = gen_random_uuid() where user_id = %L',
         current_setting('b5b.pu2')),
  'permission denied');

-- (e) THE STORAGE ASSERTIONS IN § 4 ARE CATALOG-TEXT ONLY. A `like` against
-- `pg_policies` proves a policy CONTAINS a substring; it does not prove an insert
-- into someone else's folder is refused. These are the behavioural counterparts,
-- run against `storage.objects` under a real role, which is what the bucket
-- actually enforces.
select pg_temp.act_service();
insert into storage.objects (bucket_id, name, owner, metadata)
values ('posts-media', current_setting('b5b.pu') || '/portfolio/b5b_seed.jpg',
        current_setting('b5b.pu')::uuid, '{}'::jsonb);

select pg_temp.act(current_setting('b5b.pu2')::uuid);
select pg_temp.chk_blocked('authz', 'storage: a stranger cannot upload into another user''s folder',
  format('insert into storage.objects (bucket_id, name, owner, metadata)
          values (''posts-media'', %L, %L, ''{}''::jsonb)',
         current_setting('b5b.pu') || '/portfolio/b5b_spoof.jpg', current_setting('b5b.pu2')),
  'row-level security');
select pg_temp.chk_allowed('authz', 'storage: a user CAN upload into their own folder',
  format('insert into storage.objects (bucket_id, name, owner, metadata)
          values (''posts-media'', %L, %L, ''{}''::jsonb)',
         current_setting('b5b.pu2') || '/portfolio/b5b_own.jpg', current_setting('b5b.pu2')));

-- DELETE IS NOT ASSERTED HERE, and the reason is recorded rather than left as a
-- gap. Supabase installs a trigger refusing direct DELETE on `storage.objects`
-- ("Direct deletion from storage tables is not allowed. Use the Storage API
-- instead."), so a SQL-level delete test would be refused by that trigger no
-- matter what the RLS policy said — it would pass while proving nothing. The
-- owner-delete and cross-owner-delete behaviour of `posts_media_owner_delete` is
-- instead proven through the real Storage API by the runtime verification script
-- recorded in the migration ledger, which showed an owner's object actually
-- disappearing and a stranger's delete leaving it in place.
