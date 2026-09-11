-- COMMUNITY RESHAPE — replies become answers, and the counters become true.
--
-- ══ THE FOURTH PROVIDER ACTION IS A REPLY, NOT A POST ═════════════════════
--
-- "Answer client question" is one of the four things a provider can do, and it
-- is deliberately NOT a fourth post intent. An answer that is not attached to
-- the question is how a service community turns into a feed: the question sits
-- unanswered, the answer floats free of it, and the person who asked has to find
-- it. So a provider answers IN the thread, and the reply carries who is speaking
-- the same way a post does.
--
-- `kind = 'can_help'` is the one structured response worth having. A client who
-- posts "looking for someone" does not need a conversation — they need a short
-- list of providers who can do it and a way to reach them. `can_help` is that
-- signal, attached to the provider it names, so the surface can offer the
-- profile / message / book actions instead of a comment thread.
--
-- ══ AND THE COUNTERS HAVE NEVER WORKED ════════════════════════════════════
--
-- `update_community_like_count` / `update_community_reply_count` are SECURITY
-- INVOKER — they run as the LIKER — and they `update community_posts`, whose
-- only UPDATE policy is `auth.uid() = user_id`. When the liker is not the post's
-- author, which is the entire point of a like, RLS filters the target row and the
-- UPDATE affects **zero rows, silently**. Both numbers have been stuck at 0 for
-- every post anyone else interacted with, and the app's optimistic local
-- increments hid it until reload.
--
-- This is fixed BEFORE anything is built on those numbers, and the fix is the
-- narrow one: the functions become SECURITY DEFINER so they can write the
-- counter, with `search_path` pinned. **No UPDATE policy is widened** — the
-- author's own edit boundary is untouched, and nothing else gains the ability to
-- write a post's content.
--
-- They still do not RANK anything. `like_count` is a number on a card; it is not
-- an input to the feed order and it is not an input to provider discovery.

-- ── 1. Replies carry an actor too ─────────────────────────────────────────
alter table public.community_replies
  alter column provider_id drop not null;

alter table public.community_replies
  add column if not exists author_kind text not null default 'provider',
  add column if not exists kind        text not null default 'reply';

update public.community_replies
   set author_kind = 'provider', kind = 'reply'
 where author_kind is null or kind is null;

alter table public.community_replies
  alter column author_kind drop default,
  alter column kind        drop default;

alter table public.community_replies
  drop constraint if exists community_replies_author_kind_check,
  drop constraint if exists community_replies_kind_check,
  drop constraint if exists community_replies_provider_matches_actor_check,
  drop constraint if exists community_replies_can_help_is_a_provider_check;

alter table public.community_replies
  add constraint community_replies_author_kind_check
    check (author_kind in ('client', 'provider')),
  add constraint community_replies_kind_check
    check (kind in ('reply', 'can_help')),
  add constraint community_replies_provider_matches_actor_check
    check ((author_kind = 'provider') = (provider_id is not null)),
  -- "I can help" is a business offering to do the work. A client cannot send it,
  -- because there is nothing they could be offering.
  add constraint community_replies_can_help_is_a_provider_check
    check (kind = 'reply' or author_kind = 'provider');

