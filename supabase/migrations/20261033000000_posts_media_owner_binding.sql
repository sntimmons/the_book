-- Pre-Beta Correction 2 — posts-media objects are bound to their owner.
--
-- ── THE DEFECT, REPRODUCED AGAINST NON-PRODUCTION ─────────────────────────
--
-- Provider B, authenticated, uploaded a file to
--
--   <PROVIDER A's auth uid>/portfolio/<ts>_spoof.jpg
--
-- in the public `posts-media` bucket. IT SUCCEEDED. The live policy is
--
--   posts_media_authenticated_upload  INSERT  WITH CHECK (bucket_id = 'posts-media')
--
-- and that is the whole of it: a bucket check with no owner binding. Security
-- Batch 2a closed the identical hole on `provider-media` and its header records
-- that `posts-media` was deliberately left out of that batch. This closes it on
-- the same pattern, after confirming the path convention rather than assuming it:
-- every caller (`business/portfolio.tsx`, `business/posts.tsx`, and both
-- `golive.tsx` uploads) passes `user.id` into `generatePath`, which produces
-- `${userId}/${folder}/${ts}_${rand}.${ext}` — the same first-segment-is-the-
-- owner shape `provider-media` already relies on.
--
-- ── AND A SECOND DEFECT THE REPRODUCTION FOUND ────────────────────────────
--
-- `posts-media` had NO UPDATE and NO DELETE policy at all. The consequence is
-- not "delete is blocked" — it is worse than that:
--
--   provider B deletes their OWN object   -> API reported SUCCESS
--   the object was still there afterwards -> the delete had NO EFFECT
--   provider A deletes B's object         -> API reported SUCCESS, likewise none
--
-- A remove that returns success and removes nothing is the failure mode that
-- makes a retention promise impossible to keep, because nothing surfaces the
-- problem. Owner-scoped UPDATE and DELETE policies are added so a delete either
-- happens or is refused.
--
-- ── SCOPE, AND WHAT IS DELIBERATELY NOT DONE ──────────────────────────────
--
-- This migration fixes AUTHORIZATION only. There is currently NO user-facing
-- delete for portfolio media, posts or reels — `business/portfolio.tsx` and
-- `business/posts.tsx` are upload-only, and no `.remove()` call exists anywhere
-- in the app. `community_posts` has no media column, so its delete path orphans
-- nothing. So there is no authorization/retention MISMATCH to repair: there is a
-- missing feature, and inventing that UX is out of scope for a security slice.
-- Recorded for Founder review instead.
--
-- Public read is preserved exactly: this bucket backs the discovery feed's hero
-- images and the reels player, both of which read by public URL.

-- ── 1. INSERT: only into your own top-level folder ──────────────────────────
drop policy if exists "posts_media_authenticated_upload" on storage.objects;
create policy "posts_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'posts-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 2. UPDATE: the object must be yours BEFORE and AFTER ───────────────────
-- WITH CHECK as well as USING, so an object cannot be renamed or moved INTO
-- someone else's folder — the same pairing `provider_media_owner_update` uses.
drop policy if exists "posts_media_owner_update" on storage.objects;
create policy "posts_media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'posts-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'posts-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. DELETE: only your own objects ───────────────────────────────────────
-- New capability, and narrow by construction. Before this there was no DELETE
-- policy, so every delete silently did nothing while reporting success; after
-- it, a delete of your own object works and a delete of anyone else's is refused.
drop policy if exists "posts_media_owner_delete" on storage.objects;
create policy "posts_media_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'posts-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 4. Public read is intentional and unchanged ────────────────────────────
-- `posts_media_public_read` (`FOR SELECT USING (bucket_id = 'posts-media')`,
-- role `public`) is deliberately left as-is: the bucket is public and the feed
-- renders these objects by public URL for signed-out and signed-in viewers alike.
-- Restated here so a reader knows the omission is a decision, not an oversight.
