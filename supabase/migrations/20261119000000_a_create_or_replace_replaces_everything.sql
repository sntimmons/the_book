-- FORWARD CORRECTION to 20261118000000, which was too wide by two functions.
--
-- ══ I REWROTE FIVE FUNCTIONS FROM THE BASELINE. TWO HAD MOVED ON. ═════════
--
-- `20261118000000` fixed a real defect: five counter trigger functions had no
-- `search_path` setting and unqualified relation names, so they died with `42P01`
-- inside the erasure engine's `search_path = ''` context.
--
-- I took all five bodies from the canonical baseline. But `update_community_like_count`
-- and `update_community_reply_count` had been **redefined since** —
-- `20261089000000:196-231` made them `security definer`, already schema-qualified,
-- already `set search_path = ''`. They were never part of the defect. My
-- `create or replace` silently dropped the `security definer`, and
-- `create or replace function` replaces the WHOLE definition: body, volatility,
-- security context and settings together. There is no partial form.
--
-- The consequence was immediate and is worth stating, because it is exactly the
-- failure `20261095000000` already documented once: without `security definer` the
-- counter's `update public.community_posts` runs as the LIKER, who is not the
-- post's author and whose RLS UPDATE policy does not match the row — so the
-- statement updated zero rows and **every community like and reply count stopped
-- moving**, silently, with no error anywhere. Three committed assertions caught it
-- on the next run.
--
-- ── THE RULE I SHOULD HAVE FOLLOWED ───────────────────────────────────────
--
-- **Never reconstruct a function body from the baseline.** The baseline is the
-- oldest text in the repository, and `MIGRATION_LEDGER.md` exists precisely
-- because later files supersede it. `grep` for every definition of the name first,
-- and take the LAST one. `20261066000000` is the same lesson for views; this is it
-- for functions.
--
-- Restored verbatim from `20261089000000`, the live definition before
-- `20261118000000` touched them.
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
  'LIVE DEFINITION: 20261119000000, restoring 20261089000000 verbatim after '
  '20261118000000 rewrote it from the canonical baseline and dropped the SECURITY '
  'DEFINER. **It must stay SECURITY DEFINER**: the liker is not the post''s author, '
  'so without it the increment runs under the liker''s RLS, matches no row, and '
  'every like count silently stops moving (the same failure 20261095000000 '
  'documents from the other direction). And a create-or-replace replaces the '
  'security context along with the body.';

comment on function public.update_community_reply_count() is
  'LIVE DEFINITION: 20261119000000, restoring 20261089000000 verbatim. Must stay '
  'SECURITY DEFINER for the same reason as its like-count sibling: a replier is '
  'not the post''s author.';

-- ── WHAT 20261118000000 GOT RIGHT AND KEEPS ───────────────────────────────
--
-- The three `posts` counters — comment, like and save — genuinely had no
-- search_path setting and unqualified names, and they keep the fix. They are
-- deliberately NOT made definer here: that is a live behavioural question about
-- who may move a post's counters, they have been non-definer since the baseline,
-- and this file exists to undo an unintended change rather than to make another.
comment on function public.update_post_like_count() is
  'Keeps posts.like_count in step. Pinned to an empty search_path with qualified '
  'names since 20261118000000, because a trigger function with no search_path '
  'inherits the CALLER''s — and inside the erasure engine that is empty, which '
  'made the unqualified version fail with 42P01 and abort the whole erasure. NOT '
  'security definer, which is how it has always been: unlike the community '
  'counters, that has not been revisited, and this comment is not a claim that it '
  'is right.';
