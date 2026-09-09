-- FORWARD CORRECTION to 20261049000000 (Session 8, requirement N and O).
--
-- ══ THE DEFECT ════════════════════════════════════════════════════════════
--
-- `enforce_operator_case_event_append_only` refused UPDATE **and DELETE**
-- unconditionally. Append-only was the right intent — a moderation fact must not
-- be silently rewritten — but the unconditional DELETE refusal did something the
-- session was explicitly told not to do.
--
-- `operator_cases` cascades from `providers` and from `auth.users`, and
-- `operator_case_events` cascades from `operator_cases`. So the refusal made
-- **deleting a provider impossible**:
--
--     ERROR: 23514: Case history cannot be changed.
--     CONTEXT: SQL statement "DELETE FROM ONLY public.operator_case_events …"
--              SQL statement "delete from public.providers where user_id in (…)"
--
-- Session 8's requirement O is unambiguous: *"Do NOT alter existing
-- FK/deletion/retention semantics as part of Session 8 unless absolutely
-- required for this scope."* Making provider deletion fail is altering them, and
-- it was not required by anything — it was an omission.
--
-- Caught by the concurrency harness's own cleanup, which is the only thing in
-- this repo that routinely deletes a provider. Worth noting: **B5B could not have
-- caught this.** It runs in one transaction that is always rolled back and never
-- deletes a provider, so a defect in erasure is invisible to it. The teardown of
-- another suite found a production-shaped bug.
--
-- ══ THE FIX, WHICH IS THE PATTERN THE REPO ALREADY HAD ════════════════════
--
-- Every neighbouring append-only table exempts `service_role` DELETE for exactly
-- this reason. `enforce_barter_review_request_append_only` (`20261039000000`)
-- reads:
--
--     if tg_op = 'DELETE' and (select auth.role()) = 'service_role' then
--       return old;
--     end if;
--
-- and its own comment says why: *"`service_role` may DELETE so account erasure
-- cascades still work, matching every neighbouring table."* I copied the
-- append-only idea from that file and dropped the one clause that made it
-- shippable.
--
-- ══ WHAT REMAINS REFUSED ══════════════════════════════════════════════════
--
-- **UPDATE, always, for everyone.** That is the property requirement N actually
-- asks for: a case's history cannot be rewritten. Deleting a row as part of
-- erasing the account it belongs to is not rewriting history — it is the account
-- ceasing to exist, which is a different question this session does not reopen.
--
-- And an ordinary user still cannot delete one: `authenticated` holds no grant on
-- this table at all (`20261049000000` § 4), so the trigger is the second refusal
-- rather than the only one.

create or replace function public.enforce_operator_case_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Erasure cascades. `service_role` is the only role that can reach this at all
  -- (see the grants in 20261049000000 § 4), and a cascade from a deleted provider
  -- or auth user runs in exactly that context.
  if tg_op = 'DELETE' and (select auth.role()) = 'service_role' then
    return old;
  end if;

  -- A JWT-less privileged session — psql, a migration, an ops script — is the
  -- same authority by a different route, and is what `is_operator()` recognises
  -- alongside service_role. Without this arm, a migration that deletes a provider
  -- would fail the same way the harness did.
  if tg_op = 'DELETE'
     and (select auth.role()) is null
     and (select auth.uid()) is null then
    return old;
  end if;

  raise exception 'Case history cannot be changed.' using errcode = 'check_violation';
end;
$$;

alter function public.enforce_operator_case_event_append_only() owner to postgres;
revoke all on function public.enforce_operator_case_event_append_only()
  from public, anon, authenticated;

comment on function public.enforce_operator_case_event_append_only() is
  'Case history is append-only: UPDATE is refused for everyone, always. DELETE is '
  'permitted ONLY to service_role and to a no-claims/no-subject privileged '
  'session, so that erasing a provider or an auth user still cascades — the first '
  'version refused it unconditionally and made provider deletion impossible, '
  'which Session 8 requirement O forbids. authenticated holds no grant on this '
  'table, so this trigger is the second refusal, not the only one.';
