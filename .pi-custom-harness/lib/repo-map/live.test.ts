import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";

import {
  DefaultRepositoryFactsConfiguration,
  RepoMapService,
  type RepositoryFactsConfiguration,
} from "./core";
import { RepoMapLiveLayer } from "./live";

const temporaryRepositories: Array<string> = [];

afterEach(() => {
  for (const temporaryRepository of temporaryRepositories) {
    rmSync(temporaryRepository, { force: true, recursive: true });
  }
  temporaryRepositories.length = 0;
});
const runGit = (repositoryPath: string, arguments_: ReadonlyArray<string>) => {
  const process = Bun.spawnSync(["git", ...arguments_], {
    cwd: repositoryPath,
  });
  expect(process.exitCode).toBe(0);
};

const createRepository = (packageJson?: string): string => {
  const repositoryPath = mkdtempSync(
    join(tmpdir(), "pi-custom-harness-repo-map-facts-"),
  );
  temporaryRepositories.push(repositoryPath);
  runGit(repositoryPath, ["init", "--initial-branch=main"]);
  if (packageJson !== undefined) {
    writeFileSync(join(repositoryPath, "package.json"), packageJson);
  }
  return repositoryPath;
};

const repositoryFactsFor = (input: {
  readonly cwd: string;
  readonly configuration?: RepositoryFactsConfiguration;
}) =>
  Effect.runPromise(
    RepoMapService.use((service) => {
      if (service.repositoryFactsFor === undefined) {
        return Effect.die("RepoMapLiveLayer does not expose repository facts");
      }
      return service.repositoryFactsFor(input);
    }).pipe(Effect.provide(RepoMapLiveLayer)),
  );

test("detects runner, ordered checks, dev modes, setup, and derived portless facts", async () => {
  const repositoryPath = createRepository(
    JSON.stringify({
      name: "fixture-app",
      scripts: {
        test: "vitest run",
        "ts:check": "tsc --noEmit",
        "biome:check": "biome check .",
        "graphql:check": "graphql check",
        fallow: "fallow",
        dev: "vite",
        "dev:integrate": "vite --integrate",
        "dev:mock": "vite --mock",
      },
      devDependencies: { vitest: "1.0.0" },
    }),
  );
  const repositoryName = repositoryPath.split("/").at(-1) ?? "";
  mkdirSync(join(repositoryPath, "scripts"));
  writeFileSync(
    join(repositoryPath, "scripts/setup-worktree.sh"),
    "#!/bin/sh\n",
  );

  await expect(
    repositoryFactsFor({ cwd: repositoryPath }),
  ).resolves.toMatchObject({
    deliveryPolicy: { kind: "none" },
    testRunner: "vitest",
    checks: ["ts:check", "biome:check", "test", "graphql:check", "fallow"],
    devModes: ["dev", "dev:integrate", "dev:mock"],
    setupScript: "scripts/setup-worktree.sh",
    authMode: undefined,
    portlessAppName: repositoryName,
    worktreeRoot: "~/.pi/worktrees",
    portlessRoute: {
      protocol: "https",
      hostSuffix: ".localhost",
      appName: repositoryName,
      url: `https://${repositoryName}.localhost`,
    },
    repositories: [],
  });
});

test("detects focused-only verification within the canonical delivery policy", async () => {
  const repositoryPath = createRepository(
    JSON.stringify({ scripts: { test: "turbo test" } }),
  );
  writeFileSync(join(repositoryPath, "pnpm-workspace.yaml"), "packages: []\n");

  await expect(
    repositoryFactsFor({ cwd: repositoryPath }),
  ).resolves.toMatchObject({
    deliveryPolicy: {
      kind: "none",
      verification: { kind: "focused-only" },
    },
  });
});

test("keeps ordinary package repositories repository-wide", async () => {
  const repositoryPath = createRepository(
    JSON.stringify({ scripts: { test: "vitest run" } }),
  );

  await expect(
    repositoryFactsFor({ cwd: repositoryPath }),
  ).resolves.toMatchObject({
    deliveryPolicy: { kind: "none", verification: { kind: "repository-wide" } },
  });
});

test("uses an explicit repository delivery override over detectable defaults", async () => {
  const repositoryPath = createRepository(
    JSON.stringify({ scripts: { test: "vitest run" } }),
  );
  const configuration = {
    ...DefaultRepositoryFactsConfiguration,
    deliveryPolicyOverrides: {
      [repositoryPath.split("/").at(-1) ?? ""]: {
        release: "changesets",
        verification: "focused-only",
      },
    },
  } satisfies RepositoryFactsConfiguration;

  await expect(
    repositoryFactsFor({ cwd: repositoryPath, configuration }),
  ).resolves.toMatchObject({
    deliveryPolicy: {
      kind: "changesets",
      verification: { kind: "focused-only" },
      changesetApplicability: { kind: "publishable-packages" },
    },
  });
});

test("uses declared overrides before derived names and default configuration", async () => {
  const repositoryPath = createRepository(
    JSON.stringify({ name: "fixture-app", scripts: { test: "jest" } }),
  );
  const configuration = {
    ...DefaultRepositoryFactsConfiguration,
    worktreeRoot: "/tmp/worktrees",
    portlessRoute: { protocol: "http", hostSuffix: ".test" },
    authModeOverrides: { "fixture-app": "browser-login" },
    portlessAppNameOverrides: { "fixture-app": "fixture-route" },
    repositories: [{ name: "fixture-app", path: repositoryPath }],
  } satisfies RepositoryFactsConfiguration;

  await expect(
    repositoryFactsFor({ cwd: repositoryPath, configuration }),
  ).resolves.toMatchObject({
    testRunner: "jest",
    authMode: "browser-login",
    portlessAppName: "fixture-route",
    worktreeRoot: "/tmp/worktrees",
    portlessRoute: {
      protocol: "http",
      hostSuffix: ".test",
      url: "http://fixture-route.test",
    },
    repositories: [{ name: "fixture-app", path: repositoryPath }],
  });
});

test("returns empty detectable facts for missing package metadata", async () => {
  const repositoryPath = createRepository();
  await expect(
    repositoryFactsFor({ cwd: repositoryPath }),
  ).resolves.toMatchObject({
    deliveryPolicy: { kind: "none" },
    testRunner: "none",
    checks: [],
    devModes: [],
    setupScript: undefined,
  });
});

test("fails closed for invalid package metadata", async () => {
  const repositoryPath = createRepository("{ invalid");
  await expect(
    repositoryFactsFor({ cwd: repositoryPath }),
  ).rejects.toMatchObject({
    _tag: "RepositoryFactsLookupError",
  });
});
