import { spawn } from "node:child_process";

import { Effect } from "effect";

import {
  isConventionalMergeRequestTitle,
  type MergeRequestCommit,
  normalizeMergeRequestTitle,
} from "../../lib/mr/core";
import {
  preflightTaskCreation,
  type TaskPreflightResult,
} from "../../lib/task-preflight/core";
import { TaskPreflightLiveLayer } from "../../lib/task-preflight/live";
import { effectiveWorkingDirectoryForCommand } from "./core";

/** Extracts the explicit merge request title from a protected command. */
export const mergeRequestTitleFromCommand = (
  command: string,
): string | undefined => {
  const match =
    /(?:^|\s)--title(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/u.exec(
      command,
    );
  return match?.[1] ?? match?.[2] ?? match?.[3];
};

/** Runtime input used to validate a merge request creation command. */
export interface PrepareMergeRequestCreationInput {
  readonly command: string;
  readonly cwd: string;
}

/** Result of duplicate and title preflight before a command executes. */
export interface PrepareMergeRequestCreationResult {
  readonly expectedTitle: string;
  readonly suppliedTitle: string | undefined;
  readonly titleValid: boolean;
  readonly preflight: TaskPreflightResult;
}

/** Replaceable runtime operations used by the MR guard boundary. */
export interface PrepareMergeRequestCreationRuntime {
  readonly readCommits: (
    cwd: string,
  ) => Promise<ReadonlyArray<MergeRequestCommit>>;
  readonly preflight: (input: {
    readonly cwd: string;
    readonly query: string;
  }) => Promise<TaskPreflightResult>;
}

const firstTicketKey = (text: string): string | undefined =>
  text.match(/[A-Z][A-Z0-9_]*-\d+/u)?.[0];

/** Reads current branch commits without coupling the Pi-free guard core to subprocesses. */
export const readMergeRequestBranchCommits = async (
  cwd: string,
): Promise<ReadonlyArray<MergeRequestCommit>> => {
  const { promise, resolve, reject } =
    Promise.withResolvers<ReadonlyArray<MergeRequestCommit>>();
  const child = spawn(
    "git",
    ["log", "--format=%s%x00%b%x00", "--no-decorate"],
    { cwd },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.once("error", reject);
  child.once("close", (exitCode) => {
    if (exitCode !== 0) {
      reject(new Error(`git log exited with ${exitCode ?? 1}`));
      return;
    }
    const parts = output.split("\u0000");
    const commits: MergeRequestCommit[] = [];
    for (let index = 0; index < parts.length; index += 2) {
      const subject = parts[index];
      if (subject === undefined || subject.length === 0) continue;
      commits.push({ subject, body: parts[index + 1] ?? "" });
    }
    resolve(commits);
  });
  return promise;
};

/** Runs duplicate preflight and computes the title required for MR creation. */
export const prepareMergeRequestCreation = async (
  { command, cwd }: PrepareMergeRequestCreationInput,
  runtime: PrepareMergeRequestCreationRuntime,
): Promise<PrepareMergeRequestCreationResult> => {
  const targetDirectory = effectiveWorkingDirectoryForCommand(command, cwd);
  const commits = await runtime.readCommits(targetDirectory);
  const suppliedTitle = mergeRequestTitleFromCommand(command);
  const expectedTitle = normalizeMergeRequestTitle({
    subject: suppliedTitle ?? commits[0]?.subject ?? "Update merge request",
    commits,
  });
  const query = firstTicketKey(expectedTitle) ?? expectedTitle;
  const preflight = await runtime.preflight({ cwd: targetDirectory, query });
  return {
    expectedTitle,
    suppliedTitle,
    titleValid:
      suppliedTitle === expectedTitle &&
      isConventionalMergeRequestTitle(suppliedTitle),
    preflight,
  };
};

/** Production runtime for MR title and duplicate preflight. */
export const livePrepareMergeRequestCreationRuntime: PrepareMergeRequestCreationRuntime =
  {
    readCommits: readMergeRequestBranchCommits,
    preflight: ({ cwd, query }) =>
      Effect.runPromise(
        preflightTaskCreation({
          cwd,
          query,
          resource: "merge-request",
        }).pipe(Effect.provide(TaskPreflightLiveLayer)),
      ),
  };
