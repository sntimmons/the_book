-- Deposit settings per service, editable from the provider services dashboard.
--
-- provider_services previously had no deposit columns — the onboarding form
-- captured a deposit toggle/amount in local state but never persisted it. These
-- columns let a provider require a deposit (fixed dollar amount or a percentage
-- of the service price) and edit it after onboarding.

alter table public.provider_services
  add column if not exists deposit_required boolean not null default false,
  add column if not exists deposit_type text not null default 'fixed'
    check (deposit_type in ('fixed', 'percentage')),
  add column if not exists deposit_amount numeric not null default 0;
