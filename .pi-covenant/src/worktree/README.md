# Worktree module

Public entrypoint: module-port.ts. The constructor accepts a trusted resolved WorktreeHost; new, verify, list and rm accept the JSON requests in tools/worktree/definition.json and an optional WorktreeInvocation containing an absolute deadline and AbortSignal. Operations return Effects with the shared result envelope. No credentials or agent-supplied approval flags are accepted.

```ts
import { Effect } from "effect";

import { makeWorktreeModule } from "./module-port.js";

const worktrees = makeWorktreeModule({
  repositoryPath: "/project",
  repositoryId: "project",
  sessionCwd: "/project",
  root: "/managed-worktrees",
  defaultBase: "main",
  setup: { kind: "none" },
  requiredArtifacts: [],
});
const result = await Effect.runPromise(
  worktrees.new(
    { task: "CI-123" },
    { deadline: Date.now() + 60000, signal: new AbortController().signal }
  )
);
```

The example host must be supplied by future composition/context code. This module is not yet an installed Pi tool. Setup commands are explicit trusted argv vectors with after-create or creates-worktree mode. They receive the four PI_WORKTREE_* variables documented in the implementation ADR. Readiness only inspects declared artifacts; it never runs product verification. Successful creation with no setup reports not_configured.

## Layout

Behavior folders pair an operation with its checks: creation/create.ts and create.test.ts, inspection/inspect.ts and inspect.test.ts, removal/remove.ts and remove.test.ts, and listing/list.ts and list.test.ts. Invocation lifecycle checks are beside invocation/bound.ts. Shared isolated Git fixtures live in testing/fixture.ts. module-port.test.ts checks the external result schemas. Supporting code lives in registration/read.ts, paths/resolve.ts, process/run.ts, state/store.ts and model.ts.

Test identities in contract bindings stay stable when files move. Keep module-port.ts as the only cross-module entrypoint.
