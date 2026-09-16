import { dirname, isAbsolute } from "node:path";

import { Effect } from "effect";

import {
  RepoMapService,
  type RepositoryCheck,
  type RepositoryFacts,
  verificationPolicyAllowsFocusedTest,
  verificationPolicyAllowsRepositoryWide,
  verificationPolicyWorkspaceRoot,
} from "../../lib/repo-map/core";
import {
  type VerifyCommandExecutionError,
  VerifyCommandService,
  type VerifyFocusedTestPackageError,
} from "../../lib/verify/core";
import type { VerifyInput } from "./schema";

/** One actionable diagnostic returned by a repository check. */
export interface VerifyFailure {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
}

/** The stable public result of a verification run. */
export interface VerifyReport {
  readonly ok: boolean;
  readonly status: "completed" | "interrupted";
  readonly worktree: string;
  readonly failures: ReadonlyArray<VerifyFailure>;
  readonly duration: number;
}

/** Failures that can be returned by the verify command service. */
export type VerifyError =
  | VerifyCommandExecutionError
  | VerifyFocusedTestPackageError;

const selectedCheckFor = (
  action: VerifyInput["action"],
): RepositoryCheck | undefined => {
  switch (action) {
    case "types":
      return "ts:check";
    case "lint":
      return "biome:check";
    case "test":
      return "test";
    case "all":
      return undefined;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
};

const failure = (
  rule: string,
  message: string,
  file = "",
  line = 0,
): VerifyFailure => ({ file, line, rule, message });

const stripAnsi = (line: string): string =>
  line.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape parsing requires control characters.
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[a-zA-Z\d]))/g,
    "",
  );

const diagnosticFromRest = (
  rest: string,
): { readonly rule: string; readonly message: string } | undefined => {
  const compiler = /^(TS\d+)\s*:\s*(.+)$/.exec(rest);
  if (compiler !== null) {
    const rule = compiler[1];
    const message = compiler[2];
    if (rule !== undefined && message !== undefined) {
      return { rule, message };
    }
  }

  const prefixed =
    /^(?:error|warning)\b\s*(?:(TS\d+|[A-Za-z][\w./-]*)\s*:\s*)?(.+)$/i.exec(
      rest,
    );
  if (prefixed !== null) {
    const message = prefixed[2];
    if (message === undefined) {
      return undefined;
    }
    return {
      rule:
        prefixed[1] ??
        (rest.toLowerCase().startsWith("warning") ? "warning" : "error"),
      message,
    };
  }

  const lintRule =
    /^([A-Za-z][\w.-]*(?:\/[A-Za-z0-9_.-]+)+)\s*:?[ \t]+(.+)$/.exec(rest);
  if (lintRule !== null) {
    const rule = lintRule[1];
    const message = lintRule[2];
    if (rule !== undefined && message !== undefined) {
      return { rule, message };
    }
  }

  return undefined;
};

/** Parses complete command output, retaining actionable file-location diagnostics. */
export const parseDiagnostics = (
  output: string,
): ReadonlyArray<VerifyFailure> => {
  const diagnostics: VerifyFailure[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = stripAnsi(rawLine).trim();
    if (line.length === 0 || /^(?:at|https?:\/\/)/i.test(line)) {
      continue;
    }

    const parenthesized = /^(.+)\((\d+),(?:\d+)\):\s*(.+)$/.exec(line);
    const colonDelimited = /^(.+):(\d+):(?:\d+)(?:\s*-\s*|\s+)(.+)$/.exec(line);
    const match = parenthesized ?? colonDelimited;
    if (match === null) {
      continue;
    }

    const file = match[1];
    const lineText = match[2];
    const rest = match[3];
    if (file === undefined || lineText === undefined || rest === undefined) {
      continue;
    }
    const parsed = diagnosticFromRest(rest);
    if (parsed === undefined || parsed.message.trim().length === 0) {
      continue;
    }
    diagnostics.push({
      file: file.trim(),
      line: Number.parseInt(lineText, 10),
      rule: parsed.rule,
      message: parsed.message.trim(),
    });
  }
  return diagnostics;
};

