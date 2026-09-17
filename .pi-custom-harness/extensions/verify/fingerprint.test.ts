import { expect, test } from "bun:test";

import { verificationGitFingerprint } from "./fingerprint";

test("fingerprint includes changed and untracked file content", async () => {
  const commands: string[] = [];
  const pi = {
    exec: (_command: string, args: string[]) => {
      commands.push(args.join(" "));
      const joined = args.join(" ");
      if (joined === "rev-parse HEAD") {
        return Promise.resolve({
          stdout: "abc\n",
          stderr: "",
          code: 0,
          killed: false,
        });
      }
      if (joined.startsWith("status ")) {
        return Promise.resolve({
          stdout: " M tracked.ts\n?? new.ts\n",
          stderr: "",
          code: 0,
          killed: false,
        });
      }
      if (joined === "diff --binary HEAD --") {
        return Promise.resolve({
          stdout: "diff-content",
          stderr: "",
          code: 0,
          killed: false,
        });
      }
      if (joined === "ls-files --others --exclude-standard") {
        return Promise.resolve({
          stdout: "new.ts\n",
          stderr: "",
          code: 0,
          killed: false,
        });
      }
      return Promise.resolve({
        stdout: "new-hash\n",
        stderr: "",
        code: 0,
        killed: false,
      });
    },
  };

  const fingerprint = await verificationGitFingerprint(pi, "/worktree");

  expect(fingerprint).toContain("diff-content");
  expect(fingerprint).toContain("new-hash");
  expect(commands).toContain("hash-object -- new.ts");
});
