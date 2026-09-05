-- Slice 3a-0c hardening. Three defects found by review, all introduced by 20260912000000.
--
-- Scope: the release notice's text, the new column's write boundary, and the view's conversation
-- join. No new table, no proposal/agreement/obligation schema.

-- ── 1. `system_recipient_id` is now ACTUALLY server-set ──────────────────────
-- 20260912000000's column comment claimed "server-set only; immutable by the message
-- allow-list". The allow-list is a BEFORE UPDATE trigger, so it says nothing about INSERT --
-- and the INSERT policy constrains only sender_id and conversation_id. Any participant could
-- post an ordinary message addressed to THEMSELVES, which suppresses the counterparty's badge
-- and notification: a silent-delivery channel. The claim was the kind this codebase treats as
-- a defect in its own right, because it stops the next reviewer looking.
--
-- Clamped in the existing BEFORE INSERT trigger, mirroring how created_at is already handled
-- there: discard what the client supplied rather than reject, since the app sends none.
create or replace function public.enforce_prebooking_message_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversation%rowtype;
  v_since_count integer;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Addressing is a SERVER concept: only a definer function may say who a platform notice is
  -- for. Clamped for any message that HAS an author -- i.e. every client insert, since the
  -- INSERT policy requires sender_id = auth.uid() and null can never satisfy it, so a
  -- null-sender row can only come from a definer function.
  --
  -- Scoping it this way is load-bearing: SECURITY DEFINER does not change auth.role(), so an
  -- unconditional clamp fires inside release_barter_interest too and silently wipes the
  -- addressing it just computed -- defeating the "do not badge the actor" rule via the very
  -- guard meant to protect it.
  if new.sender_id is not null then
    new.system_recipient_id := null;
  end if;

  -- created_at is an enforcement boundary (the one-message-per-pending-cycle rule reads it), so
  -- it is server-authoritative and a client-supplied value is discarded.
  new.created_at := clock_timestamp();

  select c.* into v_conv from public.conversation c where c.id = new.conversation_id;
  if not found then
    raise exception 'That conversation does not exist.' using errcode = 'check_violation';
  end if;

  -- Open conversations: booking-linked, legacy (no request state), or accepted.
  if v_conv.booking_id is not null
     or v_conv.request_status is null
     or v_conv.request_status = 'accepted' then
    return new;
  end if;

  if v_conv.request_status = 'declined' then
    raise exception 'This request has been declined; no further messages are allowed.'
      using errcode = 'check_violation';
  end if;

  -- request_status = 'pending': only the client may send, and only the single initial message.
  if new.sender_id is distinct from v_conv.client_id then
    raise exception 'The provider must accept the request before messaging.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_since_count
  from public.messages m
  where m.conversation_id = new.conversation_id
    and (v_conv.request_opened_at is null or m.created_at >= v_conv.request_opened_at);
  if v_since_count > 0 then
    raise exception 'Only one message may be sent while a request is pending.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

alter function public.enforce_prebooking_message_rules() owner to postgres;
revoke all on function public.enforce_prebooking_message_rules() from public, anon;

comment on column public.messages.system_recipient_id is
  'For a platform-authored message (sender_id IS NULL): which participant it is FOR, so the '
  'actor who caused it is not badged for their own action. NULL = addressed to both, which is '
  'every ordinary message. CLAMPED to null on insert for non-service_role callers by '
  'enforce_prebooking_message_rules, and immutable on update by the message allow-list.';

-- ── 2. The helper fails closed on a null input ───────────────────────────────
-- `least`/`greatest` IGNORE nulls, so provider_pair_key(x, null) returned 'x:x' -- a
-- silent-wrong-answer shape. Unreachable today (both provider columns are NOT NULL and
-- self-pairs are blocked), so this is hardening, not a fix.
create or replace function public.provider_pair_key(p_a uuid, p_b uuid)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text;
$$;

alter function public.provider_pair_key(uuid, uuid) owner to postgres;
revoke all on function public.provider_pair_key(uuid, uuid) from public, anon;
grant execute on function public.provider_pair_key(uuid, uuid) to authenticated;

