import { Context, type Effect, Schema } from "effect";

import type { RepositoryCheck } from "../repo-map/core";

/** A completed repository check command, including its complete untruncated output. */
export interface VerifyCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

/** A typed request for a repository check script. */
export interface VerifyCheckRequest {
  readonly cwd: string;
  readonly check: RepositoryCheck;
}

/** A typed request for an exact program, argument list, and working directory. */
export interface VerifyProgramRequest {
  readonly cwd: string;
  readonly program: string;
  readonly args: ReadonlyArray<string>;
}

/** A command request accepted by the verification command service. */
export type VerifyCommandRequest = VerifyCheckRequest | VerifyProgramRequest;

/** The test package selected for a focused file, including its runner and root. */
export interface VerifyFocusedTestPackage {
  readonly packageRoot: string;
  readonly relativeFile: string;
  readonly runner: "vitest" | "jest";
}

/** Input for focused test package discovery. */
export interface VerifyFocusedTestPackageRequest {
  readonly file: string;
  readonly workspaceRoot: string;
}

/** A focused test file could not be mapped to a package test script. */
export class VerifyFocusedTestPackageError extends Schema.TaggedError<VerifyFocusedTestPackageError>()(
  "VerifyFocusedTestPackageError",
  { message: Schema.String },
) {}

/** A command transport failure that the verify core converts into a report failure. */
export class VerifyCommandExecutionError extends Schema.TaggedError<VerifyCommandExecutionError>()(
  "VerifyCommandExecutionError",
  { message: Schema.String },
) {}

/** Runs one repository-defined check without exposing subprocess details to policy code. */
export class VerifyCommandService extends Context.Service<
  VerifyCommandService,
  {
    readonly runCheck: (
      input: VerifyCheckRequest,
    ) => Effect.Effect<VerifyCommandResult, VerifyCommandExecutionError>;
    /** Runs an exact program command when focused verification supplies arguments. */
    readonly runCommand?: (
      input: VerifyProgramRequest,
    ) => Effect.Effect<VerifyCommandResult, VerifyCommandExecutionError>;
    /** Discovers the nearest package test runner for a focused file. */
    readonly focusedTestPackageFor?: (
      input: VerifyFocusedTestPackageRequest,
    ) => Effect.Effect<VerifyFocusedTestPackage, VerifyFocusedTestPackageError>;
  }
>()("pi-custom-harness/lib/verify/VerifyCommandService") {}
