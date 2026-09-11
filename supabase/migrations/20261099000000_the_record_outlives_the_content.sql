-- FORWARD CORRECTION to 20261096000000 (Community moderation).
--
-- ══ 1. I MADE MODERATED CONTENT UNDELETABLE BY ITS OWN AUTHOR ═════════════
--
-- `community_moderation_actions.post_id` and `.reply_id` were `ON DELETE
-- CASCADE`, and the table has an append-only guard whose only carve-out is
-- `service_role` / a no-claims session.
--
-- A referential CASCADE performs a real DELETE on the referencing table, and it
-- does NOT change `request.jwt.claims` — so inside the guard `auth.role()` is
-- still `authenticated`, neither carve-out arm matches, and the guard raises.
-- **An author deleting their own post would have failed with `check_violation`
-- the moment that post — or any reply beneath it — had ever been moderated**,
-- and `communityWriteError` would have rendered `23514` as *"That isn't
-- something this account can post"*, which is nonsense on a delete.
--
-- This is the third time this session's family of bugs has had the same shape:
-- a referential action turns out to fire a rule, and the rule was written
-- thinking only about direct writes. `20261090000000` was the first and
-- `20261092000000` the second. **Enumerate what a cascade fires.**
--
-- ── AND IT ANSWERS THE OTHER HALF OF THE SAME QUESTION ────────────────────
--
-- Carving the cascade out of the guard would have fixed the delete and silently
-- destroyed the moderation record with the content — in exactly the situation
-- where it matters most: a disputed decision about something that is now gone.
-- The table's own comment promises the opposite ("the operator's action history
-- stays"), and `actor_user_id` already models the right answer: `ON DELETE SET
-- NULL`, so the record outlives the person.
--
-- The content pointers now do the same. A moderation action survives its
-- subject, having lost only the pointer — which is what an audit record is for.
alter table public.community_moderation_actions
  drop constraint if exists community_moderation_actions_post_id_fkey,
  drop constraint if exists community_moderation_actions_reply_id_fkey,
  drop constraint if exists community_moderation_actions_post_target_check,
  drop constraint if exists community_moderation_actions_reply_target_check;

alter table public.community_moderation_actions
  add constraint community_moderation_actions_post_id_fkey
    foreign key (post_id) references public.community_posts(id) on delete set null,
  add constraint community_moderation_actions_reply_id_fkey
    foreign key (reply_id) references public.community_replies(id) on delete set null,
  -- A pointer may be ABSENT (the content is gone) but never WRONG: a post action
  -- may not carry a reply id, and neither may carry both.
  add constraint community_moderation_actions_target_check
    check ((post_id is null or target_kind = 'post')
       and (reply_id is null or target_kind = 'reply')
       and not (post_id is not null and reply_id is not null));

comment on table public.community_moderation_actions is
  'Append-only record of every Community hide and restore: what, by whom, '
  'against which case, and when. The content pointers and the actor are ON '
  'DELETE SET NULL, deliberately: **the record outlives its subject.** A '
  'moderation trail that vanishes with the content is missing in precisely the '
  'situation it exists for — a disputed decision about something now deleted. '
  'It is also what keeps an author able to delete their own moderated post: a '
  'CASCADE here fired the append-only guard as the deleting USER and refused '
  'them.';

-- The guard learns the one shape an erasure makes: a pointer going to NULL, and
-- nothing else changing. Narrow on purpose — a note still cannot be rewritten
-- and an action still cannot be flipped, by anyone.
create or replace function public.enforce_moderation_actions_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return coalesce(new, old);
  end if;

  -- A referential SET NULL is an UPDATE, and it runs as whoever issued the
  -- DELETE — an ordinary author removing their own post. Permitted only in that
  -- exact shape: a pointer dropped to null, every other column untouched.
  if tg_op = 'UPDATE'
     and new.id            is not distinct from old.id
     and new.target_kind   is not distinct from old.target_kind
     and new.action        is not distinct from old.action
     and new.case_id       is not distinct from old.case_id
     and new.note          is not distinct from old.note
     and new.created_at    is not distinct from old.created_at
     and (new.post_id       is not distinct from old.post_id       or new.post_id is null)
     and (new.reply_id      is not distinct from old.reply_id      or new.reply_id is null)
     and (new.actor_user_id is not distinct from old.actor_user_id or new.actor_user_id is null)
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

-- ══ 2. HIDING BECOMES A READ BOUNDARY, NOT ONLY A RENDERING ONE ══════════
--
-- `community_posts_read` was `to authenticated using (true)`, and `authenticated`
-- holds table-level SELECT. So a take-down was enforced only in the two `_visible`
-- views: **any signed-in account could read every hidden post and reply in full
-- with one REST call.** For block inference that posture is ruled acceptable
-- (PD-090, reaffirmed as PD-100) — but PD-100 weighed BLOCK STATUS, not content
-- taken down for harassment or safety, and those are not the same question.
-- `COMMUNITY_OPERATIONS.md` tells support hiding removes content "for everyone",
-- which was true of the surfaces and not of the data.
--
-- Narrowed to the smallest rule that makes the sentence true: hidden content is
-- readable by its AUTHOR (who is told it is hidden, and must be able to delete
-- it) and by an OPERATOR (who has to review the decision). Nobody else.
drop policy if exists community_posts_read on public.community_posts;
create policy community_posts_read on public.community_posts
  for select to authenticated
  using (
    is_active
    or auth.uid() = user_id
    or public.is_operator()
  );

drop policy if exists community_replies_read on public.community_replies;
create policy community_replies_read on public.community_replies
  for select to authenticated
  using (
    is_active
    or auth.uid() = user_id
    or public.is_operator()
  );

-- The `_visible` views are DEFINER and owned by postgres, so they are unaffected
-- by this and keep doing the block and expiry filtering they already do.

-- And the one grant the repo's own standard says should not be left standing:
-- `community_replies` has no UPDATE policy at all, so the table-level privilege
-- is one added policy away from being a live hole. The moderation RPC is
-- SECURITY DEFINER owned by postgres and is unaffected.
revoke update, insert, delete on public.community_replies from anon;
revoke update on public.community_replies from authenticated;

-- ══ 3. AN OPERATOR MAY NOT MODERATE THEIR OWN MATTER ═════════════════════
--
-- **PD-068 already rules this**, and PD-064 enforces it twice for barter: *"a
-- participant may not adjudicate their own trade"*, checked in the RPC and again
-- in the trigger that writes the record, explicitly so that a compromised
-- operator process cannot file a provider as the adjudicator of their own case.
-- Moderation is adjudication with a different noun, and PD-099 was silent about
-- it — so an operator could hide a complaint about their own business, hide a
-- recommendation naming a competitor, or **restore their own hidden post**.
--
-- This is not a new decision; it is the standing one applied to a new surface.
-- Three relationships make an operator a party: they wrote it, it names a
-- business they own, or they are the one who reported it.
create or replace function public.operator_set_community_visibility(
  p_target_kind   text,
  p_target_id     uuid,
  p_hidden        boolean,
  p_actor_user_id uuid,
  p_case_id       uuid default null,
  p_note          text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_was     boolean;
  v_author  uuid;
  v_tagged  uuid;
  v_changed boolean := false;
begin
  if not public.is_operator() then
    raise exception 'Moderation is not available.' using errcode = 'insufficient_privilege';
  end if;
  if (select auth.uid()) is not null
     and p_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'A moderation action must be recorded against the operator who took it.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_actor_user_id is null then
    raise exception 'A moderation action must record who took it.'
      using errcode = 'check_violation';
  end if;
  if p_target_kind not in ('post', 'reply') then
    raise exception 'Unknown moderation target.' using errcode = 'internal_error';
  end if;
  if v_note is not null and char_length(v_note) > 4000 then
    raise exception 'That note is too long.' using errcode = '22023';
  end if;
  if p_case_id is not null
     and not exists (select 1 from public.operator_cases c where c.id = p_case_id) then
    raise exception 'That case no longer exists.' using errcode = 'check_violation';
  end if;

  if p_target_kind = 'post' then
    select cp.is_active, cp.user_id, cp.tagged_provider_id
      into v_was, v_author, v_tagged
      from public.community_posts cp where cp.id = p_target_id for update;
    if not found then
      raise exception 'That post no longer exists.' using errcode = 'check_violation';
    end if;
  else
    select cr.is_active, cr.user_id, null::uuid
      into v_was, v_author, v_tagged
      from public.community_replies cr where cr.id = p_target_id for update;
    if not found then
      raise exception 'That reply no longer exists.' using errcode = 'check_violation';
    end if;
  end if;

  -- NOT YOUR OWN MATTER (PD-068, the shape PD-064 enforces for barter).
  if v_author = p_actor_user_id then
    raise exception 'An operator cannot moderate their own content.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_tagged is not null and exists (
    select 1 from public.providers p
     where p.id = v_tagged and p.user_id = p_actor_user_id
  ) then
    raise exception 'An operator cannot moderate a recommendation of their own business.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_case_id is not null and exists (
    select 1 from public.operator_cases c
      join public.reports r on r.id = c.report_id
     where c.id = p_case_id and r.reporter_user_id = p_actor_user_id
  ) then
    raise exception 'An operator cannot act on a report they filed themselves.'
      using errcode = 'insufficient_privilege';
  end if;

  -- THE MARKER NAMES THE ROW, as every other marker in this schema does
  -- (`app.barter_release`, `app.barter_terms_write`, …). A bare 'on' would
  -- permit an is_active change on ANY row for the duration — harmless while the
  -- only writer is a single-row UPDATE here, and exactly the assumption a bulk
  -- path would break later.
  perform set_config('app.community_moderation', p_target_id::text, true);

  if v_was = p_hidden then   -- is_active = hidden means a change is needed
    if p_target_kind = 'post' then
      update public.community_posts set is_active = not p_hidden where id = p_target_id;
    else
      update public.community_replies set is_active = not p_hidden where id = p_target_id;
    end if;
    v_changed := true;
  end if;

  perform set_config('app.community_moderation', '', true);

  if v_changed then
    insert into public.community_moderation_actions
      (target_kind, post_id, reply_id, action, actor_user_id, case_id, note)
    values (p_target_kind,
            case when p_target_kind = 'post'  then p_target_id end,
            case when p_target_kind = 'reply' then p_target_id end,
            case when p_hidden then 'hidden' else 'restored' end,
            p_actor_user_id, p_case_id, v_note);

    if p_case_id is not null then
      insert into public.operator_case_events
        (case_id, actor_user_id, action, note)
      values (p_case_id, p_actor_user_id,
              case when p_hidden then 'content_hidden' else 'content_restored' end,
              v_note);
    end if;
  end if;

  return p_hidden;
end;
$$;

alter function public.operator_set_community_visibility(text, uuid, boolean, uuid, uuid, text)
  owner to postgres;
revoke all on function public.operator_set_community_visibility(text, uuid, boolean, uuid, uuid, text)
  from public, anon;
grant execute on function public.operator_set_community_visibility(text, uuid, boolean, uuid, uuid, text)
  to service_role, authenticated;

comment on function public.operator_set_community_visibility(text, uuid, boolean, uuid, uuid, text) is
  'The ONLY path that changes Community visibility. is_operator() decides '
  'authority; the actor is pinned to the caller; and an operator may NOT '
  'moderate their own content, a recommendation of their own business, or a '
  'report they filed (PD-068 — the rule PD-064 enforces twice for barter). '
  'Hiding KEEPS the row, the report, the case and the history, and is reversible '
  'by the same call. It resolves nothing, suspends nobody and restricts no '
  'provider: those are separate, separately audited actions.';

-- ══ 4. THE MARKER IS A ROW, AND A REPLY'S id IS PINNED TOO ═══════════════
create or replace function public.enforce_community_reply_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_eligible uuid;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_active is distinct from old.is_active
       and new.id          is not distinct from old.id
       and new.post_id     is not distinct from old.post_id
       and new.user_id     is not distinct from old.user_id
       and new.provider_id is not distinct from old.provider_id
       and new.author_kind is not distinct from old.author_kind
       and new.kind        is not distinct from old.kind
       and new.content     is not distinct from old.content
       and new.created_at  is not distinct from old.created_at
    then
      if not (
        public.is_operator()
        and coalesce(pg_catalog.current_setting('app.community_moderation', true), '')
            = new.id::text
      ) then
        raise exception 'Community visibility is changed by an operator moderation action.'
          using errcode = 'insufficient_privilege';
      end if;
      return new;
    end if;
    raise exception 'A community reply cannot be edited.'
      using errcode = 'check_violation';
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sign in to reply.' using errcode = '42501';
  end if;

  new.user_id    := (select auth.uid());
  new.created_at := clock_timestamp();
  new.is_active  := true;

  if new.author_kind = 'provider' then
    v_eligible := public.caller_eligible_provider_id();
    if v_eligible is null then
      raise exception 'This account cannot reply as a provider right now.'
        using errcode = 'PT431';
    end if;
    new.provider_id := v_eligible;
  else
    new.provider_id := null;
  end if;

  if exists (
    select 1 from public.community_posts cp
      join public.user_blocks b
        on (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
        or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
     where cp.id = new.post_id
  ) then
    raise exception 'This post is not available.' using errcode = 'PT427';
  end if;

  return new;
end;
$$;

alter function public.enforce_community_reply_integrity() owner to postgres;
revoke all on function public.enforce_community_reply_integrity()
  from public, anon, authenticated;

-- The posts side takes the same row-scoped marker, and is otherwise unchanged
-- from 20261096000000.
create or replace function public.enforce_community_post_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligible uuid;
  v_tz       text;
  v_end      timestamptz;
  v_likes    integer;
  v_replies  integer;
begin
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id                 is distinct from old.id
       or new.user_id            is distinct from old.user_id
       or new.provider_id        is distinct from old.provider_id
       or new.author_kind        is distinct from old.author_kind
       or new.intent             is distinct from old.intent
       or new.tagged_provider_id is distinct from old.tagged_provider_id
       or new.tagged_booking_id  is distinct from old.tagged_booking_id
       or new.expires_at         is distinct from old.expires_at
       or new.created_at         is distinct from old.created_at
    then
      raise exception 'A community post''s author, intent and links cannot be changed.'
        using errcode = 'check_violation';
    end if;

    -- A COUNTER MAY ONLY BE THE TRUTH (20261095000000).
    if new.like_count is distinct from old.like_count then
      select count(*)::integer into v_likes
        from public.community_post_likes l where l.post_id = new.id;
      if new.like_count is distinct from v_likes then
        raise exception 'A community post''s counts are derived, not set.'
          using errcode = 'check_violation';
      end if;
    end if;
    if new.reply_count is distinct from old.reply_count then
      select count(*)::integer into v_replies
        from public.community_replies r where r.post_id = new.id;
      if new.reply_count is distinct from v_replies then
        raise exception 'A community post''s counts are derived, not set.'
          using errcode = 'check_violation';
      end if;
    end if;

    -- VISIBILITY IS A MODERATION DECISION, and there is exactly one way to make
    -- one. Both halves are required: `is_operator()` so a client cannot, the
    -- marker so an operator cannot skip the audit row. Raised rather than
    -- silently pinned — a privileged action that quietly does nothing is how
    -- this column became a trap.
    if new.is_active is distinct from old.is_active then
      if not (
        public.is_operator()
        and coalesce(pg_catalog.current_setting('app.community_moderation', true), '')
            = new.id::text
      ) then
        raise exception 'Community visibility is changed by an operator moderation action.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;

    new.updated_at := now();
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sign in to post.' using errcode = '42501';
  end if;

  if not (
    (new.author_kind = 'client'
       and new.intent in ('looking_for', 'need_advice', 'who_does_this', 'shoutout'))
    or (new.author_kind = 'provider'
       and new.intent in ('open_today', 'update', 'announcement'))
  ) then
    raise exception 'That is not something a % can post.', new.author_kind
      using errcode = 'check_violation';
  end if;

  if new.intent = 'shoutout' and new.tagged_provider_id is null then
    raise exception 'Name the provider you are recommending.'
      using errcode = 'check_violation';
  end if;

  new.user_id    := (select auth.uid());
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.like_count  := 0;
  new.reply_count := 0;
  new.is_active   := true;

  if new.author_kind = 'provider' then
    v_eligible := public.caller_eligible_provider_id();
    if v_eligible is null then
      raise exception 'This account cannot post as a provider right now.'
        using errcode = 'PT431';
    end if;
    new.provider_id := v_eligible;
  else
    new.provider_id := null;
  end if;

  if new.intent = 'open_today' then
    if not exists (
      select 1 from public.providers_open_today() t(id) where t.id = new.provider_id
    ) then
      raise exception 'Publish your hours for today before posting an Open Today note.'
        using errcode = 'PT430';
    end if;
    select coalesce(a.timezone, 'America/Chicago') into v_tz
      from public.provider_availability a
     where a.provider_id = new.provider_id and a.timezone is not null
     order by a.weekday, a.start_time
     limit 1;
    v_tz := coalesce(v_tz, 'America/Chicago');
    v_end := ((((now() at time zone v_tz)::date + 1)::timestamp) at time zone v_tz);
    new.expires_at := least(v_end, now() + interval '24 hours');
  else
    new.expires_at := null;
  end if;

  if new.intent = 'shoutout' then
    if not exists (
      select 1 from public.providers p
       where p.id = new.tagged_provider_id and p.is_approved
    ) then
      raise exception 'That provider cannot be recommended.' using errcode = 'PT432';
    end if;
    if exists (
      select 1 from public.providers p
       where p.id = new.tagged_provider_id and p.user_id = (select auth.uid())
    ) then
      raise exception 'You cannot recommend your own business.' using errcode = 'PT432';
    end if;
    if public.contact_blocked_provider((select auth.uid()), new.tagged_provider_id) then
      raise exception 'That provider cannot be recommended.' using errcode = 'PT432';
    end if;
    if new.tagged_booking_id is not null then
      if not exists (
        select 1 from public.bookings b
         where b.id = new.tagged_booking_id
           and b.user_id = (select auth.uid())
           and b.provider_id = new.tagged_provider_id
           and b.completed_at is not null
      ) then
        raise exception 'That booking does not support this recommendation.'
          using errcode = 'PT433';
      end if;
    end if;
  else
    new.tagged_provider_id := null;
    new.tagged_booking_id  := null;
  end if;

  return new;
end;
$$;

alter function public.enforce_community_post_integrity() owner to postgres;
revoke all on function public.enforce_community_post_integrity()
  from public, anon, authenticated;