-- ── 3. The view resolves a conversation the same way everything else does ────
-- The join matched on provider_pair_key ONLY, while release_barter_interest,
-- resolve_conversation and find_conversation all fall back to the literal orientations --
-- because the key is a CACHED derivation that can be stale NULL (20260908000000 documents
-- exactly this). For such a pair the screen would show an active negotiation with no way to
-- open the conversation about it.
--
-- The security_invoker justification is also corrected: omitting the option would NOT expose
-- other providers' rows, because the view's own WHERE is auth.uid()-scoped and auth.uid() reads
-- the caller's JWT regardless of view ownership. What is lost is the RLS BACKSTOP on the
-- underlying tables -- which is the real reason to keep it, and the reason the reloption is
-- pinned in B5B rather than trusted.
-- Dropped and recreated rather than replaced: `create or replace view` cannot remove a column,
-- and `interest_message` was exposed by 20260912000000 and read by nothing. A public read
-- surface should not carry columns no caller wants.
drop view if exists public.my_trade_activity;
create view public.my_trade_activity
with (security_invoker = true) as
select
  i.id                       as interest_id,
  i.offer_id,
  i.status,
  i.created_at,
  i.released_at,
  i.release_reason,
  o.offering_service,
  o.seeking_service,
  o.is_active                as offer_is_active,
  case when o.user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when o.user_id = (select auth.uid()) then i.interested_provider_id else o.provider_id end
                             as counterparty_provider_id,
  c.id                       as conversation_id
from public.barter_interests i
join public.barter_offers o on o.id = i.offer_id
left join lateral (
  select cv.id from public.conversation cv
   where cv.provider_pair_key =
           public.provider_pair_key(o.provider_id, i.interested_provider_id)
      -- Same fallback as every other resolver, for a row whose cached key is still null.
      or (cv.client_id = i.interested_user_id and cv.provider_id = o.provider_id)
      or (cv.client_id = o.user_id and cv.provider_id = i.interested_provider_id)
   order by cv.id limit 1
) c on true
where o.user_id = (select auth.uid())
   or i.interested_user_id = (select auth.uid());

alter view public.my_trade_activity owner to postgres;
revoke all on public.my_trade_activity from public, anon;
grant select on public.my_trade_activity to authenticated;

