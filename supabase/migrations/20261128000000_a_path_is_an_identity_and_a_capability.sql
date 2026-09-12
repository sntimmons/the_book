-- FORWARD CORRECTION to 20261124000000 / 20261125000000 / 20261126000000, and to
-- 20261072000000 / 20261076000000 / 20261114000000 underneath them. From the
-- security review of `0d5d4be`.
--
-- ══ THE SHAPE OF ALL OF THIS: A STORAGE PATH IS TWO THINGS AT ONCE ════════
--
-- `booking_reference_photos.storage_path` is `<auth uid>/<booking id>/<n>.<ext>`
-- (`lib/bookingPhotos.ts:104`). It is therefore **an identity** — it contains the
-- uploader's real `auth.users` id — and **a capability** — the erasure engine
-- feeds it to a `service_role` Storage API delete, and `can_read_booking_photo`
-- resolves object access through it. It was bound as neither.
--
-- ── (1) IT WAS AN IDENTITY NOBODY REVOKED (SEC-AUTHZ-002, PD-105) ─────────
--
-- `20261108000000:47-49` revoked the table-level SELECT and re-granted the
-- ordinary columns by name, correctly withholding `uploader_subject_id` — and
-- left `storage_path` in the grant, **which carries the same id in text form**.
-- A counterparty provider reads it (`20261072000000:68-80`), so after an erasure
-- two providers who each hold one booking with a reference photo can compare
-- path prefixes, find them equal, and learn both that the two pseudonyms are one
-- person and what that person's auth id was. That is the exact resolution PD-105
-- forbids — through normal application data, by an auth id — and the
-- relationship pseudonyms `20261124000000` introduced do not touch it.
--
-- **The sever now covers the path as well as the id.** The real path moves to a
-- restricted column the purge reads, and the granted column becomes
-- `erased/<row id>`: NOT NULL, unique within the booking, and tracing to nobody.
--
-- **This has a product consequence and it is not hidden.** `can_read_booking_photo`
-- resolves on `storage_path`, so once severed a provider can no longer open a
-- departed client's reference photos. The row survives on its 90-day clock so the
-- BYTES are deleted on schedule, which is what policy D is about; continued
-- viewing was never the promise. Flagged for the PM rather than assumed.
--
-- ── (2) IT WAS A CAPABILITY NOBODY BOUND (SEC-AUTHZ-001) ──────────────────
--
-- `booking_photos_client_insert` (`20261076000000:99-108`) pins
-- `uploaded_by_user_id` and requires the booking to be the caller's own
-- unsubmitted draft. **It never constrains `storage_path`**, which is free text.
-- Every write policy on `storage.objects` pins `(storage.foldername(name))[1] =
-- auth.uid()::text`; this row, which NAMES such an object, pinned nothing.
--
-- Harmless while nothing acted on the column. `scripts/account-deletion-worker.mjs`
-- makes it act: a caller inserts a row on their own draft naming somebody else's
-- object path, requests deletion, and at the photo-purge date the engine enqueues
-- that path and the worker deletes it **as service_role, bypassing every storage
-- policy** — destroying booking evidence that `20261076000000` exists to make
-- undeletable after submit.
--
-- Closed twice over, because either alone leaves the other's rows: the path is
-- bound to the caller's own prefix ON INSERT, and the purge enqueues only paths
-- under the subject's own prefix, so a row forged before this migration is inert.

-- ── 1. The path is severed like the identity it contains ─────────────────
alter table public.booking_reference_photos
  add column if not exists storage_path_restricted text;

comment on column public.booking_reference_photos.storage_path_restricted is
  'RESTRICTED. The real object path, after the granted `storage_path` was severed '
  'at erasure. It exists because the path is `<auth uid>/<booking id>/<n>` and the '
  'granted column would otherwise keep publishing the erased account''s auth id to '
  'the counterparty provider (PD-105) — while the purge still has to find the '
  'object on its own 90-day clock. Absent from every client column grant.';

