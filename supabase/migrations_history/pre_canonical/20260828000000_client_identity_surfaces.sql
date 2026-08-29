-- =============================================================================
-- S1B-impl-1: Additive client identity surfaces (Block 1 ONLY)
-- =============================================================================
-- Scope of THIS migration (deliberately narrow):
--   * create public.clients_public   (general display identity)
--   * create public.clients_provider (provider relationship-scoped client info)
--   * lock their grants to authenticated SELECT only (no anon)
--
-- This migration is ADDITIVE and changes nothing about the base table:
--   * it does NOT enable RLS on public.clients
--   * it does NOT alter any existing public.clients grant or policy
--   * it does NOT touch application code
-- Base-table lockdown (RLS + self policies + grant cleanup) is a SEPARATE later
-- migration (S1B-impl-3), applied only after app reads move onto these views.
--
-- SECURITY NOTE (intentional design): both views are definer-style
-- (security_invoker = false) and owned by a BYPASSRLS role (postgres), so they
-- read the base clients rows regardless of clients RLS. Their SELECT lists and
-- the clients_provider WHERE predicate are therefore SECURITY BOUNDARIES and
-- must not be broadened without review.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- clients_public: general public display identity.
-- Exposes ONLY id, name, avatar_url for every client. Used where a name/avatar
-- is legitimately visible independent of any business relationship (e.g. review
-- authors, comment authors). Never exposes notes / neighborhood / created_at.
-- -----------------------------------------------------------------------------
create or replace view public.clients_public
  with (security_invoker = false) as
  select
    c.id,
    c.name,
    c.avatar_url
  from public.clients c;

-- Ensure a BYPASSRLS owner so the projection works before/after base RLS lands.
-- (Migrations already run as postgres; this makes the definer intent explicit.)
alter view public.clients_public owner to postgres;

-- Grants: read-only, authenticated only. The revoke strips any default-privilege
-- auto-grant (Supabase grants new objects to anon/authenticated by default, and a
-- simple projection view can be auto-updatable, so revoke ALL first to guarantee
-- SELECT-only and no anon exposure), then grant exactly SELECT to authenticated.
revoke all on public.clients_public from anon, authenticated;
grant select on public.clients_public to authenticated;


-- -----------------------------------------------------------------------------
-- clients_provider: provider workflow surface.
-- Exposes ONLY id, name, created_at, neighborhood, and ONLY for clients linked
-- to the CALLING provider through a booking or a conversation. Deliberately
-- excludes notes and avatar_url. auth.uid() reflects the caller's JWT even under
-- the definer view, so the WHERE self-scopes per provider.
-- -----------------------------------------------------------------------------
create or replace view public.clients_provider
  with (security_invoker = false) as
  select
    c.id,
    c.name,
    c.created_at,
    c.neighborhood
  from public.clients c
  where exists (
          -- booking relationship: a booking whose client is this row and whose
          -- provider is owned by the caller
          select 1
          from public.bookings b
          join public.providers p on p.id = b.provider_id
          where b.user_id = c.id
            and p.user_id = auth.uid()
        )
     or exists (
          -- conversation relationship: a conversation whose client is this row
          -- and whose provider is owned by the caller
          select 1
          from public.conversation cv
          join public.providers p on p.id = cv.provider_id
          where cv.client_id = c.id
            and p.user_id = auth.uid()
        );

alter view public.clients_provider owner to postgres;

-- Grants: read-only, authenticated only; no anon. (Same rationale as above.)
revoke all on public.clients_provider from anon, authenticated;
grant select on public.clients_provider to authenticated;
