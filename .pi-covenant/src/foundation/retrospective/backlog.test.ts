import {
  lstat,
  mkdir,
  readFile,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { makeRetrospectiveModule } from "../../retrospective/module-port.js";
import { installPiFixtures } from "../testing/fixture.js";
import { createRetroBacklog } from "./backlog.js";

const fixture = installPiFixtures();
contractTest("retrospective.storage", async () => {
  const f = await fixture();
  const docs = join(f.repo, "docs");
  await mkdir(docs);
  const storage = createRetroBacklog(f.repo);
  const retro = makeRetrospectiveModule({
    ...storage,
    obligations: () => Promise.resolve([]),
    session: () => Promise.resolve([]),
  });
  const proposal = {
    evidence: ["pi:example/entry"],
    proposed_behavior: "Explain why the harness invocation blocked.",
    title: "Improve diagnostics",
  };
  await expect(retro.list({})).resolves.toMatchObject({ data: { items: [] } });
  await expect(lstat(storage.backlogPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(retro.record(proposal)).resolves.toMatchObject({
    data: { created: true, item: { id: "HBR-001" } },
  });
  const initial = await readFile(storage.backlogPath, "utf-8");
  await writeFile(
    storage.backlogPath,
    `${initial}\nOperator context stays here.\n`
  );
  const run = await Promise.all([
    retro.record({ ...proposal, title: "Retain local evidence" }),
    retro.record({ ...proposal, title: "Report the failed step" }),
  ]);
  expect(run.filter((result) => result.status === "ok")).toHaveLength(1);
  expect(run.find((result) => result.status !== "ok")).toMatchObject({
    error: { code: "BACKLOG_CONFLICT", retryable: true },
  });
  await expect(readFile(storage.backlogPath, "utf-8")).resolves.toContain(
    "Operator context stays here."
  );
  await expect(retro.list({})).resolves.toMatchObject({
    data: { items: [{ id: "HBR-001" }, { id: "HBR-002" }] },
  });
  await writeFile(storage.backlogPath, "malformed");
  await expect(retro.list({})).resolves.toMatchObject({
    error: { code: "BACKLOG_INVALID" },
    status: "error",
  });
  await expect(readFile(storage.backlogPath, "utf-8")).resolves.toBe(
    "malformed"
  );
  const external = join(f.temp, "outside");
  await writeFile(external, "outside");
  await unlink(storage.backlogPath);
  await symlink(external, storage.backlogPath);
  await expect(retro.record(proposal)).resolves.toMatchObject({
    error: { code: "OUT_OF_SCOPE_PATH" },
  });
  await expect(readFile(external, "utf-8")).resolves.toBe("outside");
});