-- The re-grant is restated in full rather than added to: a column-level grant is
-- the whole list, and `20261107000000` had to correct this exact mistake twice.
revoke select on public.booking_reference_photos from anon, authenticated;
grant select (id, booking_id, storage_path, uploaded_by_user_id, created_at)
  on public.booking_reference_photos to authenticated;

create or replace function public.adel_booking_photos_sever(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0;
begin
  -- The identity comes off the row AND out of the path in one statement. The
  -- replacement is derived from the row's own id: NOT NULL, unique within the
  -- booking by construction, and tracing to nobody — the same shape
  -- `20261108000000` gave the emptied provider's handle.
  with u as (
    update public.booking_reference_photos
       set uploaded_by_user_id = null,
           storage_path_restricted = coalesce(storage_path_restricted, storage_path),
           storage_path = 'erased/' || id::text
     where uploaded_by_user_id = p_subject
    returning 1
  ) select count(*) into v_n from u;
  return jsonb_build_object('severed', v_n);
end $$;
alter function public.adel_booking_photos_sever(uuid) owner to postgres;
revoke all on function public.adel_booking_photos_sever(uuid)
  from public, anon, authenticated;

comment on function public.adel_booking_photos_sever(uuid) is
  'Severs a departing uploader from their booking reference photos: the live id '
  'to NULL (the retention trigger captures it), and the PATH into the restricted '
  'column, because `<auth uid>/<booking id>/<n>` is an identity as surely as the '
  'id column is. After this a provider can no longer open the photo — '
  'can_read_booking_photo resolves on the granted path — and the row survives only '
  'so the bytes are deleted on policy D''s clock.';

-- ── 2. The purge reads the restricted path, and ONLY the subject's own ───
create or replace function public.adel_booking_photos_purge(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rows integer := 0; v_queued integer := 0; v_foreign integer := 0;
begin
  -- THE PREFIX IS CHECKED, not assumed. `storage_path` was free text on INSERT
  -- until this migration, so a row written earlier may name an object belonging
  -- to somebody else — and this queue feeds a service_role delete that bypasses
  -- every storage policy. A path outside the subject's own prefix is counted and
  -- left alone rather than deleted.
  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select 'booking-photos', p.storage_path_restricted, p_subject
      from public.booking_reference_photos p
     where p.uploader_subject_id = p_subject
       and p.storage_path_restricted like p_subject::text || '/%'
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  select count(*) into v_foreign from public.booking_reference_photos p
   where p.uploader_subject_id = p_subject
     and (p.storage_path_restricted is null
       or p.storage_path_restricted not like p_subject::text || '/%');

  with d as (
    delete from public.booking_reference_photos where uploader_subject_id = p_subject returning 1
  ) select count(*) into v_rows from d;

  return jsonb_build_object('rows', v_rows, 'media_queued', v_queued,
                            'foreign_paths_skipped', v_foreign);
end $$;
alter function public.adel_booking_photos_purge(uuid) owner to postgres;
revoke all on function public.adel_booking_photos_purge(uuid)
  from public, anon, authenticated;

-- The later-of calculation keys on the same rows; restated so the pair cannot
-- drift, which is the failure `20260912000000:26-28` names for the pair key.
comment on function public.adel_booking_photos_purge(uuid) is
  'Deletes the photo ROWS and queues their BYTES, on policy D''s clock. Queues '
  'only paths under the subject''s own prefix: the queue feeds a service_role '
  'Storage delete that bypasses every policy, and `storage_path` was unbound free '
  'text until 20261128000000. A foreign path is reported in the step result '
  'rather than acted on.';

-- ── 3. And bound at the source, so no new forged row is written ──────────
create or replace function public.enforce_booking_photo_path_is_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  -- The same rule every storage.objects write policy applies to the object
  -- itself. The row that NAMES the object had no equivalent, which is how a
  -- pointer to somebody else's bytes became insertable.
  if new.storage_path is null
     or (string_to_array(new.storage_path, '/'))[1] is distinct from (select auth.uid())::text then
    raise exception 'A reference photo must live in your own folder.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
alter function public.enforce_booking_photo_path_is_own() owner to postgres;
revoke all on function public.enforce_booking_photo_path_is_own()
  from public, anon, authenticated;

drop trigger if exists a_booking_photos_path_is_own on public.booking_reference_photos;
create trigger a_booking_photos_path_is_own
  before insert on public.booking_reference_photos
  for each row execute function public.enforce_booking_photo_path_is_own();

-- ── 4. The contract-artifact exclusions were not scoped to the subject ───
--
-- SEC-DATA-001. The three `not exists` clauses in `20261126000000:104-124` asked
-- whether ANY row in the whole table named the object — and `contracts.pdf_url`
-- is free text under its owner's control (`20261031000000:76-93`). So anybody
-- who knew one object name under a departing account's `contract-pdfs` prefix
-- could point their OWN `pdf_url` at it and the erasure would skip it: never
-- queued, `media_purge` sees nothing outstanding, request reports `completed`
-- with the bytes still there. Exactly the "success with the bytes in the bucket"
-- failure `20261107000000` was written to remove, reachable by a third party.
--
-- Scoped to the subject's own rows, which is what (a) and (b) already do.
create or replace function public.adel_contract_artifacts(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_contracts integer := 0; v_versions integer := 0; v_queued integer := 0;
begin
  with d as (
    delete from public.contracts c
     where c.user_id = p_subject
       and not exists (select 1 from public.contract_signatures s where s.contract_id = c.id)
    returning 1
  ) select count(*) into v_contracts from d;

  with d as (
    delete from public.contract_versions v
     where exists (select 1 from public.contracts c
                    where c.id = v.contract_id and c.user_id = p_subject)
       and not exists (select 1 from public.contract_signatures s
                        where s.contract_version_id = v.id)
    returning 1
  ) select count(*) into v_versions from d;

  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select o.bucket_id, o.name, p_subject
      from storage.objects o
     where o.bucket_id in ('contract-pdfs', 'contract-signatures')
       and o.name like p_subject::text || '/%'
       -- SCOPED. Only THIS subject's surviving rows may keep THIS subject's
       -- object; a third party naming it has no claim on it.
       and not exists (
         select 1 from public.contract_versions v
           join public.contracts c on c.id = v.contract_id
          where c.user_id = p_subject
            and v.pdf_url is not null
            and split_part(split_part(v.pdf_url, '/contract-pdfs/', 2), '?', 1) = o.name)
       and not exists (
         select 1 from public.contracts c
          where c.user_id = p_subject
            and c.pdf_url is not null
            and split_part(split_part(c.pdf_url, '/contract-pdfs/', 2), '?', 1) = o.name)
       and not exists (
         select 1 from public.contract_signatures s
          where s.client_user_id = p_subject
            and s.signature_url is not null
            and split_part(split_part(s.signature_url, '/contract-signatures/', 2), '?', 1) = o.name)
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  return jsonb_build_object('drafts_deleted', v_contracts,
                            'unaccepted_versions_deleted', v_versions,
                            'objects_queued', v_queued);
end $$;
alter function public.adel_contract_artifacts(uuid) owner to postgres;
revoke all on function public.adel_contract_artifacts(uuid) from public, anon, authenticated;

-- ── 5. ONE CLASS MAPPING, WRITTEN IN THREE PLACES, UPDATED IN ONE ────────
--
-- SEC-DATA-003. `20261126000000:203-207` taught `run_account_deletion_step` that
-- `contract_artifacts` answers to the `accepted_contracts` hold class, and the
-- SAME `case` expression appears in `sweep_account_deletions` and in
-- `release_account_deletion_hold`. Both still fell through to
-- `else s.step_key end`, yielding `'contract_artifacts'` — a value
-- `account_deletion_holds_class_check` forbids, so no hold could ever match it.
--
-- The consequences point in opposite directions and neither is acceptable: the
-- sweep un-held the step on every pass while the hold was open (it was re-held
-- immediately by `run_account_deletion_step`, so nothing was destroyed, but the
-- request flipped completed→failed→completed forever), and the release path
-- never matched the step it should have freed — working only by accident,
-- through the sweep's opposite bug.
--
-- A rule written in three places is a rule that will be updated in one.
-- Body from the LAST definition (`20261122000000:22`), one branch added.
create or replace function public.release_account_deletion_hold(p_hold_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_hold public.account_deletion_holds%rowtype; v_class text;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Releasing a hold is not client-callable.' using errcode = '42501';
  end if;

  select * into v_hold from public.account_deletion_holds where id = p_hold_id for update;
  if not found then
    raise exception 'No such hold.' using errcode = 'check_violation';
  end if;
  if v_hold.released_at is not null then
    return 'already_released';
  end if;

  update public.account_deletion_holds
     set released_at = now(), released_by_user_id = (select auth.uid())
   where id = p_hold_id;

  v_class := v_hold.record_class;

  -- The held steps of that class become runnable again. The purge steps are left
  -- to `finalize_account_deletion`, which recomputes their due date and their
  -- held-or-scheduled status from the retention window as it stands now.
  update public.account_deletion_steps s
     set status = 'pending', last_error = null
   where s.request_id = v_hold.request_id
     and s.status = 'held'
     and s.step_key not in ('booking_photos_purge', 'messages_purge')
     and case s.step_key
           when 'booking_photos_sever' then 'booking_photos'
           when 'messages_sever' then 'messages'
           when 'contract_artifacts' then 'accepted_contracts'
           else s.step_key end = v_class;

  -- And the request is put back where the sweep will find it. `failed` is the
  -- existing resume state and the sweep already selects it, so the recovery path
  -- stays the single sentence it has always been: run the sweep again. The
  -- completion stamp goes with the completion — a request with work left is not
  -- completed, and the CHECK constraint says so.
  update public.account_deletion_requests q
     set status = 'failed',
         completed_at = null,
         last_error = format('resumed: hold on %s released', v_class)
   where q.id = v_hold.request_id
     and q.status in ('completed', 'failed', 'finalizing')
     and exists (select 1 from public.account_deletion_steps s2
                  where s2.request_id = v_hold.request_id
                    and s2.status in ('pending', 'running', 'held', 'failed'));

  return 'released';
end;
$$;

alter function public.release_account_deletion_hold(uuid) owner to postgres;
revoke all on function public.release_account_deletion_hold(uuid) from public, anon, authenticated;

-- Body from the LAST definition (`20261122000000:85`), one branch added.
create or replace function public.sweep_account_deletions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid; v_finalized integer := 0; v_purged integer := 0; v_retried integer := 0;
  v_held integer := 0; r record; v_locked uuid; v_class text;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'The deletion sweep is not client-callable.' using errcode = '42501';
  end if;

  -- RE-QUEUE FIRST. A step held for a class whose hold is gone, or a purge held
  -- because its retention window was unset and has since been configured, is work
  -- nothing else will ever pick up. Only an actually-unblocked step moves, so this
  -- terminates rather than flapping a completed request back and forth.
  update public.account_deletion_steps s
     set status = 'pending', last_error = null
   where s.status = 'held'
     and s.step_key not in ('booking_photos_purge', 'messages_purge')
     and not exists (
       select 1 from public.account_deletion_holds h
        where h.request_id = s.request_id
          and h.released_at is null
          and h.record_class = case s.step_key
                                 when 'booking_photos_sever' then 'booking_photos'
                                 when 'messages_sever' then 'messages'
                                 when 'contract_artifacts' then 'accepted_contracts'
                                 else s.step_key end);

  update public.account_deletion_requests q
     set status = 'failed',
         completed_at = null,
         last_error = 'resumed: previously held work is runnable'
   where q.status = 'completed'
     and exists (select 1 from public.account_deletion_steps s
                  where s.request_id = q.id
                    and s.status in ('pending', 'running', 'failed'));

  for v_id in
    select id from public.account_deletion_requests
     where status in ('grace_period', 'failed') and grace_ends_at <= now()
     order by grace_ends_at
  loop
    perform public.finalize_account_deletion(v_id);
    v_finalized := v_finalized + 1;
  end loop;

  for r in
    select s.id, s.step_key, s.status, s.request_id, q.subject_id
      from public.account_deletion_steps s
      join public.account_deletion_requests q on q.id = s.request_id
     where s.step_key in ('booking_photos_purge', 'messages_purge')
       and s.status in ('scheduled', 'failed')
       and s.due_at is not null and s.due_at <= now()
     order by s.due_at
  loop
    begin
      v_class := case r.step_key when 'booking_photos_purge' then 'booking_photos'
                                 else 'messages' end;
      if exists (select 1 from public.account_deletion_holds h
                  where h.request_id = r.request_id
                    and h.record_class = v_class and h.released_at is null) then
        update public.account_deletion_steps
           set status = 'held',
               last_error = format('held: an open hold on %s covers this purge', v_class)
         where id = r.id;
        v_held := v_held + 1;
        continue;
      end if;

      select id into v_locked from public.account_deletion_steps
       where id = r.id and status in ('scheduled', 'failed') for update skip locked;
      if v_locked is null then
        continue;
      end if;

      if r.step_key = 'booking_photos_purge' then
        update public.account_deletion_steps
           set status = 'completed', completed_at = now(), last_error = null,
               attempts = attempts + 1,
               result = public.adel_booking_photos_purge(r.subject_id)
         where id = r.id;
      elsif r.step_key = 'messages_purge' then
        update public.account_deletion_steps
           set status = 'completed', completed_at = now(), last_error = null,
               attempts = attempts + 1,
               result = public.adel_messages_purge(r.subject_id)
         where id = r.id;
      end if;
      v_purged := v_purged + 1;
      if r.status = 'failed' then v_retried := v_retried + 1; end if;
    exception when others then
      update public.account_deletion_steps
         set status = 'failed', attempts = attempts + 1,
             last_error = left(sqlstate || ': ' || sqlerrm, 4000)
       where id = r.id;
    end;
  end loop;

  return jsonb_build_object('finalized', v_finalized, 'purged', v_purged,
                            'retried', v_retried, 'held', v_held);
end;
$$;

alter function public.sweep_account_deletions() owner to postgres;
revoke all on function public.sweep_account_deletions() from public, anon, authenticated;

-- ── 6. A PURGE CANNOT COMPLETE BEFORE ITS SEVER DOES ─────────────────────
--
-- Body from the LAST definition (`20261126000000`), with the sever status
-- consulted before each purge step is written.
create or replace function public.finalize_account_deletion(p_request_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_req         public.account_deletion_requests%rowtype;
  v_key         text;
  v_pending     integer;
  v_failed      integer;
  v_photo_due   timestamptz;
  v_msg_due     timestamptz;
  v_photo_days  integer := public.retention_days('booking_photos');
  v_msg_days    integer := public.retention_days('messages');
  v_photo_sever text;
  v_msg_sever   text;
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
  -- THE DATE, in every non-terminal state.
  if v_req.grace_ends_at > now() then
    return 'grace_period';
  end if;

  update public.account_deletion_requests
     set status = 'finalizing',
         finalizing_started_at = coalesce(finalizing_started_at, now()),
         attempts = attempts + 1
   where id = p_request_id;

  -- A REQUEST MADE BEFORE A STEP EXISTED STILL HAS TO RUN IT. Step rows are
  -- seeded at REQUEST time (`20261115000000:100`), so adding a class leaves every
  -- in-flight request without that row — and `run_account_deletion_step` raises
  -- "No such deletion step" OUTSIDE its own exception block, which aborts the
  -- whole finalisation rather than failing one step. Seeding the missing keys
  -- here makes adding a class safe for requests already in the grace period, and
  -- it is why this correction ships with the class that first needed it.
  insert into public.account_deletion_steps (request_id, step_key)
  select p_request_id, k from unnest(public.account_deletion_step_keys()) k
  on conflict (request_id, step_key) do nothing;

  foreach v_key in array public.account_deletion_step_keys() loop
    perform public.run_account_deletion_step(p_request_id, v_key);
  end loop;

  -- A PURGE WHOSE SEVER NEVER RAN MUST NOT REPORT `completed` (SEC-DATA-004).
  -- The purge finds its rows through what the sever wrote — the restricted
  -- subject for photos, the relationship pseudonyms for messages. If the sever
  -- was HELD, neither exists, the due date computes to NULL, and the branch below
  -- would have written the purge as `completed` — which the `on conflict` clause
  -- then pins forever, because a completed purge is never rewritten and the sweep
  -- only picks up `scheduled` and `failed`. Releasing the hold later would run the
  -- sever and never the purge: a 180-day window silently becoming forever, which
  -- is the failure 20261114000000 was written to remove, in a third place.
  select status into v_photo_sever from public.account_deletion_steps
   where request_id = p_request_id and step_key = 'booking_photos_sever';
  select status into v_msg_sever from public.account_deletion_steps
   where request_id = p_request_id and step_key = 'messages_sever';

  if v_photo_days is not null then
    select max(greatest(
             coalesce(b.completed_at, b.cancelled_at, b.created_at)
               + make_interval(days => v_photo_days),
             v_req.grace_ends_at))
      into v_photo_due
      from public.booking_reference_photos p
      join public.bookings b on b.id = p.booking_id
     where p.uploader_subject_id = v_req.subject_id;
  end if;

  if v_msg_days is not null then
    select max(greatest(
             coalesce(c.last_message_at, c.created_at)
               + make_interval(days => v_msg_days),
             v_req.grace_ends_at))
      into v_msg_due
      from public.messages m
      join public.conversation c on c.id = m.conversation_id
     where m.sender_id in (select pid from public.erasure_pseudonyms_for(v_req.subject_id) pid);
  end if;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'booking_photos_purge',
          case when v_photo_sever is distinct from 'completed' then 'held'
               when v_photo_days is null then 'held'
               when v_photo_due  is null then 'completed'
               else 'scheduled' end,
          v_photo_due,
          case when v_photo_sever is distinct from 'completed'
               then 'held: booking_photos_sever has not completed, so this purge has nothing to find yet'
               when v_photo_days is null
               then 'retention_policy.booking_photos has no window set; nothing scheduled and nothing skipped'
               else null end)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        last_error = excluded.last_error,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'messages_purge',
          case when v_msg_sever is distinct from 'completed' then 'held'
               when v_msg_days is null then 'held'
               when v_msg_due  is null then 'completed'
               else 'scheduled' end,
          v_msg_due,
          case when v_msg_sever is distinct from 'completed'
               then 'held: messages_sever has not completed, so this purge has nothing to find yet'
               when v_msg_days is null
               then 'retention_policy.messages has no window set; nothing scheduled and nothing skipped'
               else null end)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        last_error = excluded.last_error,
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

-- ── 7. TWO TRIGGERS SAYING THE SAME THING ON THE SAME TABLE ──────────────
--
-- SEC-MIGRATION-001. `20261102000000:155-158` already refuses INSERT on `posts`
-- and `community_posts` for a deactivated caller, and `20261125000000` attached a
-- second `before insert or update` gate to both. Both refuse, so the behaviour
-- was never wrong — but a trigger listing showing two rules with one job is a
-- listing nobody can read an intent off, and narrowing one later would silently
-- leave the other. The new gate is narrowed to the verb it was actually added
-- for: the UPDATE that `20261102000000` never covered.
drop trigger if exists b_posts_refuse_edit_when_inactive on public.posts;
create trigger b_posts_refuse_edit_when_inactive
  before update on public.posts
  for each row execute function public.refuse_row_write_when_account_inactive(
    'provider', 'provider_id', 'like_count,comment_count,save_count,view_count,engagement_score');

drop trigger if exists b_community_posts_refuse_edit_when_inactive on public.community_posts;
create trigger b_community_posts_refuse_edit_when_inactive
  before update on public.community_posts
  for each row execute function public.refuse_row_write_when_account_inactive(
    'user', 'user_id', 'like_count,reply_count,updated_at');
