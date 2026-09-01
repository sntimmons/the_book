# The Book — Agent System

Version-controlled definitions for The Book's AI review/engineering agents. These
are tool-agnostic specifications (readable by Claude Code, ChatGPT, or a human).
Native tool adapters (e.g. `.claude/agents/*.md`) are thin pointers to these files,
never duplicates.

## Roster

| # | Agent | Access | Status |
|---|---|---|---|
| 1 | **QA / Journey Reviewer** (`qa-journey-reviewer/`) | **READ-ONLY** | **Active** |
| 2 | Security Reviewer | read-only (planned) | Planned |
| 3 | Codebase Auditor | read-only (planned) | Planned |
| 4 | Implementation Engineer | bounded writes (planned) | Planned |

Each agent gets its own directory with the same four files: `AGENT.md` (mission,
responsibilities, permissions, governance), `CHECKLIST.md` (concrete checks +
false-positive controls), `OUTPUT_FORMAT.md` (finding + review schema), `SOURCES.md`
(deterministic context loading).

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

The mode is inferred from the verb + object; no knowledge of internals required.
