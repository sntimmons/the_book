# Batch 5D-Partial — CI Enforcement Foundation (FINAL)

**Result: PASS.** CI now blocks on typecheck, a baseline lint gate, and the unit
test suite. Decorative lint (`npm run lint || true`) is gone. No app/Supabase/
migration/production changes; no lint-backlog cleanup; no new tests.

## Previous CI state
`.github/workflows/ci.yml` — one job `check` (ubuntu-latest, node 20, npm cache):
```
- npm ci --legacy-peer-deps      # blocking
- npm run typecheck              # blocking
- npm run lint || true           # NONBLOCKING (exit ignored — decorative)
```
No test step. Lint protected nothing; there were no automated tests in CI.

## New CI state
Same job/runner/node/cache; steps now (all **blocking** — no `|| true`, no
`continue-on-error`):
```
- npm ci --legacy-peer-deps      # blocking
- Typecheck:    npm run typecheck # blocking
- Lint (baseline gate): npm run lint:ci   # blocking
- Unit tests:   npm test -- --runInBand   # blocking
```
Triggers unchanged: `push` to `main`, `pull_request` targeting `main`.

**Order / fail-fast:** checkout → setup-node → install → typecheck → lint:ci →
unit tests. Cheap static checks (typecheck, lint) run before the unit suite so a
type or lint failure fails fast. All three gates are individually blocking, so a
failure at any stage fails the whole job; because every step here is fast
(seconds), order is about fail-fast clarity rather than runtime savings.

## Measured lint baseline
Measured on this branch from `main` @ `31f1f0a` via ESLint JSON output (machine-
readable, not console text):
- **Errors: 0**
- **Warnings: 210** (across 67 files)

Category breakdown:
| count | rule |
|---|---|
| 146 | `no-console` |
| 17 | `@typescript-eslint/array-type` |
| 17 | `react/no-unescaped-entities` |
| 13 | `no-unused-vars` |
| 12 | `@typescript-eslint/no-unused-vars` |
| 4 | `react-hooks/exhaustive-deps` |
| 1 | `@typescript-eslint/no-redeclare` |

## Baseline mechanism
Native ESLint, no custom framework: a new script
```
"lint:ci": "eslint . --ext .ts,.tsx --max-warnings 210"
```
- ESLint always exits non-zero on **any error**, regardless of `--max-warnings`
  → errors always fail CI.
- `--max-warnings 210` passes at ≤ 210 warnings and fails at ≥ 211 → the existing
  backlog does not block, but **new** warning debt does.
- The **210** is the frozen baseline (the exact current warning count). It is an
  explicit, reviewable number living in the `lint:ci` script and documented here.
  **It should only ever decrease** as the backlog is cleaned up (ratchet down the
  number in `lint:ci`); it must never be raised to accommodate new warnings.

Local semantics unchanged: `npm run lint` still uses `--max-warnings 0` (strict)
for day-to-day use; `lint:ci` is the CI gate only.

## Proof the gate works (temp file, reverted — nothing committed)
Method: created a throwaway `./_ci_probe.ts`, ran `npm run lint:ci`, deleted it.
| Case | Setup | `lint:ci` exit | Result |
|---|---|---|---|
| A/B current repo at baseline | (none) | **0** | baseline accepted |
| C one NEW warning | `_ci_probe.ts` with a `console.log` (`no-console`) → `✖ 211 problems (0 errors, 211 warnings)` | **1** | new warning **fails** |
| D one ESLint error | `_ci_probe.ts` with a parse error → `error Parsing error: Type expected` | **1** | error **fails** (even though warnings still ≤ 210) |
| cleanup | temp file removed | **0** | repo clean again |

`git status` confirmed no `_ci_probe` artifacts remain; `lint:ci` returns to exit 0.
No intentional lint violations are left in the branch.

## Unit-test CI command / result
Command (exactly what CI runs): `npm test -- --runInBand`
→ **10 suites passed / 10; 61 tests passed / 61** (~3.7s). Test count unchanged from
B5A (no tests added in this batch).

## Typecheck result
`npm run typecheck` (`tsc --noEmit`) → **exit 0**.

## CI / YAML validation
Parsed `.github/workflows/ci.yml` with `js-yaml` (a transitive dependency already
present — no new install). Result: valid YAML; job `check` has 6 steps; the three
gates (`typecheck`, `lint:ci`, `npm test -- --runInBand`) are all present as `run`
steps; no `|| true`; no `continue-on-error`; triggers = push+PR to `main`.
Limitation: this validates YAML syntax + workflow structure, not the full GitHub
Actions schema (no Actions-schema validator is installed and none was added).

## Files changed
- `.github/workflows/ci.yml` — blocking typecheck + `lint:ci` baseline gate +
  blocking unit tests; removed `|| true`.
- `package.json` — added `"lint:ci"` script (baseline gate). No other scripts
  changed; `lint`/`test`/`typecheck`/`check` unchanged.

No changes under `app/`, `lib/`, `components/`, `store/`, `supabase/`.

## Remaining lint debt
210 warnings remain (backlog frozen as the baseline). Dominated by `no-console`
(146). None block CI at the current baseline; new warnings will.

## Next recommended lint-ratchet step
Land a focused cleanup PR that removes/guards the `no-console` calls (or scopes a
`no-console` allowance), then lower `lint:ci` from `--max-warnings 210` to the new
measured count. Repeat per category (`array-type`, unused-vars, unescaped-entities)
until the baseline reaches 0, at which point `lint:ci` and `lint` converge and the
`--max-warnings` flag can drop to 0.

## PASS / FAIL
**PASS** — typecheck blocking (preserved), unit tests blocking (new), lint promoted
from decorative to a baseline gate that fails on errors and on new warnings;
proven; no behavior/Supabase/migration/production changes.
