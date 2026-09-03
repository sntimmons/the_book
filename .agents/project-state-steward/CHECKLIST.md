# Project State Steward — Reconciliation Checklist

Work through these in order. Each produces either a confirmed line in a PM document or an
entry under `CONFLICTS / NEEDS PRODUCT DECISION`.

## A. Anchor the run

- [ ] Record the `main` SHA being reconciled against, and today's date.
- [ ] Identify what merged since the last reconciliation (the SHA recorded in
      `CURRENT_STATE.md`), with PR numbers where available.
- [ ] Confirm the working tree is clean and the branch is not `main`.

**You have no `Bash` tool.** You cannot run `git`, `gh`, or anything else. The anchor SHA
and merge list must be **supplied in the invocation**, or read from a file. If they are
not supplied and cannot be read, you must **either** stop **or** record them under
`COULD NOT VERIFY` — never print an unconfirmed SHA in the `Reconciled against:` header,
where every downstream citation depends on it being real.

## B. Completed-work verification (the anti-wishful-thinking pass)

For every item a PM doc marks **completed**:

- [ ] Cite the merge SHA or PR that delivered it.
- [ ] Confirm the artifact exists on `main` — the route, migration, policy, or test.
- [ ] If the evidence is absent, do **not** silently downgrade it. Report it as a conflict:
      "ROADMAP claims X complete; no evidence found."

Never mark something complete because a session summary said so. Sessions describe
intent; `main` describes reality.

## C. Documentation consistency

- [ ] Does `CURRENT_STATE.md` contradict `BETA_SCOPE.md`, `REVIEWS_MODEL.md`,
      `USER_JOURNEYS.md`, or `NAVIGATION.md`? Any contradiction is a conflict to report,
      **never an edit to either file — including the one you are allowed to write.**
      "The authoritative doc outranks mine, so aligning mine is just maintenance" is
      picking a side. Report it and leave both unchanged.
- [ ] Does `PRODUCT_DECISIONS.md` contain anything unresolved? Decisions only — move
      nothing here without an explicit approval quote.
- [ ] Does `OPEN_QUESTIONS.md` contain anything already decided? An open question that has
      been answered gets **closed with a citation**, not deleted.
- [ ] Is any doc still asserting a status the repo disproves (e.g. "not configured yet",
      "does not exist yet", "planned")? Report if the doc is not in the writable allowlist.

## D. Decisions vs questions (the boundary that matters most)

- [ ] Every entry in `PRODUCT_DECISIONS.md` has: ID, decision, rationale, evidence, status.
- [ ] No entry is a working idea, a proposal, a recommendation, or a "we're leaning
      towards". If it cannot be quoted as an approval, it belongs in `OPEN_QUESTIONS.md`.
- [ ] A question that repository evidence appears to answer is **still a question** unless
      the Founder decided it. Code that happens to behave one way is not a decision.

## E. Roadmap integrity

- [ ] Sessions are ordered and labelled by session, not by calendar date.
- [ ] Completed sessions cite their merge SHAs.
- [ ] The roadmap states plainly that ordering is an estimate from current pace, not a
      delivery commitment.
- [ ] Nothing moved from "upcoming" to "in progress" without evidence that work started
      on a branch.

## F. Scope discipline (self-check before writing)

- [ ] Every file about to be written is on the allowlist in `AGENT.md`.
- [ ] No application code, migration, SQL, CI, config, test, script, or agent definition
      is in the diff.
- [ ] No new file is being created outside the allowlist.
- [ ] The diff contains no product decision that was not supplied or already recorded.

If any box in F cannot be ticked, STOP and report instead of writing.

## False-positive controls

- **Do not report a conflict you have not tried to disprove.** Read both sources fully; a
  wording difference is not a contradiction.
- **Do not treat a planned/deferred item as a defect.** `BETA_SCOPE.md` deliberately marks
  surfaces PARTIAL / PLACEHOLDER / DEFERRED / UNDECIDED.
- **Do not report absence of a feature as drift** when a doc already records it as future
  work.
- **Do not infer completion from a file's existence.** A route that exists may be a stub;
  say what you verified and what you did not.
