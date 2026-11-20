import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect } from "vitest";

import { installPiFixtures } from "../testing/fixture.js";
import { readRetroSession } from "./session.js";

const fixture = installPiFixtures();
contractTest("retrospective.session", async () => {
  const f = await fixture();
  const manager = SessionManager.create(f.repo, f.temp);
  const id = "saved-fixture";
  const actions = ["status", "threads", "status"];
  const rows: unknown[] = [
    { cwd: f.repo, id, timestamp: "2026-11-20", type: "session" },
  ];
  let parentId: string | null = null;
  for (const [index, action] of actions.entries()) {
    const callId = `call${index}`;
    rows.push({
      id: callId,
      message: {
        content: [
          { arguments: { action }, id: callId, name: "mr", type: "toolCall" },
        ],
        role: "assistant",
      },
      parentId,
      type: "message",
    });
    parentId = `result${index}`;
    rows.push({
      id: parentId,
      message: {
        content: [{ text: "private fixture output", type: "text" }],
        isError: false,
        role: "toolResult",
        toolCallId: callId,
        toolName: "mr",
      },
      parentId: callId,
      type: "message",
    });
  }
  await writeFile(
    join(f.temp, `2026-11-20_${id}.jsonl`),
    rows.map((row) => JSON.stringify(row)).join("\n")
  );
  const session = await readRetroSession(manager, id);
  expect(session).toStrictEqual(
    actions.map((_, index) => ({
      code: "REPEATED_LOOKUPS",
      operation: "mr",
      reference: `pi:${id}/result${index}`,
    }))
  );
  await expect(readRetroSession(manager, "missing")).resolves.toBeNull();
});
