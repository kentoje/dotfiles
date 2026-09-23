# Harness backlog

Session-derived fixes and features for `.pi-custom-harness`.
This is the source of truth for work discovered during `/harness-retro`.
`docs/TODO.md` remains the implementation roadmap. Do not copy an item that is already planned there.

Each item is a markdown checkbox appended by `harness_backlog record`.
Recorded specs are `describe`/`test` blocks whose bodies are only `expect` calls. No test implementation.

## Open

## Done

- [x] Fix verify command launch failing with spawn ENOTDIR across repositories

  - Kind: fix
  - Evidence: Every `verify` call in this session failed with `guard failed unexpectedly. spawn ENOTDIR` regardless of target: a changed file in the task worktree `/Volumes/HomeX/kento/.pi/worktrees/conversation-center-ext/campaigns-filter`, a pristine main-checkout file (`src/pages/conversation_center/components/Filters/Filters.tsx`), the sibling worktree `CI-6861`, `analytics-extension/src/components/CampaignsFilter/CampaignsFilter.tsx`, and `dashboard-v4/src/index.tsx`. Both `types` and `lint` actions failed identically, which blocked the ship-gate verify requirement repeatedly with no actionable information. The fault is specific to the verify launch path, not the environment or the snapshot: `fleet status` returned full repository data in the same session, `git rev-parse --show-toplevel` and `pnpm run ts:check` succeeded when run directly in those directories, and a direct Effect `ChildProcessSpawner.spawn` of `git` and `pnpm` through `@effect/platform-bun/BunServices` succeeded with `cwd` set to the same worktree. A hydra file surfaced a different and actionable message (`Repository facts lookup failed: NotFound: FileSystem.access (/Users/kento/Documents/gitlab/hydra/src/hydra.ts)`), showing the boundary reports mapped causes correctly, while the `ENOTDIR` path escapes as an unmapped `Error` and reaches the generic `guard failed unexpectedly` branch with no program, cwd, or cause.
  - Proposal: In `extensions/verify/index.ts` and `lib/verify/live.ts`, carry the failing program, argument list, and working directory into the failure reason, and map the launch error to a typed verification failure instead of letting it fall through the generic unmapped-defect branch of `failureReason`. Confirm the check command launches in the resolved worktree rather than an inherited environment, and add a regression test that exercises a launch failure and asserts the reported cause names the program and directory.
  - Spec:

    ```ts
    describe("verify command launch", () => {
      test("runs the requested check in the requested worktree", () => {
        expect(report.worktree).toBe(requestedWorktree);
        expect(report.status).toBe("completed");
        expect(report.failures).toEqual([]);
      });
      test("names the program and directory when the check cannot start", () => {
        expect(report.ok).toBe(false);
        expect(report.failures[0].message).toContain("pnpm");
        expect(report.failures[0].message).toContain(requestedWorktree);
      });
    });
    ```

- [x] Enforce context-aware ticket branch names

  - Kind: fix
  - Evidence: This session required a branch for frontend ticket CI-6861. The task worktree name cannot contain slashes, and ticket binding rejected contextual branches such as `ci-6861-campaign-filter` because it only accepted a branch exactly matching `CI-6861`. Three worktrees were created and two were removed before the exact-ticket branch could bind. Repository conventions observed in merged MRs use a type/context/ticket shape, such as `feat/add-team-picker-ci-6842`, while this harness forced `CI-6861`.
  - Proposal: Let worktree creation accept a validated branch name shaped as `<type>/<context>/<ticket>` and make ticket binding validate the ticket suffix rather than requiring an exact branch match. Preserve the branch and ticket in the worktree binding record so the ship gate can resolve either path.
  - Spec:

    ```ts
    describe("ticket branch naming", () => {
      test("accepts the repository branch convention", () => {
        expect(branchName).toMatch(/^(feat|fix|chore|refactor|docs|test)\/[^/]+\/[A-Z]+-\d+$/);
      });
      test("binds a ticket whose key is the branch suffix", () => {
        expect(binding.ticketKey).toBe(ticketKey);
        expect(binding.branch).toBe(branchName);
      });
    });
    ```

