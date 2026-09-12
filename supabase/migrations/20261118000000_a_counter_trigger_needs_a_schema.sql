-- FORWARD CORRECTION to the canonical baseline, found by the account-erasure suite.
--
-- ══ FIVE COUNTER TRIGGERS THAT CANNOT RUN INSIDE AN ERASURE ═══════════════
--
-- `update_post_comment_count`, `update_post_like_count`, `update_post_save_count`,
-- `update_community_like_count` and `update_community_reply_count` all date from
-- the canonical baseline, and all five share two properties:
--
--     LANGUAGE plpgsql        -- no `security definer`, and no `set search_path`
--     update posts set …      -- and an UNQUALIFIED relation name
--
-- A trigger function with no `search_path` setting **inherits the search_path of
-- whatever is running the statement.** Every step of the erasure engine is
-- `security definer set search_path = ''`, exactly as this repo requires of every
-- definer function. So the moment a step deletes one of these child rows, the
-- AFTER trigger fires with an empty search_path and dies:
--
--     42P01: relation "posts" does not exist
--
-- `adel_community_content` deletes `community_replies` and, since
-- `20261114000000`, `post_comments`. `adel_profile_account` deletes `post_likes`,
-- `post_saves` and `community_post_likes`. **So erasing any account that had ever
-- liked a post, saved one, replied in Community or commented on a Reel failed the
-- step** — leaving the request in `failed`, the credentials valid, and nothing
-- deleted. For a consumer app that is close to every account.
--
-- Nothing caught it because no fixture had ever seeded a like or a comment. The
-- new suite seeds both and the step failed on its first run.
--
-- ── WHY THIS BELONGS TO THE TRIGGERS AND NOT TO THE CALLERS ───────────────
--
-- `search_path = ''` is not an erasure quirk to be worked around. It is what every
-- SECURITY DEFINER function in this schema sets, because an unqualified name
-- inside a definer function is precisely how a caller-controlled schema hijacks a
-- privileged query. Any future definer function touching these tables inherits the
-- same failure, so the fix is in the trigger functions.
--
-- Bodies are otherwise IDENTICAL to the baseline, `greatest(… - 1, 0)` floor
-- included. The only changes are the schema qualification and the pinned
-- search_path.
create or replace function public.update_post_comment_count()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create or replace function public.update_post_like_count()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create or replace function public.update_post_save_count()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set save_count = save_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set save_count = greatest(save_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create or replace function public.update_community_like_count()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    update public.community_posts set like_count = like_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.community_posts set like_count = greatest(like_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create or replace function public.update_community_reply_count()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    update public.community_posts set reply_count = reply_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.community_posts set reply_count = greatest(reply_count - 1, 0) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['update_post_comment_count', 'update_post_like_count',
                            'update_post_save_count', 'update_community_like_count',
                            'update_community_reply_count'] loop
    execute format('alter function public.%I() owner to postgres', fn);
  end loop;
end $$;

comment on function public.update_post_comment_count() is
  'Keeps posts.comment_count in step. The pinned empty search_path and the '
  'qualified relation name are LOAD-BEARING, not tidiness: a trigger function with '
  'no search_path setting inherits the CALLER''s, and every SECURITY DEFINER '
  'function in this schema sets that to empty — so the unqualified baseline '
  'version died with 42P01 the moment an erasure step deleted a comment, failing '
  'the whole erasure (20261118000000). The same applies to the four sibling '
  'counters, which were fixed in the same file.';
