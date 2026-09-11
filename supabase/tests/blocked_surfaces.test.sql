-- B5B suite: Session 8C — PD-089, a blocked person leaves ordinary surfaces.
--
-- SYMMETRY IS THE PROPERTY, and it is the one a naive implementation gets half
-- right: the blocker stops seeing the blocked party (easy — the caller can read
-- their own blocks), while the blocked party goes on seeing the blocker (because
-- RLS on `user_blocks` hides a block made AGAINST you). Every assertion below is
-- therefore made from BOTH sides.
--
-- Run as the roles that would attack it, never as service_role, because
-- service_role is the one role the filter deliberately does not apply to.

do $$
declare
  au uuid := gen_random_uuid();   -- A, who blocks
  bu uuid := gen_random_uuid();   -- B, who is blocked
  cu uuid := gen_random_uuid();   -- C, unrelated
  pa uuid; pb uuid; pc uuid;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (au), (bu), (cu);
  insert into public.providers(user_id, display_name, username, is_approved)
    values (au, 'S8C Alpha', 's8ca_'||substr(au::text,1,8), true) returning id into pa;
  insert into public.providers(user_id, display_name, username, is_approved)
    values (bu, 'S8C Bravo', 's8cb_'||substr(bu::text,1,8), true) returning id into pb;
  insert into public.providers(user_id, display_name, username, is_approved)
    values (cu, 'S8C Charlie', 's8cc_'||substr(cu::text,1,8), true) returning id into pc;
  -- Community Reshape (20261088000000) added the actor and intent columns. These
  -- fixtures stay PROVIDER posts, because that is what they were when the block
  -- rule was written and the block rule does not care who is speaking.
  insert into public.community_posts(provider_id, user_id, author_kind, intent,
                                     content, category, is_active)
    values (pa, au, 'provider', 'update', 'alpha post', 'general', true),
           (pb, bu, 'provider', 'update', 'bravo post', 'general', true),
           (pc, cu, 'provider', 'update', 'charlie post', 'general', true);
  insert into public.community_replies(post_id, provider_id, user_id, author_kind, kind, content)
    select id, pb, bu, 'provider', 'reply', 'bravo reply'
      from public.community_posts where user_id = cu;
  perform set_config('b5c.a', au::text, true);
  perform set_config('b5c.b', bu::text, true);
  perform set_config('b5c.c', cu::text, true);
  perform set_config('b5c.pa', pa::text, true);
  perform set_config('b5c.pb', pb::text, true);
end $$;

-- ══ 1. BEFORE THE BLOCK, EVERYONE SEES EVERYONE ═══════════════════════════
--
-- Asserted first so the absence proved later means something. A suite that only
-- checks "after" cannot tell hiding from a fixture that never existed.
do $$
declare
  au uuid := current_setting('b5c.a')::uuid;
  bu uuid := current_setting('b5c.b')::uuid;
  pb uuid := current_setting('b5c.pb')::uuid;
  v_n integer;
begin
  perform pg_temp.act(au);
  select count(*) into v_n from public.providers_visible where id = pb;
  perform pg_temp.chk('blockedsurfaces', 'before a block, A sees B in discovery', '1', v_n::text);
  perform pg_temp.act(bu);
  select count(*) into v_n from public.providers_visible
   where id = current_setting('b5c.pa')::uuid;
  perform pg_temp.chk('blockedsurfaces', 'and B sees A', '1', v_n::text);
end $$;

-- ══ 2. AFTER THE BLOCK — BOTH DIRECTIONS ══════════════════════════════════
do $$
declare
  au uuid := current_setting('b5c.a')::uuid;
  bu uuid := current_setting('b5c.b')::uuid;
  cu uuid := current_setting('b5c.c')::uuid;
  pa uuid := current_setting('b5c.pa')::uuid;
  pb uuid := current_setting('b5c.pb')::uuid;
  v_n integer;
