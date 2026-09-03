# Project State Steward — Reconciliation Checklist

Work through these in order. Each produces either a confirmed line in a PM document or an
entry under `CONFLICTS / NEEDS PRODUCT DECISION`.

## A. Anchor the run

- [ ] Record today's date and the `main` SHA the run inspected.
- [ ] Decide whether that SHA advances the `Reconciled against:` anchor. **It does not
      advance automatically.** The anchor means *the last commit at which the repository
      facts asserted in this document were verified* — not the tip of `main`. A
      documentation-only merge that changes no repository, product, runtime or security
      fact **leaves the anchor where it is**. Re-stamping it on every docs PR makes the
      anchor chase its own tail: the merge that updates it is itself unrecorded the moment
      it lands, and the header asserts a verification that never happened.
- [ ] **Tiebreak — when a merge looks like both.** A `.agents/**` specification change is
      *documentation* by file type and a *governance capability* by effect, so the
      exemption above and the § E row rule both appear to apply. The rule is:
      **a PR that earns a ROADMAP capability row under § E has, by definition, changed a
      repository fact relevant to that ROADMAP, and advances the ROADMAP anchor to that
      capability-delivering merge.** A routine documentation-only reconciliation that earns
      no capability row advances no anchor. This stays terminal rather than recursive:
      the PR that *writes* a row is never the PR that earned **that row** — the anchor
      moves to the earning merge, which is already in the past when the row is written.
      Stated per-row deliberately. A single PR may both write rows for past merges and
      earn one of its own, to be written later; "this PR writes rows, therefore it earns
      none" is the wrong inference. The guarantee is structural rather than conventional:
      a self-citing row is **unconstructible**, because no commit can contain its own SHA.
      A document's anchor moves only if that document asserts the new fact: a governance
      merge that ROADMAP cites moves ROADMAP's anchor and not necessarily the others'.
- [ ] Record `Last edited by: PR #NN` on every document the run edits. This is the
      documentation-mutation record and is **independent** of the factual anchor. Use the
      PR number: it exists before merge, whereas a merge SHA does not — so a document can
      never truthfully cite the commit that lands it.
- [ ] Identify what merged since the last reconciliation, with PR numbers where available.
      `Reconciled against:` is the *factual* baseline; `Last edited by:` says how far the
      prose has been carried. The two can legitimately diverge, and both may be needed to
      work out what is new.
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
- [ ] A PR earns a Completed row only when it materially delivers a **product,
      architecture, security, governance, infrastructure or operating capability**. A
      routine reconciliation that only updates documentation to reflect already-landed
      facts does **not** earn a row — otherwise the table fills with entries about itself.
      `git log --merges main` remains the complete record of every merge.
- [ ] Adding a row here has an anchor consequence: per the tiebreak in § A, a PR that earns
      a row advances this document's `Reconciled against:` anchor to that PR's merge commit.
      A row whose artifact post-dates the anchor is a contradiction — the header would be
      asserting a verification at a commit where the cited artifact did not yet exist.
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
