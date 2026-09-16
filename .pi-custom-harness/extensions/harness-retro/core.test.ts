import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  type HarnessBacklogDocuments,
  HarnessBacklogFileSystemService,
  HarnessBacklogValidationError,
  makeHarnessRetroFollowUpText,
  parseHarnessBacklogItems,
  parseHarnessRoadmapReferences,
  runHarnessBacklog,
  validateHarnessBacklogSpec,
} from "./core";
import type { HarnessBacklogInput } from "./schema";

const validSpec = `describe("worktree root", () => {
  test("keeps created trees off the internal disk", () => {
    expect(worktreeRoot).toBe("/Volumes/HomeX/kento/.pi/worktrees");
  });
})`;

const fencedSpec = `    \`\`\`ts
${validSpec
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
    \`\`\``;

const sampleBacklog = `# Harness backlog

## Open

- [ ] Worktree root stays on internal disk

  - Kind: fix
  - Evidence: CI-6782 node_modules used 2.3G on ~/.pi/worktrees
  - Proposal: Point worktreeRoot at HomeX
  - Spec:

${fencedSpec}
`;

const sampleRoadmap = `# Remaining work

## P1: decisions blocking dependent modules

- [ ] Choose the replacement for ~/.maestro/worktrees
- [x] Add the worktree extension
`;

const makeDocuments = (
  documents: HarnessBacklogDocuments,
): { documents: HarnessBacklogDocuments; writes: string[] } => {
  const writes: string[] = [];
  return {
    documents,
    writes,
  };
};

const run = (
  input: HarnessBacklogInput,
  state: { documents: HarnessBacklogDocuments; writes: string[] },
) =>
  Effect.runPromise(
    runHarnessBacklog(input).pipe(
      Effect.provideService(HarnessBacklogFileSystemService, {
        readDocuments: () => Effect.succeed(state.documents),
        writeBacklog: (contents) =>
          Effect.sync(() => {
            state.documents = { ...state.documents, backlog: contents };
            state.writes.push(contents);
          }),
      }),
    ),
  );

const runExit = (
  input: HarnessBacklogInput,
  state: { documents: HarnessBacklogDocuments; writes: string[] },
) =>
  Effect.runPromiseExit(
    runHarnessBacklog(input).pipe(
      Effect.provideService(HarnessBacklogFileSystemService, {
        readDocuments: () => Effect.succeed(state.documents),
        writeBacklog: (contents) =>
          Effect.sync(() => {
            state.documents = { ...state.documents, backlog: contents };
            state.writes.push(contents);
          }),
      }),
    ),
  );

const expectValidationFailure = async (spec: string) => {
  const exit = await Effect.runPromiseExit(validateHarnessBacklogSpec(spec));
  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    expect(String(exit.cause)).toContain("HarnessBacklogValidationError");
    expect(String(exit.cause)).toContain(
      "must not include test implementation",
    );
  }
};

test("parses checklist items and roadmap coverage", () => {
  expect(parseHarnessBacklogItems(sampleBacklog)).toEqual([
    {
      title: "Worktree root stays on internal disk",
      kind: "fix",
      done: false,
      evidence: "CI-6782 node_modules used 2.3G on ~/.pi/worktrees",
      proposal: "Point worktreeRoot at HomeX",
      spec: validSpec,
    },
  ]);
  expect(parseHarnessRoadmapReferences(sampleRoadmap)).toEqual([
    { kind: "heading", text: "P1: decisions blocking dependent modules" },
    {
      kind: "checkbox",
      text: "Choose the replacement for ~/.maestro/worktrees",
    },
    { kind: "checkbox", text: "Add the worktree extension" },
  ]);
});

test("lists existing checklist items and roadmap references", async () => {
  const result = await run(
    { action: "list" },
    makeDocuments({ backlog: sampleBacklog, roadmap: sampleRoadmap }),
  );
  expect(result.action).toBe("list");
  if (result.action !== "list") return;
  expect(result.items.map((item) => item.title)).toEqual([
    "Worktree root stays on internal disk",
  ]);
  expect(result.roadmap.map((entry) => entry.text)).toContain(
    "P1: decisions blocking dependent modules",
  );
});

