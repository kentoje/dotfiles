import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { runDevelopmentCommand } from "./command.js";

const runFixtureCommand = (args: string[], timeout = 1000, maxBytes = 4096) =>
  Effect.runPromise(
    runDevelopmentCommand(
      { args, command: process.execPath, id: "fixture", maxBytes, timeout },
      process.cwd()
    )
  );

describe("development command execution", () => {
  contractTest("development.command-failures", async () => {
    expect((await runFixtureCommand(["-e", "process.exit(1)"])).status).toBe(
      "failed"
    );
    expect(
      (await runFixtureCommand(["-e", "setInterval(()=>{},1000)"], 30)).status
    ).toBe("timed_out");
    expect(
      (
        await runFixtureCommand(
          ["-e", "process.stdout.write('x'.repeat(1000))"],
          1000,
          64
        )
      ).status
    ).toBe("failed");
    const missing = await Effect.runPromise(
      runDevelopmentCommand(
        {
          args: [],
          command: "/no-such-covenant-command",
          id: "missing",
          timeout: 1000,
        },
        process.cwd()
      )
    );
    expect(missing.status).toBe("unavailable");
  });
});
