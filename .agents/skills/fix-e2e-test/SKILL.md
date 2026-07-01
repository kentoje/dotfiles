---
name: fix-e2e-test
description: >
  Fix a broken Playwright e2e test by reproducing the failure in a real browser
  FIRST and capturing the live UI, then editing the test once - instead of the
  blind edit-rerun-repeat loop. Use when an Aircall Playwright e2e test is
  failing/flaky, a CI e2e job is red, or on "fix this broken test". Leans on
  agent-browser-aircall-local for auth + portless URLs. Guards against masking a
  real product regression by editing the test to pass.
---

# Fix a broken e2e test (Playwright, Aircall)

Kills the loop of edit-test → rerun → still red → edit again. That loop guesses. Instead:
**reproduce the failing step in a real browser, capture the live UI as ground truth, then make one
informed edit.** With the correct locators and flow already in hand, the rerun usually passes first try.

## Two rules

1. **Never edit the test before reproducing its failing step in the browser.** Capture first.
2. **A red test may be catching a real regression.** If the root cause is a product bug, **STOP -
   do not edit the test to pass it.** Surface it; fix the product. Never weaken an assertion or drop
   a step just to get green.

## Find the repo's e2e command first

Read `package.json` `scripts` for the e2e target (`test:e2e`, `e2e`, `playwright`, …) and use it
scoped to **one** test. Use that script - don't invent `npx`. Run the dev server via `portless`
(see agent-browser-aircall-local), never a bare port.

## Phase 0 - Read the failure

1. Read the test + its config/fixtures. Note the **preconditions** (used in Phase 1): auth user /
   `storageState` or programmatic login, `baseURL` / env, seeded data, `beforeEach`, and the **exact**
   action sequence.
2. Run the single failing test with a trace - **don't fix yet**: `<e2e-script> <file> -g "<name>" --trace on`.
3. Open the trace. Its failure-time DOM snapshot + the exact failing step/locator scope which step to
   interrogate: `playwright show-trace <trace.zip>`.

## Phase 1 - Reproduce against the test's real state

Ground truth captured against the wrong state is confident-and-wrong. Match Phase 0's preconditions.

- The test's auth user may differ from agent-browser-aircall-local's injected staging JWT - different
  permissions/data yield different UI. Use the test's env and user where possible.
- Drive with **`agent-browser-aircall-local`** (`--session aircall-local`).
- **Replay the test's action sequence step-for-step.** After each step that changes the page,
  `snapshot -i` and record the live element (role, accessible name, `data-testid`, text). Walk to the
  failing step.

## Phase 2 - Diagnose the gap

| Gap | Fix |
| --- | --- |
| **Selector drift** - renamed/removed testid, changed role/name/text | Update locator to the captured one. |
| **Flow change** - new modal/confirm, reordered/extra steps | Update the action sequence. |
| **Timing** - element appears later | Web-first assertion / `expect.poll`, **never** `waitForTimeout`. |
| **Real regression** - UI genuinely wrong | **STOP** (rule 2). |

Confirm each locator resolves to exactly one element before using it (Playwright strict mode):
`agent-browser --session aircall-local get count "<selector>"` → must be 1.

## Phase 3 - One informed edit

Edit with the captured ground truth. Prefer resilient locators (`getByRole`/`getByLabel`/`getByTestId`)
matching the snapshot. See [references/locator-mapping.md](references/locator-mapping.md).

## Phase 4 - Rerun the single test, converge by new evidence only

Rerun (Phase 0 command). Green → done. Else:

- **Different failure** → discovery was partial. Back to the browser (Phase 1) for that step. Progress.
- **Same failure** → discovery/diagnosis is wrong. **Do not re-edit and rerun** - re-interrogate in
  the browser; reconsider whether it's a regression.

Cap ~2-3 iterations; if not converging, the assumption is likely wrong (product bug, or reproduced
state ≠ test state), not the edit.

## Notes

- Delegates browser/auth to `agent-browser-aircall-local` - don't reimplement it. One test at a time.
