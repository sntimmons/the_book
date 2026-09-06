-- Hardening of pre-delivery cancellation, from the security and QA review of 20261005000000.
--
-- FORWARD-ONLY. 20261005000000 has already been applied to the linked non-production project,
-- so it is append-only history and is NOT edited. Everything here is a `create or replace` of
-- an object that migration created; no table is altered, no data is rewritten, nothing is
-- dropped, and production is untouched.
--
-- Three corrections, none of which changes the product rules:
--
--   1. QA-STATE-005 — `cancel_barter_agreement` did not re-check FOUND after its locking
--      re-read. An agreement erased between the authorization read and the lock produced
--      `internal_error`, which the UI maps to "This trade needs support. Please contact
--      support" — telling a provider to open a support conversation about a trade that had
--      simply ceased to exist. It now answers exactly as the pre-lock branch does.
--
--   2. SEC-TRIGGER-001 — `enforce_barter_cancellation_consistent` validated that the
--      (actor_user_id, actor_provider_id) pair was ONE of the agreement's two participants,
--      but never that it was THE CALLER. A privileged insert could therefore attribute an act
--      to the counterparty and fabricate a "mutually cancelled" classification — a false
--      record of someone else's assent. The actor is now bound to `auth.uid()`.
--
--   3. SEC-DATA-001 — `created_at` was called "server-stamped" but was only a column DEFAULT,
--      which an explicit insert overrides. It is now stamped in the trigger on every insert
--      path. This matters ahead of PD-057: `cancelled_at` is display-only today, but the
--      moment any slice measures a deadline from it, a backdatable timestamp becomes an
--      authorization boundary.
--
-- The null-uid / service_role escape is PRESERVED in both triggers, unchanged, exactly as
-- PD-051 ratified it (20260916000000) and as the sibling obligation guards spell it. Account
-- erasure cascades from auth.users and providers must keep working, and they run with no JWT.

-- ── A cancellation row must describe a real, still-cancellable agreement, and
--    must be attributable to the session that wrote it ───────────────────────
create or replace function public.enforce_barter_cancellation_consistent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ok boolean;
  v_delivered integer;
begin
  -- SERVER-STAMPED ON EVERY PATH, not only via the column default. An explicit insert could
  -- previously supply any value, including a backdated one.
  new.created_at := clock_timestamp();

  -- THE ACTOR IS THE CALLER. Checked before the participant-pair test, because "you may not
  -- act as someone else" is the stronger statement: without it a privileged writer holding
  -- one participant's session could record the OTHER participant's cancellation, and two acts
  -- is precisely what the product reads as "mutually cancelled". A null uid is a migration,
  -- an erasure cascade or a service_role backfill, which this guard has never policed.
  if v_uid is not null and new.actor_user_id <> v_uid then
    raise exception 'You can only record your own cancellation.'
      using errcode = 'insufficient_privilege';
  end if;

  select exists (
    select 1 from public.barter_agreements ag
     where ag.id = new.agreement_id
       and (
         (new.actor_user_id = ag.owner_user_id
          and new.actor_provider_id = ag.owner_provider_id)
         or
         (new.actor_user_id = ag.responder_user_id
          and new.actor_provider_id = ag.responder_provider_id)
       )
  ) into v_ok;
  if not v_ok then
    raise exception 'Only a participant of that agreement can cancel it.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Unchanged, and still a SEQUENTIAL guard on an unlocked read: it catches a direct
  -- privileged insert against an already-delivered agreement and does NOT decide a race.
  -- Race-safety remains owned by the lock order in cancel_barter_agreement and the matching
  -- post-lock check in mark_barter_obligation_delivered.
  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = new.agreement_id
     and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  return new;
end;
$$;

alter function public.enforce_barter_cancellation_consistent() owner to postgres;
revoke all on function public.enforce_barter_cancellation_consistent()
  from public, anon, authenticated;

comment on column public.barter_agreement_cancellations.created_at is
  'Server-stamped by enforce_barter_cancellation_consistent on every insert path, not merely '
  'defaulted, and immutable thereafter. A repeat cancellation by the same participant returns '
  'the existing act rather than re-stamping it.';
comment on column public.barter_agreement_cancellations.actor_user_id is
  'Derived server-side from auth.uid() and re-checked against BOTH the caller and the '
  'agreement. Never client-supplied, and never another participant: an act attributed to the '
  'counterparty would fabricate their assent, which is what the product reads as mutual '
  'cancellation.';

-- ── cancel_barter_agreement — answer "gone" as "gone" ──────────────────────
-- Body identical to 20261005000000 except for the FOUND re-check after the locking read.
create or replace function public.cancel_barter_agreement(
  p_agreement_id uuid,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ag public.barter_agreements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider uuid;
  v_obligations integer;
  v_delivered integer;
  v_acts integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'Keep the reason under 200 characters.' using errcode = 'invalid_parameter_value';
  end if;

  select ag.* into v_ag from public.barter_agreements ag where ag.id = p_agreement_id;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;
  if v_uid not in (v_ag.owner_user_id, v_ag.responder_user_id) then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  v_provider := case when v_uid = v_ag.owner_user_id
                     then v_ag.owner_provider_id else v_ag.responder_provider_id end;

  select ag.* into v_ag from public.barter_agreements ag
   where ag.id = p_agreement_id for update;
  -- ADDED. Erasing a participant cascades the agreement away, so it can vanish between the
  -- authorization read above and this lock. Without this branch v_ag became a null row, the
  -- obligation count fell to zero, and the malformed-agreement guard below reported
  -- internal_error — sending a provider to support over a trade that merely no longer exists.
  -- Same answer as the pre-lock branch, so the two cannot disagree about what "gone" means.
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  select count(*) into v_obligations
    from (select o.id from public.barter_obligations o
           where o.agreement_id = p_agreement_id
           order by o.id for update) locked;
  if v_obligations <> 2 then
    raise exception 'That trade is not in a state that can be cancelled.'
      using errcode = 'internal_error';
  end if;

  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = p_agreement_id and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = p_agreement_id and c.actor_user_id = v_uid) then
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
  end if;

  insert into public.barter_agreement_cancellations
    (agreement_id, actor_user_id, actor_provider_id, reason)
  values (p_agreement_id, v_uid, v_provider, v_reason);

  select count(*) into v_acts from public.barter_agreement_cancellations c
   where c.agreement_id = p_agreement_id;
  return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
exception
  when unique_violation then
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
end;
$$;

alter function public.cancel_barter_agreement(uuid, text) owner to postgres;
revoke all on function public.cancel_barter_agreement(uuid, text) from public, anon;
grant execute on function public.cancel_barter_agreement(uuid, text) to authenticated;