begin
  perform pg_temp.act_service();
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (au, bu);

  -- THE BLOCKER stops seeing the blocked party.
  perform pg_temp.act(au);
  select count(*) into v_n from public.providers_visible where id = pb;
  perform pg_temp.chk('blockedsurfaces', 'the BLOCKER no longer sees them in discovery',
    '0', v_n::text);
  select count(*) into v_n from public.community_posts_visible where user_id = bu;
  perform pg_temp.chk('blockedsurfaces', 'nor their posts', '0', v_n::text);
  select count(*) into v_n from public.community_replies_visible where user_id = bu;
  perform pg_temp.chk('blockedsurfaces', 'nor their replies under anyone else''s post',
    '0', v_n::text);

  -- THE BLOCKED PARTY stops seeing the blocker. This is the half that is easy to
  -- get wrong: RLS on user_blocks hides a block made AGAINST you, so a filter
  -- built from the caller's own rows would leave this direction wide open.
  perform pg_temp.act(bu);
  select count(*) into v_n from public.providers_visible where id = pa;
  perform pg_temp.chk('blockedsurfaces', 'and the BLOCKED PARTY no longer sees the blocker',
    '0', v_n::text);
  select count(*) into v_n from public.community_posts_visible where user_id = au;
  perform pg_temp.chk('blockedsurfaces', 'nor the blocker''s posts', '0', v_n::text);

  -- EVERYONE ELSE IS UNAFFECTED. A filter that quietly hid content from
  -- bystanders would be a far worse bug than the one being fixed.
  perform pg_temp.act(cu);
  select count(*) into v_n from public.providers_visible where id in (pa, pb);
  perform pg_temp.chk('blockedsurfaces', 'an unrelated user still sees both', '2', v_n::text);
  select count(*) into v_n from public.community_posts_visible where user_id in (au, bu);
  perform pg_temp.chk('blockedsurfaces', 'and both their posts', '2', v_n::text);

  -- ANON sees everything public: no auth.uid(), so the predicate is vacuous.
  perform pg_temp.act(null, 'anon');
  select count(*) into v_n from public.providers_visible where id in (pa, pb);
  perform pg_temp.chk('blockedsurfaces', 'anon is unaffected by anyone else''s block',
    '2', v_n::text);
  perform pg_temp.act_service();
end $$;

-- ══ 2b. REELS AND COMMENTS — THE SURFACES A FIRST PASS MISSES ═════════════
--
-- These read `public.posts`, a DIFFERENT table from `community_posts`, and
-- `public.post_comments` beneath it. A rule that hid someone from the community
-- feed and left them in Reels would deliver most of PD-089 and fail in the half
-- that is most visible. `posts` is owned through `provider_id` and has no
-- `user_id`, so the filter joins to `providers` — blocking is between PEOPLE,
-- not businesses, and the join is what keeps that true.
do $$
declare
  au uuid := current_setting('b5c.a')::uuid;
  bu uuid := current_setting('b5c.b')::uuid;
  cu uuid := current_setting('b5c.c')::uuid;
  pa uuid := current_setting('b5c.pa')::uuid;
  pb uuid := current_setting('b5c.pb')::uuid;
  v_post uuid; v_n integer;
