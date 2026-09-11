-- COMMUNITY MODERATION — a report an operator can actually act on.
--
-- ══ THE GAP THIS CLOSES ═══════════════════════════════════════════════════
--
-- Reporting a Community post already creates durable operator work: it writes
-- `public.reports`, `reports_open_case` opens an `operator_cases` row, and an
-- operator can claim, resolve, dismiss and note it. **What did not exist was an
-- OUTCOME.** `community_posts.is_active` had no writer anywhere — not the app,
-- not an RPC, not a migration — so an operator could read a case, decide the
-- content should come down, and have no way to take it down.
--
-- `20261088000000` documented that column as RESERVED AND UNUSED precisely so
-- nobody would wire a button to it and discover it failed silently. This is the
-- migration that makes it real, and it is deliberately the smallest thing that
-- can be: **hide and restore, for Community posts and replies, by an authorized
-- operator, through one audited path.**
--
-- ══ WHAT THIS IS NOT ══════════════════════════════════════════════════════
--
-- **Hiding is not deletion.** The row stays, the report stays, the case stays,
-- the operator's action history stays. That distinction is the whole design: a
-- moderation decision has to be reviewable, reversible and attributable, and a
-- deleted row is none of those. **Do not turn this into a delete.**
--
-- There is no bulk action, no keyword filter, no automated or scored moderation,
-- no auto-ban, no priority queue and no SLA. A person reads a case and decides.
--
-- ══ WHY A SESSION MARKER AND AN OPERATOR CHECK, TOGETHER ══════════════════
--
-- `enforce_community_post_integrity` pins `is_active` for every client role, and
-- that pin must survive — an author who could flip it would undo a take-down.
-- But the operator RPC runs with the operator's own JWT, so its claim is
-- `authenticated` too: **the legitimate writer and the forger present
-- identically**, which is the same trap the counters fell into one migration ago.
--
-- Neither half alone is enough:
--
--   * `is_operator()` alone would let an operator PATCH `is_active` straight
--     through PostgREST — authorized, but with no audit row, which defeats the
--     point of having one.
--   * a session marker alone is forgeable by anyone: `set_config` on a custom
--     GUC is available to every caller.
--
-- Together they are exactly "an authorized operator, acting through the audited
-- path". A non-operator fails the first test; an operator taking a shortcut
-- fails the second, **loudly** rather than silently, because a privileged action
-- that quietly does nothing is how `is_active` became a trap in the first place.
--
-- `service_role` still bypasses everything, as it does on every table here. That
-- is the accepted trusted-infrastructure posture (OQ-080's ruling), not a hole
-- this migration opens: the product boundary is that **no client, provider or
-- operator UI path can change visibility except through the audited RPC.**

-- ── 1. Replies can be hidden too ──────────────────────────────────────────
alter table public.community_replies
  add column if not exists is_active boolean not null default true;

comment on column public.community_replies.is_active is
  'False when an operator has HIDDEN this reply from ordinary surfaces. The row '
  'is kept — hiding is a visibility decision, not evidence deletion. Writable '
  'only through operator_set_community_visibility(); the integrity trigger '
  'refuses every other path.';

-- ── 2. The audit trail ────────────────────────────────────────────────────
--
-- A separate table rather than `operator_case_events`, for one reason:
-- moderation can happen WITHOUT a case (an operator finding something directly),
-- and `operator_case_events.case_id` is not nullable. When there IS a case, both
-- are written, so the case trail shows the action too.
create table if not exists public.community_moderation_actions (
  id             uuid primary key default gen_random_uuid(),
  target_kind    text not null,
  post_id        uuid references public.community_posts(id)   on delete cascade,
  reply_id       uuid references public.community_replies(id) on delete cascade,
  action         text not null,
  actor_user_id  uuid references auth.users(id) on delete set null,
  case_id        uuid references public.operator_cases(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now(),
  constraint community_moderation_actions_kind_check
    check (target_kind in ('post', 'reply')),
  constraint community_moderation_actions_action_check
    check (action in ('hidden', 'restored')),
  constraint community_moderation_actions_post_target_check
    check ((target_kind = 'post') = (post_id is not null)),
  constraint community_moderation_actions_reply_target_check
    check ((target_kind = 'reply') = (reply_id is not null)),
  constraint community_moderation_actions_note_check
    check (note is null or char_length(note) <= 4000)
);

create index if not exists community_moderation_actions_post_idx
  on public.community_moderation_actions (post_id, created_at desc) where post_id is not null;
create index if not exists community_moderation_actions_reply_idx
  on public.community_moderation_actions (reply_id, created_at desc) where reply_id is not null;
create index if not exists community_moderation_actions_case_idx
  on public.community_moderation_actions (case_id) where case_id is not null;

comment on table public.community_moderation_actions is
  'Append-only record of every Community hide and restore: what, by whom, '
  'against which case, and when. Separate from operator_case_events because '
  'moderation can happen without a case and that column is not nullable; when '
  'there IS a case, both are written. This is what makes "hidden" distinguishable '
  'from "hidden then restored" — a boolean on the row cannot tell those apart, '
  'and an operator deciding whether to restore something needs to know it has '
  'been here before.';

alter table public.community_moderation_actions enable row level security;

-- No policy for any client role. An operator reads this through a SECURITY
-- DEFINER RPC, exactly as they read cases; a participant has no business
-- enumerating moderation decisions about other people.
revoke all on public.community_moderation_actions from public, anon, authenticated;

-- APPEND-ONLY, with the erasure carve-out written in from the start.
--
-- `actor_user_id` is `ON DELETE SET NULL`, and a set-null is an UPDATE — so an
-- append-only guard with no carve-out would make **deleting an operator who has
-- ever moderated anything fail outright.** That is defect (2) recorded under
-- OQ-077, and this session should not manufacture a third instance of it. The
-- carve-out is the standard one, first, before any other branch.
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
  raise exception 'A moderation action is a record of what was done and cannot be changed.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_moderation_actions_append_only() owner to postgres;
revoke all on function public.enforce_moderation_actions_append_only()
  from public, anon, authenticated;

drop trigger if exists community_moderation_actions_append_only
  on public.community_moderation_actions;
create trigger community_moderation_actions_append_only
  before update or delete on public.community_moderation_actions
  for each row execute function public.enforce_moderation_actions_append_only();

comment on function public.enforce_moderation_actions_append_only() is
  'A moderation action is a record of a decision, so it cannot be edited or '
  'deleted by any client role. service_role and no-claims sessions ARE carved '
  'out, deliberately and first: actor_user_id is ON DELETE SET NULL, and a '
  'set-null is an UPDATE — without the carve-out, deleting an operator who had '
  'ever moderated anything would fail outright, which is exactly the OQ-077 '
  'defect this session must not reproduce.';

-- ── 3. The integrity triggers learn the one authorized exception ──────────
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
        and coalesce(pg_catalog.current_setting('app.community_moderation', true), '') = 'on'
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
    -- A reply is a statement in a conversation and still cannot be rewritten.
    -- The ONE exception is the same audited moderation path the posts side has,
    -- and it may change nothing but the visibility flag.
    if new.is_active is distinct from old.is_active
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
        and coalesce(pg_catalog.current_setting('app.community_moderation', true), '') = 'on'
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

-- ── 4. Hidden replies leave the ordinary surfaces ─────────────────────────
drop view if exists public.community_replies_visible;
create view public.community_replies_visible
with (security_invoker = false) as
select cr.id, cr.post_id, cr.provider_id, cr.user_id, cr.author_kind,
       cr.kind, cr.content, cr.created_at
  from public.community_replies cr
 where cr.is_active
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cr.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cr.user_id)
   );

