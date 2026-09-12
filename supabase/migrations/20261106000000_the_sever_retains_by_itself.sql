-- FORWARD CORRECTION to 20261103000000 / 20261105000000 (Account erasure).
--
-- ══ THE ENGINE WORKS AND A RAW DELETE STILL FAILS ═════════════════════════
--
-- `20261103000000` widened `reports_target_check` to accept a retained
-- `reported_subject_id`, and the erasure engine writes that column before
-- nulling the live one — so the supported path succeeds. Verified.
--
-- But a **raw** `delete from auth.users` — the Supabase dashboard, the GoTrue
-- admin API, an ops script, a future code path — does not run the engine. The
-- referential SET NULL empties `reported_user_id`, nothing populates the
-- replacement, and the check fails with `23514`. **That is OQ-077 defect (1)
-- still present on every path except the one I happened to build.**
--
-- A guarantee that depends on calling things in the right order is not a
-- guarantee; it is a convention with a test. So identity retention becomes a
-- property of the SEVER ITSELF: when a referential action nulls one of these
-- columns, a trigger captures the departing id into the restricted column in the
-- same statement. Every path now retains the evidence, and the engine's own
-- writes become belt-and-braces rather than the only thing standing between a
-- delete and a lost safety record.
--
-- ── WHY THIS IS NOT A BACK DOOR ───────────────────────────────────────────
--
-- The trigger only ever moves an id from a column that is being emptied ANYWAY
-- into one no client role can read. It cannot be used to write an arbitrary
-- subject: the value comes from `old`, never from the caller.

create or replace function public.retain_identity_on_sever()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  end if;
  return new;
end;
$$;

alter function public.retain_identity_on_sever() owner to postgres;
revoke all on function public.retain_identity_on_sever() from public, anon, authenticated;

comment on function public.retain_identity_on_sever() is
  'When a referential SET NULL empties an identity column on a RETAINED evidence '
  'row, capture the departing id into the restricted subject column in the same '
  'statement. The value always comes from `old`, never from the caller, so this '
  'cannot write an arbitrary subject. It exists because the alternative was a '
  'guarantee that held only on the one code path that remembered to populate the '
  'column first — every other delete path (dashboard, admin API, ops script) '
  'failed a CHECK or silently lost the evidence.';

-- `a_` so it runs BEFORE the append-only guards, which is the whole point: the
-- guard must see the finished row, with the identity already moved.
drop trigger if exists a_reports_retain_identity on public.reports;
create trigger a_reports_retain_identity
  before update on public.reports
  for each row execute function public.retain_identity_on_sever();

drop trigger if exists a_contract_signatures_retain_identity on public.contract_signatures;
create trigger a_contract_signatures_retain_identity
  before update on public.contract_signatures
  for each row execute function public.retain_identity_on_sever();

drop trigger if exists a_operator_case_events_retain_identity on public.operator_case_events;
create trigger a_operator_case_events_retain_identity
  before update on public.operator_case_events
  for each row execute function public.retain_identity_on_sever();

drop trigger if exists a_moderation_actions_retain_identity on public.community_moderation_actions;
create trigger a_moderation_actions_retain_identity
  before update on public.community_moderation_actions
  for each row execute function public.retain_identity_on_sever();

-- ══ THE APPEND-ONLY GUARDS MUST ACCEPT THE PAIRED WRITE ═══════════════════
--
-- `enforce_operator_case_event_append_only` permits exactly one UPDATE shape:
-- `actor_user_id` severed to null, every other column identical. The healing
-- trigger above now also sets `actor_subject_id` in that same statement — so the
-- guard would reject its own erasure path. Widened to the PAIR, and no further:
-- an id may move from the live column to the restricted one, and nothing else
-- may change.
create or replace function public.enforce_operator_case_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if (select auth.role()) = 'service_role'
       or ((select auth.role()) is null and (select auth.uid()) is null) then
      return old;
    end if;
    raise exception 'A case event cannot be deleted.' using errcode = 'check_violation';
  end if;

  -- THE ERASURE SEVER, AND ONLY IT (OQ-077 defect 2). What may change: the live
  -- actor id, to NULL; and the restricted subject id, from NULL to the id that
  -- just left. Nothing else, ever.
  if new.id          is not distinct from old.id
     and new.case_id     is not distinct from old.case_id
     and new.action      is not distinct from old.action
     and new.from_status is not distinct from old.from_status
     and new.to_status   is not distinct from old.to_status
     and new.note        is not distinct from old.note
     and new.created_at  is not distinct from old.created_at
     and new.actor_user_id is null
     and old.actor_user_id is not null
     and (new.actor_subject_id is not distinct from old.actor_subject_id
          or (old.actor_subject_id is null
              and new.actor_subject_id is not distinct from old.actor_user_id))
  then
    if (select auth.role()) = 'service_role'
       or ((select auth.role()) is null and (select auth.uid()) is null) then
      return new;
    end if;
  end if;

  raise exception 'A case event is a record of what happened and cannot be changed.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_operator_case_event_append_only() owner to postgres;
