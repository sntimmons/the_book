-- FORWARD CORRECTION to 20261104000000 / 20261106000000 (Account erasure).
--
-- ══ 1. SQL CANNOT DELETE A STORAGE OBJECT, AND I ASSUMED IT COULD ═════════
--
-- `adel_provider_content` deleted from `storage.objects` directly. Supabase
-- refuses it:
--
--     42501: Direct deletion from storage tables is not allowed.
--            Use the Storage API instead.
--
-- So the step failed, and with it the whole finalisation. That is the right
-- outcome for a wrong assumption — but it means **media bytes cannot be erased
-- from inside the database at all**, and the honest response is not to drop the
-- requirement. It is to make the outstanding work VISIBLE and keep the request
-- out of `completed` until somebody has actually done it.
--
-- So the step now ENQUEUES what must be deleted, and a separate `media_purge`
-- step stays outstanding until every queued object has been confirmed deleted
-- through the Storage API. **No deletion reaches `completed` while media is
-- still there**, which is exactly what "incapable of claiming success before all
-- required live-system steps finish" asks for — and it is why this is a queue
-- rather than a comment saying "remember to clear the bucket".
--
-- **OPERATIONS OWES THIS DRAIN.** There is no scheduler and no Edge Function for
-- it in this beta. That limitation is written into the table's own comment and
-- into the Operations note, because a person has to do it and pretending
-- otherwise is how orphaned media survives an erasure.

create table if not exists public.pending_media_deletions (
  id             uuid primary key default gen_random_uuid(),
  bucket_id      text not null,
  object_path    text not null,
  -- The erased account, so a drain can be scoped and audited per subject.
  subject_id     uuid not null,
  request_id     uuid references public.account_deletion_requests(id) on delete set null,
  enqueued_at    timestamptz not null default now(),
  deleted_at     timestamptz,
  attempts       integer not null default 0,
  last_error     text,
  constraint pending_media_deletions_unique unique (bucket_id, object_path)
);

create index if not exists pending_media_deletions_open_idx
  on public.pending_media_deletions (subject_id) where deleted_at is null;

comment on table public.pending_media_deletions is
  'Storage objects that MUST be deleted and cannot be deleted from SQL — Supabase '
  'refuses direct writes to storage.objects and requires the Storage API. Each row '
  'is outstanding work, and the `media_purge` deletion step stays incomplete while '
  'any row for that subject is undeleted, so an erasure cannot report success with '
  'the bytes still in the bucket. **NO SCHEDULER DRAINS THIS IN THIS BETA: an '
  'operator does, through the Storage API, and then calls confirm_media_deleted.**';

alter table public.pending_media_deletions enable row level security;
revoke all on public.pending_media_deletions from public, anon, authenticated;

