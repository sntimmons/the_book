# Security Reviewer — Output Format

## Finding schema

```
ID:                 <see ID prefixes>
Severity:           BLOCKER | HIGH | MEDIUM | LOW | NOTE
Confidence:         CONFIRMED | LIKELY | QUESTION
Category:           A. AUTHORIZATION/SECURITY | B. DATA-INTEGRITY | C. PRODUCT DECISION |
                    D. DEFENSE-IN-DEPTH | E. TEST/COVERAGE GAP | F. NON-ISSUE
Location:           <file:line> (+ object: table/policy/function/trigger)
Security invariant: <the property that must hold>
Expected:           <what the boundary should enforce — cite the authority, or
                    "UNKNOWN — PRODUCT DECISION REQUIRED">
Actual:             <what the code/schema actually enforces>
Evidence:           <file:line quotes / traced path — required>
Attack / failure path: <concrete steps a crafted client/actor would take>
User/data impact:   <what is exposed, escalated, or corrupted>
Exploit prerequisites: <what the attacker must already have/control; reachability>
Suggested acceptance criteria: <testable given/when/then the fix must satisfy —
                    NOT the fix itself>
Recommended owner:  Implementation Engineer | Product Decision | Test Automation |
                    Codebase Auditor | QA / Journey Reviewer
```

### ID prefixes
- `SEC-RLS-NNN` — row-level security / policy scope / anon exposure.
- `SEC-AUTHZ-NNN` — auth.uid() boundary, ownership, cross-user/tenant, privilege escalation.
- `SEC-TRIGGER-NNN` — SECURITY DEFINER / trigger authorization / search_path.
- `SEC-DATA-NNN` — server-side data-integrity invariant a crafted client can violate.
- `SEC-SECRET-NNN` — secrets / credential handling.
- `SEC-ENV-NNN` — environment separation / prod-vs-nonprod boundary.
- `SEC-STORAGE-NNN` — storage bucket/object policies.
- `SEC-MIGRATION-NNN` — dangerous/unsafe migration or unsafe default.
- `SEC-TRUTH-NNN` — stale/false security comment or doc vs implementation.
- `SEC-COVERAGE-NNN` — security invariant with no/only-manual coverage.

Number sequentially within a review (e.g. `SEC-AUTHZ-001`).

## Review output

```
# SECURITY REVIEW — <target>

## EXECUTIVE SUMMARY
- overall security posture
- whether server-side boundaries are real (not UI-only, not client-bypassable)
- the most important risks
- release/merge recommendation (one line)

## SECURITY IMPACT MAP
| Surface | Server boundary (RLS / trigger / constraint) | Risk | Status |
|---|---|---|---|
(rows for each reviewed surface)

## FINDINGS
(finding schema above, ranked most-severe first; empty is a valid, stated result)

## VERIFIED INVARIANTS
(security properties CONFIRMED by cited evidence — the "what holds" list)

## COVERAGE GAPS
(separate: covered by committed automated tests  vs  only by manual DB simulation  vs
 no coverage. Coverage gap ≠ defect.)

## SECURITY QUESTIONS / PRODUCT BOUNDARIES
(only genuine unresolved posture questions → PRODUCT DECISION)

## REGRESSION RECOMMENDATIONS
(specific tests / DB-harness cases that would lock the invariants)

## VERDICT
PASS | PASS WITH FINDINGS | NEEDS CHANGES | FAIL
```

## Verdicts
- **PASS** — server-side boundaries verified real; no findings above NOTE.
- **PASS WITH FINDINGS** — boundaries hold overall; HIGH/MEDIUM/LOW findings exist but none
  is a merge/release stop.
- **NEEDS CHANGES** — a MEDIUM+ security invariant is weakened or a required boundary is
  missing such that the change should not ship without a bounded correction (no clear
  cross-user/secret/destructive blocker).
- **FAIL** — any **BLOCKER**: clear cross-user/cross-tenant access, exposed secret,
  destructive production risk, or trivially bypassable auth.

Verdict precedence: any BLOCKER → **FAIL**; else a MEDIUM+ that should gate shipping →
**NEEDS CHANGES**; else findings present → **PASS WITH FINDINGS**; else **PASS**. A purely
undefined-posture item routes to PRODUCT DECISION and does not by itself fail the review.
