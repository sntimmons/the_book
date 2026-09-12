-- FORWARD CORRECTION to 20261120000000 (PD-102 policy J and class A).
--
-- ══ THE GENERIC ASSERTION EARNED ITS KEEP IMMEDIATELY ═════════════════════
--
-- `20261120000000` fixed the four provider-keyed tables a reviewer named, and the
-- suite gained a catalogue-driven assertion — every table with a foreign key to
-- `public.providers` must be either erased by a step or a recorded keeper — on the
-- reasoning that a hand-written list is the thing that drifts.
--
-- It failed on its first run with three tables nobody had mentioned:
--
--     provider_booking_preferences   provider_metrics_daily   provider_profile_views
--
-- Two of them matter, and they matter differently, which is the whole reason the
-- assertion demands a DECISION per table rather than a deletion per table.
--
-- **`provider_booking_preferences` is deleted.** Notice periods, buffers, vacation
-- mode, timezone, same-day rules: these are the settings of a business that no
-- longer exists, hanging off a shell kept only so bookings have something to point
-- at. Policy A, same as the profile fields.
--
-- **`provider_profile_views` carries `viewer_user_id`** — other people's account
-- ids, and the departing person's own when they viewed somebody else. That second
-- half is a miss in `adel_profile_account`, which already nulls the viewer on
-- `post_views` and `provider_booking_clicks` and did not know about this table. So
-- it gets both treatments: the subject's own viewer id is severed wherever it
-- appears, and the rows belonging to their own shell go with the business.
--
-- **`provider_metrics_daily` is KEPT, and that is a decision rather than an
-- oversight.** Every column is an integer count for a date. There is no identity
-- in it — not the provider's, and not a viewer's — so there is nothing in it to
-- erase, and it is the aggregate record of a business that existed. Recorded in
-- the suite's keeper list with that reason so the next person does not have to
-- re-derive it.
create or replace function public.adel_provider_content(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_posts integer := 0; v_queued integer := 0; v_pid uuid;
  v_services integer := 0; v_avail integer := 0; v_blocked integer := 0;
  v_policies integer := 0; v_followers integer := 0; v_prefs integer := 0;
  v_views integer := 0;
begin
  -- UNCONDITIONAL, AND FIRST. Every object under this account's own prefix in
  -- either media bucket, whether it is a provider's portfolio or a client's
  -- avatar. Enqueued before any row is deleted, so a failure between the two
  -- cannot lose the only record of what has to go.
  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select o.bucket_id, o.name, p_subject
      from storage.objects o
     where o.bucket_id in ('provider-media', 'posts-media')
       and o.name like p_subject::text || '/%'
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  select id into v_pid from public.providers where user_id = p_subject;
  if v_pid is null then
    return jsonb_build_object('posts', 0, 'media_queued', v_queued);
  end if;

  with d as (delete from public.posts where provider_id = v_pid returning 1)
  select count(*) into v_posts from d;

  -- THE BUSINESS ITSELF. None of this is retained by any class: the bookings keep
  -- their own service_name snapshot, and the accepted-contract record is the
  -- separate, retained thing. The providers row stays (emptied) because bookings
  -- point at it; what hung off it does not get to stay with it.
  with d as (delete from public.provider_services where provider_id = v_pid returning 1)
  select count(*) into v_services from d;
  with d as (delete from public.provider_availability where provider_id = v_pid returning 1)
  select count(*) into v_avail from d;
  with d as (delete from public.provider_blocked_dates where provider_id = v_pid returning 1)
  select count(*) into v_blocked from d;
  with d as (delete from public.provider_policies where provider_id = v_pid returning 1)
  select count(*) into v_policies from d;
  with d as (
    delete from public.provider_booking_preferences where provider_id = v_pid returning 1
  ) select count(*) into v_prefs from d;
  -- Inbound follows: `adel_profile_account` removes the ones this person MADE;
  -- these are the ones made TO them, and they are a list of other people.
  with d as (delete from public.provider_follows where provider_id = v_pid returning 1)
  select count(*) into v_followers from d;
  -- Profile views of this shell. Aggregate in purpose, but each row names a viewer.
  with d as (delete from public.provider_profile_views where provider_id = v_pid returning 1)
  select count(*) into v_views from d;

  -- NOT DELETED, deliberately: provider_metrics_daily is integer counts per date
  -- with no identity of any kind in it. There is nothing in it to erase.

  return jsonb_build_object('posts', v_posts, 'media_queued', v_queued,
                            'services', v_services, 'availability', v_avail,
                            'blocked_dates', v_blocked, 'policies', v_policies,
                            'booking_preferences', v_prefs,
                            'inbound_follows', v_followers, 'profile_views', v_views);
end $$;

alter function public.adel_provider_content(uuid) owner to postgres;
revoke all on function public.adel_provider_content(uuid) from public, anon, authenticated;

-- ── AND THE VIEWER IDENTITY THIS PERSON LEFT ON OTHER PROVIDERS ───────────
create or replace function public.adel_profile_account(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_prov integer := 0; v_client integer := 0; v_auth integer := 0; v_misc integer := 0;
begin
  with u as (
    update public.providers
       set user_id = null,
           display_name = 'Former member',
           username = 'former_' || left(replace(id::text, '-', ''), 23),
           specialties = '{}'::text[],
           business_name = null, bio = null,
           location = null, neighborhood = null,
           profile_photo_url = null, cover_image_url = null,
           custom_category = null,
           is_approved = false, is_featured = false, is_trending = false,
           next_available = null
     where user_id = p_subject
    returning 1
  ) select count(*) into v_prov from u;

  with d as (delete from public.clients where id = p_subject returning 1)
  select count(*) into v_client from d;

  delete from public.saved_providers  where user_id = p_subject;
  delete from public.provider_follows where follower_user_id = p_subject;
  delete from public.post_likes       where user_id = p_subject;
  delete from public.post_saves       where user_id = p_subject;
  delete from public.community_post_likes where user_id = p_subject;
  delete from public.community_bookmarks  where user_id = p_subject;
  delete from public.care_reminders   where client_user_id = p_subject;
  delete from public.feature_interest where user_id = p_subject;
  delete from public.rate_limit_log   where user_id = p_subject;
  delete from public.user_blocks      where blocker_user_id = p_subject
                                          or blocked_user_id = p_subject;
  get diagnostics v_misc = row_count;

  -- ANALYTICS IDENTITY. The rows are aggregate, the viewer is not. All THREE
  -- tables that name a viewer — provider_profile_views was missed until the
  -- catalogue-driven assertion in 20261123000000 went looking.
  update public.post_views              set viewer_user_id = null where viewer_user_id = p_subject;
  update public.provider_booking_clicks set viewer_user_id = null where viewer_user_id = p_subject;
  update public.provider_profile_views  set viewer_user_id = null where viewer_user_id = p_subject;

  -- THE CREDENTIALS, LAST. Every cascade this fires now has nothing left to take:
  -- that is what the preceding steps were for. Deleting the auth row is also what
  -- revokes the sessions — GoTrue refresh tokens cascade from it, so an old access
  -- token cannot be renewed once it expires.
  with d as (delete from auth.users where id = p_subject returning 1)
  select count(*) into v_auth from d;

  return jsonb_build_object('providers_emptied', v_prov, 'clients_deleted', v_client,
                            'auth_deleted', v_auth, 'personal_rows', v_misc);
end $$;

alter function public.adel_profile_account(uuid) owner to postgres;
revoke all on function public.adel_profile_account(uuid) from public, anon, authenticated;
