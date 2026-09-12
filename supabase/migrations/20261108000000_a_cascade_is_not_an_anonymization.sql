-- FORWARD CORRECTION to 20261104000000 / 20261107000000 (Account erasure).
--
-- ══ 1. THE HANDLE HAS A FORMAT, AND I IGNORED IT ══════════════════════════
--
-- `providers.username` carries `CHECK (username ~ '^[a-z0-9_]{3,30}$')`. The
-- emptied shell was given `'former_' || <32 hex chars>` — 39 characters — so the
-- profile step failed and the account was not erased at all. Trimmed to fit, and
-- still unique: 23 hex characters of the row's own id.
--
-- ══ 2. A CASCADE IS NOT AN ANONYMIZATION ══════════════════════════════════
--
-- The engine writes a pseudonym into identity columns so history survives. That
-- works only where the column has **no foreign key**: `bookings.user_id`,
-- `messages.sender_id`, `conversation.client_id` and both review tables have
-- none, which is why those steps pass.
--
-- Every barter identity column, and `booking_reference_photos.uploaded_by_user_id`,
-- is `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`. A pseudonym is not a
-- real auth id, so the write is refused by the foreign key; the step fails; and
-- then the profile step deletes the auth row and the **CASCADE destroys the barter
-- history and the photo record** — precisely what policies H and D forbid.
--
-- The fix is to make the relationship say what the policy says. `SET NULL` on a
-- nullable column IS the anonymization: the row survives, the person does not,
-- and the database performs it rather than the engine having to remember to.
--
-- **What survives NULLing, and why that is enough:** every barter row also
-- carries `*_provider_id`, which points at the provider row — and the provider
-- row is KEPT (emptied) rather than deleted, precisely so records like these
-- retain which business was involved. Terms, status and outcome are untouched.

alter table public.booking_reference_photos
  add column if not exists uploader_subject_id uuid;
alter table public.booking_reference_photos alter column uploaded_by_user_id drop not null;
alter table public.booking_reference_photos
  drop constraint if exists booking_reference_photos_uploaded_by_user_id_fkey;
alter table public.booking_reference_photos
  add constraint booking_reference_photos_uploaded_by_user_id_fkey
  foreign key (uploaded_by_user_id) references auth.users(id) on delete set null;

comment on column public.booking_reference_photos.uploader_subject_id is
  'RESTRICTED. Who uploaded this photo, after their account was erased. The photo '
  'outlives the account by design — policy D counts 90 days from the BOOKING, and '
  'the effective date is the later of that and the grace-period end — so the row '
  'has to survive the auth delete and the purge has to be able to find it again.';

revoke select on public.booking_reference_photos from anon, authenticated;
grant select (id, booking_id, storage_path, uploaded_by_user_id, created_at)
  on public.booking_reference_photos to authenticated;

-- The barter identity columns: nullable, and severed by the database.
do $$
declare r record;
begin
  for r in
    select c.relname as tbl, a.attname as col, con.conname
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_class rc on rc.oid = con.confrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
      join unnest(con.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
     where con.contype = 'f' and n.nspname = 'public'
       and rn.nspname = 'auth' and rc.relname = 'users'
       and c.relname like 'barter%'
       and con.confdeltype = 'c'          -- currently CASCADE
  loop
    execute format('alter table public.%I alter column %I drop not null', r.tbl, r.col);
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      r.tbl, r.conname, r.col);
  end loop;
end $$;

-- Barter version acceptances are ACCEPTANCE EVIDENCE, and policy H routes those
-- to the contract policy — so this one keeps a restricted party identity rather
-- than becoming anonymous. `retain_identity_on_sever` fills it in automatically
-- when the referential action empties the live column.
alter table public.barter_version_acceptances
  add column if not exists participant_subject_id uuid;

comment on column public.barter_version_acceptances.participant_subject_id is
  'RESTRICTED. Who accepted this version, retained after erasure. Policy H sends '
  'accepted terms to the CONTRACT policy, and an acceptance that cannot say who '
  'accepted is not evidence of an agreement. Populated by '
  'retain_identity_on_sever when the live column is severed.';

