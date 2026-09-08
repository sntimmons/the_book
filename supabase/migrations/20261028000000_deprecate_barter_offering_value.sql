-- The Book stops collecting a dollar value for a barter offer (PD-069, Founder ruling 2026-09-08).
--
-- `barter_offers.offering_value` predates PD-069. The live product asked a provider to price
-- their own barter offer — an "ESTIMATED VALUE (OPTIONAL)" field in the composer — and then
-- rendered `~$N value` on the board card to every browsing provider. PD-069 says The Book does
-- not appraise, equalize or compare the value of a trade, and that providers decide for
-- themselves whether an exchange is worth accepting. A platform-rendered dollar figure beside a
-- barter offer teaches that parity is the standard, which is the exact effect that decision
-- exists to prevent.
--
-- The UX is removed in the same change as this migration. This is the server half: no NEW value
-- can be recorded, from any client, including one that has not been updated.
--
-- ── WHY THE COLUMN IS NOT DROPPED, AND THIS IS DELIBERATE ─────────────────
--
-- Dropping it would be destructive in two ways that outweigh the tidiness:
--
--   1. HISTORICAL DATA. Rows written before this ruling carry a figure a provider actually
--      entered. Deleting it is not "removing a feature", it is erasing a record.
--   2. THE PROPOSAL SNAPSHOT. `20260917000000` copies `offering_value` into every proposal
--      version's IMMUTABLE post snapshot (`:384`). Those snapshots are the evidence of what was
--      proposed at the time, they are never edited by design, and a dropped column would leave
--      the snapshot builder referencing something that no longer exists.
--
-- So the column is DEPRECATED, not removed: it stays, it stops being written, it stops being
-- read by any live surface, and it is documented as legacy historical data. Removing it, if that
-- is ever wanted, is a separate decision with its own data-retention question.
--
-- ── HOW NEW WRITES ARE STOPPED: NULLED, NOT REFUSED ───────────────────────
--
-- On INSERT the value is silently forced to NULL rather than raising. This is the deliberate
-- choice and the reason matters: a React Native app ships on its own cadence, so an installed
-- build that still sends `offering_value` will keep posting offers for weeks after this lands.
-- Refusing the write would break posting entirely for those users to enforce a field they cannot
-- see. Nulling it means the old client keeps working and simply stops recording the figure,
-- which is exactly what "stop collecting" asks for.
--
-- On UPDATE the value may stay as it is, or be cleared to NULL. It may never be introduced or
-- changed. That keeps a legacy offer EDITABLE — a provider can still fix their wording without
-- the trigger rejecting the row for carrying a value it inherited — while making the field
-- one-directional: it can only ever go away.
--
-- Written from the LIVE definition (`pg_get_functiondef`), not from the migration that created
-- it, and the existing body is preserved exactly: the `service_role` short-circuit, the INSERT
-- `created_at` stamp, and the id / created_at immutability check are unchanged in order and
-- wording. The `service_role` branch still returns first, matching this function's established
-- trust posture; the participant paths are what this rule governs.
create or replace function public.enforce_barter_offer_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    -- DEPRECATED FIELD (PD-069). Silently dropped rather than refused, so a not-yet-updated
    -- client can still post an offer. No new barter offer records a dollar value.
    new.offering_value := null;
    return new;
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Offer identity and creation time are not editable.'
      using errcode = 'check_violation';
  end if;
  -- ONE-DIRECTIONAL. A legacy value may be kept (so an old offer stays editable) or cleared,
  -- never introduced and never changed. `is distinct from` is required rather than `<>` because
  -- NULL is the ordinary case on both sides here.
  if new.offering_value is distinct from old.offering_value
     and new.offering_value is not null then
    raise exception 'Barter offers no longer carry an estimated value.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

alter function public.enforce_barter_offer_write() owner to postgres;
revoke all on function public.enforce_barter_offer_write() from public, anon, authenticated;
-- The trigger is NOT recreated: `create or replace function` preserves the OID, so
-- `barter_offers_write_integrity` still points at this body.

comment on column public.barter_offers.offering_value is
  'DEPRECATED and LEGACY-ONLY (PD-069, 2026-09-08). The Book does not appraise, equalize or '
  'compare the value of a barter trade, so no new offer records one: enforce_barter_offer_write '
  'nulls this on INSERT and refuses to introduce or change it on UPDATE. Existing values are '
  'retained as historical record and are rendered by NO live surface. Proposal-version post '
  'snapshots (20260917000000) still carry whatever was captured at the time, because those '
  'snapshots are immutable evidence of what was proposed. Do not add a replacement valuation, '
  'equivalency, fairness-warning, credit or token field — that reverses a locked decision.';
