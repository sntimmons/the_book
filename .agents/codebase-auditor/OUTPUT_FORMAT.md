# Codebase Auditor — Output Format

## Finding schema

```
ID:                 <see ID prefixes>
Severity:           BLOCKER | HIGH | MEDIUM | LOW | NOTE
Confidence:         CONFIRMED | LIKELY | QUESTION
Category:           A. ARCHITECTURE | B. DUPLICATED LOGIC | C. DEAD/STALE | D. MAINTAINABILITY |
                    E. CONSISTENCY/DRIFT | F. TESTABILITY | G. PRODUCT DECISION | H. NON-ISSUE
Location:           <file:line> (+ all relevant call sites)
Intended architecture: <what the approved docs / canonical code imply, or
                    "UNKNOWN — PRODUCT/ARCH DECISION REQUIRED">
Actual structure:   <what the code actually does>
Evidence:           <file:line quotes / grep results across call sites — required>
Why this matters:   <the concrete future cost: slower / riskier / inconsistent / harder to test>
Failure / maintenance path: <how this bites a future change — a concrete scenario>
Scope:              <how many files/call sites; localized vs cross-cutting>
Suggested acceptance criteria: <testable end-state a bounded cleanup must satisfy —
                    NOT a full design>
Recommended owner:  Implementation Engineer | Product Decision | Security Reviewer (Agent 2) |
                    QA / Journey Reviewer (Agent 1) | Test Automation
```

### ID prefixes
- `CODE-ARCH-NNN` — architecture/structural defect.
- `CODE-DUP-NNN` — duplicated logic / multiple sources of truth.
- `CODE-DEAD-NNN` — dead / stale / abandoned code, unreachable routes.
- `CODE-DRIFT-NNN` — implementation drift from approved architecture docs.
- `CODE-COUPLING-NNN` — coupling / a module doing too many jobs / risky imports.
- `CODE-STATE-NNN` — inconsistent/overlapping state models or stores.
- `CODE-NAMING-NNN` — inconsistent naming / typed contracts.
- `CODE-ERROR-NNN` — inconsistent error handling / swallowed errors.
- `CODE-TEST-NNN` — testability problem.
- `CODE-ROUTE-NNN` — routing/navigation structure (aliases, legacy, unreachable).

Number sequentially within an audit (e.g. `CODE-DUP-001`).

## Audit output

```
# CODEBASE AUDIT — <target>

## EXECUTIVE SUMMARY
- overall maintainability posture
- whether the architecture is converging or drifting
- the biggest structural risks
- whether upcoming feature work is safe on this base

## ARCHITECTURE IMPACT MAP
| Surface | Intended abstraction | Actual implementation | Risk | Status |
|---|---|---|---|---|

## FINDINGS
(finding schema above, ranked most-severe first; empty is a valid, stated result)

## VERIFIED HEALTHY PATTERNS
(important things that are working well — what NOT to disturb)

## DEAD/STALE CODE CANDIDATES
(only candidates with evidence — call sites checked)

## DUPLICATION MAP
(where logic is repeated + whether consolidation is worthwhile, with a reason)

## COUPLING HOTSPOTS
(files/modules where a future change is unusually risky, and why)

## UPCOMING REVIEWS FEATURE RISKS
(structural issues to resolve/account for before Structured Two-Sided Reviews)

## TESTABILITY GAPS
(where architecture makes behavior hard to prove)

## REFACTOR RECOMMENDATIONS
(BOUNDED and ordered — never a rewrite)

## VERDICT
PASS | PASS WITH FINDINGS | NEEDS CLEANUP BEFORE NEXT FEATURE | FAIL
```

## Verdicts
- **PASS** — architecture converging; no findings above NOTE.
- **PASS WITH FINDINGS** — healthy overall; HIGH/MEDIUM/LOW findings exist but none blocks
  continued feature work.
- **NEEDS CLEANUP BEFORE NEXT FEATURE** — a specific area carries enough duplication/drift/
  coupling that the *next* feature touching it should be preceded by a bounded cleanup (name
  the area and the feature).
- **FAIL** — a BLOCKER: structural problem making safe release impossible or causing
  widespread broken behavior.

Verdict precedence: any BLOCKER → **FAIL**; else an area that must be cleaned before the named
upcoming feature → **NEEDS CLEANUP BEFORE NEXT FEATURE**; else findings present → **PASS WITH
FINDINGS**; else **PASS**.
