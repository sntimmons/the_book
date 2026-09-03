-- B5B harness — assertion + auth-simulation helpers.
--
-- Executed inside ONE transaction that the runner always rolls back, so every
-- object here is temporary and nothing survives the run. Loaded before any suite.

create temp table _results (
  id serial primary key,
  suite text,
  name text,
  expected text,
  actual text,
  pass boolean
);

-- Suites run as the `authenticated` role (see pg_temp.act), which must still be able
-- to record results into this scratch table.
grant select, insert on _results to authenticated;
grant usage, select on sequence _results_id_seq to authenticated;

-- Simulate a PostgREST auth context. Supabase's auth.uid() reads
-- request.jwt.claims->>'sub' and auth.role() reads ->>'role', so setting that one
-- GUC is exactly what an authenticated request does. Passing NULL simulates an
-- unauthenticated caller (auth.uid() IS NULL) — the case that must fail closed.
create or replace function pg_temp.act(p_uid uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  if p_uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', p_role)::text, true);
  end if;
  -- CRITICAL: also assume the Postgres ROLE, not just the JWT claim.
  --
  -- The claim alone makes auth.uid() return the right value, so SECURITY DEFINER
  -- functions and triggers behave correctly -- but the session is still the table
  -- OWNER, which BYPASSES row-level security. Every RLS assertion would then pass
  -- vacuously: an outsider would appear able to read and write anything, and a
  -- harness that only set the claim would report a policy as enforced when it had
  -- never been consulted. Assuming `authenticated` is what makes the policies real.
  perform set_config('role', p_role, true);
end $$;

-- Seed/teardown writes run as service_role so the booking write-integrity trigger
-- (which early-returns for service_role) does not rewrite fixture state. Test
-- assertions must NEVER run in this context.
create or replace function pg_temp.act_service()
returns void language plpgsql as $$
begin
  -- Drop back to the session (owner) role so seeding can write auth.users etc.,
  -- and claim service_role so the write-integrity trigger early-returns.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

create or replace function pg_temp.chk(p_suite text, p_name text, p_expected text, p_actual text)
returns void language sql as $$
  insert into _results (suite, name, expected, actual, pass)
  values (p_suite, p_name, p_expected, p_actual,
          p_expected is not distinct from p_actual);
$$;

-- Assert that a statement is REJECTED by the database. This is the core of a
-- security harness: it proves the DB itself refuses, not that the UI avoided asking.
-- Optionally requires the error text to contain p_expect_msg, so a rejection for an
-- unrelated reason (a typo, a missing column) cannot masquerade as enforcement.
create or replace function pg_temp.chk_blocked(
  p_suite text, p_name text, p_sql text, p_expect_msg text default null
) returns void language plpgsql as $$
declare v_msg text; v_blocked boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    v_blocked := true; v_msg := sqlerrm;
  end;
  if not v_blocked then
    perform pg_temp.chk(p_suite, p_name, 'blocked', 'ALLOWED');
  elsif p_expect_msg is not null and position(lower(p_expect_msg) in lower(v_msg)) = 0 then
    perform pg_temp.chk(p_suite, p_name, 'blocked: ' || p_expect_msg,
                        'blocked for another reason: ' || left(v_msg, 90));
  else
    perform pg_temp.chk(p_suite, p_name, 'blocked', 'blocked');
  end if;
end $$;

-- Assert that a statement SUCCEEDS. Guards against a harness that only ever proves
-- denial — a permission model that denies everything would otherwise look perfect.
create or replace function pg_temp.chk_allowed(p_suite text, p_name text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    perform pg_temp.chk(p_suite, p_name, 'allowed', 'allowed');
  exception when others then
    perform pg_temp.chk(p_suite, p_name, 'allowed', 'BLOCKED: ' || left(sqlerrm, 90));
  end;
end $$;
