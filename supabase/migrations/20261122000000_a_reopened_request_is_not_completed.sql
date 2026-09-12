-- FORWARD CORRECTION to 20261120000000 / 20261121000000.
--
-- ══ A CONSTRAINT I PUT THERE TO KEEP THE ROW HONEST, DOING ITS JOB ════════
--
-- `account_deletion_requests_completed_check` is
-- `check ((status = 'completed') = (completed_at is not null))` —
-- `20261101000000:66-67`. It exists so a request can never SAY it is complete
-- without a completion time, or carry a completion time without being complete.
--
-- The re-queue added by `20261120000000` moved a request from `completed` back to
-- `failed` and left `completed_at` where it was, so every sweep raised:
--
--     23514: account_deletion_requests_completed_check
--
-- Which is the constraint being right. **A request that has work left to do is
-- not completed, and must not keep a completion timestamp** — a stamp that
-- outlived its status is exactly how "completed" stops meaning anything, and this
-- workstream already has one finding (SEC-DATA-008) about a request reporting
-- success over outstanding work.
--
-- So both re-queue paths clear it. Nothing else about them changes.
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