create or replace function public.confirm_media_deleted(
  p_bucket text, p_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Media confirmation is not client-callable.' using errcode = '42501';
  end if;
  update public.pending_media_deletions
     set deleted_at = now(), last_error = null
   where bucket_id = p_bucket and object_path = p_path and deleted_at is null;
  return found;
end;
$$;
alter function public.confirm_media_deleted(text, text) owner to postgres;
revoke all on function public.confirm_media_deleted(text, text)
  from public, anon, authenticated;

comment on function public.confirm_media_deleted(text, text) is
  'Records that one storage object has ACTUALLY been deleted through the Storage '
  'API. Called after the delete succeeds, never before — the queue exists so that '
  '"the bytes are gone" is something confirmed rather than assumed.';

-- The content step: rows deleted here, bytes enqueued for the API.
create or replace function public.adel_provider_content(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_posts integer := 0; v_queued integer := 0; v_pid uuid;
begin
  select id into v_pid from public.providers where user_id = p_subject;
  if v_pid is null then
    return jsonb_build_object('posts', 0, 'media_queued', 0);
  end if;

  -- The bytes are ENQUEUED BEFORE the rows go, so a failure between the two
  -- cannot lose the only record of what has to be deleted.
  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select o.bucket_id, o.name, p_subject
      from storage.objects o
     where o.bucket_id in ('provider-media', 'posts-media')
       and o.name like p_subject::text || '/%'
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  with d as (delete from public.posts where provider_id = v_pid returning 1)
  select count(*) into v_posts from d;

  return jsonb_build_object('posts', v_posts, 'media_queued', v_queued);
end $$;
alter function public.adel_provider_content(uuid) owner to postgres;
revoke all on function public.adel_provider_content(uuid) from public, anon, authenticated;

-- Booking photos, same correction: the row goes, the object is enqueued.
create or replace function public.adel_booking_photos_purge(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rows integer := 0; v_queued integer := 0; v_pseudo uuid;
begin
  select pseudonym_id into v_pseudo from public.erased_accounts where subject_id = p_subject;
  if v_pseudo is null then return jsonb_build_object('rows', 0, 'media_queued', 0); end if;

  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select 'booking-photos', p.storage_path, p_subject
      from public.booking_reference_photos p
     where p.uploaded_by_user_id = v_pseudo
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  with d as (
    delete from public.booking_reference_photos where uploaded_by_user_id = v_pseudo returning 1
  ) select count(*) into v_rows from d;

  return jsonb_build_object('rows', v_rows, 'media_queued', v_queued);
end $$;
alter function public.adel_booking_photos_purge(uuid) owner to postgres;
revoke all on function public.adel_booking_photos_purge(uuid) from public, anon, authenticated;

-- The step that will not let the job lie about media.
create or replace function public.adel_media_purge(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_open integer;
begin
  select count(*) into v_open from public.pending_media_deletions
   where subject_id = p_subject and deleted_at is null;
  if v_open > 0 then
    raise exception '% storage object(s) still await deletion through the Storage API', v_open
      using errcode = 'PT446';
  end if;
  return jsonb_build_object('outstanding', 0);
end $$;
alter function public.adel_media_purge(uuid) owner to postgres;
revoke all on function public.adel_media_purge(uuid) from public, anon, authenticated;

comment on function public.adel_media_purge(uuid) is
  'Succeeds only when every queued storage object for this subject has been '
  'CONFIRMED deleted. It deletes nothing itself — SQL cannot — and raises while '
  'anything is outstanding, which is what keeps the request out of `completed` '
  'until the bytes are actually gone.';

-- ══ 2. `providers.username` AND `specialties` ARE NOT NULL ════════════════
--
-- The profile step nulled both, and both are `NOT NULL` — `username` is unique as
-- well. The row identified a person and now has to identify nobody WHILE
-- remaining a legal row, so the handle becomes a value derived from the provider
-- id: unique by construction, and carrying no trace of who it was.
create or replace function public.adel_profile_account(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_prov integer := 0; v_client integer := 0; v_auth integer := 0; v_misc integer := 0;
begin
  with u as (
    update public.providers
       set user_id = null,
           display_name = 'Former member',
           -- Unique by construction and derived from a key nobody can trace to a
           -- person, because the column is NOT NULL and UNIQUE and still has to
           -- stop identifying anyone.
           username = 'former_' || replace(id::text, '-', ''),
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

  update public.post_views              set viewer_user_id = null where viewer_user_id = p_subject;
  update public.provider_booking_clicks set viewer_user_id = null where viewer_user_id = p_subject;

  with d as (delete from auth.users where id = p_subject returning 1)
  select count(*) into v_auth from d;

  return jsonb_build_object('providers_emptied', v_prov, 'clients_deleted', v_client,
                            'auth_deleted', v_auth, 'personal_rows', v_misc);
end $$;
alter function public.adel_profile_account(uuid) owner to postgres;
revoke all on function public.adel_profile_account(uuid) from public, anon, authenticated;

-- ══ 3. THE STEP LIST GAINS THE MEDIA GATE ════════════════════════════════
create or replace function public.account_deletion_step_keys()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'provider_content', 'community_content', 'booking_photos_sever', 'messages_sever',
    'bookings', 'reviews', 'barter', 'accepted_contracts', 'reports_evidence',
    'operator_audit',
    'profile_account',   -- the auth row goes here
    'media_purge'        -- and the bytes are only confirmed AFTER it
  ]::text[];
$$;
alter function public.account_deletion_step_keys() owner to postgres;

comment on function public.account_deletion_step_keys() is
  'The data classes, IN EXECUTION ORDER. `profile_account` deletes the auth row '
  'and everything before it exists so the cascades that fires take nothing with '
  'them. `media_purge` is LAST and deliberately after it: it deletes nothing, it '
  'only refuses to pass while storage objects remain unconfirmed — so the request '
  'cannot report success with the bytes still in the bucket.';

create or replace function public.run_account_deletion_step(
  p_request_id uuid, p_step_key text
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_req    public.account_deletion_requests%rowtype;
  v_step   public.account_deletion_steps%rowtype;
  v_result jsonb;
  v_class  text;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Deletion steps are not client-callable.' using errcode = '42501';
  end if;

  select * into v_req from public.account_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'No such deletion request.' using errcode = 'check_violation';
  end if;
  select * into v_step from public.account_deletion_steps
   where request_id = p_request_id and step_key = p_step_key for update;
  if not found then
    raise exception 'No such deletion step: %', p_step_key using errcode = 'check_violation';
  end if;
  if v_step.status = 'completed' then return 'completed'; end if;

  v_class := case p_step_key
               when 'booking_photos_sever' then 'booking_photos'
               when 'messages_sever' then 'messages'
               else p_step_key end;
  if exists (
    select 1 from public.account_deletion_holds h
     where h.request_id = p_request_id and h.record_class = v_class and h.released_at is null
  ) then
    update public.account_deletion_steps set status = 'held', last_error = null
     where id = v_step.id;
    return 'held';
  end if;

  update public.account_deletion_steps
     set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()),
         last_error = null
   where id = v_step.id;

  begin
    v_result := case p_step_key
      when 'provider_content'     then public.adel_provider_content(v_req.subject_id)
      when 'community_content'    then public.adel_community_content(v_req.subject_id)
      when 'booking_photos_sever' then public.adel_booking_photos_sever(v_req.subject_id)
      when 'messages_sever'       then public.adel_messages_sever(v_req.subject_id)
      when 'bookings'             then public.adel_bookings(v_req.subject_id)
      when 'reviews'              then public.adel_reviews(v_req.subject_id)
      when 'barter'               then public.adel_barter(v_req.subject_id)
      when 'accepted_contracts'   then public.adel_accepted_contracts(v_req.subject_id)
      when 'reports_evidence'     then public.adel_reports_evidence(v_req.subject_id)
      when 'operator_audit'       then public.adel_operator_audit(v_req.subject_id)
      when 'profile_account'      then public.adel_profile_account(v_req.subject_id)
      when 'media_purge'          then public.adel_media_purge(v_req.subject_id)
      else null end;

    if v_result is null then
      raise exception 'Unknown deletion step: %', p_step_key using errcode = 'internal_error';
    end if;
    update public.account_deletion_steps
       set status = 'completed', completed_at = now(), result = v_result
     where id = v_step.id;
    return 'completed';
  exception when others then
    update public.account_deletion_steps
       set status = 'failed', last_error = left(sqlstate || ': ' || sqlerrm, 4000)
     where id = v_step.id;
    return 'failed';
  end;
end;
$$;
alter function public.run_account_deletion_step(uuid, text) owner to postgres;
revoke all on function public.run_account_deletion_step(uuid, text)
  from public, anon, authenticated;

-- ══ 4. A COLUMN-LEVEL REVOKE DOES NOT BEAT A TABLE-LEVEL GRANT ═══════════
--
-- `20261103000000` revoked SELECT on the restricted subject columns and it had no
-- effect: both tables carry a TABLE-level grant to `authenticated`, and a
-- table-level privilege covers every column including ones added later. So the
-- retained identities were readable by any signed-in user — the exact opposite of
-- "restricted".
--
-- The fix is the shape `20261052000000` already uses for `reports`: revoke the
-- table-level privilege and re-grant the columns the app actually names. `20261103000000`
-- looked right and did nothing, which is the more dangerous kind of wrong.
revoke select on public.contract_signatures from anon, authenticated;
grant select (id, contract_id, booking_id, client_user_id, signature_url,
              signed_at, status, created_at, contract_version_id)
  on public.contract_signatures to authenticated;

revoke select on public.operator_case_events from anon, authenticated;
grant select (id, case_id, actor_user_id, action, from_status, to_status, note, created_at)
  on public.operator_case_events to authenticated;

comment on column public.contract_signatures.signer_subject_id is
  'RESTRICTED BY PRIVILEGE. The erased signer''s original account id. The '
  'table-level SELECT is revoked from every client role and the ordinary columns '
  're-granted by name, because a column-level revoke does NOT override a '
  'table-level grant — which is how 20261103000000''s revoke came to have no '
  'effect at all. Readable by operators and service_role only. INTERIM '
  'CLOSED-BETA POLICY PENDING ATTORNEY REVIEW, and not a claim of a verified '
  'legal e-signature.';

-- ══ 5. THE MODERATION GUARD'S SEVER ALLOWANCE WAS NARROWED BY MISTAKE ════
--
-- `20261106000000` moved the pointer-sever allowance INSIDE the service_role
-- branch. But a referential SET NULL runs as whoever issued the DELETE — for a
-- post that is its ORDINARY AUTHOR — so the allowance has to be reachable
-- without privilege, which is how `20261099000000` had it. The narrowing broke
-- an author's ability to delete their own moderated post: a regression the
-- community suite caught immediately.
--
-- Restored, with the paired identity retention `20261106000000` added kept.
create or replace function public.enforce_moderation_actions_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return coalesce(new, old);
  end if;

  -- THE SEVER, AVAILABLE TO ANY ROLE, because the cascade that performs it runs
  -- as the author deleting their own post. What may change: a pointer going to
  -- NULL, and the restricted subject taking the id that just left. Nothing else.
  if tg_op = 'UPDATE'
     and new.id          is not distinct from old.id
     and new.target_kind is not distinct from old.target_kind
     and new.action      is not distinct from old.action
     and new.case_id     is not distinct from old.case_id
     and new.note        is not distinct from old.note
     and new.created_at  is not distinct from old.created_at
     and (new.post_id  is not distinct from old.post_id  or new.post_id is null)
     and (new.reply_id is not distinct from old.reply_id or new.reply_id is null)
     and (new.actor_user_id is not distinct from old.actor_user_id or new.actor_user_id is null)
     and (new.actor_subject_id is not distinct from old.actor_subject_id
          or (old.actor_subject_id is null
              and new.actor_subject_id is not distinct from old.actor_user_id))
  then
    return new;
  end if;

  raise exception 'A moderation action is a record of what was done and cannot be changed.'
    using errcode = 'check_violation';
end;
$$;
alter function public.enforce_moderation_actions_append_only() owner to postgres;
revoke all on function public.enforce_moderation_actions_append_only()
  from public, anon, authenticated;

comment on function public.enforce_moderation_actions_append_only() is
  'A moderation action cannot be edited or deleted. ONE exception, reachable by '
  'ANY role because a referential cascade runs as whoever issued the DELETE — for '
  'a post, its ordinary author: a pointer may go to NULL and the restricted '
  'subject may take the id that just left. 20261106000000 narrowed this to '
  'service_role and broke an author''s own delete; the community suite caught it.';
