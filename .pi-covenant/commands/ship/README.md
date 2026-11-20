# Explicit shipping in Pi

Run `/ship` from a clean named task branch to ship existing commits. For uncommitted changes, provide exact task files relative to the repository root:

```text
/ship {"task_paths":["src/example.ts","src/example.test.ts"],"commit_message":"Implement example","title":"Implement example"}
```

Optional arguments are `cwd`, `repository`, `target_branch`, `description`, `deadline_minutes` and `max_fix_rounds`. The target defaults to the selected GitLab project's default branch. The title defaults to the current commit subject. Title and description are applied to a new draft. Existing MRs retain their metadata apart from the draft prefix removed on readiness.

The command runs the selected project checks, checks configured MR delivery requirements, commits exact files, and pushes the current branch with a normal single-branch Git push. Inherited push options and mirroring are cleared for this invocation. It reuses an exact existing branch MR or creates one GitLab draft. The same GitLab host credentials and optional MR delivery policy used by the `mr` tool apply. Unrelated staged files stay staged. Checks run in the selected checkout, where unrelated working files remain visible.

Readiness requires current-head GitLab CI, complete current-attempt job evidence and complete discussion evidence. Explicit GitLab `allow_failure` fields can exempt failed, skipped or manual jobs. Resolvable open discussions block readiness until explicitly addressed. A reply marked declined leaves the discussion open and keeps its rationale in the report.

When Pi asks for a review decision, enter a JSON object with `disposition` (`addressed` or `declined`) and `body`, or enter `repair` after applying a fix to the same authorized files. The command reruns checks and pushes the repair in the current invocation. A failed pipeline is offered for retry only after GitLab job evidence points to allowlisted transient failures and the user confirms. The command uses a 30-minute deadline, 15-second polling, and three repair or retry rounds by default. `/ship cancel` requests cancellation of an active run. Completed effects are reported when the command stops.

This command ends at human review readiness. It uses a fresh check and post-update GitLab readback for draft removal. Concurrent server updates can race the GitLab API title change. The GitLab integration has been exercised with a loopback fixture and disposable Git repositories. Live tenants and interactive TUI rendering remain unverified.

[Behavior contract](../../contracts/shipping/intent.md) · [Action schema](definition.json) · [Decision and model scope](../../docs/decisions/ADR-015-explicit-ship.md)