revoke all on function public.enforce_operator_case_event_append_only()
  from public, anon, authenticated;

comment on function public.enforce_operator_case_event_append_only() is
  'A case event cannot be edited or deleted. ONE exception: the erasure sever — '
  '`actor_user_id` to NULL, paired with `actor_subject_id` taking the id that '
  'just left, by service_role. Both halves together, because '
  '`retain_identity_on_sever` writes them in one statement and a guard that '
  'accepted only the first would reject its own erasure path. A licence to forget '
  'WHO publicly, never to change WHAT.';

-- Same widening for the moderation log, whose guard admits a pointer going to
-- null and must now admit the paired retention alongside it.
create or replace function public.enforce_moderation_actions_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    if tg_op = 'UPDATE'
       and new.id          is not distinct from old.id
       and new.target_kind is not distinct from old.target_kind
       and new.action      is not distinct from old.action
       and new.case_id     is not distinct from old.case_id
       and new.note        is not distinct from old.note
       and new.created_at  is not distinct from old.created_at
       and (new.post_id  is not distinct from old.post_id  or new.post_id is null)
       and (new.reply_id is not distinct from old.reply_id or new.reply_id is null)
       and (new.actor_user_id is not distinct from old.actor_user_id
            or new.actor_user_id is null)
       and (new.actor_subject_id is not distinct from old.actor_subject_id
            or (old.actor_subject_id is null
                and new.actor_subject_id is not distinct from old.actor_user_id))
    then
      return new;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    raise exception 'A moderation action is a record of what was done and cannot be changed.'
      using errcode = 'check_violation';
  end if;
  raise exception 'A moderation action is a record of what was done and cannot be changed.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_moderation_actions_append_only() owner to postgres;
revoke all on function public.enforce_moderation_actions_append_only()
  from public, anon, authenticated;

-- ══ AND THE DEAD LOOP COMES OUT ═══════════════════════════════════════════
--
-- `sweep_account_deletions` shipped with an empty `for … loop null; end loop;` —
-- a first draft of the purge pass that the block below it replaced and that I
-- left behind. It does nothing except read as though it might.
create or replace function public.sweep_account_deletions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid; v_finalized integer := 0; v_purged integer := 0; r record;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'The deletion sweep is not client-callable.' using errcode = '42501';
  end if;

  -- Requests whose grace period has ended. `failed` is included deliberately:
  -- recovery from a partial failure is meant to be "run the sweep again".
  for v_id in
    select id from public.account_deletion_requests
     where status in ('grace_period', 'failed') and grace_ends_at <= now()
     order by grace_ends_at
  loop
    perform public.finalize_account_deletion(v_id);
    v_finalized := v_finalized + 1;
  end loop;

  -- Purges that have come due. Each in its own block, so one failure is local
  -- rather than abandoning the rest of the sweep.
  for r in
    select s.id, s.step_key, q.subject_id
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

  return jsonb_build_object('finalized', v_finalized, 'purged', v_purged);
end;
$$;

alter function public.sweep_account_deletions() owner to postgres;
revoke all on function public.sweep_account_deletions() from public, anon, authenticated;

comment on function public.sweep_account_deletions() is
  'Finalises every request whose grace period has ended and runs every purge that '
  'has come due. Retries `failed` requests, because recovery from a partial '
  'failure is meant to be "run this again" rather than hand surgery. service_role '
  'only. **NO SCHEDULER EXISTS IN THIS BETA — an operator runs it**, and that is '
  'documented in Operations rather than implied away by a cron nobody built.';