const VERIFY_FALLBACK_OUTPUT_TAIL_LINES = 20;
const VERIFY_FALLBACK_OUTPUT_TAIL_CHARS = 2000;

/** Last lines of check output kept when no file-location diagnostic was parsed. */
export const commandOutputTail = (output: string): string => {
  const stripped = stripAnsi(output).trim();
  if (stripped.length === 0) {
    return "";
  }
  const tail = stripped
    .split(/\r?\n/u)
    .slice(-VERIFY_FALLBACK_OUTPUT_TAIL_LINES)
    .join("\n")
    .trim();
  if (tail.length <= VERIFY_FALLBACK_OUTPUT_TAIL_CHARS) {
    return tail;
  }
  return tail.slice(-VERIFY_FALLBACK_OUTPUT_TAIL_CHARS);
};

const checkFailures = (
  check: RepositoryCheck,
  result: { readonly exitCode: number; readonly output: string },
): ReadonlyArray<VerifyFailure> => {
  if (result.exitCode === 0) {
    return [];
  }

  const missingScript =
    /(?:missing script|no script named)\s*:?\s*["']?([^"'\s]+)["']?/i.exec(
      result.output,
    );
  const script = missingScript?.[1];
  if (script !== undefined) {
    return [
      failure(
        "missing-script",
        `Repository does not define the ${script} check script.`,
      ),
    ];
  }

  const diagnostics = parseDiagnostics(result.output);
  if (diagnostics.length > 0) {
    return diagnostics;
  }
  const tail = commandOutputTail(result.output);
  const suffix = tail.length > 0 ? `\n${tail}` : "";
  return [
    failure(check, `Check failed with exit code ${result.exitCode}.${suffix}`),
  ];
};

const runChecks = Effect.fn("verify.runChecks")(function* ({
  cwd,
  checks,
  testRunner,
}: {
  readonly cwd: string;
  readonly checks: ReadonlyArray<RepositoryCheck>;
  readonly testRunner: RepositoryFacts["testRunner"];
}) {
  const commandService = yield* VerifyCommandService;
  const failures: VerifyFailure[] = [];
  for (const check of checks) {
    const result = yield* commandService
      .runCheck({ cwd, check, testRunner })
      .pipe(
        Effect.match({
          onFailure: (error) => ({ _tag: "failure" as const, error }),
          onSuccess: (value) => ({ _tag: "success" as const, value }),
        }),
      );
    if (result._tag === "failure") {
      failures.push(failure("command", result.error.message));
      continue;
    }
    failures.push(...checkFailures(check, result.value));
  }
  return failures;
});
const focusedTestFailures = Effect.fn("verify.focusedTestFailures")(function* ({
  file,
  workspaceRoot,
}) {
  const commandService = yield* VerifyCommandService;
  const packageDiscovery = commandService.focusedTestPackageFor;
  if (packageDiscovery === undefined) {
    return [
      failure(
        "focused-test-package",
        "Focused test package discovery is unavailable.",
      ),
    ];
  }
  const packageResult = yield* packageDiscovery({
    file,
    workspaceRoot,
  }).pipe(
    Effect.match({
      onFailure: (error) => ({ _tag: "failure" as const, error }),
      onSuccess: (value) => ({ _tag: "success" as const, value }),
    }),
  );
  if (packageResult._tag === "failure") {
    return [failure("focused-test-package", packageResult.error.message)];
  }
  const relativeFile = packageResult.value.relativeFile;
  const args =
    packageResult.value.runner === "vitest"
      ? ["test", "--", "--run", relativeFile]
      : ["test", "--", relativeFile];
  const runCommand = commandService.runCommand;
  if (runCommand === undefined) {
    return [
      failure(
        "focused-test-command",
        "Focused test command execution is unavailable.",
      ),
    ];
  }
  const result = yield* runCommand({
    cwd: packageResult.value.packageRoot,
    program: "pnpm",
    args,
  }).pipe(
    Effect.match({
      onFailure: (error) => ({ _tag: "failure" as const, error }),
      onSuccess: (value) => ({ _tag: "success" as const, value }),
    }),
  );
  if (result._tag === "failure") {
    return [failure("command", result.error.message)];
  }
  return checkFailures("test", result.value);
});