begin
  perform pg_temp.act_service();
  insert into public.user_blocks(blocker_user_id, blocked_user_id) values (au, bu)
    on conflict do nothing;
  insert into public.posts(provider_id, media_url, media_type, is_active, is_demo)
  values (pb, 'https://example.invalid/b.mp4', 'video', true, false)
  returning id into v_post;
  -- A comment by the BLOCKED party under a THIRD party's post: the shape that
  -- survives after their own content is hidden.
  insert into public.posts(provider_id, media_url, media_type, is_active, is_demo)
  values (current_setting('b5c.pa')::uuid, 'https://example.invalid/a.mp4', 'video', true, false);
  insert into public.post_comments(post_id, user_id, comment_text)
  values (v_post, bu, 'from the blocked party');

  perform pg_temp.act(au);
  select count(*) into v_n from public.posts_visible where provider_id = pb;
  perform pg_temp.chk('blockedsurfaces', 'the blocker sees no Reels from them', '0', v_n::text);
  select count(*) into v_n from public.post_comments_visible where user_id = bu;
  perform pg_temp.chk('blockedsurfaces', 'nor their comments under anyone''s post',
    '0', v_n::text);

  -- And the other direction, which is the half a one-sided filter gets wrong.
  perform pg_temp.act(bu);
  select count(*) into v_n from public.posts_visible where provider_id = pa;
  perform pg_temp.chk('blockedsurfaces', 'and the blocked party sees no Reels from the blocker',
    '0', v_n::text);

  -- A bystander sees both.
  perform pg_temp.act(cu);
  select count(*) into v_n from public.posts_visible where provider_id in (pa, pb);
  perform pg_temp.chk('blockedsurfaces', 'an unrelated user still sees both Reels',
    '2', v_n::text);
  perform pg_temp.act_service();
  delete from public.user_blocks where blocker_user_id = au and blocked_user_id = bu;
end $$;

-- ══ 3. THE VIEWS ARE NOT A PROBE, AND NOT A WRITE PATH ════════════════════
--
-- The whole point of filtering CONTENT rather than exposing a predicate: there
-- is no question to ask. These assertions pin the properties that make that true.
select pg_temp.chk('blockedsurfaces', 'no client-callable block predicate was restored', 'false',
  (has_function_privilege('authenticated', 'public.contact_blocked(uuid,uuid)', 'EXECUTE')
   or has_function_privilege('authenticated',
        'public.contact_blocked_provider(uuid,uuid)', 'EXECUTE')
   or has_function_privilege('authenticated',
        'public.has_live_transaction(uuid,uuid)', 'EXECUTE'))::text);
