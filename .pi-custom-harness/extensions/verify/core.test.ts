import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  RepoMapService,
  type RepositoryCheck,
  type RepositoryFacts,
  RepositoryFactsLookupError,
  type RepositoryVerificationPolicy,
} from "../../lib/repo-map/core";
import {
  VerifyCommandService,
  VerifyFocusedTestPackageError,
} from "../../lib/verify/core";
import { parseDiagnostics, verify } from "./core";

const facts = (
  checks: ReadonlyArray<RepositoryCheck>,
  verificationPolicy: RepositoryVerificationPolicy = {
    kind: "repository-wide",
  },
): RepositoryFacts => ({
  deliveryPolicy: { kind: "none", verification: verificationPolicy },
  testRunner: "none",
  checks,
  devModes: [],
  setupScript: undefined,
  authMode: undefined,
  portlessAppName: "repo",
  worktreeRoot: "/tmp",
  portlessRoute: {
    protocol: "https",
    hostSuffix: ".localhost",
    appName: "repo",
    url: "https://repo.localhost",
  },
  repositories: [],
});
const runVerify = (
  action: "types" | "lint" | "test" | "all",
  repositoryFacts: RepositoryFacts | undefined,
  runCheck: (input: {
    readonly cwd: string;
    readonly check: RepositoryCheck;
  }) => Effect.Effect<
    { readonly exitCode: number; readonly output: string },
    never
  >,
) =>
  Effect.runPromise(
    verify({ action, cwd: "/worktree" }).pipe(
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () =>
          repositoryFacts === undefined
            ? Effect.fail(
                new RepositoryFactsLookupError({
                  message: "facts unavailable",
                }),
              )
            : Effect.succeed(repositoryFacts),
      }),
      Effect.provideService(VerifyCommandService, { runCheck }),
    ),
  );
const runFocusedVerify = (
  repositoryFacts: RepositoryFacts,
  file: string,
  commandService: typeof VerifyCommandService.Service,
) =>
  Effect.runPromise(
    verify({ action: "test", file, cwd: "/worktree" }).pipe(
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.succeed(repositoryFacts),
      }),
      Effect.provideService(VerifyCommandService, commandService),
    ),
  );

test("focused-only all returns a policy failure without running commands", async () => {
  let calls = 0;
  const report = await runVerify(
    "all",
    facts(["test", "ts:check"], {
      kind: "focused-only",
      workspaceRoot: "/workspace",
    }),
    () => {
      calls += 1;
      return Effect.succeed({ exitCode: 0, output: "" });
    },
  );

  expect(calls).toBe(0);
  expect(report.failures).toEqual([
    {
      file: "",
      line: 0,
      rule: "repository-wide-forbidden",
      message:
        "Repository-wide verification is forbidden by repository policy; use focused verification.",
    },
  ]);
});

test("focused Vitest runs package-root command with --run file", async () => {
  const commands: ReadonlyArray<unknown>[] = [];
  const report = await runFocusedVerify(
    facts(["test"], { kind: "focused-only", workspaceRoot: "/workspace" }),
    "packages/blocks/src/LanguageSelect.test.tsx",
    {
      runCheck: () => Effect.die("runCheck must not run"),
      focusedTestPackageFor: () =>
        Effect.succeed({
          packageRoot: "/workspace/packages/blocks",
          relativeFile: "src/LanguageSelect.test.tsx",
          runner: "vitest",
        }),
      runCommand: (input) => {
        commands.push([input.cwd, input.program, ...input.args]);
        return Effect.succeed({ exitCode: 0, output: "" });
      },
    },
  );

  expect(commands).toEqual([
    [
      "/workspace/packages/blocks",
      "pnpm",
      "test",
      "--",
      "--run",
      "src/LanguageSelect.test.tsx",
    ],
  ]);
  expect(report.ok).toBe(true);
});

test("focused Jest runs package-root command with file after separator", async () => {
  const commands: ReadonlyArray<unknown>[] = [];
  const report = await runFocusedVerify(
    facts(["test"], { kind: "focused-only", workspaceRoot: "/workspace" }),
    "packages/extensions/src/widget.test.tsx",
    {
      runCheck: () => Effect.die("runCheck must not run"),
      focusedTestPackageFor: () =>
        Effect.succeed({
          packageRoot: "/workspace/packages/extensions",
          relativeFile: "src/widget.test.tsx",
          runner: "jest",
        }),
      runCommand: (input) => {
        commands.push([input.cwd, input.program, ...input.args]);
        return Effect.succeed({ exitCode: 0, output: "" });
      },
    },
  );

  expect(commands).toEqual([
    [
      "/workspace/packages/extensions",
      "pnpm",
      "test",
      "--",
      "src/widget.test.tsx",
    ],
  ]);
  expect(report.ok).toBe(true);
});

test("focused package discovery failures are structured and do not run tests", async () => {
  let commands = 0;
  const report = await runFocusedVerify(
    facts(["test"], { kind: "focused-only", workspaceRoot: "/workspace" }),
    "../outside.test.tsx",
    {
      runCheck: () => Effect.die("runCheck must not run"),
      focusedTestPackageFor: () =>
        Effect.fail(
          new VerifyFocusedTestPackageError({
            message:
              "Focused test file is outside the repository workspace: ../outside.test.tsx",
          }),
        ),
      runCommand: () => {
        commands += 1;
        return Effect.succeed({ exitCode: 0, output: "" });
      },
    },
  );

  expect(commands).toBe(0);
  expect(report).toMatchObject({
    ok: false,
    failures: [
      {
        rule: "focused-test-package",
        message:
          "Focused test file is outside the repository workspace: ../outside.test.tsx",
      },
    ],
  });
});

