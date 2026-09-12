-- FORWARD CORRECTION to 20261120000000.
--
-- ══ A TABLE ALIAS AND A RECORD VARIABLE CANNOT SHARE A NAME ═══════════════
--
-- `sweep_account_deletions` declares `r record` for its purge loop, and
-- `20261120000000` added a re-queue statement written as
-- `update public.account_deletion_requests r … where r.status = 'completed'`.
-- PL/pgSQL resolves `r.status` against the DECLARED VARIABLE, not the alias, and
-- the variable is unassigned until the loop runs:
--
--     55000: record "r" is not assigned yet
--
-- It raised on the FIRST call, so every sweep failed — the one function the whole
-- design depends on an operator running by hand. Caught by the suite on the next
-- run, which is the only reason it is a rename and not an incident.
--
-- The alias becomes `q`, matching the one this function already uses for requests
-- in its purge query.
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

  update public.account_deletion_requests q
     set status = 'failed', last_error = 'resumed: previously held work is runnable'
   where q.status = 'completed'
     -- Only when something is genuinely runnable. A request whose only outstanding
     -- step is still legitimately `held` stays `completed`, so this terminates
     -- instead of flapping the same request back and forth on every sweep.
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

comment on function public.sweep_account_deletions() is
  'The only thing that finalises a due request or runs a due purge. THERE IS NO '
  'SCHEDULER: an operator runs this, and a request whose grace period passed and '
  'whose sweep never ran is an account that was promised deletion and did not get '
  'it. Safe to run repeatedly and concurrently — steps are idempotent, due purges '
  'are locked with SKIP LOCKED, a FAILED purge is retried, an open hold now stops '
  'a purge as well as a sever, and work whose hold has been released is re-queued. '
  'Table aliases in here must avoid `r`, which is a declared record variable: '
  'PL/pgSQL resolves the variable first and the statement fails with 55000 '
  '(20261121000000).';
