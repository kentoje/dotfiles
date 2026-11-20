import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

import { Effect, Schema } from "effect";

import {
  ProjectCheckError,
  readProjectCheckJson,
} from "../configuration/plan.js";
import { inspectProjectChecks } from "../discovery/inspect.js";

const profileName = "project-checks.json";
const projectScripts = Schema.Struct({
  scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const managedProfile = Schema.Struct({
  checks: Schema.Array(Schema.Struct({ id: Schema.String })),
  managed: Schema.Struct({ checksum: Schema.String, discovery: Schema.String }),
});
const checksum = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const proposalError = (error: unknown) =>
  new ProjectCheckError({
    message: error instanceof Error ? error.message : String(error),
  });
async function readManagedProjectProfile(path: string) {
  const metadata = await lstat(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (!metadata) {
    return null;
  }
  if (!metadata.isFile() || metadata.size > 1_048_576) {
    throw new Error(
      "PROJECT_PROFILE_OWNERSHIP: reconcile the existing profile before applying."
    );
  }
  const raw = await readFile(path, "utf-8");
  const input: unknown = JSON.parse(raw);
  const profile = Schema.decodeUnknownSync(managedProfile)(input);
  const full = Schema.decodeUnknownSync(
    Schema.Struct({
      checks: Schema.Array(Schema.Unknown),
      managed: managedProfile.fields.managed,
    }),
    { onExcessProperty: "error" }
  )(input);
  if (
    checksum({ checks: full.checks, discovery: profile.managed.discovery }) !==
    profile.managed.checksum
  ) {
    throw new Error(
      "PROJECT_PROFILE_OWNERSHIP: reconcile edits to the existing profile before applying."
    );
  }
  return { digest: checksum(raw), profile };
}

/** Propose an exact project-owned profile from static discovery, preserving the existing check selection by default. */
export const proposeProjectProfile = Effect.fn("proposeProjectProfile")(
  function* proposeProjectProfile(input: {
    project: string;
    checks?: readonly string[];
  }) {
    const plan = yield* inspectProjectChecks({ project: input.project }, true);
    return yield* Effect.tryPromise({
      catch: proposalError,
      try: async () => {
        const path = join(plan.project, profileName);
        const current = await readManagedProjectProfile(path);
        const requested =
          input.checks ??
          current?.profile.checks.map((check) => check.id) ??
          plan.checks.map((check) => check.id);
        if (
          !requested.length ||
          requested.length > 64 ||
          new Set(requested).size !== requested.length
        ) {
          throw new Error(
            "PROJECT_PROFILE_SELECTION: select 1..64 distinct discovered check IDs."
          );
        }
        const checks = requested.map((id) => {
          const selected = plan.checks.find((check) => check.id === id);
          const candidate = plan.discovered.find((check) => check.id === id);
          const check = selected ?? candidate;
          if (
            !check ||
            (!selected && candidate?.categories.includes("setup"))
          ) {
            throw new Error(
              `PROJECT_PROFILE_DRIFT: ${id} is unavailable. Review discovered checks and select their exact IDs.`
            );
          }
          const cwd = relative(plan.project, check.cwd);
          if (cwd === ".." || cwd.startsWith("../") || isAbsolute(cwd)) {
            throw new Error(
              "PROJECT_PROFILE_PATH: check working directory leaves the project."
            );
          }
          return {
            args: check.args,
            command: check.command,
            cwd: cwd || ".",
            id,
            timeout_ms: selected?.timeout_ms ?? 180_000,
          };
        });
        const { scripts } = Schema.decodeUnknownSync(projectScripts)(
          await readProjectCheckJson(plan.project, "package.json")
        );
        const discovery = checksum({
          scripts,
          sources: plan.discovered.map(({ id, evidence }) => ({
            evidence,
            id,
          })),
        });
        const content = {
          checks,
          managed: { checksum: checksum({ checks, discovery }), discovery },
        };
        let state: "create" | "unchanged" | "update" = "create";
        if (current) {
          state =
            current.profile.managed.checksum === content.managed.checksum
              ? "unchanged"
              : "update";
        }
        return {
          base: current?.digest ?? null,
          checks,
          content,
          disclosed_checks: plan.discovered,
          project: plan.project,
          proposal_id: checksum({
            base: current?.digest ?? null,
            content,
            project: plan.project,
          }),
          state,
        };
      },
    });
  }
);

/** Publish an exact reviewed profile and reject stale proposals or concurrent harness writers. */
export const applyProjectProfile = Effect.fn("applyProjectProfile")(
  function* publishReviewedProfile(
    input: { project: string; proposal_id: string; checks?: readonly string[] },
    invocation: { signal?: AbortSignal; deadline?: number } = {}
  ) {
    const initial = yield* proposeProjectProfile(input);
    const lock = join(initial.project, ".project-checks.lock");
    const ensureActive = () => {
      if (
        invocation.signal?.aborted ||
        Date.now() >= (invocation.deadline ?? Infinity)
      ) {
        throw new Error(
          "PROJECT_PROFILE_CANCELLED: profile publication cancelled."
        );
      }
    };
    yield* Effect.tryPromise({
      catch: proposalError,
      try: async () => {
        ensureActive();
        await mkdir(lock);
      },
    });
    return yield* Effect.gen(function* saveProfileUnderLock() {
      const fresh = yield* proposeProjectProfile(input);
      return yield* Effect.tryPromise({
        catch: proposalError,
        try: async () => {
          if (fresh.proposal_id !== input.proposal_id) {
            throw new Error(
              "PROJECT_PROFILE_STALE: review the current proposal before applying."
            );
          }
          if (fresh.state === "unchanged") {
            return fresh;
          }
          const target = join(fresh.project, profileName);
          const temp = join(lock, randomUUID());
          try {
            await writeFile(
              temp,
              `${JSON.stringify(fresh.content, null, 2)}\n`,
              {
                flag: "wx",
              }
            );
            const last = await readManagedProjectProfile(target);
            if ((last?.digest ?? null) !== fresh.base) {
              throw new Error(
                "PROJECT_PROFILE_STALE: the reviewed profile changed before publication."
              );
            }
            ensureActive();
            await (fresh.base === null
              ? link(temp, target)
              : rename(temp, target));
            return { ...fresh, state: "saved" } as const;
          } finally {
            await rm(temp, { force: true });
          }
        },
      });
    }).pipe(Effect.ensuring(Effect.promise(() => rmdir(lock))));
  }
);
