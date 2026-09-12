-- FORWARD CORRECTION to 20261104000000 / 20261107000000 / 20261108000000 (PD-102).
-- Security review of 5977169: SEC-RLS-003 (HIGH, erasure half), SEC-STORAGE-004,
-- SEC-DATA-008, and two of SEC-DATA-020.
--
-- ══ 1. REEL COMMENTS WERE NOT IN ANY CLASS ════════════════════════════════
--
-- `post_comments.user_id` has NO foreign key to `auth.users` (baseline:935-942).
-- Nothing cascaded, no step touched it, and the whole erasure ran to `completed`
-- leaving a person's comment text in place **under their real account id**,
-- publicly readable. `20261111000000` closed the read; this closes the record.
--
-- They are deleted, not anonymised, because they are the same class as the
-- Community content beside them: short, personal, addressed to a moment, and of
-- no evidentiary or reputational value to anyone else. Nothing references them.
create or replace function public.adel_community_content(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_deleted integer := 0; v_tombstoned integer := 0; v_replies integer := 0;
        v_comments integer := 0;
begin
  with t as (
    update public.community_posts cp
       set content = 'Content removed',
           user_id = null,
           provider_id = null,
           author_kind = 'client',
           service_tag = null, area = null, timing = null,
           tagged_provider_id = null, tagged_booking_id = null,
           intent = case when cp.intent = 'open_today' then 'need_advice' else cp.intent end,
           expires_at = null
     where cp.user_id = p_subject
       and exists (select 1 from public.community_replies r
                    where r.post_id = cp.id and r.user_id is distinct from p_subject)
    returning 1
  ) select count(*) into v_tombstoned from t;

  with d as (delete from public.community_replies where user_id = p_subject returning 1)
  select count(*) into v_replies from d;

  with d as (delete from public.community_posts where user_id = p_subject returning 1)
  select count(*) into v_deleted from d;

  -- Reel comments. No foreign key means nothing else would ever have removed
  -- these; the count is returned so a completed erasure can be shown to have
  -- accounted for them.
  with d as (delete from public.post_comments where user_id = p_subject returning 1)
  select count(*) into v_comments from d;

  return jsonb_build_object('posts_deleted', v_deleted, 'tombstoned', v_tombstoned,
                            'replies_deleted', v_replies, 'comments_deleted', v_comments);
end $$;

alter function public.adel_community_content(uuid) owner to postgres;
revoke all on function public.adel_community_content(uuid) from public, anon, authenticated;

-- ══ 2. A CLIENT'S FACE IS BYTES TOO (SEC-STORAGE-004) ═════════════════════
--
-- `adel_provider_content` enqueued the storage objects — and returned early when
-- the subject had no `providers` row:
--
--     select id into v_pid from public.providers where user_id = p_subject;
--     if v_pid is null then return …
--
-- A CLIENT uploads their avatar to the same bucket under the same
-- `<user id>/profile/…` prefix (`app/me/edit.tsx:162`,
-- `app/onboarding/client/preview.tsx:89` → `lib/storage.ts:38-42`), and
-- `provider-media` is PUBLIC with a non-expiring `getPublicUrl`. So for every
-- client-only account: nothing enqueued, `adel_media_purge` saw zero outstanding,
-- and the request reported **`completed` with the person's face still served**.
--
-- The gate was real and the queue was right. It just never received the one class
-- of object the majority of accounts have. Enqueuing now happens FIRST and
-- unconditionally — it is keyed on the subject's own storage prefix, which exists
-- whether or not they were ever a provider.
create or replace function public.adel_provider_content(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_posts integer := 0; v_queued integer := 0; v_pid uuid;
begin
  -- UNCONDITIONAL, AND FIRST. Every object under this account's own prefix, in
  -- either media bucket, whether it is a provider's portfolio or a client's
  -- avatar. Enqueued before any row is deleted so a failure between the two
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
  if v_pid is not null then
    with d as (delete from public.posts where provider_id = v_pid returning 1)
    select count(*) into v_posts from d;
  end if;

  return jsonb_build_object('posts', v_posts, 'media_queued', v_queued);
end $$;

alter function public.adel_provider_content(uuid) owner to postgres;
revoke all on function public.adel_provider_content(uuid) from public, anon, authenticated;

comment on function public.adel_provider_content(uuid) is
  'Policy J. Enqueues EVERY storage object under this account''s own prefix in '
  'provider-media and posts-media — a client''s avatar as much as a provider''s '
  'portfolio — then deletes the post rows if there is a provider. The enqueue is '
  'unconditional on purpose: it was once gated behind "has a providers row", '
  'which meant a client-only erasure reported completed with the avatar still '
  'served from a public bucket (SEC-STORAGE-004).';

-- ══ 3. AN ERASURE RECORD IS APPEND-ONLY, INCLUDING AGAINST DELETE ═════════
--
-- The guard refused a RE-KEY and then returned `coalesce(new, old)` — which
-- permits a DELETE. Deleting the record lets `erasure_pseudonym` mint a SECOND
-- pseudonym for the same subject on a later run, which is precisely the "one
-- person becomes several" outcome the trigger's own comment says it exists to
-- prevent. The mapping is also the only thing that makes a purge findable: the
-- message and photo purges look their target up BY the pseudonym.
create or replace function public.enforce_erased_accounts_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    if tg_op = 'DELETE' then
      raise exception 'An erasure record cannot be deleted; the pseudonym it holds is the only way the remaining purges find their rows.'
        using errcode = 'check_violation';
    end if;
    if tg_op = 'UPDATE'
       and (new.subject_id   is distinct from old.subject_id
         or new.pseudonym_id is distinct from old.pseudonym_id) then
      raise exception 'An erasure record cannot be re-keyed.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  raise exception 'Erasure records are not client-writable.' using errcode = '42501';
end;
$$;

alter function public.enforce_erased_accounts_append_only() owner to postgres;
revoke all on function public.enforce_erased_accounts_append_only()
  from public, anon, authenticated;

-- ══ 4. A FAILED PURGE WAS RETAINED FOREVER (SEC-DATA-008) ═════════════════
--
-- The sweep's purge loop selected `status = 'scheduled'` and its exception
-- handler wrote `status = 'failed'`. Nothing selected `'failed'` purge steps
-- again: the request had already reached `completed` (the completion recount
-- deliberately ignores `scheduled`), and `finalize_account_deletion` returns
-- immediately on a completed request. So ONE transient failure — a lock, a
-- statement timeout — retained an erased person's message bodies or booking
-- photos **permanently**, with no retry, no alarm, and no client role able to
-- see the row that says so.
--
-- A retention window is an UPPER BOUND. A failure that quietly converts it into
-- "forever" is the worst way for this to break, because everything else keeps
-- reporting success.
--
-- Two changes: `failed` is retried, and the step row is LOCKED before it runs, so
-- two overlapping sweeps cannot both execute the same purge and have the second
-- overwrite the first's counts with zeroes.
create or replace function public.sweep_account_deletions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid; v_finalized integer := 0; v_purged integer := 0; v_retried integer := 0;
  r record; v_locked uuid;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'The deletion sweep is not client-callable.' using errcode = '42501';
  end if;

  for v_id in
    select id from public.account_deletion_requests
     where status in ('grace_period', 'failed') and grace_ends_at <= now()
     order by grace_ends_at
  loop
    perform public.finalize_account_deletion(v_id);
    v_finalized := v_finalized + 1;
  end loop;

  for r in
    select s.id, s.step_key, s.status, q.subject_id
      from public.account_deletion_steps s
      join public.account_deletion_requests q on q.id = s.request_id
     where s.step_key in ('booking_photos_purge', 'messages_purge')
       and s.status in ('scheduled', 'failed')   -- `failed` RETRIES. See above.
       and s.due_at is not null and s.due_at <= now()
     order by s.due_at
  loop
    begin
      -- Take the row before doing the work, so a second sweep waits and then
      -- sees `completed` rather than repeating the purge and reporting zero.
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
                            'retried', v_retried);
end;
$$;

alter function public.sweep_account_deletions() owner to postgres;
revoke all on function public.sweep_account_deletions() from public, anon, authenticated;

comment on function public.sweep_account_deletions() is
  'The only thing that finalises a due request or runs a due purge. THERE IS NO '
  'SCHEDULER: an operator runs this, and a request whose grace period passed and '
  'whose sweep never ran is an account that was promised deletion and did not get '
  'it. Safe to run repeatedly and concurrently — every step is idempotent, due '
  'purge steps are locked with SKIP LOCKED, and a FAILED purge is retried rather '
  'than left to retain data past its window forever (SEC-DATA-008).';

-- A query operations can actually run. Named rather than left in a document,
-- because the failure mode this closes is invisible by construction: no client
-- role can read the steps table, and nothing else reports an overdue purge.
create or replace function public.overdue_account_deletion_work()
returns table (request_id uuid, subject_id uuid, step_key text, status text,
               due_at timestamptz, attempts integer, last_error text)
language sql stable security definer set search_path = ''
as $$
  select s.request_id, q.subject_id, s.step_key, s.status, s.due_at, s.attempts, s.last_error
    from public.account_deletion_steps s
    join public.account_deletion_requests q on q.id = s.request_id
   where (s.status = 'failed')
      or (s.status in ('scheduled', 'pending', 'running')
          and s.due_at is not null and s.due_at <= now())
      or s.status = 'held'
   order by s.due_at nulls first;
$$;

alter function public.overdue_account_deletion_work() owner to postgres;
revoke all on function public.overdue_account_deletion_work() from public, anon, authenticated;

comment on function public.overdue_account_deletion_work() is
  'Every deletion step that is failed, held, or past due. The operational answer '
  'to "is anything being retained longer than it should be" — service_role only, '
  'and documented in ACCOUNT_ERASURE_OPERATIONS.md as part of the sweep duty.';

-- ══ 5. THE GRACE PERIOD IS A DATE, NOT A STATUS (SEC-DATA-020) ════════════
--
-- The guard was `if v_req.status = 'grace_period' and v_req.grace_ends_at > now()`,
-- so a request sitting in `'requested'` would finalise IMMEDIATELY on a direct
-- call. service_role-only, so no client can reach it — but the thing that
-- protects a person's thirty days is the DATE, and it should be the date that is
-- checked, in every state that is not already terminal.
--
-- ══ 6. AND THE RETENTION WINDOWS STOP BEING BAKED IN (SEC-TRUTH-019c) ═════
--
-- `coalesce(public.retention_days('booking_photos'), 90)` and its 180-day twin
-- contradicted the entire premise of `20261100000000`: *"NULL is never treated as
-- zero and never treated as infinite."* A NULL window silently became the number
-- I happened to write in the engine — and the guard test that claims no window is
-- hard-coded matched only `interval '90 day'`, not `make_interval(days => …, 90)`,
-- so it passed while the property was false. **A test that cannot fail is worse
-- than no test**: it converts an unchecked property into a checked one on paper.
--
-- If a window is unset, the purge is not scheduled and not silently skipped: the
-- step is `held` with the reason, so it appears in `overdue_account_deletion_work`
-- and somebody has to decide. That is what "never zero and never infinite" has to
-- mean in code.
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

  foreach v_key in array public.account_deletion_step_keys() loop
    perform public.run_account_deletion_step(p_request_id, v_key);
  end loop;

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
     where m.sender_id = (select pseudonym_id from public.erased_accounts
                           where subject_id = v_req.subject_id);
  end if;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'booking_photos_purge',
          case when v_photo_days is null then 'held'
               when v_photo_due  is null then 'completed'
               else 'scheduled' end,
          v_photo_due,
          case when v_photo_days is null
               then 'retention_policy.booking_photos has no window set; nothing scheduled and nothing skipped'
               else null end)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        last_error = excluded.last_error,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'messages_purge',
          case when v_msg_days is null then 'held'
               when v_msg_due  is null then 'completed'
               else 'scheduled' end,
          v_msg_due,
          case when v_msg_days is null
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

-- ══ 7. THE TABLE COMMENT SAID SOMETHING THE CODE DOES NOT DO ══════════════
--
-- `20261101000000:85-87` said `completed` may be written only when every required
-- step is done AND NO HOLD IS OPEN. The recount counts `pending`, `running` and
-- `failed` — a `held` step does not stop completion, which is what the design
-- header at `20261108000000:33-36` intends and what PD-102 requires: a hold on
-- one class must not keep an account's credentials and profile alive.
--
-- Both cannot be true, and the TABLE comment is the one a reader trusts. It now
-- says what actually happens, including the part that matters to anyone reading
-- a request row: `completed` means the job did everything it was PERMITTED to do,
-- which is not the same as everything being gone.
comment on column public.account_deletion_requests.status is
  'requested → grace_period → finalizing → completed, or cancelled, or failed. '
  '`completed` is RECOMPUTED from the step rows, never asserted: it means no step '
  'is pending, running or failed. It does NOT mean every class was erased — a '
  'HELD class is deliberately skipped so that one legal hold cannot keep an '
  'entire account alive (PD-102), and a step whose retention window is unset is '
  'held rather than guessed. Read account_deletion_steps, or '
  'overdue_account_deletion_work(), for what a completed request still retains.';