create or replace function public.retain_identity_on_sever()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'reports' then
    if old.reported_user_id is not null and new.reported_user_id is null
       and new.reported_subject_id is null then
      new.reported_subject_id := old.reported_user_id;
    end if;
    if old.reporter_user_id is not null and new.reporter_user_id is null
       and new.reporter_subject_id is null then
      new.reporter_subject_id := old.reporter_user_id;
    end if;
  elsif tg_table_name = 'contract_signatures' then
    if old.client_user_id is not null and new.client_user_id is null
       and new.signer_subject_id is null then
      new.signer_subject_id := old.client_user_id;
    end if;
  elsif tg_table_name = 'operator_case_events' then
    if old.actor_user_id is not null and new.actor_user_id is null
       and new.actor_subject_id is null then
      new.actor_subject_id := old.actor_user_id;
    end if;
  elsif tg_table_name = 'community_moderation_actions' then
    if old.actor_user_id is not null and new.actor_user_id is null
       and new.actor_subject_id is null then
      new.actor_subject_id := old.actor_user_id;
    end if;
  elsif tg_table_name = 'barter_version_acceptances' then
    if old.participant_user_id is not null and new.participant_user_id is null
       and new.participant_subject_id is null then
      new.participant_subject_id := old.participant_user_id;
    end if;
  elsif tg_table_name = 'booking_reference_photos' then
    if old.uploaded_by_user_id is not null and new.uploaded_by_user_id is null
       and new.uploader_subject_id is null then
      new.uploader_subject_id := old.uploaded_by_user_id;
    end if;
  end if;
  return new;
end;
$$;
alter function public.retain_identity_on_sever() owner to postgres;
revoke all on function public.retain_identity_on_sever() from public, anon, authenticated;

drop trigger if exists a_barter_acceptances_retain_identity on public.barter_version_acceptances;
create trigger a_barter_acceptances_retain_identity
  before update on public.barter_version_acceptances
  for each row execute function public.retain_identity_on_sever();

drop trigger if exists a_booking_photos_retain_identity on public.booking_reference_photos;
create trigger a_booking_photos_retain_identity
  before update on public.booking_reference_photos
  for each row execute function public.retain_identity_on_sever();

