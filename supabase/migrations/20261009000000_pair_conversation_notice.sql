-- ONE writer for platform notices into a provider pair's thread.
--
-- FORWARD-ONLY. Every earlier migration on this branch is applied to non-production and is
-- append-only history. Production untouched.
--
-- WHY THIS EXISTS. The Founder ruling said: "If the existing pre-agreement system-message
-- implementation can be safely reused, prefer reuse over a second competing mechanism."
-- 20261007000000 reused the SHAPE by hand-copying it, which is not the same thing, and
-- 20261008000000 then had to re-add four properties the copy had dropped. That is the fifth
-- live copy of "resolve the pair thread, then post to it", and the first one that diverged from
-- the others — the exact escalation condition that makes a deferred consolidation due.
--
-- The correctness of a platform notice lives in properties that are easy to forget and
-- invisible when forgotten. Each is here because it was once a shipped defect:
--
--   * ADDRESSED to the counterparty. Left null, `system_recipient_id` means "both", so the
--     actor is badged and in-app-notified about their own action.
--   * IDENTITY re-checked. This runs as postgres with RLS off; a `providers` row whose user_id
--     no longer matches would resolve a thread belonging to an unrelated third provider.
--   * OPEN-CONVERSATION predicate, mirroring enforce_prebooking_message_rules.
--   * BEST-EFFORT BY CONSTRUCTION. The predicate above is a second source of truth and will go
--     stale if that trigger ever grows stricter; the handler is what makes "the signal never
--     vetoes the act" structural rather than a list of conditions someone remembered.
--
-- SCOPE, DELIBERATELY. Only NEW callers are routed through this. `release_barter_interest`
-- keeps its own body: it is a shipped, authorization-adjacent function, and replacing it
-- wholesale to remove a duplicate would risk a live path to tidy one — the same judgement
-- 20260912000000 recorded when it deferred this consolidation. It should be migrated the next
-- time it is opened for a reason of its own. Until then the two agree, and this one is the
-- body the next signal slice must copy.
--
-- NOT A NOTIFICATION SYSTEM. No push, no device notice, no email. A durable in-thread message
-- and nothing else.

create or replace function public.pair_conversation_notice(
  p_provider_a uuid,
  p_user_a uuid,
  p_provider_b uuid,
  p_user_b uuid,
  p_copy text,
  p_recipient uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conv public.conversation%rowtype;
begin
  if p_copy is null or btrim(p_copy) = '' then
    return;
  end if;

  select c.* into v_conv from public.conversation c
   where c.provider_pair_key = public.provider_pair_key(p_provider_a, p_provider_b)
   order by c.id limit 1;

  if v_conv.id is null then
    -- A thread created before the canonical pair key existed can still carry a stale null key.
    select c.* into v_conv from public.conversation c
     where (c.client_id = p_user_b and c.provider_id = p_provider_a)
        or (c.client_id = p_user_a and c.provider_id = p_provider_b)
     order by c.id limit 1;
  end if;

  if v_conv.id is null then
    -- No thread for this pair. Not an error: the caller's act stands, it simply has nowhere to
    -- post. NO CONVERSATION IS CREATED here, ever.
    return;
  end if;

  if not exists (select 1 from public.providers p
                  where p.id = p_provider_a and p.user_id = p_user_a)
     or not exists (select 1 from public.providers p
                     where p.id = p_provider_b and p.user_id = p_user_b) then
    return;
  end if;

  if not (v_conv.booking_id is not null
          or v_conv.request_status is null
          or v_conv.request_status = 'accepted') then
    return;
  end if;

  begin
    insert into public.messages
      (conversation_id, sender_id, content, is_read, created_at, system_recipient_id)
    values (v_conv.id, null, p_copy, false, clock_timestamp(), p_recipient);

    update public.conversation set last_message_at = clock_timestamp() where id = v_conv.id;
  exception when others then
    null;
  end;
end;
$$;

alter function public.pair_conversation_notice(uuid, uuid, uuid, uuid, text, uuid)
  owner to postgres;
-- NO client may call this: it writes a message nobody authored, which is precisely what a
-- client must never be able to do. Callers are other SECURITY DEFINER functions.
revoke all on function public.pair_conversation_notice(uuid, uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;

comment on function public.pair_conversation_notice(uuid, uuid, uuid, uuid, text, uuid) is
  'The one writer for platform notices (sender_id IS NULL) into a provider pair''s existing '
  'conversation. Resolves the canonical thread, re-checks provider identity, skips a thread '
  'that cannot take a message, addresses the notice to one recipient, and is best-effort by '
  'construction so it can NEVER veto the act it announces. Creates no conversation. Callable '
  'only by other definer functions.';

-- ── cancel_barter_agreement now CALLS the mechanism instead of restating it ──
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
  v_class text;
  v_label text;
  v_offer public.barter_offers%rowtype;
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
  -- Derived ONCE, then used for both the wording and the return, so the sentence the
  -- counterparty reads can never disagree with the answer the caller was given.
  v_class := case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;

  select o.* into v_offer from public.barter_offers o where o.id = v_ag.offer_id;
  v_label := public.barter_terms_label(v_offer.offering_service, v_offer.seeking_service);

  perform public.pair_conversation_notice(
    v_ag.owner_provider_id, v_ag.owner_user_id,
    v_ag.responder_provider_id, v_ag.responder_user_id,
    case when v_class = 'mutually_cancelled'
         then 'Both providers agreed to cancel the trade for ' || v_label || '.'
         else 'The trade for ' || v_label || ' was cancelled by one provider.'
    end,
    -- Addressed to whoever did NOT just act.
    case when v_uid = v_ag.owner_user_id
         then v_ag.responder_user_id else v_ag.owner_user_id end);

  return v_class;
exception
  when unique_violation then
    -- Reachable only from the act insert: the notice contains its own failures, so nothing it
    -- does can land here and roll the act back while this returns a success.
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
end;
$$;

alter function public.cancel_barter_agreement(uuid, text) owner to postgres;
revoke all on function public.cancel_barter_agreement(uuid, text) from public, anon;
grant execute on function public.cancel_barter_agreement(uuid, text) to authenticated;
