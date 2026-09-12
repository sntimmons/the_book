-- FORWARD CORRECTION to 20261111000000 / 20261114000000 (PD-102, PD-104).
-- Re-review of the erasure branch: SEC-AUTHZ-101, SEC-RLS-102, SEC-DATA-103,
-- SEC-TRIGGER-105, plus one hole in holds that fell out of reading them.
--
-- ══ THE SAME DEFECT, ONE TABLE FURTHER OUT ════════════════════════════════
--
-- `20261111000000` exists because "hidden" was enforced in the views and not in
-- the tables. It then narrowed the five tables I thought of. It did not narrow
-- these:
--
--     provider_services       public_read_active_services   USING (is_active)
--     provider_availability   "Anyone can read …"           USING (true)
--     provider_blocked_dates  "Anyone can read …"           USING (true)
--     provider_policies       provider_policies_read        USING (true)
--
-- All four are granted to `anon`. So a stranger could still read a departing
-- provider's **entire service menu** with names, descriptions, prices, durations
-- and deposit terms, their **weekly working hours**, their **cancellation and
-- deposit policies**, and their **blocked dates including the free-text reason** —
-- which is a field people fill in with "maternity leave" and "surgery".
--
-- And none of them was ever deleted. Every one is
-- `provider_id references public.providers on delete cascade`, and
-- `adel_profile_account` deliberately **keeps** the providers row (emptied) so the
-- contract chain survives — so **the cascade never fires and no step touches
-- them.** After a `completed` erasure the `former_…` shell still carried a live,
-- publicly readable business. That set of prices and hours is a fingerprint:
-- anyone holding one snapshot of the anon-readable directory can re-identify the
-- shell from it, which undoes the anonymisation of everything else.
--
-- **I am not treating this as an open product question.** PD-102 policy J is
-- "provider content leaves public access on the request, and the bytes go after
-- the grace period", and a service menu is provider content by any reading a
-- person would recognise. A blocked-date reason is closer to a medical note than
-- to a business listing. Where I would have needed a ruling is retention, and
-- there is nothing here to retain: bookings carry their own `service_name`
-- snapshot, so the operational record does not depend on these rows.
create or replace function public.provider_content_hidden(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.providers p
     where p.id = p_provider_id
       and public.account_unavailable(p.user_id)
       and (p.user_id is null or p.user_id is distinct from (select auth.uid()))
  );
$$;

alter function public.provider_content_hidden(uuid) owner to postgres;
grant execute on function public.provider_content_hidden(uuid) to anon, authenticated, service_role;

comment on function public.provider_content_hidden(uuid) is
  'True when this provider''s public content must not be served: their owner is '
  'unavailable and the reader is not that owner. ONE function so that every '
  'provider-content table gives the same answer — services, availability, blocked '
  'dates, policies and posts were narrowed at five different times and the list is '
  'the thing that drifts (SEC-RLS-102). A new table keyed on provider_id belongs '
  'either here or in a documented retention class.';

drop policy if exists public_read_active_services on public.provider_services;
create policy public_read_active_services on public.provider_services
  for select
  using (is_active = true and not public.provider_content_hidden(provider_id));

drop policy if exists "Anyone can read provider availability" on public.provider_availability;
create policy "Anyone can read provider availability" on public.provider_availability
  for select
  using (not public.provider_content_hidden(provider_id));

drop policy if exists "Anyone can read provider blocked dates" on public.provider_blocked_dates;
create policy "Anyone can read provider blocked dates" on public.provider_blocked_dates
  for select
  using (not public.provider_content_hidden(provider_id));

drop policy if exists provider_policies_read on public.provider_policies;
create policy provider_policies_read on public.provider_policies
  for select
  using (not public.provider_content_hidden(provider_id));

comment on policy public_read_active_services on public.provider_services is
  'A service menu is public while the provider is. It leaves public access on a '
  'deletion request (PD-102 policy J) and is deleted at finalisation — bookings '
  'keep their own service_name snapshot, so nothing operational depends on these '
  'rows. The owner keeps reading their own menu throughout, via the carve-out in '
  'provider_content_hidden.';

