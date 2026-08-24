import { Effect } from "effect";

import {
  FleetConfirmationService,
  FleetGitLabService,
  FleetGitService,
  type FleetGitStatus,
  type FleetInstallFailure,
  FleetPackageService,
  type FleetPortlessServer,
  FleetPortlessService,
  FleetRepositoryError,
  type FleetServiceError,
  type FleetSyncPlan,
  type FleetVersion,
  type OpenMergeRequest,
} from "../../lib/fleet/core";
import {
  RepoMapService,
  type RepositoryFleetEntry,
} from "../../lib/repo-map/core";
import type { FleetInput } from "./schema";

/** One repository's status, including its open merge request when one exists. */
export interface FleetStatusEntry {
  readonly repository: RepositoryFleetEntry;
  readonly branch: string;
  readonly dirty: boolean;
  readonly ahead: number;
  readonly behind: number;
  readonly openMergeRequest: OpenMergeRequest | undefined;
}

/** The result of comparing one package across every mapped repository. */
export interface FleetVersionsResult {
  readonly action: "versions";
  readonly packageName: string;
  readonly repositories: ReadonlyArray<FleetVersion>;
}

/** A complete fleet action result. */
export type FleetResult =
  | {
      readonly action: "status";
      readonly repositories: ReadonlyArray<FleetStatusEntry>;
    }
  | FleetVersionsResult
  | {
      readonly action: "sync";
      readonly hard: boolean;
      readonly pending: ReadonlyArray<FleetSyncPlan>;
      readonly applied: ReadonlyArray<string>;
      readonly confirmed: boolean;
    }
  | {
      readonly action: "install";
      readonly installed: ReadonlyArray<string>;
      readonly failures: ReadonlyArray<FleetInstallFailure>;
    }
  | {
      readonly action: "prune";
      readonly removed: ReadonlyArray<FleetPortlessServer>;
      readonly failures: ReadonlyArray<{
        readonly server: FleetPortlessServer;
        readonly message: string;
      }>;
    };

const repositoryEntries = Effect.fn("fleet.repositoryEntries")(function* ({
  cwd,
}: {
  readonly cwd: string;
}) {
  const repoMap = yield* RepoMapService;
  const repositoryFactsFor = repoMap.repositoryFactsFor;
  if (repositoryFactsFor === undefined) {
    return yield* new FleetRepositoryError({
      message:
        "Fleet repository selection is unavailable: RepoMapService.repositoryFactsFor is not configured.",
    });
  }
  const facts = yield* repositoryFactsFor({ cwd }).pipe(
    Effect.mapError(
      (error) =>
        new FleetRepositoryError({
          message: error.message,
        }),
    ),
  );
  if (facts.repositories.length === 0) {
    return yield* new FleetRepositoryError({
      message:
        "Fleet repository selection failed: RepoMapService.repositoryFactsFor returned no repositories.",
    });
  }
  return facts.repositories;
});

const statusFor = Effect.fn("fleet.statusFor")(function* ({
  cwd,
  repositories,
}: {
  readonly cwd: string;
  readonly repositories: ReadonlyArray<RepositoryFleetEntry>;
}) {
  const git = yield* FleetGitService;
  const gitlab = yield* FleetGitLabService;
  const statuses: FleetStatusEntry[] = [];
  for (const repository of repositories) {
    const status: FleetGitStatus = yield* git.statusFor({ repository });
    const openMergeRequest = yield* gitlab.openMergeRequestFor({
      repository,
      branch: status.branch,
      cwd,
    });
    statuses.push({ repository, ...status, openMergeRequest });
  }
  return statuses;
});

const syncPlansFor = Effect.fn("fleet.syncPlansFor")(function* ({
  repositories,
}: {
  readonly repositories: ReadonlyArray<RepositoryFleetEntry>;
}) {
  const git = yield* FleetGitService;
  const plans: FleetSyncPlan[] = [];
  for (const repository of repositories) {
    plans.push(yield* git.syncPlanFor({ repository }));
  }
  return plans;
});

