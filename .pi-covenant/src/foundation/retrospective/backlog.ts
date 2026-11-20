import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { Type } from "typebox";
import { Value } from "typebox/value";

import {
  normalizeRetroTitle,
  retroStoredItem,
} from "../../retrospective/module-port.js";
import type { RetroItem } from "../../retrospective/module-port.js";

const format = Type.Object(
  {
    items: Type.Array(retroStoredItem, { maxItems: 2000 }),
    schema_version: Type.Literal(1),
  },
  { additionalProperties: false }
);
const marker =
  /^<!-- pi-covenant-backlog v1 -->\r?\n```json\r?\n(?<json>[\s\S]*?)\r?\n```\r?\n<!-- end pi-covenant-backlog -->$/gmu;
const title = "# Harness improvement backlog\n\n";
const maxBytes = 1_048_576;
async function readRetroBacklog(file: string) {
  let source: string;
  try {
    const info = await lstat(file);
    if (!info.isFile() || (await realpath(file)) !== file) {
      throw new Error("OUT_OF_SCOPE_PATH");
    }
    if (info.size > maxBytes) {
      throw new Error("BACKLOG_INVALID");
    }
    source = await readFile(file, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { items: [], source: null };
    }
    throw error;
  }
  const [block, ...other] = [...source.matchAll(marker)];
  const json = block?.groups?.json;
  if (!json || other.length) {
    throw new Error("BACKLOG_INVALID");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("BACKLOG_INVALID");
  }
  if (
    !Value.Check(format, raw) ||
    new Set(raw.items.map(({ id }) => id)).size !== raw.items.length ||
    new Set(raw.items.map((item) => normalizeRetroTitle(item.title))).size !==
      raw.items.length ||
    raw.items.some((item) => Number(item.id.slice(4)) < 1)
  ) {
    throw new Error("BACKLOG_INVALID");
  }
  return { items: raw.items, source };
}
function renderRetroBacklog(
  source: string | null,
  items: readonly RetroItem[]
) {
  if (!Value.Check(format, { items, schema_version: 1 })) {
    throw new Error("BACKLOG_INVALID");
  }
  const json = JSON.stringify({ items, schema_version: 1 }, null, 2);
  const block = [
    "<!-- pi-covenant-backlog v1 -->",
    "```json",
    json,
    "```",
    "<!-- end pi-covenant-backlog -->",
  ].join("\n");
  const updated =
    source === null
      ? `${title}${block}\n`
      : source.replaceAll(marker, () => block);
  if (Buffer.byteLength(updated) > maxBytes) {
    throw new Error("BACKLOG_INVALID");
  }
  return updated;
}

/** The host binds this location once and owns the lock, revision comparison and rename. */
export function createRetroBacklog(harnessRoot: string) {
  const docs = join(harnessRoot, "docs");
  const file = join(docs, "backlog.md");
  const lock = join(docs, ".harness-retro.lock");
  const validateDocs = async () => {
    if (
      (await realpath(docs)) !== join(await realpath(harnessRoot), "docs") ||
      (await realpath(docs)) !== docs
    ) {
      throw new Error("OUT_OF_SCOPE_PATH");
    }
  };
  return {
    backlogPath: file,
    async read() {
      await validateDocs();
      const { items } = await readRetroBacklog(file);
      return items;
    },
    async update<T>(
      transform: (items: readonly RetroItem[]) => {
        items: readonly RetroItem[];
        data: T;
      }
    ) {
      await validateDocs();
      try {
        await mkdir(lock, { mode: 0o700 });
      } catch {
        throw new Error("BACKLOG_CONFLICT");
      }
      const temp = join(docs, `.backlog-${randomUUID()}.md`);
      try {
        const current = await readRetroBacklog(file);
        const updated = transform(current.items);
        if (updated.items !== current.items) {
          await writeFile(
            temp,
            renderRetroBacklog(current.source, updated.items),
            { flag: "wx", mode: 0o600 }
          );
          await validateDocs();
          const latest = await readRetroBacklog(file);
          if (latest.source !== current.source) {
            throw new Error("BACKLOG_CONFLICT");
          }
          await rename(temp, file);
        }
        return updated.data;
      } finally {
        await unlink(temp).catch(() => null);
        await rmdir(lock).catch(() => null);
      }
    },
  };
}
