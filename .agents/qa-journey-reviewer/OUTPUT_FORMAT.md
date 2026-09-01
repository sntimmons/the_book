# QA / Journey Reviewer — Output Format

## Finding schema

```
ID:                 <see ID prefixes>
Severity:           BLOCKER | HIGH | MEDIUM | LOW | NOTE
Confidence:         CONFIRMED | LIKELY | QUESTION
Journey:            <journey id/name, or "cross-cutting">
Location:           <file:line> (+ route)
Expected behavior:  <from BETA_SCOPE/USER_JOURNEYS/NAVIGATION, or
                     "UNKNOWN — PRODUCT DECISION REQUIRED">
Actual behavior:    <what the code does>
Evidence:           <file:line quotes / trace — required>
User impact:        <what the user experiences>
Suggested acceptance criteria:  <testable given/when/then the fix must satisfy —
                     NOT the fix itself>
Recommended owner:  Product Decision | Implementation Engineer | Security Reviewer |
                    Codebase Auditor | Manual QA | Test Automation
```

### ID prefixes
- `QA-JOURNEY-NNN` — journey correctness (dead ends, transitions, fake success).
- `QA-TRUTH-NNN` — product-truth (claim vs capability).
- `QA-STATE-NNN` — user-visible state/data consistency.
- `QA-REGRESSION-NNN` — regression risk (PR mode).
- `QA-UX-NNN` — UX/acceptance quality.

Number sequentially within a review (e.g. `QA-TRUTH-001`).

## Review output (all modes)

```
EXECUTIVE SUMMARY
JOURNEYS REVIEWED            (+ what could NOT be verified)
FINDINGS                     (schema above, ranked most-severe first)
COVERAGE GAPS
PRODUCT QUESTIONS            (NEEDS PRODUCT DECISION items)
REGRESSION TEST RECOMMENDATIONS
MANUAL QA RECOMMENDATIONS
VERDICT
```

### PR mode adds
```
CHANGE IMPACT MAP            (journeys touched by the diff, before FINDINGS)
```

### RELEASE/BETA SMOKE mode
Must state prominently: **"This is a static/paper review of the checklist against
source; it does NOT replace Maestro or manual execution."**

## Verdicts
- **PASS** — journeys complete; no findings above NOTE.
- **PASS WITH FINDINGS** — journeys complete; HIGH/MEDIUM/LOW findings exist but none block.
- **NEEDS PRODUCT DECISION** — a core journey's expected behavior is undefined (open
  product question blocks acceptance).
- **FAIL** — any BLOCKER (journey cannot complete, false success, destructive/data
  outcome, or a fundamental promise broken).

Verdict precedence: any BLOCKER → **FAIL**; else unresolved core-journey product
intent → **NEEDS PRODUCT DECISION**; else findings present → **PASS WITH FINDINGS**;
else **PASS**.