const installFor = Effect.fn("fleet.installFor")(function* ({
  repositories,
}: {
  readonly repositories: ReadonlyArray<RepositoryFleetEntry>;
}) {
  const packages = yield* FleetPackageService;
  const installed: string[] = [];
  const failures: FleetInstallFailure[] = [];
  for (const repository of repositories) {
    const result = yield* packages.installFor({ repository }).pipe(
      Effect.match({
        onFailure: (error) => ({ _tag: "failure" as const, error }),
        onSuccess: () => ({ _tag: "success" as const }),
      }),
    );
    if (result._tag === "failure") {
      failures.push({ repository, message: result.error.message });
    } else {
      installed.push(repository.name);
    }
  }
  return { installed, failures };
});

const pruneOrphans = Effect.fn("fleet.pruneOrphans")(function* () {
  const portless = yield* FleetPortlessService;
  const servers = yield* portless.listOrphaned();
  const removed: FleetPortlessServer[] = [];
  const failures: Array<{
    readonly server: FleetPortlessServer;
    readonly message: string;
  }> = [];
  for (const server of servers) {
    const result = yield* portless.remove({ server }).pipe(
      Effect.match({
        onFailure: (error) => ({ _tag: "failure" as const, error }),
        onSuccess: () => ({ _tag: "success" as const }),
      }),
    );
    if (result._tag === "failure") {
      failures.push({ server, message: result.error.message });
    } else {
      removed.push(server);
    }
  }
  return { removed, failures };
});

/** Executes a fleet action using only the repository list supplied by RepoMapService. */
type FleetEnvironment =
  | RepoMapService
  | FleetGitService
  | FleetGitLabService
  | FleetPackageService
  | FleetPortlessService
  | FleetConfirmationService;

type FleetError = FleetRepositoryError | FleetServiceError;

export const runFleetTool: (input: {
  readonly input: FleetInput;
  readonly cwd: string;
}) => Effect.Effect<FleetResult, FleetError, FleetEnvironment> = Effect.fn(
  "runFleetTool",
)(function* ({
  input,
  cwd,
}: {
  readonly input: FleetInput;
  readonly cwd: string;
}) {
  const repositories = yield* repositoryEntries({ cwd });
  switch (input.action) {
    case "status":
      return {
        action: input.action,
        repositories: yield* statusFor({ cwd, repositories }),
      } satisfies FleetResult;
    case "versions": {
      const packageName = input.packageName;
      if (packageName === undefined) {
        return yield* new FleetRepositoryError({
          message: "Fleet versions requires a package name.",
        });
      }
      const packageService = yield* FleetPackageService;
      const versions: FleetVersion[] = [];
      for (const repository of repositories) {
        versions.push(
          yield* packageService.versionFor({ repository, packageName }),
        );
      }
      return {
        action: input.action,
        packageName,
        repositories: versions,
      } satisfies FleetVersionsResult;
    }
    case "sync": {
      const pending = yield* syncPlansFor({ repositories });
      if (!input.hard) {
        return {
          action: input.action,
          hard: false,
          pending,
          applied: [],
          confirmed: false,
        } satisfies FleetResult;
      }

      const confirmation = yield* FleetConfirmationService;
      const confirmed = yield* confirmation.confirm({ pending });
      if (!confirmed) {
        return {
          action: input.action,
          hard: true,
          pending,
          applied: [],
          confirmed: false,
        } satisfies FleetResult;
      }

      const git = yield* FleetGitService;
      const applied: string[] = [];
      for (const repository of repositories) {
        yield* git.syncHardFor({ repository });
        applied.push(repository.name);
      }
      return {
        action: input.action,
        hard: true,
        pending,
        applied,
        confirmed: true,
      } satisfies FleetResult;
    }
    case "install": {
      const result = yield* installFor({ repositories });
      return { action: input.action, ...result } satisfies FleetResult;
    }
    case "prune": {
      const result = yield* pruneOrphans();
      return { action: input.action, ...result } satisfies FleetResult;
    }
    default: {
      const _exhaustive: never = input.action;
      return _exhaustive;
    }
  }
});
