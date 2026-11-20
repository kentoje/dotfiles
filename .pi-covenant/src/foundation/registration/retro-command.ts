import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { makeRetrospectiveModule } from "../../retrospective/module-port.js";
import { renderPiDetails } from "../invocation/render.js";
import { createRetroBacklog } from "../retrospective/backlog.js";
import {
  readRetroObligations,
  readRetroSession,
} from "../retrospective/session.js";

export function registerRetroCommand(
  pi: Pick<ExtensionAPI, "registerCommand">
) {
  const harness = fileURLToPath(new URL("../../../", import.meta.url)).replace(
    /\/$/u,
    ""
  );
  pi.registerCommand("harness-retro", {
    description:
      "Review observed harness friction, or list or record draft improvements. Accepts review, list or record and an optional JSON object.",
    async handler(args, ctx) {
      const text = args.trim();
      const parts =
        /^(?<action>review|list|record)(?:\s+(?<args>[\s\S]+))?$/u.exec(
          text
        )?.groups;
      const action = parts?.action ?? "review";
      const raw = parts?.args ?? (parts ? "" : text);
      try {
        const input: unknown = raw ? JSON.parse(raw) : {};
        const retro = makeRetrospectiveModule({
          ...createRetroBacklog(harness),
          obligations: () => readRetroObligations(harness),
          session: (id) => readRetroSession(ctx.sessionManager, id),
        });
        const call =
          action === "record" || action === "list"
            ? retro[action]
            : retro.review;
        const result = await call(input);
        ctx.ui.notify(
          renderPiDetails(`Harness retrospective ${result.status}`, result),
          result.status === "ok" ? "info" : "warning"
        );
      } catch {
        ctx.ui.notify(
          "Use /harness-retro review, list, or record with an optional JSON object.",
          "error"
        );
      }
    },
  });
}