-- ── The steps that were writing an impossible value ──────────────────────
create or replace function public.adel_booking_photos_sever(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0;
begin
  -- NULL, not a pseudonym: the column has a foreign key, and the retention
  -- trigger captures the departing id into the restricted column in the same
  -- statement so the purge can still find these later.
  with u as (
    update public.booking_reference_photos
       set uploaded_by_user_id = null
     where uploaded_by_user_id = p_subject
    returning 1
  ) select count(*) into v_n from u;
  return jsonb_build_object('severed', v_n);
end $$;

create or replace function public.adel_booking_photos_purge(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rows integer := 0; v_queued integer := 0;
begin
  -- Found by the RESTRICTED SUBJECT, which is why it is retained at all.
  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select 'booking-photos', p.storage_path, p_subject
      from public.booking_reference_photos p
     where p.uploader_subject_id = p_subject
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  with d as (
    delete from public.booking_reference_photos where uploader_subject_id = p_subject returning 1
  ) select count(*) into v_rows from d;

  return jsonb_build_object('rows', v_rows, 'media_queued', v_queued);
end $$;

create or replace function public.adel_barter(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare n integer := 0; total integer := 0;
begin
  -- NULL, not a pseudonym, on every one of these: they all carry a foreign key,
  -- and what identifies the PARTY is the surviving `*_provider_id` pointing at
  -- the emptied provider shell. Terms, status and outcome are untouched, which is
  -- what policy H preserves.
  update public.barter_offers set user_id = null where user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_interests set interested_user_id = null where interested_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposals set owner_user_id = null where owner_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposals set responder_user_id = null where responder_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposal_versions set author_user_id = null where author_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_proposal_terms set provider_user_id = null where provider_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  -- Acceptance evidence keeps its party, restricted (policy H → policy C).
  update public.barter_version_acceptances set participant_user_id = null
   where participant_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_agreements set owner_user_id = null where owner_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_agreements set responder_user_id = null where responder_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligations set deliverer_user_id = null where deliverer_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligations set receiver_user_id = null where receiver_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_agreement_cancellations set actor_user_id = null
   where actor_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligation_no_show_reports set reporter_user_id = null
   where reporter_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligation_review_requests set requested_by_user_id = null
   where requested_by_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  update public.barter_obligation_adjudications set adjudicator_user_id = null
   where adjudicator_user_id = p_subject;
  get diagnostics n = row_count; total := total + n;
  return jsonb_build_object('rows', total);
end $$;

create or replace function public.adel_profile_account(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_prov integer := 0; v_client integer := 0; v_auth integer := 0; v_misc integer := 0;
begin
  with u as (
    update public.providers
       set user_id = null,
           display_name = 'Former member',
           -- `CHECK (username ~ '^[a-z0-9_]{3,30}$')`. Seven characters plus 23
           -- hex is exactly 30 — unique by construction, legal by the constraint,
           -- and traceable to nobody.
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

  update public.post_views              set viewer_user_id = null where viewer_user_id = p_subject;
  update public.provider_booking_clicks set viewer_user_id = null where viewer_user_id = p_subject;

  with d as (delete from auth.users where id = p_subject returning 1)
  select count(*) into v_auth from d;

  return jsonb_build_object('providers_emptied', v_prov, 'clients_deleted', v_client,
                            'auth_deleted', v_auth, 'personal_rows', v_misc);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['adel_booking_photos_sever', 'adel_booking_photos_purge',
                            'adel_barter', 'adel_profile_account'] loop
    execute format('alter function public.%I(uuid) owner to postgres', fn);
    execute format('revoke all on function public.%I(uuid) from public, anon, authenticated', fn);
  end loop;
end $$;

-- The photo purge now finds rows by the restricted subject, so the later-of
-- calculation must use the same key.
create or replace function public.finalize_account_deletion(p_request_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_req      public.account_deletion_requests%rowtype;
  v_key      text;
  v_pending  integer;
  v_failed   integer;
  v_photo_due timestamptz;
  v_msg_due  timestamptz;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Finalisation is not client-callable.' using errcode = '42501';
  end if;

  select * into v_req from public.account_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'No such deletion request.' using errcode = 'check_violation';
  end if;
  if v_req.status = 'completed' then return 'completed'; end if;
  if v_req.status = 'cancelled' then return 'cancelled'; end if;
  if v_req.status = 'grace_period' and v_req.grace_ends_at > now() then
    return 'grace_period';
  end if;

  update public.account_deletion_requests
     set status = 'finalizing',
         finalizing_started_at = coalesce(finalizing_started_at, now()),
         attempts = attempts + 1
   where id = p_request_id;

  foreach v_key in array public.account_deletion_step_keys() loop
    perform public.run_account_deletion_step(p_request_id, v_key);
  end loop;

  -- The two two-phase classes, dated by the LATER OF their own window and the
  -- grace-period end — found by the keys that survive erasure.
  select max(later) into v_photo_due from (
    select greatest(
             coalesce(b.completed_at, b.cancelled_at, b.created_at)
               + make_interval(days => coalesce(public.retention_days('booking_photos'), 90)),
             v_req.grace_ends_at) as later
      from public.booking_reference_photos p
      join public.bookings b on b.id = p.booking_id
     where p.uploader_subject_id = v_req.subject_id
  ) x;
  select max(later) into v_msg_due from (
    select greatest(
             coalesce(c.last_message_at, c.created_at)
               + make_interval(days => coalesce(public.retention_days('messages'), 180)),
             v_req.grace_ends_at) as later
      from public.messages m
      join public.conversation c on c.id = m.conversation_id
     where m.sender_id = (select pseudonym_id from public.erased_accounts
                           where subject_id = v_req.subject_id)
  ) x;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at)
  values (p_request_id, 'booking_photos_purge',
          case when v_photo_due is null then 'completed' else 'scheduled' end, v_photo_due)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at)
  values (p_request_id, 'messages_purge',
          case when v_msg_due is null then 'completed' else 'scheduled' end, v_msg_due)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  select count(*) filter (where status in ('pending', 'running')),
         count(*) filter (where status = 'failed')
    into v_pending, v_failed
    from public.account_deletion_steps where request_id = p_request_id;

  if v_failed > 0 or v_pending > 0 then
    update public.account_deletion_requests
       set status = 'failed',
           last_error = format('%s step(s) failed, %s still pending', v_failed, v_pending)
     where id = p_request_id;
    return 'failed';
  end if;

  update public.account_deletion_requests
     set status = 'completed', completed_at = now(), last_error = null
   where id = p_request_id;
  return 'completed';
end;
$$;
alter function public.finalize_account_deletion(uuid) owner to postgres;
revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