test("types runs the repository ts:check kind", async () => {
  const calls: RepositoryCheck[] = [];
  const report = await runVerify("types", facts(["ts:check"]), ({ check }) => {
    calls.push(check);
    return Effect.succeed({ exitCode: 0, output: "complete output" });
  });

  expect(calls).toEqual(["ts:check"]);
  expect(report.ok).toBe(true);
  expect(report.failures).toEqual([]);
});

test("lint runs the repository biome:check kind", async () => {
  const calls: RepositoryCheck[] = [];
  const report = await runVerify(
    "lint",
    facts(["biome:check"]),
    ({ check }) => {
      calls.push(check);
      return Effect.succeed({ exitCode: 0, output: "" });
    },
  );

  expect(calls).toEqual(["biome:check"]);
  expect(report.ok).toBe(true);
});

test("test runs the repository test kind", async () => {
  const calls: RepositoryCheck[] = [];
  const report = await runVerify("test", facts(["test"]), ({ check }) => {
    calls.push(check);
    return Effect.succeed({ exitCode: 0, output: "" });
  });

  expect(calls).toEqual(["test"]);
  expect(report.ok).toBe(true);
});

test("all follows repository check order, including bespoke checks", async () => {
  const checks: RepositoryCheck[] = [
    "fallow",
    "ts:check",
    "graphql:check",
    "test",
  ];
  const calls: RepositoryCheck[] = [];
  const report = await runVerify("all", facts(checks), ({ check }) => {
    calls.push(check);
    return Effect.succeed({ exitCode: 0, output: "" });
  });

  expect(calls).toEqual(checks);
  expect(report.ok).toBe(true);
});

test("missing individual scripts are structured failures and do not run", async () => {
  let calls = 0;
  const report = await runVerify("lint", facts(["test"]), () => {
    calls += 1;
    return Effect.succeed({ exitCode: 0, output: "" });
  });

  expect(calls).toBe(0);
  expect(report).toMatchObject({
    ok: false,
    failures: [
      {
        file: "",
        line: 0,
        rule: "missing-script",
        message: "Repository does not define the biome:check check script.",
      },
    ],
  });
});

test("command-reported missing scripts are structured failures", async () => {
  const report = await runVerify("all", facts(["ts:check"]), () =>
    Effect.succeed({
      exitCode: 1,
      output: "ERR_PNPM_NO_SCRIPT  Missing script: biome:check",
    }),
  );

  expect(report.failures).toEqual([
    {
      file: "",
      line: 0,
      rule: "missing-script",
      message: "Repository does not define the biome:check check script.",
    },
  ]);
});

test("all aggregates command failures and continues in order", async () => {
  const checks: RepositoryCheck[] = ["ts:check", "biome:check", "test"];
  const calls: RepositoryCheck[] = [];
  const report = await runVerify("all", facts(checks), ({ check }) => {
    calls.push(check);
    if (check === "ts:check") {
      return Effect.succeed({
        exitCode: 2,
        output: "src/a.ts:4:2 - error TS2322: Type mismatch",
      });
    }
    if (check === "biome:check") {
      return Effect.succeed({
        exitCode: 1,
        output: "src/b.ts:8:1 error noExplicitAny: avoid any",
      });
    }
    return Effect.succeed({ exitCode: 0, output: "" });
  });

  expect(calls).toEqual(checks);
  expect(report.ok).toBe(false);
  expect(report.failures).toEqual([
    {
      file: "src/a.ts",
      line: 4,
      rule: "TS2322",
      message: "Type mismatch",
    },
    {
      file: "src/b.ts",
      line: 8,
      rule: "noExplicitAny",
      message: "avoid any",
    },
  ]);
});

test("diagnostic parsing respects actionable boundaries and complete output", () => {
  const output = [
    "summary: 1 error",
    "src/a.ts:3:4 - error TS1005: ';' expected",
    "at compile (src/a.ts:3:4)",
    "src/b.ts(12,7): warning lint/no-any: avoid any",
    "not-a-diagnostic: still prose",
    "src/c.ts:99:2 error TS9999: final line",
  ].join("\n");

  expect(parseDiagnostics(output)).toEqual([
    {
      file: "src/a.ts",
      line: 3,
      rule: "TS1005",
      message: "';' expected",
    },
    {
      file: "src/b.ts",
      line: 12,
      rule: "lint/no-any",
      message: "avoid any",
    },
    {
      file: "src/c.ts",
      line: 99,
      rule: "TS9999",
      message: "final line",
    },
  ]);
});

test("repository-fact absence is a structured failure", async () => {
  const report = await runVerify("types", undefined, () =>
    Effect.die("command must not run"),
  );

  expect(report).toMatchObject({
    ok: false,
    failures: [
      {
        file: "",
        line: 0,
        rule: "repository-facts",
      },
    ],
  });
});