- [x] Enforce conventional merge-request titles

  - Kind: fix
  - Evidence: MR !1309 was initially created as `[CI-6861] Add campaign filter to Conversation Center`, but merged repository examples use a conventional prefix followed by context and the ticket, such as `feat: add team picker to automation users [CI-6842]`. The title had to be corrected manually after review, and the MR creation boundary accepted the nonconforming title without warning.
  - Proposal: Have the guarded MR creation and update paths derive or validate titles against the repository convention, using the conventional commit prefix, a concise context, and the bound ticket suffix. Fail closed with the expected format when a supplied title does not conform, or normalize it before creation.
  - Spec:

    ```ts
    describe("merge request title convention", () => {
      test("accepts a conventional prefix, context, and ticket suffix", () => {
        expect(title).toMatch(/^(feat|fix|chore|refactor|docs|test)(\([^)]*\))?: .+ \[[A-Z]+-\d+\]$/);
      });
      test("reports the expected title when the supplied title is nonconforming", () => {
        expect(normalizedTitle).toBe(expectedTitle);
        expect(titleError).toBeUndefined();
      });
    });
    ```

- [x] Preflight duplicate task worktrees and merge requests

  - Kind: fix
  - Evidence: The user warned that another worktree might exist, but the harness did not surface existing task state before implementation. This session created three CI-6861 worktrees because branch naming and ticket binding were incompatible, and GitLab already showed another open campaign-filter MR from a separate task branch. Existing-MR inspection happened only after the new branch and MR were created.
  - Proposal: Add a preflight action before worktree creation or ticket creation that searches registered worktrees, branch bindings, Jira tickets, and open merge requests for the task context. Return the matches and require an explicit user decision before creating a potentially duplicate worktree, ticket, or MR.
  - Spec:

    ```ts
    describe("task preflight deduplication", () => {
      test("reports matching worktrees, tickets, and merge requests", () => {
        expect(preflight.worktrees).toBeDefined();
        expect(preflight.tickets).toBeDefined();
        expect(preflight.mergeRequests).toBeDefined();
      });
      test("requires an explicit decision before duplicate creation", () => {
        expect(preflight.action).toBe("ask_user");
        expect(preflight.reason).toContain("existing");
      });
    });
    ```

- [x] Keep repository verification alive for the requested worktree

  - Kind: fix
  - Evidence: After the CI image edit, `verify all` was invoked twice with `/Volumes/HomeX/kento/.pi/worktrees/assets-page/DAT-624/.gitlab/ci/e2e.gitlab-ci.yml`; both calls ran the session checkout's bare `vitest` script, entered watch mode, and ended only when the tool signal was aborted.
  - Proposal: Resolve an absolute supplied file to its worktree, run the command plan there, and invoke Vitest checks with `--run` so verification returns a structured completed result unless the caller explicitly cancels.
  - Spec:

    ```ts
    describe("verify all worktree lifecycle", () => {
      test("returns a completed result for the requested worktree", () => {
        expect(result.worktree).toBe(requestedWorktree);
        expect(result.status).toBe("completed");
      });
    });
    ```

- [x] Run Fleet Git range checks in the selected repository

  - Kind: fix
  - Evidence: After Fleet repository discovery and open-MR lookup were fixed, `fleet status` failed with `fatal: ambiguous argument 'main...HEAD'`. A live sweep showed Git commands already used each selected repository path; the actual failure was `dashboard-v4`, whose `origin/HEAD` is `origin/master`, while Fleet hardcoded `main...HEAD` for every repository.
  - Proposal: Run every Fleet Git command in the selected repository and resolve its default branch from `origin/HEAD`, with `origin/main` and `origin/master` fallbacks, before computing ahead/behind.
  - Spec:

    ```ts
    describe("Fleet repository Git context", () => {
      test("runs ahead-behind checks in the selected repository", () => {
        expect(gitWorkingDirectory).toBe(repositoryPath);
        expect(aheadBehind).toEqual({ behind: 0, ahead: 0 });
      });
    });
    ```

