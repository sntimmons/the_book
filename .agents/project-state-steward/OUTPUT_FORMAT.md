# Project State Steward — Output Format

Every run produces this report, whether or not any file was written.

```
# PROJECT STATE RECONCILIATION — <date>

Reconciled against: main @ <SHA>
Previous reconciliation: <SHA or "none">
Inspected at: main @ <SHA>   (omit when identical to the anchor)
Last edited by: PR #NN       (or "not edited this run")
Mode: <write | read-only>

`Reconciled against:` is **not** the tip of `main`. It is the last commit at which the
repository facts asserted in the documents were verified, and a documentation-only merge
that changes no such fact does not advance it. When the run inspected a later commit than
the anchor, state that commit on `Inspected at:` and say why the anchor did not move.
`Last edited by:` records the documentation mutation independently — see CHECKLIST § A.

## VERIFIED CURRENT STATE
What is true on main today, each line with a citation. Delegate to authoritative docs
rather than restating their rules.

## COMPLETED SINCE LAST RECONCILIATION
| Item | Evidence (PR / SHA) | Verified artifact |
Only items whose artifact was found on main.

## IN PROGRESS
Work with a branch or an open PR, with its state. Empty is a valid answer.

## UPCOMING
Next sessions from ROADMAP.md, unchanged unless evidence moved something.

## OPEN QUESTIONS
Count by area, with anything newly opened or newly closed called out. Closed questions
cite what closed them.

## CONFLICTS / NEEDS PRODUCT DECISION
The most important section. For each:
- What source A claims, with citation
- What source B claims, with citation
- Why they cannot both be true
- What a human needs to decide
NEVER resolved by the Steward. "None" is a valid and good answer.

## FILES WRITTEN
Exhaustive list, each confirmed against the AGENT.md allowlist. "None" if read-only.

## COULD NOT VERIFY
Anything requiring the app to run, a database query, or a CI execution. Name the check
that would confirm it.

## VERDICT
RECONCILED — docs match main; no conflicts.
RECONCILED WITH CONFLICTS — docs updated where unambiguous; N conflicts need a decision.
BLOCKED — a conflict prevents truthful reconciliation; nothing written.
```

## Entry schemas

**Decision** (`PRODUCT_DECISIONS.md`):

```
### PD-NNN — <short title>
- **Decided:** <date or "pre-dates ledger">
- **Decision:** <what was locked, stated flatly>
- **Rationale:** <why>
- **Evidence:** <approval quote / doc / SHA>
- **Status:** Locked | Superseded by PD-NNN
```

**Open question** (`OPEN_QUESTIONS.md`):

```
### OQ-NNN — <question as a question>
- **Area:** Barter | Messaging | Safety | Payments | Contracts | Houston Beta | Reviews | Schema / data
- **Why it matters:** <consequence of leaving it open>
- **Blocks:** <session/work, or "nothing yet">
- **Status:** Open | Closed by PD-NNN on <date>
```

Never delete a closed question — mark it closed and cite what closed it, so the record of
how the product got here survives.
