import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { parse } from "yaml";

import type { RetroObservation } from "../../retrospective/module-port.js";

function retroObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
function observeRetroEntry(
  value: unknown,
  session: string
): RetroObservation | null {
  const entry = retroObject(value);
  const message = retroObject(entry?.message);
  const operation = message?.toolName;
  if (
    entry?.type !== "message" ||
    typeof entry.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,120}$/u.test(entry.id) ||
    message?.role !== "toolResult" ||
    typeof operation !== "string" ||
    message.isError !== true
  ) {
    return null;
  }
  const detail = retroObject(message.details);
  const code = retroObject(detail?.error)?.code;
  return {
    code:
      typeof code === "string" && /^[A-Z][A-Z0-9_]{1,79}$/u.test(code)
        ? code
        : "TOOL_ERROR",
    operation,
    reference: `pi:${session}/${entry.id}`,
  };
}
async function selectRetroSessionFile(directory: string, id: string) {
  try {
    const root = await realpath(directory);
    const names = await readdir(root);
    const files = names.filter((file) => file.endsWith(`_${id}.jsonl`));
    const [name] = files;
    if (!name || files.length !== 1) {
      return null;
    }
    const path = join(root, name);
    const info = await lstat(path);
    if (
      !info.isFile() ||
      info.size > 4_194_304 ||
      (await realpath(path)) !== path
    ) {
      return null;
    }
    const content = await readFile(path, "utf-8");
    const rows: unknown[] = content
      .split("\n")
      .filter(Boolean)
      .map((line): unknown => JSON.parse(line));
    const [header, ...entries] = rows;
    if (
      retroObject(header)?.id !== id ||
      retroObject(header)?.type !== "session"
    ) {
      return null;
    }
    const mapped = entries.map(retroObject).filter((row) => row !== undefined);
    const index = new Map(mapped.map((row) => [row.id, row]));
    const branch = [];
    const seen = new Set<unknown>();
    let cursor = mapped.at(-1);
    while (cursor && branch.length < 1000) {
      if (seen.has(cursor.id)) {
        return null;
      }
      seen.add(cursor.id);
      branch.push(cursor);
      if (cursor.parentId === null) {
        break;
      }
      cursor = index.get(cursor.parentId);
    }
    return branch.toReversed();
  } catch {
    return null;
  }
}

const retroReadActions: Readonly<Record<string, readonly string[]>> = {
  fleet: ["status", "versions"],
  gitlab: ["repository", "pipelines", "pipeline", "jobs", "job", "logs"],
  jira: ["get", "search"],
  mr: ["status", "threads"],
  project_cli: ["inspect"],
  worktree: ["list"],
};
function collectRetroReadCalls(
  parts: readonly unknown[],
  decisions: Map<string, string>
) {
  for (const part of parts) {
    const call = retroObject(part);
    const action = retroObject(call?.arguments)?.action;
    if (
      call?.type === "toolCall" &&
      typeof call.id === "string" &&
      typeof call.name === "string" &&
      typeof action === "string" &&
      Object.hasOwn(retroReadActions, call.name) &&
      retroReadActions[call.name]?.includes(action)
    ) {
      decisions.set(call.id, call.name);
    }
  }
}
function reviewRetroEntries(entries: readonly unknown[], session: string) {
  const decisions = new Map<string, string>();
  const repetitions = new Map<string, RetroObservation[]>();
  const observations: RetroObservation[] = [];
  for (const value of entries.slice(-1000)) {
    const entry = retroObject(value);
    const message = retroObject(entry?.message);
    if (entry?.type !== "message" || !message) {
      continue;
    }
    if (message.role === "user") {
      repetitions.clear();
      decisions.clear();
    }
    if (message.role === "assistant" && Array.isArray(message.content)) {
      collectRetroReadCalls(message.content, decisions);
      continue;
    }
    const failure = observeRetroEntry(entry, session);
    if (failure) {
      observations.push(failure);
      continue;
    }
    if (
      message.role !== "toolResult" ||
      typeof message.toolCallId !== "string" ||
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,120}$/u.test(entry.id)
    ) {
      continue;
    }
    const operation = decisions.get(message.toolCallId);
    if (!operation || operation !== message.toolName) {
      continue;
    }
    decisions.delete(message.toolCallId);
    const group = repetitions.get(operation) ?? [];
    group.push({
      code: "REPEATED_LOOKUPS",
      operation,
      reference: `pi:${session}/${entry.id}`,
    });
    repetitions.set(operation, group);
    if (group.length === 3) {
      observations.push(...group);
    }
  }
  return observations;
}

export async function readRetroSession(
  manager: ExtensionCommandContext["sessionManager"],
  requested?: string
) {
  const current = manager.getSessionId();
  const session = requested ?? current;
  const entries =
    session === current
      ? manager.getBranch()
      : await selectRetroSessionFile(manager.getSessionDir(), session);
  return entries ? reviewRetroEntries(entries, session) : null;
}

export async function readRetroObligations(harness: string) {
  const contracts = [
    "gitlab",
    "jira",
    "mr",
    "fleet",
    "worktree",
    "project-cli",
  ];
  try {
    const current = await Promise.all(
      contracts.map(async (component) => {
        const directory = join(harness, "contracts", component);
        const [contractText, decisionText] = await Promise.all([
          readFile(join(directory, "contract.yaml"), "utf-8"),
          readFile(join(directory, "decisions.yml"), "utf-8"),
        ]);
        const raw: unknown = parse(contractText, { maxAliasCount: 100 });
        const decisions: unknown = parse(decisionText, { maxAliasCount: 100 });
        if (!Array.isArray(retroObject(decisions)?.decisions)) {
          throw new TypeError("CONTRACT_UNAVAILABLE");
        }
        const observations = retroObject(raw)?.obligations;
        if (!Array.isArray(observations)) {
          throw new TypeError("CONTRACT_UNAVAILABLE");
        }
        return observations
          .map((entry: unknown) => retroObject(entry)?.id)
          .filter((id): id is string => typeof id === "string");
      })
    );
    return current.flat();
  } catch {
    throw new Error("CONTRACT_UNAVAILABLE");
  }
}