- [x] Verify the requested task worktree instead of the session checkout

  - Kind: fix
  - Evidence: In this session, `worktree new DAT-624` created `/Volumes/HomeX/kento/.pi/worktrees/assets-page/DAT-624`, but `worktree verify DAT-624` inspected `/Volumes/HomeX/kento/Documents/gitlab/assets-page` and failed with `Worktree is not recognized`. The task argument was ignored when resolving the checkout.
  - Proposal: Resolve the requested task to its registered worktree before verification, and return that worktree's branch and setup result rather than relying on the session process working directory.
  - Spec:

    ```ts
    describe("worktree verify task targeting", () => {
      test("verifies the requested task worktree", () => {
        expect(effectiveWorktreePath).toBe(taskWorktreePath);
        expect(verification.reason).not.toContain("is not recognized");
      });
    });
    ```

- [x] Expose the protected merge-request creation boundary

  - Kind: fix
  - Evidence: This session required opening an MR through the mandated `mr-guard` boundary, but `command -v mr-guard` returned no path and `mr-guard --help` returned `command not found`. The only available GitLab CLI command was unguarded `glab mr create`, which policy forbids as a substitute.
  - Proposal: Install or expose `mr-guard` on the agent command path, and make its unavailable state an actionable harness diagnostic before an agent reaches the MR-creation gate.
  - Spec:

    ```ts
    describe("mr-guard command availability", () => {
      test("exposes the protected merge-request creation command", () => {
        expect(commandName).toBe("mr-guard");
        expect(executablePath).toBeDefined();
      });
    });
    ```

- [x] Fix WorktreePortlessService invoking non-existent portless add command

  - Kind: fix
  - Evidence: Running worktree new CI-6782 executed portless add CI-6782.conversation-center-ext ..., which failed with /bin/sh: CI-6782.conversation-center-ext: command not found because portless CLI has no add subcommand and treated add as an app name.
  - Proposal: In lib/worktree/live.ts, update WorktreePortlessService.register to avoid calling non-existent portless add, making it a no-op or using supported portless CLI primitives.
  - Spec:

    ```ts
    describe("WorktreePortlessService.register", () => {
      test("does not invoke a portless add command", () => {
        expect(portlessCommand).not.toMatch(/\bportless add\b/);
        expect(registerWorktreePortlessRoute).toBe(portless.register);
      });
    });
    ```

- [x] Resolve effective target directory in mr-guard when commands chain cd

  - Kind: fix
  - Evidence: Running cd /Users/kento/.pi/worktrees/hydra/DS-237 && glab mr create ... was blocked by mr-guard because it checked context.cwd (conversation-center-ext, branch CI-6782 with MR !1302) instead of the cd target directory.
  - Proposal: In extensions/mr-guard, extract the effective working directory from leading cd statements in the command before checking gitLabService.findOpenMergeRequestForCurrentBranch({ cwd }).
  - Spec:

    ```ts
    describe("mr-guard chained cd", () => {
      test("looks up the merge request in the cd target directory", () => {
        expect(effectiveWorkingDirectory).toBe(
          "/Users/kento/.pi/worktrees/hydra/DS-237",
        );
        expect(mergeRequestLookupCwd).toBe(
          "/Users/kento/.pi/worktrees/hydra/DS-237",
        );
      });
    });
    ```

- [x] Include command output tail in verify fallback failure when diagnostics parser returns empty

  - Kind: fix
  - Evidence: When verify ran pnpm test and a worker crash occurred, verify returned Check failed with exit code 1 without including any of the output, forcing manual bash inspection.
  - Proposal: In extensions/verify/core.ts checkFailures, include the tail of result.output in the fallback failure message when parseDiagnostics returns an empty array on non-zero exit codes.
  - Spec:

    ```ts
    describe("verify fallback failure", () => {
      test("includes the command output tail when diagnostics are empty", () => {
        expect(failure.message).toContain("Check failed with exit code 1.");
        expect(failure.message).toContain("A worker process has failed to exit gracefully");
      });
    });
    ```
