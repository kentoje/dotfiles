import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";

import { runHarnessBacklog } from "./core";
import { HarnessBacklogLiveLayerForDirectory } from "./live";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const expectOnlySpec = `describe("session retro command", () => {
  test("records a checklist item without a ticket id", () => {
    expect(recordedItem.title).toBe("Missing session retro command");
    expect(recordedItem).not.toHaveProperty("id");
  });
})`;

const runAgainst = async (
  docsDirectory: string,
  input: Parameters<typeof runHarnessBacklog>[0],
) =>
  Effect.runPromise(
    runHarnessBacklog(input).pipe(
      Effect.provide(HarnessBacklogLiveLayerForDirectory(docsDirectory)),
    ),
  );

test("records the first item into an empty backlog file", async () => {
  const docsDirectory = await mkdtemp(join(tmpdir(), "harness-retro-"));
  temporaryDirectories.push(docsDirectory);
  await writeFile(join(docsDirectory, "TODO.md"), "# Remaining work\n", "utf8");

  const result = await runAgainst(docsDirectory, {
    action: "record",
    kind: "fix",
    title: "Missing session retro command",
    evidence: "No user-invoked way to capture harness friction",
    proposal: "Add /harness-retro",
    spec: expectOnlySpec,
  });

  expect(result).toMatchObject({
    action: "record",
    status: "recorded",
    item: { title: "Missing session retro command", done: false },
  });
  const backlog = await readFile(join(docsDirectory, "BACKLOG.md"), "utf8");
  expect(backlog).toContain("- [ ] Missing session retro command");
  expect(backlog).toContain('expect(recordedItem).not.toHaveProperty("id")');
  expect(backlog).not.toContain("HB-");
});

test("list then record reports an existing backlog title", async () => {
  const docsDirectory = await mkdtemp(join(tmpdir(), "harness-retro-"));
  temporaryDirectories.push(docsDirectory);
  await writeFile(
    join(docsDirectory, "TODO.md"),
    "# Remaining work\n\n- [ ] Unrelated planned item\n",
    "utf8",
  );
  await writeFile(
    join(docsDirectory, "BACKLOG.md"),
    `# Harness backlog

## Open

- [ ] Isolated worktree root

  - Kind: feature
  - Evidence: x
  - Proposal: y
  - Spec:

    \`\`\`ts
${expectOnlySpec
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
    \`\`\`

## Done
`,
    "utf8",
  );

  const listed = await runAgainst(docsDirectory, { action: "list" });
  expect(listed).toMatchObject({
    action: "list",
    items: [{ title: "Isolated worktree root", done: false }],
  });

  const existing = await runAgainst(docsDirectory, {
    action: "record",
    kind: "feature",
    title: "isolated worktree root",
    evidence: "same issue",
    proposal: "do not duplicate",
    spec: expectOnlySpec,
  });
  expect(existing).toMatchObject({
    action: "record",
    status: "existing",
    source: "backlog",
    item: { title: "Isolated worktree root" },
  });
});