-- security_invoker = false is LOAD-BEARING: it is how the filter sees a block
-- made against the caller. Recreating any of these with invoker semantics would
-- silently restore the one-directional bug.
select pg_temp.chk('blockedsurfaces', 'all three views are definer, which is what makes them work',
  '0',
  (select count(*)::text from pg_class c
    where c.relname in ('providers_visible','community_posts_visible',
                        'community_replies_visible','posts_visible','post_comments_visible',
                        'barter_offers_visible')
      and c.relkind = 'v'
      and coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%'));
-- A simple view over one table is auto-updatable, which would make each of these
-- a write path straight past the underlying RLS.
do $$
declare
  au uuid := current_setting('b5c.a')::uuid;
  v_code text;
begin
  perform pg_temp.act(au);
  begin
    update public.providers_visible set display_name = 'hijacked'
     where id = current_setting('b5c.pb')::uuid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('blockedsurfaces', 'the provider view is not a write path', '42501', v_code);
  begin
    delete from public.community_posts_visible where user_id = current_setting('b5c.b')::uuid;
    v_code := 'NO ERROR';
  exception when others then v_code := sqlstate;
  end;
  perform pg_temp.chk('blockedsurfaces', 'nor is the post view', '42501', v_code);
  perform pg_temp.act_service();
end $$;
-- No PRIVATE provider column rode in on the definer view. It bypasses the
-- column grants 20261030000000 established, so the column list is the boundary.
select pg_temp.chk('blockedsurfaces', 'the provider view publishes no private column', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'providers_visible'
      and column_name in ('phone', 'email', 'stripe_account_id', 'is_admin',
                          'onboarding_step', 'push_token')));

select pg_temp.chk('blockedsurfaces', 'all six PD-089 views exist', '6',
  (select count(*)::text from pg_class c where c.relkind = 'v'
     and c.relname in ('providers_visible','community_posts_visible',
                       'community_replies_visible','posts_visible','post_comments_visible',
                       'barter_offers_visible')));

-- ══ 3b. THE ONE PROPERTY THAT CATCHES THIS WHOLE CLASS ════════════════════
--
-- `security_invoker = false` drops the base table's RLS as well as its column
-- grants. The first version of these views paid the COLUMN half of that bill and
-- not the POLICY half, so three views silently discarded their base table's read
-- predicate — and two of them were granted to `anon`, which made the
-- provider-only community hub world-readable to anyone holding the public key.
--
-- Every assertion in this file was about BLOCKS, so none of them could see it.
-- The property below is not about blocks at all:
--
--     for every `_visible` view and every role, the rows it returns must be a
--     SUBSET of the rows that role could read from the base table.
--
-- One check, and it catches a dropped policy, a widened grant and a future view
-- that forgets both.
do $$
declare
  nonprov uuid := gen_random_uuid();
  v_n integer;
begin
  perform pg_temp.act_service();
  insert into auth.users(id) values (nonprov);
  insert into public.clients(id, name) values (nonprov, 'Not A Provider')
    on conflict (id) do nothing;

  -- COMMUNITY IS NO LONGER PROVIDER-ONLY (20261088000000). This assertion used
  -- to read "a non-provider reads NOTHING from the community post view", and it
  -- is INVERTED here deliberately rather than deleted: a client asking "who does
  -- braids in the Heights" is the reason the surface exists, and the rule change
  -- should be visible in the diff of the test that guarded the old one.
  perform pg_temp.act(nonprov);
  select count(*) into v_n from public.community_posts_visible;
  perform pg_temp.chk('blockedsurfaces',
    'a non-provider now READS community — that is the reshape', 'true',
    (v_n > 0)::text);
  select count(*) into v_n from public.community_replies_visible;
  perform pg_temp.chk('blockedsurfaces', 'and the replies under it', 'true', (v_n > 0)::text);

  -- BARTER DID NOT CHANGE. It is a provider-to-provider trade board and remains
  -- provider-only; sharing a route with Community never made it the same product.
  select count(*) into v_n from public.barter_offers_visible;
  perform pg_temp.chk('blockedsurfaces',
    'but the barter board is still provider-only', '0', v_n::text);

  -- AND NEITHER DOES ANON. The gate above already refuses them; the grant is
  -- removed as well, because two refusals are the standard here and the first
  -- version of these views is why.
  perform pg_temp.act(null, 'anon');
  begin
    select count(*) into v_n from public.community_posts_visible;
  exception when others then v_n := -1;
  end;
  perform pg_temp.chk('blockedsurfaces',
    'anon still cannot read community through the view', 'true',
    (v_n <= 0)::text);
  perform pg_temp.act_service();
end $$;

select pg_temp.chk('blockedsurfaces', 'no provider-only view is granted to anon', 'false',
  (has_table_privilege('anon','public.community_posts_visible','SELECT')
   or has_table_privilege('anon','public.community_replies_visible','SELECT')
   or has_table_privilege('anon','public.barter_offers_visible','SELECT'))::text);

-- `posts_public_read` is `USING (is_active = true)`, and the view must carry it.
-- Deactivated media was readable through `posts_visible` until 20261066000000.
do $$
declare
  pa uuid := current_setting('b5c.pa')::uuid;
  v_n integer;
begin
  perform pg_temp.act_service();
  insert into public.posts(provider_id, media_url, media_type, is_active, is_demo)
  values (pa, 'https://example.invalid/hidden.mp4', 'video', false, false);
  perform pg_temp.act(null, 'anon');
  select count(*) into v_n from public.posts_visible where is_active = false;
  perform pg_temp.chk('blockedsurfaces',
    'a deactivated post is not readable through the media view', '0', v_n::text);
  perform pg_temp.act_service();
end $$;

-- EVERY view refuses a write, not just the two that were checked first.
do $$
declare
  au uuid := current_setting('b5c.a')::uuid;
  v_bad integer := 0;
  v_rel text;
begin
  perform pg_temp.act(au);
  foreach v_rel in array array['providers_visible','community_posts_visible',
                               'community_replies_visible','posts_visible',
                               'post_comments_visible','barter_offers_visible'] loop
    begin
      execute format('delete from public.%I where false', v_rel);
      v_bad := v_bad + 1;   -- a DELETE that is PERMITTED is the failure
    exception when others then null;
    end;
  end loop;
  perform pg_temp.chk('blockedsurfaces', 'not one of the six views is a write path',
    '0', v_bad::text);
  perform pg_temp.act_service();
end $$;

-- The private-column check, pointed at the columns 20261030000000 ACTUALLY
-- withholds. The first version listed `phone`, `email`, `push_token` and
-- `onboarding_step` — of which only one is even a `providers` column — so it
-- passed for the wrong reason.
select pg_temp.chk('blockedsurfaces', 'the provider view publishes no withheld column', '0',
  (select count(*)::text from information_schema.columns
    where table_schema = 'public' and table_name = 'providers_visible'
      and column_name in ('verification_notes','verification_status','identity_verified',
                          'business_verified','no_show_count','late_count','payment_mode',
                          'stripe_account_id','issue_window_hours')));
-- And it publishes every column a shipped surface filters or orders on. A column
-- that is GRANTED on the table but ABSENT from the view is a query that fails
-- closed — which is how the "Mobile only" filter died silently.
select pg_temp.chk('blockedsurfaces', 'the provider view carries the columns the app filters on',
  '0',
  (select count(*)::text from (values ('is_mobile'),('completed_count'),('is_approved'),
                                      ('average_rating'),('is_featured'),('neighborhood')) as w(c)
    where not exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='providers_visible'
                         and column_name = w.c)));
