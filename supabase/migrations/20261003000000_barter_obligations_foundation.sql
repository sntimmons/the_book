-- Barter Obligations Foundation.
--
-- Every official agreement gets exactly TWO directed obligations, derived from the accepted
-- proposal version:
--   offer_owner term -> owner delivers, responder receives
--   responder term   -> responder delivers, owner receives
--
-- Additive architecture: an AFTER INSERT trigger on barter_agreements creates the pair in the
-- same transaction as finalize_barter_agreement, without rewriting that high-value RPC. The
-- same internal helper is idempotent for existing agreements and migration/backfill use.
--
-- This slice deliberately does NOT add delivery, receipt, cancellation, no-show, adjudication,
-- reviews, reputation, terminal states or any fulfilment lifecycle.

create table if not exists public.barter_obligations (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.barter_agreements(id) on delete cascade,
  source_term_id uuid not null unique references public.barter_proposal_terms(id) on delete cascade,
  side text not null,
  deliverer_provider_id uuid not null references public.providers(id) on delete cascade,
  deliverer_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_provider_id uuid not null references public.providers(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  agreed_description text not null,
  due_at timestamptz not null,
  scheduled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint barter_obligations_side_check check (side in ('offer_owner', 'responder')),
  constraint barter_obligations_distinct_users check (deliverer_user_id <> receiver_user_id),
  constraint barter_obligations_description_check
    check (char_length(btrim(agreed_description)) between 1 and 200),
  constraint barter_obligations_scheduled_before_due
    check (scheduled_at is null or scheduled_at <= due_at)
);

create unique index if not exists barter_obligations_one_per_side
  on public.barter_obligations (agreement_id, side);
create index if not exists barter_obligations_agreement_idx
  on public.barter_obligations (agreement_id);
create index if not exists barter_obligations_deliverer_idx
  on public.barter_obligations (deliverer_user_id);
create index if not exists barter_obligations_receiver_idx
  on public.barter_obligations (receiver_user_id);

alter table public.barter_obligations owner to postgres;

comment on table public.barter_obligations is
  'Exactly two immutable directed obligations per barter agreement, derived server-side from '
  'the agreement''s accepted proposal version. No fulfilment lifecycle in this slice.';
comment on column public.barter_obligations.agreement_id is
  'FK cascades with barter_agreements. This preserves the existing agreement graph''s account '
  'erasure behaviour and does not add a new retention policy.';
comment on column public.barter_obligations.source_term_id is
  'The accepted proposal term this obligation was derived from. Unique: one obligation per '
  'accepted term.';
comment on column public.barter_obligations.side is
  'Fixed proposal side: offer_owner or responder. Not client-selected.';
comment on column public.barter_obligations.agreed_description is
  'Immutable copy of the accepted term description for confirmed-trade display.';
comment on column public.barter_obligations.due_at is
  'Inherited exactly from the accepted proposal term. Not editable in this slice.';
comment on column public.barter_obligations.scheduled_at is
  'Inherited exactly from the accepted proposal term. Not editable in this slice.';

create or replace function public.create_barter_obligation_pair(p_agreement_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ag public.barter_agreements%rowtype;
  v_existing integer;
  v_terms integer;
begin
  select * into v_ag
    from public.barter_agreements
   where id = p_agreement_id
   for update;
  if not found then
    raise exception 'That agreement no longer exists.' using errcode = 'check_violation';
  end if;

  select count(*) into v_existing
    from public.barter_obligations o
   where o.agreement_id = p_agreement_id;
  if v_existing = 2 then
    return;
  end if;
  if v_existing <> 0 then
    raise exception 'An agreement must have exactly two obligations, not a partial pair.'
      using errcode = 'internal_error';
  end if;

  select count(*) into v_terms
    from public.barter_proposal_terms t
   where t.version_id = v_ag.accepted_version_id;
  if v_terms <> 2 then
    raise exception 'An agreement must derive obligations from exactly two accepted terms.'
      using errcode = 'internal_error';
  end if;

  insert into public.barter_obligations
    (agreement_id, source_term_id, side,
     deliverer_provider_id, deliverer_user_id, receiver_provider_id, receiver_user_id,
     agreed_description, due_at, scheduled_at)
  select
    v_ag.id,
    t.id,
    t.provided_by,
    case t.provided_by
      when 'offer_owner' then v_ag.owner_provider_id
      when 'responder' then v_ag.responder_provider_id
    end,
    case t.provided_by
      when 'offer_owner' then v_ag.owner_user_id
      when 'responder' then v_ag.responder_user_id
    end,
    case t.provided_by
      when 'offer_owner' then v_ag.responder_provider_id
      when 'responder' then v_ag.owner_provider_id
    end,
    case t.provided_by
      when 'offer_owner' then v_ag.responder_user_id
      when 'responder' then v_ag.owner_user_id
    end,
    t.service_description,
    t.due_at,
    t.scheduled_at
  from public.barter_proposal_terms t
  where t.version_id = v_ag.accepted_version_id
    and t.provided_by in ('offer_owner', 'responder')
  order by t.provided_by;

  get diagnostics v_terms = row_count;
  if v_terms <> 2 then
    raise exception 'An agreement must derive obligations from exactly two accepted terms.'
      using errcode = 'internal_error';
  end if;
end;
$$;

alter function public.create_barter_obligation_pair(uuid) owner to postgres;
revoke all on function public.create_barter_obligation_pair(uuid)
  from public, anon, authenticated;

create or replace function public.enforce_barter_obligations_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  raise exception 'A barter obligation cannot be edited or deleted.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_obligations_immutable() owner to postgres;
revoke all on function public.enforce_barter_obligations_immutable()
  from public, anon, authenticated;

drop trigger if exists barter_obligations_immutable on public.barter_obligations;
create trigger barter_obligations_immutable
  before update or delete on public.barter_obligations
  for each row execute function public.enforce_barter_obligations_immutable();

create or replace function public.enforce_barter_obligation_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1
      from public.barter_agreements ag
      join public.barter_proposal_terms t
        on t.id = new.source_term_id
       and t.version_id = ag.accepted_version_id
     where ag.id = new.agreement_id
       and new.side = t.provided_by
       and new.agreed_description = t.service_description
       and new.due_at = t.due_at
       and new.scheduled_at is not distinct from t.scheduled_at
       and (
         (new.side = 'offer_owner'
          and new.deliverer_provider_id = ag.owner_provider_id
          and new.deliverer_user_id = ag.owner_user_id
          and new.receiver_provider_id = ag.responder_provider_id
          and new.receiver_user_id = ag.responder_user_id)
         or
         (new.side = 'responder'
          and new.deliverer_provider_id = ag.responder_provider_id
          and new.deliverer_user_id = ag.responder_user_id
          and new.receiver_provider_id = ag.owner_provider_id
          and new.receiver_user_id = ag.owner_user_id)
       )
  ) into v_ok;
  if not v_ok then
    raise exception 'A barter obligation must derive from its agreement accepted terms.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_obligation_consistent() owner to postgres;
revoke all on function public.enforce_barter_obligation_consistent()
  from public, anon, authenticated;

drop trigger if exists barter_obligations_consistent on public.barter_obligations;
create trigger barter_obligations_consistent
  before insert on public.barter_obligations
  for each row execute function public.enforce_barter_obligation_consistent();

create or replace function public.enforce_barter_agreement_obligations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_barter_obligation_pair(new.id);
  return new;
end;
$$;

alter function public.enforce_barter_agreement_obligations() owner to postgres;
revoke all on function public.enforce_barter_agreement_obligations()
  from public, anon, authenticated;

drop trigger if exists barter_agreements_create_obligations on public.barter_agreements;
create trigger barter_agreements_create_obligations
  after insert on public.barter_agreements
  for each row execute function public.enforce_barter_agreement_obligations();

alter table public.barter_obligations enable row level security;

drop policy if exists barter_obligations_participant_read on public.barter_obligations;
create policy barter_obligations_participant_read on public.barter_obligations
  for select to authenticated
  using (deliverer_user_id = (select auth.uid()) or receiver_user_id = (select auth.uid()));

revoke all on table public.barter_obligations from public, anon, authenticated;
grant select on table public.barter_obligations to authenticated;

do $$
declare
  v_ag uuid;
begin
  for v_ag in select id from public.barter_agreements loop
    perform public.create_barter_obligation_pair(v_ag);
  end loop;
end $$;
