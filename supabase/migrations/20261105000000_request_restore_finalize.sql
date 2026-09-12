-- ACCOUNT ERASURE — request, restore, and the orchestrator that cannot lie.
--
-- ══ THE PROVIDER ROW HAS TO BE ABLE TO LOSE ITS OWNER ═════════════════════
--
-- `adel_profile_account` empties the provider row rather than deleting it,
-- because deleting it would cascade into `bookings` and policy B keeps the
-- operational record. That requires `providers.user_id` to be nullable and to
-- stop cascading — an ownerless business shell that some bookings still point at.
--
-- **An ownerless provider must be invisible and unbookable**, and neither follows
-- automatically: `account_pending_deletion(null)` is false, so without the two
-- additions below a shell would reappear in discovery the moment its owner was
-- erased. That is the failure this section exists to prevent.
alter table public.providers alter column user_id drop not null;
alter table public.providers drop constraint if exists providers_user_id_fkey;
alter table public.providers
  add constraint providers_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

comment on column public.providers.user_id is
  'The account that owns this business, or NULL when that account has been '
  'erased. The row is kept ownerless rather than deleted because bookings '
  'reference it and policy B keeps the operational record. An ownerless provider '
  'is excluded from every public view and refuses new bookings — a shell is not a '
  'business.';

create or replace view public.providers_visible
with (security_invoker = false) as
select p.id, p.user_id, p.display_name, p.business_name, p.username, p.category_id,
       p.custom_category, p.bio, p.location, p.neighborhood, p.profile_photo_url,
       p.cover_image_url, p.rating, p.average_rating, p.review_count, p.total_bookings,
       p.repeat_client_rate, p.follower_count, p.next_available, p.is_trending,
       p.is_featured, p.is_approved, p.is_demo, p.years_experience, p.specialties,
       p.created_at, p.is_mobile, p.completed_count, p.rating_client_count
  from public.providers p
 where p.user_id is not null                       -- an erased shell is not a business
   and not public.account_pending_deletion(p.user_id)
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = p.user_id)
   );
alter view public.providers_visible owner to postgres;

create or replace function public.refuse_write_to_inactive_provider()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_exists boolean;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;
  select p.user_id, true into v_owner, v_exists
    from public.providers p where p.id = new.provider_id;
  -- Ownerless (erased) counts as unavailable. `v_owner is null` on an existing
  -- row is exactly the shell case, and it must not fall through as "fine".
  if coalesce(v_exists, false) and (v_owner is null or public.account_pending_deletion(v_owner)) then
    raise exception 'This provider is not currently available for new bookings.'
      using errcode = 'PT426';
  end if;
  return new;
end;
$$;
alter function public.refuse_write_to_inactive_provider() owner to postgres;
revoke all on function public.refuse_write_to_inactive_provider()
  from public, anon, authenticated;