-- ── 4. Owner-authored text cannot pose as platform speech ────────────────────
-- 20260912000000 appended the offer's terms to the END of a sentence written with
-- `sender_id IS NULL` -- i.e. rendered centred and unattributed, as a statement by the
-- platform. Both columns are 200 chars of free text and remain owner-mutable BY DESIGN
-- (PD-047), so ~400 characters chosen by one participant were delivered to the other inside a
-- message with no attributable author and no closing text. An owner could write
-- "...THE BOOK SUPPORT: verify your account at <link>" and it would read as ours.
--
-- This is the exact property the sender_id IS NULL representation exists to hold -- "a client
-- could never CREATE one" -- broken by putting a client's words inside one.
--
-- Three corrections, all server-side: the terms are QUOTED so the boundary is visible, they are
-- CAPPED so they cannot dominate the sentence, and control characters are stripped so they
-- cannot fake structure. The platform's own words now both open AND close the sentence, so
-- there is no trailing position for injected text to occupy.
create or replace function public.barter_terms_label(p_offering text, p_seeking text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '"' || substr(regexp_replace(coalesce(nullif(btrim(p_offering), ''), 'a service'),
                                      '[[:cntrl:]]', ' ', 'g'), 1, 40)
      || '" for "'
      || substr(regexp_replace(coalesce(nullif(btrim(p_seeking), ''), 'a service'),
                               '[[:cntrl:]]', ' ', 'g'), 1, 40)
      || '"';
$$;

alter function public.barter_terms_label(text, text) owner to postgres;
revoke all on function public.barter_terms_label(text, text) from public, anon;
grant execute on function public.barter_terms_label(text, text) to authenticated;

-- ── 5. The release notice, using the bounded label ───────────────────────────
create or replace function public.release_barter_interest(p_interest_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_is_owner boolean;
  v_is_responder boolean;
  v_reason text;
  v_conv public.conversation%rowtype;
  v_copy text;
  v_label text;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  -- Lock the OFFER, not the interest: the invariant is "one accepted response per offer", so
  -- the offer is the serialisation point -- the same reasoning by which accept_barter_interest
  -- locks it. This serialises a release against a concurrent accept of another response.
  select o.* into v_offer from public.barter_offers o
   where o.id = v_interest.offer_id for update;
  if not found then
    raise exception 'That offer no longer exists.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;

  v_is_owner := (v_offer.user_id = v_uid);
  v_is_responder := (v_interest.interested_user_id = v_uid);

  if not (v_is_owner or v_is_responder) then
    raise exception 'Only a participant can end this negotiation.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent where safe, and this is ALSO what stops the signal being written twice: a
  -- repeated call returns before the update and therefore before the message insert.
  -- Deliberately AFTER the participant check, so a non-participant learns nothing about the row.
  if v_interest.status = 'released' then
    return v_interest.release_reason;
  end if;

  if v_interest.status <> 'accepted' then
    raise exception 'Only the response currently in negotiation can be released.'
      using errcode = 'check_violation';
  end if;

  -- A SEED, not the decision. enforce_barter_interest_write CLAMPS all three release columns,
  -- so whatever is written here is overwritten. The value RETURNED below is read back from the
  -- row, so the caller is told what the boundary recorded.
  v_reason := case when v_is_responder then 'responder_withdrew'
                   else 'owner_ended_negotiation' end;

  -- PRE-AGREEMENT ONLY. When the agreement schema lands, the "no official agreement exists for
  -- this interest" guard goes HERE -- in THIS definition, the live one -- and must also be
  -- enforced at the write boundary, not only in this function.
  perform set_config('app.barter_release', v_interest.id::text, true);
  update public.barter_interests
     set status = 'released',
         released_at = clock_timestamp(),
         released_by = v_uid,
         release_reason = v_reason
   where id = v_interest.id
  returning release_reason into v_reason;
  perform set_config('app.barter_release', '', true);

  select c.* into v_conv from public.conversation c
   where c.provider_pair_key =
         public.provider_pair_key(v_offer.provider_id, v_interest.interested_provider_id)
   order by c.id limit 1;
  if not found then
    select c.* into v_conv from public.conversation c
     where (c.client_id = v_interest.interested_user_id and c.provider_id = v_offer.provider_id)
        or (c.client_id = v_offer.user_id
            and c.provider_id = v_interest.interested_provider_id)
     order by c.id limit 1;
  end if;

  -- IDENTITY, checked HERE and not earlier. It exists solely for the lookup above, so it must
  -- suppress the SIGNAL, never veto the RELEASE -- a participant is not trapped in a consumed
  -- slot by a data condition they did not cause and cannot fix.
  if v_conv.id is not null and (
       not exists (select 1 from public.providers p
                    where p.id = v_offer.provider_id and p.user_id = v_offer.user_id)
    or not exists (select 1 from public.providers p
                    where p.id = v_interest.interested_provider_id
                      and p.user_id = v_interest.interested_user_id)
  ) then
    v_conv.id := null;
  end if;

  if v_conv.id is not null
     and (v_conv.booking_id is not null
          or v_conv.request_status is null
          or v_conv.request_status = 'accepted') then

    -- Server-derived post context, so the reader can tell WHICH negotiation ended when the
    -- pair has traded on more than one post. Never client-supplied.
    -- Quoted, capped and control-stripped by barter_terms_label, and the sentence CLOSES with
    -- the platform's own words -- so there is no trailing position for owner-authored text to
    -- occupy and pose as ours.
    v_label := public.barter_terms_label(v_offer.offering_service, v_offer.seeking_service);

    v_copy := case v_reason
                when 'responder_withdrew' then
                  'The responding provider ended the trade negotiation for '
                    || v_label || '. No trade was agreed.'
                when 'owner_ended_negotiation' then
                  'The post owner ended the trade negotiation for '
                    || v_label || '. No trade was agreed.'
                else 'This trade negotiation for ' || v_label
                    || ' has ended. No trade was agreed.'
              end;

    -- Addressed to the COUNTERPARTY. The actor confirmed the action and watched their own UI
    -- move to "ended"; badging them for it is self-notification noise.
    v_recipient := case when v_is_responder then v_offer.user_id
                        else v_interest.interested_user_id end;

    -- BEST-EFFORT BY CONSTRUCTION. The skip predicate mirrors enforce_prebooking_message_rules,
    -- and a mirrored predicate is a second source of truth; the handler makes the guarantee
    -- structural -- the signal can fail for ANY reason and the release still commits.
    begin
      insert into public.messages
        (conversation_id, sender_id, content, is_read, created_at, system_recipient_id)
      values (v_conv.id, null, v_copy, false, clock_timestamp(), v_recipient);

      update public.conversation set last_message_at = clock_timestamp() where id = v_conv.id;
    exception when others then
      null;
    end;
  end if;

  return v_reason;
end;
$$;

alter function public.release_barter_interest(uuid) owner to postgres;
revoke all on function public.release_barter_interest(uuid) from public, anon;
grant execute on function public.release_barter_interest(uuid) to authenticated;