comment on column public.community_replies.kind is
  '''reply'' is ordinary text. ''can_help'' is a provider answering a client''s '
  'request — the structured response a "looking for someone" post actually needs, '
  'so the surface can offer profile / message / book instead of a comment thread. '
  'Providers only: a client has nothing to be offering.';

comment on column public.community_replies.author_kind is
  'Who is speaking. Server-bound exactly as on community_posts: a ''provider'' '
  'reply is rewritten to the caller''s own APPROVED provider, and a caller with '
  'no eligible provider cannot write one.';

-- ── 2. The same integrity rules, on the same terms ────────────────────────
create or replace function public.enforce_community_reply_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_eligible uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A community reply cannot be edited.'
      using errcode = 'check_violation';
  end if;

  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sign in to reply.' using errcode = '42501';
  end if;

  new.user_id    := (select auth.uid());
  new.created_at := clock_timestamp();

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

  -- A BLOCK STOPS A REPLY, which the posts side gets for free from the view and
  -- the replies side did not: the feed hid the post, but a blocked party holding
  -- a post id could still insert a reply under it. Replies are where contact
  -- actually happens, so this is the write gate that matters.
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

comment on function public.enforce_community_reply_integrity() is
  'Binds a community reply to its author, refuses a provider reply from a caller '
  'with no eligible approved provider, and REFUSES A REPLY ACROSS A BLOCK in '
  'either direction. The last one is the gap the read-side block filter left: '
  'the feed hid the post, but a blocked party holding a post id could still '
  'reply under it — and replies are where contact actually happens.';

drop trigger if exists a_community_replies_integrity on public.community_replies;
create trigger a_community_replies_integrity
  before insert or update on public.community_replies
  for each row execute function public.enforce_community_reply_integrity();

-- ── 3. Reply policies ─────────────────────────────────────────────────────
drop policy if exists community_replies_provider_read   on public.community_replies;
drop policy if exists community_replies_provider_insert on public.community_replies;
drop policy if exists community_replies_owner_delete    on public.community_replies;

create policy community_replies_read on public.community_replies
  for select to authenticated
  using (true);

create policy community_replies_insert on public.community_replies
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy community_replies_owner_delete on public.community_replies
  for delete to authenticated
  using (auth.uid() = user_id);
-- Deliberately NO update policy. A reply is a statement in a thread; editing one
-- after people have answered it rewrites the conversation.

drop view if exists public.community_replies_visible;
create or replace view public.community_replies_visible
with (security_invoker = false) as
select cr.id, cr.post_id, cr.provider_id, cr.user_id, cr.author_kind,
       cr.kind, cr.content, cr.created_at
  from public.community_replies cr
 where not exists (
   select 1 from public.user_blocks b
    where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cr.user_id)
       or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cr.user_id)
 );

revoke all on public.community_replies_visible from public, anon;
grant select on public.community_replies_visible to authenticated;

comment on view public.community_replies_visible is
  'Thread replies as one viewer sees them, carrying the bidirectional block '
  'filter (PD-089) and the actor columns. Definer view, authenticated only. '
  'Columns listed explicitly so a column added to community_replies is not '
  'published here by accident.';

create index if not exists community_replies_post_idx
  on public.community_replies (post_id, created_at);

-- ── 4. The counters, made true ────────────────────────────────────────────
create or replace function public.update_community_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set like_count = like_count + 1 where id = new.post_id;
    return new;
  else
    update public.community_posts
       set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

create or replace function public.update_community_reply_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set reply_count = reply_count + 1 where id = new.post_id;
    return new;
  else
    update public.community_posts
       set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end;
$$;

alter function public.update_community_like_count()  owner to postgres;
alter function public.update_community_reply_count() owner to postgres;
revoke all on function public.update_community_like_count()  from public, anon, authenticated;
revoke all on function public.update_community_reply_count() from public, anon, authenticated;

comment on function public.update_community_like_count() is
  'Maintains community_posts.like_count. SECURITY DEFINER because it must be: as '
  'SECURITY INVOKER it ran as the liker and the post''s only UPDATE policy is '
  'auth.uid() = user_id, so every like by someone other than the author updated '
  'ZERO ROWS, silently. `greatest(…, 0)` because a counter that can go negative '
  'is worse than one that is late. This number does not rank anything — not the '
  'feed, and never provider discovery.';

comment on function public.update_community_reply_count() is
  'Maintains community_posts.reply_count, SECURITY DEFINER for the same reason '
  'as the like counter: as invoker it was filtered out by the post''s own UPDATE '
  'policy and never incremented for anyone else''s post. Ranks nothing.';

-- Re-derive both, because every count on every post that anyone but its author
-- interacted with is currently wrong and nothing else will ever correct it.
update public.community_posts cp
   set like_count  = coalesce((select count(*) from public.community_post_likes l
                                where l.post_id = cp.id), 0),
       reply_count = coalesce((select count(*) from public.community_replies r
                                where r.post_id = cp.id), 0);

-- ── 5. Likes and bookmarks under the new actor model ──────────────────────
--
-- These were ALREADY open to any authenticated user — the INSERT gates check
-- only `auth.uid() = user_id` and never the provider membership that posting and
-- reading required. So "provider-only" was 4/6 enforced, and the two unenforced
-- verbs are exactly the two that now SHOULD be open. The gates are restated
-- rather than left accidental, and the like READ is fixed: it was
-- provider-gated, so a client could insert a like and then not read it back —
-- the heart would never show as filled.
drop policy if exists community_likes_provider_read on public.community_post_likes;
drop policy if exists community_likes_insert        on public.community_post_likes;
drop policy if exists community_likes_delete        on public.community_post_likes;

create policy community_likes_own_read on public.community_post_likes
  for select to authenticated using (auth.uid() = user_id);
create policy community_likes_own_insert on public.community_post_likes
  for insert to authenticated with check (auth.uid() = user_id);
create policy community_likes_own_delete on public.community_post_likes
  for delete to authenticated using (auth.uid() = user_id);

comment on table public.community_post_likes is
  'Who liked what. OWN-ROW ONLY in every direction: a viewer reads their own '
  'likes to render the filled heart, and the public number comes from '
  'community_posts.like_count. Nobody can enumerate who liked a post, and '
  'nothing ranks on this — not the feed, and never provider discovery.';
