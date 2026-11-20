import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { makeRetrospectiveModule } from "../module-port.js";
import type { RetroItem } from "../module-port.js";

function fixture() {
  let items: readonly RetroItem[] = [];
  let writes = 0;
  const retro = makeRetrospectiveModule({
    backlogPath: "docs/backlog.md",
    obligations: () => Promise.resolve(["MR-001"]),
    read: () => Promise.resolve(items),
    session: (id) =>
      Promise.resolve(
        id === "missing"
          ? null
          : [
              {
                code: "LOOKUP_FAILED",
                operation: "mr",
                reference: "pi:session/entry",
              },
            ]
      ),
    update: (transform) => {
      const result = transform(items);
      if (result.items !== items) {
        writes += 1;
        ({ items } = result);
      }
      return Promise.resolve(result.data);
    },
  });
  return { retro, writes: () => writes };
}
contractTest("retrospective.review", async () => {
  const { retro, writes } = fixture();
  expect(writes()).toBe(0);
  await expect(retro.review({ session_id: "missing" })).resolves.toMatchObject({
    error: { code: "SESSION_UNAVAILABLE" },
    status: "blocked",
  });
  await expect(retro.review({ dry_run: true })).resolves.toMatchObject({
    data: {
      proposals: [
        {
          evidence: ["pi:session/entry"],
          related_obligations: ["MR-001"],
          state: "proposed",
        },
      ],
      recorded_ids: [],
    },
    status: "ok",
  });
  expect(writes()).toBe(0);
  await expect(retro.review({})).resolves.toMatchObject({
    data: { recorded_ids: ["HBR-001"] },
    status: "ok",
  });
  await expect(retro.review({})).resolves.toMatchObject({
    data: { proposals: [{ duplicate_of: "HBR-001" }], recorded_ids: [] },
  });
  expect(writes()).toBe(1);
});
contractTest("retrospective.record", async () => {
  const { retro, writes } = fixture();
  const input = {
    evidence: ["pi:A/B"],
    proposed_behavior: "Report the missing local comparison explicitly.",
    title: "Normalize this",
  };
  await expect(retro.record({ ...input, evidence: [] })).resolves.toMatchObject(
    { status: "blocked" }
  );
  await expect(retro.record(input)).resolves.toMatchObject({
    data: { created: true, item: { id: "HBR-001", ...input } },
    status: "ok",
  });
  await expect(
    retro.record({ ...input, title: "  Ｎormalize    THIS " })
  ).resolves.toMatchObject({
    data: { created: false, item: { duplicate_of: "HBR-001", id: "HBR-001" } },
  });
  await expect(retro.list({ state: "accepted" })).resolves.toMatchObject({
    data: { items: [] },
  });
  expect(writes()).toBe(1);
});
