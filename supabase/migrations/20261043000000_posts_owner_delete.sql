-- Pre-Session-8 Correction 3 (item L) — a provider can delete their own media.
--
-- ── THE GAP ───────────────────────────────────────────────────────────────
--
-- `public.posts` carries every piece of provider-authored media in the product:
-- portfolio photos, posts, and the video content Reels plays. It has had three
-- policies since the canonical baseline — `posts_insert_own`, `posts_public_read`
-- and `posts_update_own` — and NO DELETE POLICY AT ALL. There is also no delete
-- control on any provider screen.
--
-- So a provider who uploaded the wrong photo, or a photo of a client who later
-- asked for it to come down, had no way to remove it. Not a hard one — none. The
-- only workaround was to ask someone with database access, which is not a
-- product. For media a person may have a real reason to withdraw, and which is
-- PUBLICLY READABLE the moment it is inserted (`posts_public_read` is
-- unauthenticated), that is the gap this closes.
--
-- ── WHY A HARD DELETE ─────────────────────────────────────────────────────
--
-- The alternative was `is_active = false` through the existing update policy, and
-- it is the wrong answer here. `posts_public_read` requires `is_active`, so a
-- deactivated row becomes invisible to its own author as well — a provider would
-- press Delete and then be unable to see, verify or recover what they had done.
-- More importantly, a provider deleting a photo of a person who asked for it to
-- come down means it is GONE, and a row that is merely flagged is not gone.
--
-- The storage object is deleted by the client alongside the row. Correction 2's
-- `20261033000000` already bound `posts-media` objects to their uploader with
-- owner-scoped INSERT, UPDATE and DELETE policies, so that half needs nothing
-- here: a provider may delete their own file and no one else's.
--
-- ── THE ORDER OF OPERATIONS, AND THE FAILURE IT ACCEPTS ───────────────────
--
-- The client deletes the ROW first and the storage object second. If the second
-- step fails the file is orphaned in a bucket, which costs storage and nothing
-- else: nothing links to it any more, it is not in any feed, and it is not on any
-- profile. The reverse order can fail with the row still present and its image
-- gone, which is a broken card on a public profile. Given one of the two must be
-- possible, the orphan is the one to accept.

-- ── 1. The owner may delete their own row ───────────────────────────────────
-- Predicate copied from `posts_insert_own` verbatim so ownership means exactly
-- one thing on this table: the caller is the user behind the provider the row
-- belongs to. Narrowed to `authenticated`, which is the only role that can
-- satisfy it — the baseline policies omit a role clause and default to `public`.
drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (
    (select auth.uid()) = (
      select p.user_id from public.providers p where p.id = posts.provider_id
    )
  );

-- Correction 2 (`20261035000000`) revoked the blanket privileges this schema had
-- been granting, so the policy alone is not enough — without the grant the DELETE
-- is refused before any policy is consulted.
grant delete on table public.posts to authenticated;

-- ── 2. While here: the update policy could hand a row to someone else ──────
--
-- `posts_update_own` has a USING clause and NO WITH CHECK. USING decides which
-- rows may be updated; WITH CHECK decides what they may be updated INTO. Without
-- the second half a provider could take their own row and set `provider_id` to
-- ANOTHER provider — publishing media onto a stranger's public profile under
-- their name, which is exactly the kind of ownership defect Correction 2 closed
-- on `contracts`, `contract_signatures` and `posts-media` storage.
--
-- Nothing in the app does this and no report says it happened; it is closed
-- because item L's brief is that media ownership be respected, and an update
-- boundary that only guards the source row does not respect it. The USING half is
-- reproduced unchanged, so no update that was legal before becomes illegal now
-- except the one that changes whose row it is.
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using (
    (select auth.uid()) = (
      select p.user_id from public.providers p where p.id = posts.provider_id
    )
  )
  with check (
    (select auth.uid()) = (
      select p.user_id from public.providers p where p.id = posts.provider_id
    )
  );

comment on table public.posts is
  'Provider-authored media: portfolio photos, posts, and the video content Reels '
  'plays. Publicly readable while is_active. Owner-scoped for insert, update and '
  '(since Correction 3 item L) delete, where "owner" is the user behind the '
  'provider named by provider_id — the same predicate in all three policies. '
  'Deleting a row does NOT remove the storage object; the client deletes that '
  'separately against the owner-scoped posts-media policies from 20261033000000.';