select pg_temp.chk('blockedsurfaces', 'and the media view carries the ones content search uses',
  '0',
  (select count(*)::text from (values ('thumbnail_url'),('service_type'),('caption'),
                                      ('media_type')) as w(c)
    where not exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='posts_visible'
                         and column_name = w.c)));

-- ══ 4. WHAT THE FILTER MUST NOT TAKE AWAY ═════════════════════════════════
--
-- PD-089 preserves the narrow access an existing transaction needs. The base
-- tables are untouched, which is what makes that true — bookings, threads,
-- reviews and contracts all still read `public.providers`.
do $$
declare
  au uuid := current_setting('b5c.a')::uuid;
  pb uuid := current_setting('b5c.pb')::uuid;
  v_n integer;
begin
  perform pg_temp.act(au);
  -- The blocker can still resolve the blocked provider through the BASE table,
  -- which is how a live booking keeps showing a name, terms and an appointment.
  select count(*) into v_n from public.providers where id = pb;
  perform pg_temp.chk('blockedsurfaces',
    'transaction and history reads still resolve a blocked provider', '1', v_n::text);
  perform pg_temp.act_service();
end $$;

-- ══ 5. UNBLOCKING RESTORES VISIBILITY, BOTH WAYS ══════════════════════════
--
-- Derived from the block row rather than stored, so there is no second state to
-- fall out of step — but "derived" is a claim until something checks it.
do $$
declare
  au uuid := current_setting('b5c.a')::uuid;
  bu uuid := current_setting('b5c.b')::uuid;
  pa uuid := current_setting('b5c.pa')::uuid;
  pb uuid := current_setting('b5c.pb')::uuid;
  v_n integer;
begin
  perform pg_temp.act(au);
  delete from public.user_blocks where blocker_user_id = au and blocked_user_id = bu;
  select count(*) into v_n from public.providers_visible where id = pb;
  perform pg_temp.chk('blockedsurfaces', 'unblocking restores them for the blocker',
    '1', v_n::text);
  perform pg_temp.act(bu);
  select count(*) into v_n from public.providers_visible where id = pa;
  perform pg_temp.chk('blockedsurfaces', 'and restores the blocker for them', '1', v_n::text);
  perform pg_temp.act_service();
end $$;
select pg_temp.act_service();
