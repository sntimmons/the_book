# The Book — Agent System

Version-controlled definitions for The Book's AI review/engineering agents. These
are tool-agnostic specifications (readable by Claude Code, ChatGPT, or a human).
Native tool adapters (e.g. `.claude/agents/*.md`) are thin pointers to these files,
never duplicates.

## Roster

| # | Agent | Access | Status |
|---|---|---|---|
| 1 | **QA / Journey Reviewer** (`qa-journey-reviewer/`) | **READ-ONLY** | **Active** |
| 2 | **Security Reviewer** (`security-reviewer/`) | **READ-ONLY** | **Active** |
| 3 | **Codebase Auditor** (`codebase-auditor/`) | **READ-ONLY** | **Active** |
| 4 | **Project State Steward** (`project-state-steward/`) | **read + writes limited to 5 PM docs** | **Active** |
| 5 | Implementation Engineer | bounded writes (planned) | Planned |

Each agent gets its own directory with the same four files: `AGENT.md` (mission,
responsibilities, permissions, governance), `CHECKLIST.md` (concrete checks +
false-positive controls), `OUTPUT_FORMAT.md` (finding + review schema), `SOURCES.md`
(deterministic context loading).

The Project State Steward is the only agent with write access, and it is deliberately
narrower than an implementation agent: an exhaustive allowlist of five project-management
documents under `docs/product/`, no code, no SQL, no CI, and no agent definitions —
including its own. Claude Code declares tools per agent rather than per path, so that
allowlist is enforced by its specification and by PR review; a Steward diff touching
anything outside it is a defect in the run, not a change to accept.

## Shared governance (applies to every agent)

- Agent definitions are **version-controlled**; changes go through a **PR**.
- **No self-modification** — an agent never edits its own or another agent's definition.
- **Findings are advisory** — they never automatically become code. A human assigns
  severity and makes product decisions.
- **Implementation happens separately**, on its own branch, by the Implementation
  Engineer (or a human). Reviewers do not fix what they find; they **route** it.
- Every agent **discloses what it inspected** and **what it could not verify**.
- Authority hierarchy, the "source code wins" rule, the three information classes
  (current implementation / target / historical), and canonical vocabulary are
  defined once in [../AGENTS.md](../AGENTS.md); agent files reference, never restate.

## Invocation (founder-friendly)

- `QA review PR #NN` — PR review.
- `QA review journey: <name>` — full audit of one journey (e.g. `booking-creation`).
- `QA full audit: <area>` — all journeys in an area (e.g. `booking`).
- `QA feature acceptance: <spec-or-path>` — check an implementation against a spec.
- `QA smoke: <checklist>` — static/paper smoke review (does not replace Maestro/manual).
- `Security review PR #NN` — read-only security/authorization review of a PR.
- `Security review branch: <name>` — security review of a feature branch.
- `Security audit: <area>` — security review of a surface (e.g. `messaging`, `bookings`).
- `Security review feature: <spec-or-path>` — check a feature's server-side boundaries.
- `Codebase audit: <area or "current product architecture">` — read-only structural/maintainability audit.
- `Codebase audit PR #NN` — structural review of a PR's diff.
- `Audit duplication: <surface>` / `Audit dead code: <area>` — targeted structural sweeps.

The mode is inferred from the verb + object; no knowledge of internals required. QA (Agent 1)
owns journey/product-truth; Security (Agent 2) owns the server-side trust boundary; Codebase
Auditor (Agent 3) owns code structure and maintainability.

- **Project State Steward** — "Project State Steward: reconcile project state against main
  and the latest merged PR." (add "read-only, report but do not write" for a dry run, or
  "…against PR #NN" to scope it). It has no `Bash` tool, so supply the `main` SHA and the
  merge list in the invocation.

