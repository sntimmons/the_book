-- FORWARD CORRECTION to 20261105000000 / 20261102000000 (PD-102).
-- Security review of 5977169: SEC-AUTHZ-007, SEC-TRUTH-019a.
--
-- ══ I TESTED TOKEN ISSUANCE AND CALLED IT REAUTHENTICATION ═════════════════
--
-- `request_account_deletion` required `iat` within fifteen minutes, and said why:
-- *"requiring a recent one means a stolen, long-lived session cannot delete an
-- account on its own."* `lib/accountDeletion.ts` repeats the claim to the next
-- reader.
--
-- `iat` is genuinely NOT forgeable — `auth.jwt()` reads `request.jwt.claims`,
-- which PostgREST populates only after verifying the GoTrue signature. That half
-- holds. But **a fresh `iat` is produced by any token issuance**, and the largest
-- source of token issuance is `supabase.auth.refreshSession()` — including the
-- SDK's own automatic background refresh, which needs no password and which the
-- attacker does not even have to call deliberately. Anyone holding a refresh
-- token mints a compliant access token on demand.
--
-- So the gate stopped a session that had been sitting idle in a text file, and
-- did nothing about a live stolen session — which is the one that matters. The
-- app does call `signInWithPassword`, but only AFTER a PT442: a client-side
-- convention, unverifiable by the server, skipped entirely whenever the token
-- happens to be under fifteen minutes old.
--
-- ── WHAT THE TOKEN ACTUALLY CARRIES ───────────────────────────────────────
--
-- GoTrue puts an `amr` claim in the access token: an array of authentication
-- events, each with a `method` and a unix `timestamp`. It records when the person
-- last PROVED who they were, and a refresh carries it forward unchanged rather
-- than restamping it. That is the value this gate always meant to read.
--
-- The check now takes the most recent `amr` timestamp, and **falls back to `iat`
-- only when `amr` is absent or carries no timestamp**. The fallback is not
-- decoration: this project's token contents are a GoTrue configuration detail,
-- and if `amr` is not there, a gate that silently passes everything would be
-- worse than the weak one it replaced. `iat` is the weaker bar, and the comment
-- and the docstring now say which bar is in force instead of claiming the
-- stronger one unconditionally.
create or replace function public.request_account_deletion(
  p_confirm_text text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_open   uuid;
  v_days   integer;
  v_id     uuid;
  v_iat    bigint;
  v_amr    bigint;
  v_proved timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;

  select r.id into v_open from public.account_deletion_requests r
   where r.subject_user_id = v_uid
     and r.status in ('requested', 'grace_period', 'finalizing');
  if v_open is not null then
    return v_open;
  end if;

  -- The most recent time this person PROVED who they are. Not the most recent
  -- time a token was minted for them.
  select max((e ->> 'timestamp')::bigint) into v_amr
    from jsonb_array_elements(
           coalesce(((select auth.jwt()) -> 'amr'), '[]'::jsonb)) e
   where jsonb_typeof((select auth.jwt()) -> 'amr') = 'array'
     and (e ->> 'timestamp') ~ '^[0-9]+$';

  v_iat := nullif((((select auth.jwt()) -> 'iat')::text), '')::bigint;
  v_proved := to_timestamp(coalesce(v_amr, v_iat));

  if v_proved is null or v_proved < now() - interval '15 minutes' then
    raise exception 'Confirm your password again before deleting your account.'
      using errcode = 'PT442';
  end if;

  if coalesce(btrim(p_confirm_text), '') <> 'DELETE' then
    raise exception 'Type DELETE to confirm.' using errcode = 'PT443';
  end if;

  v_days := public.retention_days('account_grace_period');
  if v_days is null then
    raise exception 'Account deletion is unavailable right now.' using errcode = 'PT444';
  end if;

  insert into public.account_deletion_requests
    (subject_user_id, subject_id, status, grace_ends_at, disclosed_grace_days)
  values (v_uid, v_uid, 'requested', now() + make_interval(days => v_days), v_days)
  returning id into v_id;

  update public.account_deletion_requests set status = 'grace_period' where id = v_id;

  insert into public.account_deletion_steps (request_id, step_key)
  select v_id, k from unnest(public.account_deletion_step_keys()) k
  on conflict (request_id, step_key) do nothing;

  return v_id;
end;
$$;

alter function public.request_account_deletion(text) owner to postgres;
revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

comment on function public.request_account_deletion(text) is
  'Starts a deletion for the CALLER — there is no account parameter, which is '
  'what makes it impossible to aim at somebody else. Idempotent: an existing open '
  'request is returned rather than duplicated. Requires the typed word DELETE '
  '(PT443) and recent proof of identity (PT442), measured from the token''s `amr` '
  'authentication timestamp where the token carries one and from `iat` where it '
  'does not. THE TWO BARS ARE NOT THE SAME: `amr` is when the person last proved '
  'who they are; `iat` is only when a token was last issued, which any '
  'refreshSession() satisfies without a password. Do not describe this as '
  'reauthentication without checking which one the deployment is actually '
  'getting (SEC-AUTHZ-007).';

-- ══ AND A COMMENT THAT CONTRADICTED ITS OWN TRIGGER (SEC-TRUTH-019a) ═══════
--
-- `20261102000000:24-27` says messaging about an existing booking is deliberately
-- NOT gated. `b_messages_refuse_when_inactive` blocks every message insert, and
-- the committed suite pins PT440 as correct.
--
-- **The code is what was ordered.** The approved policy lists the immediate
-- effects as "no new bookings, messages, posts, or marketplace activity", and
-- messages are named in it. The comment was me describing a softer rule than the
-- one I built, which is the more dangerous direction: the next person relaxes the
-- trigger to match the comment and quietly widens what a departing account can do.
--
-- What the policy protects instead is the ability to SEE and RESOLVE an existing
-- transaction: the booking stays visible to both sides, it can still be cancelled
-- or completed (which `20261111000000` had to fix), and the dispute record
-- survives. Reading a thread is untouched; only sending is refused.
comment on function public.refuse_write_when_account_inactive() is
  'Refuses INSERTs from an account that is pending deletion or already erased '
  '(PT440). Messages ARE included — the approved policy names them among the '
  'immediate effects — so a departing account can still READ a thread and still '
  'resolve, cancel or complete an existing booking, but cannot send. Do not relax '
  'this to permit messaging "about an existing booking": an earlier comment said '
  'that and the code never did (SEC-TRUTH-019a).';
