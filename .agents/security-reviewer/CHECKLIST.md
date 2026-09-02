# Security Reviewer — Checklist

Concrete checks across the security surface. Every claim requires cited evidence
(file:line). Apply the **false-positive controls** before recording anything. Trace the
full server-side path — RLS **and** triggers/functions — before calling anything a defect.

## A. Row-Level Security (RLS)
- [ ] RLS is **enabled** on every table holding user/tenant data (`pg_class.relrowsecurity`).
- [ ] SELECT policies are **participant/owner-scoped**; a `roles=public` policy with an
      `auth.uid()`-based qual is fine (anon `auth.uid()` is null → no rows) — verify the qual,
      not just the role list.
- [ ] INSERT/UPDATE policies are not overly broad; `WITH CHECK` matches the intended writer.
- [ ] Where a policy is intentionally broad, a trigger/function compensates — confirm it does.
- [ ] DELETE is either disallowed or owner-scoped; no unintended cascade exposure.
- [ ] anon exposure: can an unauthenticated caller read/write anything it shouldn't?

## B. auth.uid() boundaries & identity
- [ ] `auth.uid()` can be **null** (anon / no JWT) — every predicate using it behaves safely
      when null (null never satisfies an ownership check).
- [ ] Ownership joins use the **correct columns**: `providers.id` (row id) vs
      `providers.user_id` (owner auth id); `conversation.client_id = auth.uid()`;
      `messages.sender_id = auth.uid()`; `bookings.user_id = auth.uid()`.
- [ ] The client cannot forge an identity field the server trusts (client_id, sender_id,
      provider_id) — check whether RLS/trigger pins it to `auth.uid()` or a validated join.

## C. SECURITY DEFINER functions & triggers
- [ ] SECURITY DEFINER changes execution context to the function **owner** — confirm the
      function does not thereby grant a caller more than intended.
- [ ] `set search_path = ''` (or a pinned safe path) is present, and all objects are
      schema-qualified (`public.*`, `auth.*`) — no search_path hijack.
- [ ] Function ownership is a trusted role; `revoke all ... from public`/`anon` where intended.
- [ ] Trigger authorization matches the RLS intent (no path the trigger allows that RLS
      forbids, or vice-versa) — **RLS/trigger disagreement is a finding**.
- [ ] BEFORE INSERT/UPDATE triggers that clamp/stamp fields cannot be skipped by the caller.

## D. service_role bypass
- [ ] `service_role` bypass is **intentional and narrow** (an explicit early-return guarded by
      `auth.role() = 'service_role'`), used only on trusted server paths.
- [ ] An authenticated user **cannot impersonate** `service_role`: distinguish the DB session
      **role** from a JWT **claim**. `auth.role()` reflects the request role; confirm a
      user-supplied `role` claim in `request.jwt.claims` cannot flip a session that is running
      as `authenticated`. Flag any function trusting an unsafe/user-settable JWT field.

## E. Ownership & forged relationships
- [ ] Foreign keys that gate access (e.g. `booking_id` on a conversation) are validated to
      **belong to the acting pair/user** on the server (insert AND update paths), not merely
      constrained to exist.
- [ ] A relationship cannot be **reassigned** to escalate (e.g. swap a validated `booking_id`
      for another's), and a validated link cannot be **cleared/downgraded** to re-open a gate.
- [ ] No privilege escalation via attaching/associating a row the caller doesn't own.

## F. Mutable security-sensitive & client-controlled trust fields
- [ ] Identity fields (ids), status/lifecycle fields, and money/verification flags are
      **immutable or server-controlled** where the design requires it.
- [ ] Any **timestamp used as an authorization/enforcement boundary** is server-stamped
      (`now()`/`clock_timestamp()` in a trigger), **not** trusted from the client. A client
      that can set the value used in a gate is a finding.
- [ ] State transitions are validated against an allowed lifecycle; no "transition not
      explicitly intended" slips through an `else`/default branch.

## G. Insecure write/read paths & error handling
- [ ] Every write goes through a server-authoritative path (API route / RLS+trigger); no
      trusted decision made only in `'use client'` code.
- [ ] A failed security-relevant write is **not** swallowed into a false-success state (e.g.
      an attach that fails must not return an id implying an open/authorized resource).
- [ ] Distinguish a mere UX error-handling gap from an actual security defect.

## H. Secrets, environment & migrations
- [ ] No secrets/service-role keys in client-reachable code or `EXPO_PUBLIC_*`; only the
      anon key (RLS-gated, public-by-design) ships to the client.
- [ ] Environment separation holds; no code path can target the **production** project by
      default; non-prod ≠ prod is asserted where destructive actions are possible.
- [ ] Migrations are not destructive/unsafe; a from-scratch apply reproduces the intended
      **secure** end state (defaults, constraints, policies, triggers all present).
- [ ] Unsafe defaults (e.g. a `DEFAULT` that makes a gate field non-null) are caught.

## I. Realtime (delivery/visibility, not the boundary)
- [ ] Realtime is treated as a delivery layer; **no security decision depends solely on a
      realtime payload**. Subscriptions rely on RLS for row visibility (participant-scoped).
- [ ] Local/optimistic state changes cannot bypass DB enforcement.

## J. Documentation truth (security)
- [ ] Docs/comments do **not** claim server enforcement where only UI enforcement exists.
- [ ] Comments do not misrepresent RLS/policy state (a stale "still needed / allows anon"
      comment that contradicts the live schema is a finding).
- [ ] Manual/non-CI DB role-simulations are clearly distinguished from committed automated
      coverage.

## False-positive controls (mandatory — try to DISPROVE the finding first)
- **Trace the full server-side path** (route → handler → RLS → trigger/function → constraint)
  and cite file:line. No finding without evidence.
- Check **RLS AND** triggers/functions — one may compensate for the other.
- Check whether **SECURITY DEFINER** changed the execution context.
- Inspect the **actual** table relationships, ownership joins, constraints, and indexes.
- Inspect **service_role** exceptions and whether the path runs as `authenticated`.
- Inspect whether **`auth.uid()` can be null** and whether the field is **truly
  client-controllable**.
- Confirm the path is **reachable by an ordinary authenticated user** (not only by
  service_role or an admin path).
- Confirm **no other server-side layer already blocks** the path.
- "The UI could theoretically send a value" is **not** proof of exploitability — the server
  must actually accept it.
- If uncertain after tracing → mark **LIKELY** or **QUESTION**, never a confirmed BLOCKER.
- **Prefer 5 strong findings over 30 speculative ones.** A disproven suspicion is recorded as
  category **F. NON-ISSUE**, not omitted silently when it was worth checking.

## Known context — do NOT raise as new findings unless the implementation contradicts them
(from approved decisions and prior audits for the messaging feature; see `SOURCES.md`)
- Client-initiated **non-booking** contact should be request-gated; provider/community-initiated
  contact is a **deferred product decision** (QA-STATE-001) — not a defect.
- A real booking **supersedes** prior request restrictions; one conversation per (client,
  provider) pair; an existing non-null `booking_id` is **not** overwritten by a later booking.
- One pending initial client message per request cycle; `request_opened_at` is server-owned;
  non-service_role `messages.created_at` is server-stamped; `service_role` is intentionally trusted.
- Production migration has **not** yet been applied; the **25/25 DB role simulation is
  manual/non-CI**; a committed DB/security harness (B5B) does **not** yet exist.
- `conversation` realtime publication membership is a **deployment/config** follow-up.
- QA-STATE-002 (barter swallowed-error edge) is a known **LOW** follow-up; QA-UX-002
  (Requests sent/received mixing) is **UX, not security**.
