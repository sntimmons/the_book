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
  insert into public.community_posts(provider_id, user_id, content, category, is_active)
    values (pa, au, 'alpha post', 'general', true),
           (pb, bu, 'bravo post', 'general', true),
           (pc, cu, 'charlie post', 'general', true);
  insert into public.community_replies(post_id, provider_id, user_id, content)
    select id, pb, bu, 'bravo reply' from public.community_posts where user_id = cu;
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
                        'community_replies_visible','posts_visible','post_comments_visible')
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

select pg_temp.chk('blockedsurfaces', 'all five PD-089 views exist', '5',
  (select count(*)::text from pg_class c where c.relkind = 'v'
     and c.relname in ('providers_visible','community_posts_visible',
                       'community_replies_visible','posts_visible','post_comments_visible')));

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
