-- FORWARD CORRECTION to 20261092000000 (Community Reshape).
--
-- ══ A DEFINER VIEW DOES NOT LEND ITS OWNER'S FUNCTION PRIVILEGES ══════════
--
-- `20261092000000` added the second block filter — on the provider a shoutout
-- NAMES — by calling `public.contact_blocked_provider()` from inside
-- `community_posts_visible`. That looked safe: the view is a definer view owned
-- by `postgres`, and `postgres` can execute anything.
--
-- **A view re-targets RELATION permission checks at its owner. It does not
-- re-target FUNCTION execute checks.** Those are still evaluated against
-- `current_user`. `contact_blocked_provider` is `revoke all … from public, anon`
-- (`20261046000000:207`), so any caller without an explicit grant — `anon`, and
-- any session that has dropped its role — reads the view and gets
-- `42501: permission denied for function contact_blocked_provider` instead of a
-- row set. It surfaced immediately in the existing blocked-surface suite.
--
-- This is the same class as `20261044000000`'s computed column: a privilege
-- model that is right for the OWNER and wrong for the CALLER, in a place where
-- the caller is who is checked.
--
-- ── THE FIX: THE VIEW OWNS ITS OWN PREDICATE ──────────────────────────────
--
-- The predicate is inlined — which is what the AUTHOR-side block filter in the
-- same view already does, four lines above. Now both halves of the same rule are
-- expressed the same way, read the same tables, and depend on no grant beyond
-- the view's own SELECT. The function stays exactly where it is for the WRITE
-- gates, which run as a real authenticated caller who does hold the grant.
drop view if exists public.community_posts_visible;
create view public.community_posts_visible
with (security_invoker = false) as
select cp.id, cp.provider_id, cp.user_id, cp.author_kind, cp.intent,
       cp.content, cp.service_tag, cp.area, cp.timing,
       cp.tagged_provider_id, cp.tagged_booking_id, cp.expires_at,
       cp.like_count, cp.reply_count, cp.created_at, cp.is_active
  from public.community_posts cp
 where cp.is_active
   -- PD-089, on the AUTHOR.
   and not exists (
     select 1 from public.user_blocks b
      where (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = cp.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = cp.user_id)
   )
   -- PD-089, on the provider a SHOUTOUT NAMES. Same rule, both directions,
   -- written the same way as the line above rather than through a function the
   -- caller may not be allowed to execute. A nameless card that still offers the
   -- action is worse than no filter at all (20261066000000).
   and not exists (
     select 1
       from public.providers p
       join public.user_blocks b
         on (b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = p.user_id)
         or (b.blocked_user_id = (select auth.uid()) and b.blocker_user_id = p.user_id)
      where p.id = cp.tagged_provider_id
   )
   -- The open_today time bound, and the requirement that the provider is STILL
   -- published as open. `providers_open_today()` is granted to anon and
   -- authenticated, so it is safe to call from here — which is precisely the
   -- check `contact_blocked_provider` failed.
   and (
     cp.intent <> 'open_today'
     or (cp.expires_at > now()
         and cp.provider_id in (select public.providers_open_today()))
   );

alter view public.community_posts_visible owner to postgres;
revoke all on public.community_posts_visible from public, anon;
grant select on public.community_posts_visible to authenticated;

comment on view public.community_posts_visible is
  'The community feed as ONE VIEWER sees it. Four rules the base table cannot '
  'carry: the bidirectional block filter on the AUTHOR, the same filter on the '
  'provider a SHOUTOUT NAMES, the open_today time bound, and the requirement '
  'that an open_today note''s provider is still published as open. Definer view '
  'OWNED BY postgres — ownership is the security context. **Both block '
  'predicates are INLINE, not function calls: a view re-targets relation '
  'permission checks at its owner and NOT function execute checks, so calling a '
  'function the caller may not execute turns every read into 42501.** Columns '
  'listed explicitly; the legacy `category` is not among them.';