-- ── THE FOREIGN KEY THAT WOULD HAVE BLOCKED THE DELETE ────────────────────
--
-- `bookings.service_id` references `provider_services(id)` with **no referential
-- action**, which is NO ACTION — so deleting a service a booking had ever used
-- would have failed with 23503 and taken the whole erasure step with it. This is
-- the same shape as every other cascade in this workstream, in the opposite
-- direction: too strict rather than too eager.
--
-- `SET NULL` is right here and loses nothing, because `bookings.service_name` is
-- `NOT NULL` and holds the snapshot. The booking keeps saying what was booked; it
-- stops pointing at a menu entry that no longer exists.
alter table public.bookings drop constraint if exists bookings_service_id_fkey;
alter table public.bookings
  add constraint bookings_service_id_fkey
  foreign key (service_id) references public.provider_services(id) on delete set null;

comment on constraint bookings_service_id_fkey on public.bookings is
  'SET NULL since 20261120000000. The booking''s record of WHAT was booked is '
  'bookings.service_name, which is NOT NULL and snapshotted at request time; this '
  'column is only the live menu link. NO ACTION here made erasure impossible for '
  'any provider who had ever been booked.';

-- ── AND THE STEP THAT NOW ACCOUNTS FOR THEM ───────────────────────────────
create or replace function public.adel_provider_content(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_posts integer := 0; v_queued integer := 0; v_pid uuid;
  v_services integer := 0; v_avail integer := 0; v_blocked integer := 0;
  v_policies integer := 0; v_followers integer := 0;
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
  -- their own service_name snapshot and the accepted-contract record is the
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
  -- Inbound follows. `adel_profile_account` removes the ones this person made;
  -- these are the ones made to them, and they are a list of other people.
  with d as (delete from public.provider_follows where provider_id = v_pid returning 1)
  select count(*) into v_followers from d;

  return jsonb_build_object('posts', v_posts, 'media_queued', v_queued,
                            'services', v_services, 'availability', v_avail,
                            'blocked_dates', v_blocked, 'policies', v_policies,
                            'inbound_follows', v_followers);
end $$;

alter function public.adel_provider_content(uuid) owner to postgres;
revoke all on function public.adel_provider_content(uuid) from public, anon, authenticated;

comment on function public.adel_provider_content(uuid) is
  'Policy J, the whole class. Enqueues every storage object under this account''s '
  'own prefix (a client''s avatar as much as a provider''s portfolio), then deletes '
  'the posts AND the business that hung off the provider row: services, '
  'availability, blocked dates, policies and inbound follows. The providers row '
  'itself is kept and emptied by adel_profile_account because bookings reference '
  'it — which is exactly why these five could not rely on its cascade and were '
  'surviving a completed erasure (SEC-RLS-102).';

-- ══ THE ENUMERATION I SAID WAS CLOSED WAS NOT (SEC-AUTHZ-101) ═════════════
--
-- `20261111000000:93-96` argued that keeping `account_unavailable(uuid)` granted
-- was acceptable because "the listing no longer contains them, so the oracle can
-- only be asked about an id the caller already holds". That was **wrong**, and
-- wrong in the way that matters: it was the justification for a grant.
--
-- Two tables hand out raw `auth.users` ids to `anon` with `USING (true)`:
--
--     post_likes        likes_public_read     USING (true)
--     provider_follows  "public read follows" USING (true)
--
-- So an unauthenticated caller reads `post_likes?select=user_id`, then asks
-- `rpc/account_unavailable` once per id, and recovers the set of people leaving
-- The Book. Every user who has ever liked a Reel or followed a provider is in
-- that supply.
--
-- ── I AM CLOSING IT RATHER THAN RE-ARGUING IT ─────────────────────────────
--
-- Neither table needs to publish anybody's id. `post_saves` has had the right
-- policy since the baseline — `saves_public_read USING (auth.uid() = user_id)` —
-- and the app reads likes exactly the way it reads saves, with
-- `.eq('user_id', user.id)`: the visible like COUNT comes from
-- `posts.like_count`, not from counting rows. So likes get the policy saves
-- already had.
--
-- Follows are one step harder, because the profile screen counts followers with a
-- live `count` over other people's rows. That is a legitimate need for a NUMBER
-- and never for the identities, so it becomes a function that returns the number.
drop policy if exists likes_public_read on public.post_likes;
create policy likes_public_read on public.post_likes
  for select
  using ((select auth.uid()) = user_id);

comment on policy likes_public_read on public.post_likes is
  'Own rows only — the same shape saves_public_read has had since the baseline. It '
  'was USING (true) with an anon grant, which published a real auth.users id for '
  'every like on the platform and was the id supply that kept the '
  'account_unavailable oracle enumerable without an account (SEC-AUTHZ-101). The '
  'visible like count comes from posts.like_count, maintained by '
  'update_post_like_count, so nothing needs to read other people''s rows.';

drop policy if exists "public read follows" on public.provider_follows;
create policy "public read follows" on public.provider_follows
  for select
  using ((select auth.uid()) = follower_user_id);

comment on policy "public read follows" on public.provider_follows is
  'Own rows only. The follower COUNT that the profile screen needs is a number, '
  'not a list of people, and it now comes from provider_follower_count(); this '
  'policy was USING (true) with an anon grant, which published every follower''s '
  'real account id (SEC-AUTHZ-101).';

create or replace function public.provider_follower_count(p_provider_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.provider_content_hidden(p_provider_id) then 0
              else (select count(*)::integer from public.provider_follows f
                     where f.provider_id = p_provider_id) end;
$$;

alter function public.provider_follower_count(uuid) owner to postgres;
grant execute on function public.provider_follower_count(uuid) to anon, authenticated, service_role;

comment on function public.provider_follower_count(uuid) is
  'How many people follow this provider. A NUMBER, deliberately — the rows it '
  'counts carry real account ids and are no longer publicly readable '
  '(SEC-AUTHZ-101). Returns 0 for a provider whose content is hidden, so it cannot '
  'become a second way to learn that somebody is leaving. Reading a count about a '
  'public business is not an oracle about a person.';

-- ══ HOLDS: RELEASABLE, RESUMABLE, AND HONOURED BY THE PURGES ══════════════
--
-- Three related gaps, all of which made a hold a one-way door:
--
--   1. `ACCOUNT_ERASURE_OPERATIONS.md` said a hold "is released the same way" it
--      is placed. **Nothing in the schema ever wrote `released_at`.** Releasing
--      one was raw SQL, and it resumed nothing.
--   2. A `held` step was not in the sweep's retry set, and the request had already
--      reported `completed`, so `finalize_account_deletion` returned at its first
--      guard on every later call. Held work was never done by anything.
--   3. **The purge loop never consulted holds at all.** The class mapping lives in
--      `run_account_deletion_step`, and the two purges are run directly by the
--      sweep — so a legal hold on `messages` did not stop the message purge. A
--      hold that does not hold is worse than no hold, because somebody is relying
--      on it.
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
           else s.step_key end = v_class;

  -- And the request is put back where the sweep will find it. `failed` is the
  -- existing resume state and the sweep already selects it, so the recovery path
  -- stays the single sentence it has always been: run the sweep again.
  update public.account_deletion_requests
     set status = 'failed',
         last_error = format('resumed: hold on %s released', v_class)
   where id = v_hold.request_id
     and status in ('completed', 'failed', 'finalizing')
     and exists (select 1 from public.account_deletion_steps s2
                  where s2.request_id = v_hold.request_id
                    and s2.status in ('pending', 'running', 'held', 'failed'));

  return 'released';
end;
$$;

alter function public.release_account_deletion_hold(uuid) owner to postgres;
revoke all on function public.release_account_deletion_hold(uuid) from public, anon, authenticated;

comment on function public.release_account_deletion_hold(uuid) is
  'Releases one record-class hold and puts the work back in the queue: the held '
  'steps of that class become pending and the request returns to `failed`, which '
  'is the state the sweep already picks up — so the recovery instruction stays '
  '"run the sweep again". Before this existed the operations note promised holds '
  'could be released and nothing in the schema wrote released_at (SEC-DATA-103).';

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
  -- that nothing else will ever pick up. Only an actually-unblocked step moves, so
  -- this terminates rather than flapping a completed request back and forth.
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
                                 else s.step_key end);

  update public.account_deletion_requests r
     set status = 'failed', last_error = 'resumed: previously held work is runnable'
   where r.status = 'completed'
     -- Only when something is genuinely runnable. A request whose only outstanding
     -- step is still legitimately `held` stays `completed`, so this terminates
     -- instead of flapping the same request back and forth on every sweep.
     and exists (select 1 from public.account_deletion_steps s
                  where s.request_id = r.id
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
       and s.status in ('scheduled', 'failed')   -- `failed` RETRIES.
       and s.due_at is not null and s.due_at <= now()
     order by s.due_at
  loop
    begin
      -- A HOLD ON THE CLASS STOPS THE PURGE. This loop runs the purges directly
      -- rather than through run_account_deletion_step, which is where the hold
      -- check lives — so the check has to be here too, or a legal hold on
      -- `messages` would watch the messages be deleted.
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

-- ── AND THE OPERATIONAL QUERY CAN SEE THE FAILURE ITS OWN COMMENT NAMES ───
--
-- `overdue_account_deletion_work()` said it answered "is anything being retained
-- longer than it should be", and it queried STEPS only — with
-- `due_at is not null`. The failure the sweep's own comment calls the worst one is
-- **a request whose grace period passed and whose sweep never ran**, and that
-- request's twelve steps are all `pending` with `due_at` NULL. It was the single
-- case the detector could not detect.
drop function if exists public.overdue_account_deletion_work();
create or replace function public.overdue_account_deletion_work()
returns table (request_id uuid, subject_id uuid, step_key text, status text,
               due_at timestamptz, attempts integer, last_error text)
language sql stable security definer set search_path = ''
as $$
  -- The request itself, when its window has passed and nothing finished it.
  select q.id, q.subject_id, '(request never finalised)'::text, q.status,
         q.grace_ends_at, q.attempts, q.last_error
    from public.account_deletion_requests q
   where q.status in ('requested', 'grace_period', 'finalizing', 'failed')
     and q.grace_ends_at <= now()
  union all
  -- And every individual step that is failed, held, or past due.
  select s.request_id, q.subject_id, s.step_key, s.status, s.due_at, s.attempts, s.last_error
    from public.account_deletion_steps s
    join public.account_deletion_requests q on q.id = s.request_id
   where s.status = 'failed'
      or s.status = 'held'
      or (s.status in ('scheduled', 'pending', 'running')
          and s.due_at is not null and s.due_at <= now())
   order by 5 nulls first;
$$;

alter function public.overdue_account_deletion_work() owner to postgres;
revoke all on function public.overdue_account_deletion_work() from public, anon, authenticated;

comment on function public.overdue_account_deletion_work() is
  'Everything that is late: any request past its grace date that nothing has '
  'finalised, and any step that is failed, held or past due. The first half was '
  'missing and it is the case that matters most — there is no scheduler, so a '
  'request nobody swept has twelve `pending` steps with no due date and was '
  'invisible to the query named as the detector (SEC-DATA-103).';

-- ══ A DEFINER FUNCTION WITH NO PINNED search_path (SEC-TRIGGER-105) ═══════
--
-- `20261118000000` wrote the rule down — an unqualified name inside a definer
-- function is how a caller-controlled schema hijacks a privileged query — and then
-- fixed five NON-definer functions while leaving the one SECURITY DEFINER trigger
-- on `public.providers` with no `search_path` at all. It fires on every providers
-- UPDATE, including the erasure's.
--
-- It does not currently fail or get hijacked: its body touches only `auth.role()`
-- and NEW/OLD fields, with no unqualified relation. This is the rule being applied
-- to the function that most obviously falls under it, plus the generic assertion
-- in the suite so number two cannot be found by a reviewer again.
create or replace function public.prevent_provider_verification_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.verification_status is distinct from old.verification_status
    or new.identity_verified is distinct from old.identity_verified
    or new.business_verified is distinct from old.business_verified
    or new.verification_submitted_at is distinct from old.verification_submitted_at
    or new.verification_notes is distinct from old.verification_notes
  then
    raise exception 'Provider verification fields are admin-managed';
  end if;

  return new;
end;
$$;

alter function public.prevent_provider_verification_self_update() owner to postgres;

comment on function public.prevent_provider_verification_self_update() is
  'A provider may not verify themselves. BODY IS VERBATIM from the canonical '
  'baseline — all five verification columns, the same message, the same '
  'service_role carve-out and no other. The ONLY change is the pinned empty '
  'search_path, which it had none of: the exact hazard 20261118000000 wrote down '
  'while fixing five non-definer functions and missing the one definer trigger on '
  'this table. 20261119000000 is the standing warning against reconstructing a '
  'body from memory, so nothing else here moved, grants included.';