alter view public.community_replies_visible owner to postgres;
revoke all on public.community_replies_visible from public, anon;
grant select on public.community_replies_visible to authenticated;

comment on view public.community_replies_visible is
  'Thread replies as one viewer sees them: the bidirectional block filter '
  '(PD-089) and, since 20261096000000, the operator visibility flag. A hidden '
  'reply is absent from every ordinary surface and still present in the table, '
  'because hiding is a visibility decision and not evidence deletion.';

-- ── 5. The one way to change visibility ───────────────────────────────────
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
  v_changed boolean := false;
begin
  if not public.is_operator() then
    raise exception 'Moderation is not available.' using errcode = 'insufficient_privilege';
  end if;

  -- THE NAMED ACTOR MUST BE THE CALLER (20261061000000). The id is a RECORD of
  -- who acted, never a claim of authority — but the moment a client can reach
  -- the function, an unbound parameter is a way to file a false record against
  -- somebody else. When there is no caller identity (service_role, a migration)
  -- the parameter keeps its original meaning.
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

  -- The marker is set for the narrowest possible window: taken immediately
  -- before the write and dropped immediately after, so nothing else in the
  -- transaction inherits the permission.
  perform set_config('app.community_moderation', 'on', true);

  if p_target_kind = 'post' then
    select cp.is_active into v_was from public.community_posts cp
     where cp.id = p_target_id for update;
    if not found then
      perform set_config('app.community_moderation', 'off', true);
      raise exception 'That post no longer exists.' using errcode = 'check_violation';
    end if;
    if v_was = p_hidden then   -- is_active = hidden means a change is needed
      update public.community_posts set is_active = not p_hidden where id = p_target_id;
      v_changed := true;
    end if;
  else
    select cr.is_active into v_was from public.community_replies cr
     where cr.id = p_target_id for update;
    if not found then
      perform set_config('app.community_moderation', 'off', true);
      raise exception 'That reply no longer exists.' using errcode = 'check_violation';
    end if;
    if v_was = p_hidden then
      update public.community_replies set is_active = not p_hidden where id = p_target_id;
      v_changed := true;
    end if;
  end if;

  perform set_config('app.community_moderation', 'off', true);

  -- RECORDED ONLY WHEN SOMETHING CHANGED. An audit trail full of "hid an already
  -- hidden post" entries is one nobody reads, and the honest answer to a
  -- repeated click is the state, not a new row.
  if v_changed then
    insert into public.community_moderation_actions
      (target_kind, post_id, reply_id, action, actor_user_id, case_id, note)
    values (p_target_kind,
            case when p_target_kind = 'post'  then p_target_id end,
            case when p_target_kind = 'reply' then p_target_id end,
            case when p_hidden then 'hidden' else 'restored' end,
            p_actor_user_id, p_case_id, v_note);

    -- When there is a case, the case trail shows it too, so an operator reading
    -- the history sees the decision next to the discussion of it.
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
  'The ONLY path that changes Community visibility. Granted to authenticated '
  'because that is what an operator signs in as; is_operator() is what decides. '
  'Hiding KEEPS the row, the report and the case — it is a visibility decision, '
  'not evidence deletion, and it is reversible by the same call with p_hidden '
  'false. Every change appends to community_moderation_actions, and to '
  'operator_case_events when a case is named. It does not suspend anyone, '
  'restrict a provider or resolve a case: those are separate, separately audited '
  'actions, and bundling them would hide three decisions behind one click.';
