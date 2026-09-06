-- Bring the cancellation signal to PARITY with the LIVE release signal.
--
-- FORWARD-ONLY. 20261005000000, 20261006000000 and 20261007000000 are already applied to the
-- linked non-production project and are append-only history. Production untouched.
--
-- 20261007000000's header claimed it "reuses" the pre-agreement mechanism and cited
-- 20260910000000. That citation was WRONG, and the claim was therefore only half true:
-- `release_barter_interest` was redefined by 20260913000000 § 5, which is the live definition,
-- and the version I copied is superseded. Four properties the live mechanism added were
-- silently dropped. This migration adds all four. A header that stops the next reviewer
-- looking is the kind of claim this codebase treats as a defect in its own right, so the
-- corrected provenance is stated here rather than left to be rediscovered.
--
--   1. BEST-EFFORT BY CONSTRUCTION — the worst of the four. The message insert sat bare inside
--      the cancellation transaction, and the function's only handler catches unique_violation.
--      `enforce_prebooking_message_rules` (live at 20260914000000) raises check_violation for a
--      `pending` or `declined` conversation, and SECURITY DEFINER does not change auth.role(),
--      so that trigger DOES fire here. Any such failure aborted the whole RPC — the
--      cancellation act rolled back with it, and lib/barterErrors.ts answered check_violation
--      for cancelTrade with "That trade is no longer available", which is false: the trade
--      exists and is uncancelled. A provider could be refused PD-046's ONLY ordinary exit, and
--      told a lie about why, by a data condition in a MESSAGING row they did not cause and
--      cannot fix. The rule the live mechanism states — "it must suppress the SIGNAL, never
--      veto the RELEASE" — applies with more force here, because a release is recoverable and
--      an abandoned confirmed trade is not.
--
--   2. THE OPEN-CONVERSATION PREDICATE — mirrors enforce_prebooking_message_rules so the
--      ordinary case is skipped rather than thrown. A mirrored predicate is a second source of
--      truth, which is exactly why it is paired with (1) rather than relied on alone.
--
--   3. THE IDENTITY GUARD — a provider row whose user_id no longer matches the agreement's
--      participant means the resolved thread may not belong to this pair. It suppresses the
--      signal; it never blocks the cancellation.
--
--   4. system_recipient_id — the notice is addressed to the COUNTERPARTY. Left null it means
--      "addressed to both" (lib/messageAuthorship.ts), so the provider who just cancelled got
--      an unread badge and a notification-bell entry about their own act.
--
-- ALSO ADOPTED: server-derived post context via `barter_terms_label`. One conversation carries
-- a provider pair's whole relationship and a pair may trade more than once over it, so
-- "This trade was cancelled by one provider." could not say WHICH trade. The Founder ruling
-- asked for copy "equivalent to" that sentence and required canonical provider-pair
-- conversation behaviour to be preserved; naming the trade is what that behaviour already does
-- for the pre-agreement notice. The label is server-derived, quoted, control-stripped and
-- capped at 40 characters per side, and the sentence CLOSES with the platform's own words, so
-- there is no trailing position for owner-authored text to occupy and pose as ours.
--
-- STILL TRUE, and unchanged: the participant's free-text reason is NOT in the message; no
-- participant is named; nothing claims a push, device notification or email; no conversation is
-- created; exactly one message per transition.
--
-- LOCK NOTE. The message insert makes `enforce_prebooking_message_rules` take a conversation
-- row lock, so this RPC's order is agreement → its obligations → conversation. No path in the
-- barter graph takes a conversation lock before an agreement or obligation lock, so this adds
-- no cycle. A future writer that takes them in the other order must revisit this.

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
  v_conv public.conversation%rowtype;
  v_copy text;
  v_label text;
  v_recipient uuid;
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

  -- Already acted: returns BEFORE the insert, which is what makes a repeat idempotent and what
  -- stops a second system message.
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

  -- ── The signal. Everything below is BEST-EFFORT and may not change the outcome. ──
  select c.* into v_conv from public.conversation c
   where c.provider_pair_key =
           public.provider_pair_key(v_ag.owner_provider_id, v_ag.responder_provider_id)
   order by c.id limit 1;

  if v_conv.id is null then
    select c.* into v_conv from public.conversation c
     where (c.client_id = v_ag.responder_user_id and c.provider_id = v_ag.owner_provider_id)
        or (c.client_id = v_ag.owner_user_id and c.provider_id = v_ag.responder_provider_id)
     order by c.id limit 1;
  end if;

  -- IDENTITY. A provider row whose user_id no longer matches this agreement's participant
  -- means the resolved thread may belong to a different pair. Suppresses the SIGNAL only.
  if v_conv.id is not null and (
       not exists (select 1 from public.providers p
                    where p.id = v_ag.owner_provider_id and p.user_id = v_ag.owner_user_id)
    or not exists (select 1 from public.providers p
                    where p.id = v_ag.responder_provider_id
                      and p.user_id = v_ag.responder_user_id)
  ) then
    v_conv.id := null;
  end if;

  if v_conv.id is not null
     and (v_conv.booking_id is not null
          or v_conv.request_status is null
          or v_conv.request_status = 'accepted') then

    select o.* into v_offer from public.barter_offers o where o.id = v_ag.offer_id;
    v_label := public.barter_terms_label(v_offer.offering_service, v_offer.seeking_service);

    v_copy := case when v_acts >= 2
                   then 'Both providers agreed to cancel the trade for '
                          || v_label || '.'
                   else 'The trade for ' || v_label
                          || ' was cancelled by one provider.'
              end;

    -- To the COUNTERPARTY: the actor took the action and watched their own screen change.
    v_recipient := case when v_uid = v_ag.owner_user_id
                        then v_ag.responder_user_id else v_ag.owner_user_id end;

    -- STRUCTURAL, not merely predicated. The signal may fail for ANY reason — a trigger this
    -- function does not know about, a constraint added later — and the cancellation still
    -- commits. This is the half that makes "never veto the act" a guarantee rather than a
    -- list of conditions someone remembered.
    begin
      insert into public.messages
        (conversation_id, sender_id, content, is_read, created_at, system_recipient_id)
      values (v_conv.id, null, v_copy, false, clock_timestamp(), v_recipient);

      update public.conversation set last_message_at = clock_timestamp() where id = v_conv.id;
    exception when others then
      null;
    end;
  end if;

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