const repositoryWideForbidden = (): VerifyFailure =>
  failure(
    "repository-wide-forbidden",
    "Repository-wide verification is forbidden by repository policy; use focused verification.",
  );

const checksForAction = (
  action: VerifyInput["action"],
  facts: RepositoryFacts,
): {
  readonly checks: ReadonlyArray<RepositoryCheck>;
  readonly missing?: VerifyFailure;
} => {
  const requestedCheck = selectedCheckFor(action);
  if (requestedCheck === undefined) {
    return { checks: facts.checks };
  }
  if (!facts.checks.includes(requestedCheck)) {
    return {
      checks: [],
      missing: failure(
        "missing-script",
        `Repository does not define the ${requestedCheck} check script.`,
      ),
    };
  }
  return { checks: [requestedCheck] };
};

export const verify = Effect.fn("verify")(function* ({
  action,
  cwd,
  file,
}: VerifyInput & { readonly cwd: string }) {
  const startedAt = performance.now();
  const lookupPath =
    file !== undefined && isAbsolute(file) ? dirname(file) : cwd;
  const repoMapService = yield* RepoMapService;
  const repositoryFactsFor = repoMapService.repositoryFactsFor;
  if (repositoryFactsFor === undefined) {
    return {
      ok: false,
      status: "completed",
      worktree: cwd,
      failures: [
        failure(
          "repository-facts",
          "Repository facts are unavailable: RepoMapService.repositoryFactsFor is not configured.",
        ),
      ],
      duration: performance.now() - startedAt,
    } satisfies VerifyReport;
  }

  const factsResult = yield* repositoryFactsFor({ cwd: lookupPath }).pipe(
    Effect.match({
      onFailure: (error) => ({ _tag: "failure" as const, error }),
      onSuccess: (value) => ({ _tag: "success" as const, value }),
    }),
  );
  if (factsResult._tag === "failure") {
    return {
      ok: false,
      status: "completed",
      worktree: cwd,
      failures: [failure("repository-facts", factsResult.error.message)],
      duration: performance.now() - startedAt,
    } satisfies VerifyReport;
  }
  const worktree = factsResult.value.repositoryRoot;
  const verificationPolicy = factsResult.value.deliveryPolicy.verification;
  const selected = checksForAction(action, factsResult.value);
  let failures: ReadonlyArray<VerifyFailure>;
  if (
    action === "all" &&
    !verificationPolicyAllowsRepositoryWide(verificationPolicy)
  ) {
    failures = [repositoryWideForbidden()];
  } else if (action === "test" && file !== undefined) {
    const workspaceRoot = verificationPolicyWorkspaceRoot(verificationPolicy);
    if (
      !verificationPolicyAllowsFocusedTest(verificationPolicy) ||
      workspaceRoot === undefined
    ) {
      failures = [
        failure(
          "focused-test-policy",
          "Focused test verification requires a focused-only or focused-then-all repository policy.",
        ),
      ];
    } else {
      failures = yield* focusedTestFailures({
        file,
        workspaceRoot,
      });
    }
  } else if (selected.missing !== undefined) {
    failures = [selected.missing];
  } else {
    failures = yield* runChecks({
      cwd: worktree,
      checks: selected.checks,
      testRunner: factsResult.value.testRunner,
    });
  }

  return {
    ok: failures.length === 0,
    status: "completed",
    worktree,
    failures,
    duration: performance.now() - startedAt,
  } satisfies VerifyReport;
});