-- ══ 1. REQUESTING DELETION ════════════════════════════════════════════════
--
-- The in-app control creates a VERIFIED REQUEST; it does not erase anything.
-- The policy requires self-service initiation inside the app — emailing support
-- must not be the only way — and equally requires that the act be deliberate and
-- reversible for thirty days.
--
-- **Reauthentication is the caller's to prove, and the server checks it.** A
-- Supabase access token carries `auth_time`-equivalent freshness in its issued-at
-- claim; requiring a recent one means a stolen, long-lived session cannot delete
-- an account on its own. The window is generous enough for a real reauth flow and
-- short enough that an idle session does not qualify.
create or replace function public.request_account_deletion(
  p_confirm_text text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_days  integer;
  v_id    uuid;
  v_iat   bigint;
  v_open  uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to manage your account.' using errcode = '42501';
  end if;

  -- ALREADY REQUESTED is not an error. Returning the existing request makes the
  -- call idempotent, which matters because the control is a button a person may
  -- press twice on a slow connection — and two requests for one account would be
  -- two orchestrators over the same rows.
  select r.id into v_open from public.account_deletion_requests r
   where r.subject_user_id = v_uid
     and r.status in ('requested', 'grace_period', 'finalizing');
  if v_open is not null then
    return v_open;
  end if;

  -- MEANINGFUL SECURE CONFIRMATION. Two independent things: a freshly-issued
  -- token (so a stale or stolen session cannot do this unattended) and the typed
  -- confirmation the UI collects.
  v_iat := nullif(((select auth.jwt()) -> 'iat')::text, '')::bigint;
  if v_iat is null or to_timestamp(v_iat) < now() - interval '15 minutes' then
    raise exception 'Confirm your password again before deleting your account.'
      using errcode = 'PT442';
  end if;
  if coalesce(btrim(p_confirm_text), '') <> 'DELETE' then
    raise exception 'Type DELETE to confirm.' using errcode = 'PT443';
  end if;

  v_days := public.retention_days('account_grace_period');
  if v_days is null then
    raise exception 'Account deletion is unavailable right now.' using errcode = 'PT444';
  end if;

  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (v_uid, v_uid, 'requested', now() + make_interval(days => v_days), v_days)
  returning id into v_id;

  -- Every step is written up front, so "which steps exist" is not something a
  -- retry has to re-derive, and a step that never ran is visibly `pending`
  -- rather than absent.
  insert into public.account_deletion_steps (request_id, step_key)
  select v_id, k from unnest(public.account_deletion_step_keys()) k;

  -- The deactivation is DERIVED from this row, so it is already in force by the
  -- time this statement commits. `grace_period` records that fact rather than
  -- causing it — which is why the two states are distinct.
  update public.account_deletion_requests set status = 'grace_period' where id = v_id;

  return v_id;
end;
$$;

alter function public.request_account_deletion(text) owner to postgres;
revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

comment on function public.request_account_deletion(text) is
  'Creates a verified deletion request for the CALLER and nobody else — it takes '
  'no user id, which is what makes granting it safe. Requires a token issued in '
  'the last 15 minutes (so a stale or stolen session cannot do this unattended) '
  'and the typed confirmation. Idempotent: pressing the button twice returns the '
  'same request rather than starting a second orchestrator over the same rows. '
  'Deactivation is DERIVED from the row, so it is in force the moment this '
  'commits.';

-- ══ 2. RESTORING ══════════════════════════════════════════════════════════
create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_status text;
begin
  if v_uid is null then
    raise exception 'Sign in to manage your account.' using errcode = '42501';
  end if;

  -- THE CALLER'S OWN REQUEST, found by their identity rather than by an id they
  -- pass. There is no parameter to point at somebody else's account.
  select r.id, r.status into v_id, v_status
    from public.account_deletion_requests r
   where r.subject_user_id = v_uid
     and r.status in ('requested', 'grace_period', 'finalizing')
   for update;

  if v_id is null then
    -- Either nothing to cancel, or the account is already gone — in which case
    -- there is no caller, because the credentials went with it.
    return false;
  end if;

  -- ONCE FINALISING, IT IS TOO LATE. The steps have begun and several are
  -- irreversible; a "restore" that returned a half-erased account would be worse
  -- than an honest refusal.
  if v_status = 'finalizing' then
    raise exception 'This deletion is already being carried out and cannot be stopped.'
      using errcode = 'PT445';
  end if;

  update public.account_deletion_requests
     set status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = v_uid
   where id = v_id;

  -- Nothing else to undo. Deactivation was DERIVED from the open request, so it
  -- lifts by itself — there is no flag to remember and no second row to repair,
  -- which is the reason it was modelled that way.
  return true;
end;
$$;

alter function public.cancel_account_deletion() owner to postgres;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

comment on function public.cancel_account_deletion() is
  'Restores the CALLER''S account during the grace period. Takes no argument, so '
  'there is no id with which to cancel somebody else''s deletion — the same '
  'property that makes is_operator() grantable. Refuses once finalising has '
  'begun, because several steps are irreversible and a half-restored account is '
  'worse than an honest no. Restoration needs no repair work: deactivation was '
  'derived from the open request, so it lifts when the request closes.';

-- ══ 3. THE ORCHESTRATOR ═══════════════════════════════════════════════════
--
-- `completed` is a CONCLUSION, not an assertion. The function may only write it
-- when every step is accounted for, and it recomputes that from the step rows
-- rather than tracking it in a variable — so a step that failed silently, or one
-- added later and never run, keeps the request out of `completed` by existing.
create or replace function public.run_account_deletion_step(
  p_request_id uuid, p_step_key text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
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

  -- IDEMPOTENT AT THE TOP. A retry of a completed step is a no-op, not a
  -- second execution — which is what makes "safe to retry" true of the whole job
  -- rather than only of the individual functions.
  if v_step.status = 'completed' then
    return 'completed';
  end if;

  -- A HELD CLASS IS SKIPPED, NOT FAILED. The hold names one class; everything
  -- else still finishes. This is the record-specific hold doing its job.
  v_class := case p_step_key
               when 'booking_photos_sever' then 'booking_photos'
               when 'messages_sever' then 'messages'
               else p_step_key end;
  if exists (
    select 1 from public.account_deletion_holds h
     where h.request_id = p_request_id and h.record_class = v_class and h.released_at is null
  ) then
    update public.account_deletion_steps
       set status = 'held', last_error = null
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
      else null end;

    if v_result is null then
      raise exception 'Unknown deletion step: %', p_step_key using errcode = 'internal_error';
    end if;

    update public.account_deletion_steps
       set status = 'completed', completed_at = now(), result = v_result
     where id = v_step.id;
    return 'completed';
  exception when others then
    -- RECORDED, NOT SWALLOWED, and not re-raised: one failing class must not
    -- roll back the ten that succeeded, or a retry would start from nothing.
    update public.account_deletion_steps
       set status = 'failed', last_error = left(sqlstate || ': ' || sqlerrm, 4000)
     where id = v_step.id;
    return 'failed';
  end;
end;
$$;

alter function public.run_account_deletion_step(uuid, text) owner to postgres;
revoke all on function public.run_account_deletion_step(uuid, text) from public, anon, authenticated;

comment on function public.run_account_deletion_step(uuid, text) is
  'Runs ONE class of a deletion, and remembers that it did. Idempotent at the '
  'top (a completed step returns immediately), hold-aware (a held class is '
  'skipped, not failed, so the rest still finishes), and it records a failure '
  'rather than re-raising — one failing class must not roll back the ten that '
  'succeeded, because a retry would then start from nothing.';

create or replace function public.finalize_account_deletion(p_request_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
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
    -- NOT DUE. Finalising early would erase an account inside the window the
    -- user was told they could change their mind in.
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

  -- THE TWO SCHEDULED CLASSES. Their content outlives the identity by design, so
  -- their purge is dated rather than done — the later of their own window and
  -- the grace-period end, exactly as the policy states it.
  select max(later) into v_photo_due from (
    select greatest(
             coalesce(b.completed_at, b.cancelled_at, b.created_at)
               + make_interval(days => coalesce(public.retention_days('booking_photos'), 90)),
             v_req.grace_ends_at) as later
      from public.booking_reference_photos p
      join public.bookings b on b.id = p.booking_id
     where p.uploaded_by_user_id = (select pseudonym_id from public.erased_accounts
                                     where subject_id = v_req.subject_id)
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

  -- THE CONCLUSION, RECOMPUTED FROM THE ROWS. Not a flag anybody set: a step
  -- that failed, or one added later and never run, keeps this out of `completed`
  -- simply by existing in the wrong state.
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

comment on function public.finalize_account_deletion(uuid) is
  'Runs every step in order and then CONCLUDES. `completed` is recomputed from '
  'the step rows rather than asserted, so a failure or an unrun step keeps the '
  'request out of it by existing. Refuses to run before the grace period ends — '
  'erasing inside the window the user was told they could change their mind in '
  'would make the promise false. Safe to call repeatedly: completed steps '
  'no-op, and a failed request retried picks up exactly what is left.';

-- The sweep an operator or a schedule runs. Separate from the orchestrator so
-- "what is due" is a query anyone can read, not logic buried in a loop.
create or replace function public.sweep_account_deletions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid; v_finalized integer := 0; v_purged integer := 0;
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

  for v_id in
    select s.request_id from public.account_deletion_steps s
     where s.status = 'scheduled' and s.due_at is not null and s.due_at <= now()
  loop
    null;   -- handled per-step below, kept separate so a purge failure is local
  end loop;

  declare r record;
  begin
    for r in
      select s.id, s.request_id, s.step_key, q.subject_id
        from public.account_deletion_steps s
        join public.account_deletion_requests q on q.id = s.request_id
       where s.status = 'scheduled' and s.due_at is not null and s.due_at <= now()
    loop
      begin
        if r.step_key = 'booking_photos_purge' then
          update public.account_deletion_steps
             set status = 'completed', completed_at = now(),
                 result = public.adel_booking_photos_purge(r.subject_id)
           where id = r.id;
        elsif r.step_key = 'messages_purge' then
          update public.account_deletion_steps
             set status = 'completed', completed_at = now(),
                 result = public.adel_messages_purge(r.subject_id)
           where id = r.id;
        end if;
        v_purged := v_purged + 1;
      exception when others then
        update public.account_deletion_steps
           set status = 'failed', last_error = left(sqlstate || ': ' || sqlerrm, 4000)
         where id = r.id;
      end;
    end loop;
  end;

  return jsonb_build_object('finalized', v_finalized, 'purged', v_purged);
end;
$$;

alter function public.sweep_account_deletions() owner to postgres;
revoke all on function public.sweep_account_deletions() from public, anon, authenticated;

comment on function public.sweep_account_deletions() is
  'Finalises every request whose grace period has ended, and runs every purge '
  'step that has come due. Retries `failed` requests too — a partial failure is '
  'meant to be recoverable by running this again, not by hand. service_role '
  'only. **There is no scheduler in this beta: an operator runs it.** That '
  'limitation is documented rather than papered over with a cron nobody built.';
