-- FORWARD CORRECTION to 20261103000000 / 20261104000000 (PD-102 policy C).
-- Security review of 5977169: SEC-AUTHZ-001 (HIGH).
--
-- ══ I PRESERVED THE SIGNATURE AND LEFT THE CASCADE THAT DELETES IT ════════
--
-- `20261103000000` made the accepted-contract record survive the CLIENT: the
-- foreign key became `SET NULL`, `signer_subject_id` retained the party, and
-- `reports_target_check` was widened so the delete could succeed without the
-- evidence going with it.
--
-- I checked one direction. `contracts.user_id` is
-- `references auth.users(id) ON DELETE CASCADE` (baseline:2094), so erasing the
-- **PROVIDER** deletes the `contracts` row, which cascades into
-- `contract_versions` (`20261068000000:52`) and `contract_signatures`
-- (baseline:2084). Both cascades are `ON DELETE CASCADE`, and
-- `enforce_contract_version_immutable` explicitly permits DELETE on the erasure
-- paths — so the whole chain goes **silently, and succeeds**.
--
-- The loss is not the departing provider's. It is every CLIENT of theirs: the
-- exact version of the terms they accepted, when they accepted them, and the
-- booking it was accepted for. People who did not ask for anything, losing the
-- record of what they agreed to, because somebody else left.
--
-- A record-class HOLD could not have stopped it either. Holds are checked in
-- `run_account_deletion_step`; a referential cascade consults nothing.
--
-- ── THE FIX IS THE ONE 20261103000000 ALREADY CHOSE, APPLIED BOTH WAYS ────
--
-- The contract row outlives its author the way the signature outlives its
-- signer: the live owner link is severed, the row stays.
--
-- **No `owner_subject_id` column is added, and that is deliberate.** The other
-- retained classes needed one because nulling the id left no party at all. A
-- contract does not: `contracts.provider_id` points at `public.providers`, and
-- `adel_profile_account` keeps that row — emptied, ownerless, but PRESENT — for
-- exactly this reason. The provider-side party identity is already durable. The
-- minimum record policy C describes is intact without widening a table that
-- carries `GRANT ALL` to `anon` and `authenticated`, where a new column would be
-- readable the moment it existed (the mistake `20261107000000` had to correct
-- twice).
alter table public.contracts alter column user_id drop not null;

alter table public.contracts drop constraint if exists contracts_user_id_fkey;
alter table public.contracts
  add constraint contracts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

comment on column public.contracts.user_id is
  'The provider account that authored these terms. NULLABLE and ON DELETE SET '
  'NULL since 20261112000000: erasing the author must not delete the contract, '
  'because the clients who ACCEPTED it keep the record (PD-102 policy C, INTERIM '
  'pending attorney review). The party identity on this side survives as '
  'contracts.provider_id — the providers row is kept, emptied and ownerless, '
  'rather than deleted. Do not restore ON DELETE CASCADE.';

-- `contracts.provider_id` is `ON DELETE CASCADE` to `public.providers`, which is
-- correct and stays: the engine never deletes the providers row. Recorded so the
-- next person does not have to re-derive why one of the two is a cascade.
comment on constraint contracts_provider_id_fkey on public.contracts is
  'CASCADE, and safe: the erasure engine EMPTIES the providers row rather than '
  'deleting it (20261107000000), precisely so this cascade never fires. If a '
  'future change starts deleting provider rows, this becomes the same defect as '
  'SEC-AUTHZ-001 and this constraint must change with it.';

-- ══ THE STEP SEVERS IT DELIBERATELY, RATHER THAN LEAVING IT TO THE CASCADE ═
--
-- The referential SET NULL would do this by itself at the auth delete. Doing it
-- in the step means the sever is AUDITED — it lands in the step's `result` — and
-- that a raw `delete from auth.users` and the supported path leave the same
-- state, which is the property `20261106000000` was written to establish.
create or replace function public.adel_accepted_contracts(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_signed integer := 0; v_authored integer := 0;
begin
  -- CLIENT SIDE: the acceptance is kept, the signer is retained and severed.
  -- `retain_identity_on_sever` fills signer_subject_id from OLD; this update
  -- states the sever and lets the trigger keep the party.
  with u as (
    update public.contract_signatures
       set client_user_id = null
     where client_user_id = p_subject
    returning 1
  ) select count(*) into v_signed from u;

  -- PROVIDER SIDE: the terms are kept, the author link is severed. The party on
  -- this side is contracts.provider_id, which outlives the account.
  with u as (
    update public.contracts
       set user_id = null
     where user_id = p_subject
    returning 1
  ) select count(*) into v_authored from u;

  return jsonb_build_object('signatures_retained', v_signed,
                            'contracts_retained', v_authored);
end $$;

alter function public.adel_accepted_contracts(uuid) owner to postgres;
revoke all on function public.adel_accepted_contracts(uuid) from public, anon, authenticated;

comment on function public.adel_accepted_contracts(uuid) is
  'PD-102 policy C, BOTH DIRECTIONS. Severs the live account link on contract '
  'signatures (client side) and on contracts (provider side) while keeping every '
  'row: the accepted version, the timestamp, the booking and the minimum party '
  'identity. Retention duration for this class is UNSET and flagged for attorney '
  'review (OQ-084) — this function retains, it does not decide how long.';
