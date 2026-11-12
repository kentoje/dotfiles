import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { createGlabCredentialProvider } from "../module-port.js";

contractTest("gitlab.credential-reader", async () => {
  const temp = await mkdtemp(join(tmpdir(), "glab-credential-"));
  const configPath = join(temp, "config.yml");
  const provider = createGlabCredentialProvider({
    configPath,
    host: "gitlab.example",
  });
  try {
    await writeFile(
      configPath,
      'hosts:\n  gitlab.example:\n    token: selected-secret-token\n    is_oauth2: "true"\n  other.example:\n    token: unrelated-secret-token\n'
    );
    await expect(provider(new AbortController().signal)).resolves.toStrictEqual(
      {
        kind: "oauth",
        token: "selected-secret-token",
      }
    );
    await writeFile(
      configPath,
      "token: unrelated-secret-token\nhosts:\n  gitlab.example: {}\n"
    );
    await expect(provider(new AbortController().signal)).rejects.toThrow(
      /GLAB_CREDENTIAL/u
    );
    await writeFile(
      configPath,
      'hosts:\n  gitlab.example:\n    use_keyring: "true"\n    token: stale-secret-token\n'
    );
    await expect(provider(new AbortController().signal)).rejects.toThrow(
      /GLAB_CREDENTIAL/u
    );
    await writeFile(configPath, "x".repeat(262_145));
    await expect(provider(new AbortController().signal)).rejects.toThrow(
      /GLAB_CREDENTIAL/u
    );
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});