test("records a new checklist item under Open before Done", async () => {
  const state = makeDocuments({
    backlog: `${sampleBacklog}\n## Done\n`,
    roadmap: sampleRoadmap,
  });
  const result = await run(
    {
      action: "record",
      kind: "feature",
      title: "Session retro command",
      evidence: "No user-invoked way to capture harness friction",
      proposal: "Add /harness-retro and a dedicated backlog file",
      spec: `describe("harness retro", () => {
  test("records a checklist item instead of a ticket id", () => {
    expect(recordedItem.title).toBe("Session retro command");
    expect(recordedItem).not.toHaveProperty("id");
  });
})`,
    },
    state,
  );
  expect(result).toMatchObject({
    action: "record",
    status: "recorded",
    item: {
      title: "Session retro command",
      kind: "feature",
      done: false,
    },
  });
  expect(state.writes).toHaveLength(1);
  expect(state.documents.backlog).toContain("- [ ] Session retro command");
  expect(state.documents.backlog).not.toContain("HB-");
  expect(
    state.documents.backlog.indexOf("- [ ] Session retro command"),
  ).toBeLessThan(state.documents.backlog.indexOf("## Done"));
});

test("refuses to copy a title already in the backlog", async () => {
  const state = makeDocuments({
    backlog: sampleBacklog,
    roadmap: sampleRoadmap,
  });
  const result = await run(
    {
      action: "record",
      kind: "fix",
      title: "worktree root stays on internal disk!",
      evidence: "same pain again",
      proposal: "move the root",
      spec: validSpec,
    },
    state,
  );
  expect(result).toEqual({
    action: "record",
    status: "existing",
    source: "backlog",
    item: {
      title: "Worktree root stays on internal disk",
      kind: "fix",
      done: false,
      evidence: "CI-6782 node_modules used 2.3G on ~/.pi/worktrees",
      proposal: "Point worktreeRoot at HomeX",
      spec: validSpec,
    },
  });
  expect(state.writes).toHaveLength(0);
});

test("refuses to copy a title already planned in the roadmap", async () => {
  const state = makeDocuments({
    backlog: sampleBacklog,
    roadmap: sampleRoadmap,
  });
  const result = await run(
    {
      action: "record",
      kind: "feature",
      title: "Choose the replacement for ~/.maestro/worktrees",
      evidence: "still on ~/.pi/worktrees",
      proposal: "document the HomeX root",
      spec: validSpec,
    },
    state,
  );
  expect(result).toMatchObject({
    action: "record",
    status: "existing",
    source: "roadmap",
    roadmap: {
      kind: "checkbox",
      text: "Choose the replacement for ~/.maestro/worktrees",
    },
  });
  expect(state.writes).toHaveLength(0);
});

test("rejects a record missing required fields", async () => {
  const exit = await runExit(
    { action: "record", title: "Incomplete" },
    makeDocuments({ backlog: sampleBacklog, roadmap: sampleRoadmap }),
  );
  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    expect(String(exit.cause)).toContain("HarnessBacklogValidationError");
  }
  await expect(
    run(
      { action: "record", title: "Incomplete" },
      makeDocuments({ backlog: sampleBacklog, roadmap: sampleRoadmap }),
    ),
  ).rejects.toBeInstanceOf(HarnessBacklogValidationError);
});

test("rejects a spec that includes test implementation", async () => {
  await expectValidationFailure(`describe("verify fallback", () => {
  test("includes command output", () => {
    const output = runCheck();
    expect(output).toContain("worker process has failed");
  });
})`);
  await expectValidationFailure(`import { expect, test } from "bun:test";
describe("verify fallback", () => {
  test("includes command output", () => {
    expect(failure.message).toContain("worker process has failed");
  });
})`);
  await expectValidationFailure(`describe("verify fallback", () => {
  test("includes command output", async () => {
    expect(failure.message).toContain("worker process has failed");
  });
})`);
  await expectValidationFailure(`describe("verify fallback", () => {
  test("includes command output", () => {
    setupFixtures();
    expect(failure.message).toContain("worker process has failed");
  });
})`);
});

test("accepts a fenced expect-only spec", async () => {
  const spec = await Effect.runPromise(
    validateHarnessBacklogSpec(`\`\`\`ts
${validSpec}
\`\`\``),
  );
  expect(spec).toBe(validSpec);
});

test("includes operator focus and expect-only rules in the follow-up prompt", () => {
  expect(makeHarnessRetroFollowUpText("worktree root")).toContain(
    "Operator focus: worktree root",
  );
  expect(makeHarnessRetroFollowUpText("")).toContain(
    "No extra focus was provided",
  );
  expect(makeHarnessRetroFollowUpText("x")).toContain(
    "call `harness_backlog` with action `record`",
  );
  expect(makeHarnessRetroFollowUpText("x")).toContain(
    "Do not invent ticket ids or HB prefixes.",
  );
  expect(makeHarnessRetroFollowUpText("x")).toContain(
    "Do not write test implementation",
  );
});
