import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { Schema } from "effect";
import YAML from "yaml";

const flag = Schema.Union([Schema.Boolean, Schema.Literals(["true", "false"])]);
const entrySchema = Schema.Struct({
  is_oauth2: Schema.optionalKey(flag),
  token: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^[!-~]{8,4096}$/u))
  ),
  use_keyring: Schema.optionalKey(flag),
});
const fileSchema = Schema.Struct({
  hosts: Schema.Record(Schema.String, Schema.Unknown),
});
/** Read an explicit glab file's exact host entry only; secure-store/refresh backends require a host credential callback. */
export function createGlabCredentialProvider(options: {
  configPath: string;
  host: string;
}) {
  return async (signal: AbortSignal) => {
    try {
      if (signal.aborted || !isAbsolute(options.configPath)) {
        throw new Error("GLAB_CREDENTIAL: unsupported credential source");
      }
      const info = await stat(options.configPath);
      if (!info.isFile() || info.size > 262_144) {
        throw new Error("GLAB_CREDENTIAL: unsupported credential source");
      }
      const raw: unknown = YAML.parse(
        await readFile(options.configPath, { encoding: "utf-8", signal }),
        { maxAliasCount: 0, uniqueKeys: true }
      );
      const file = Schema.decodeUnknownSync(fileSchema)(raw);
      if (!Object.hasOwn(file.hosts, options.host)) {
        throw new Error("GLAB_CREDENTIAL: unsupported credential source");
      }
      const entry = Schema.decodeUnknownSync(entrySchema)(
        file.hosts[options.host]
      );
      if (
        entry.use_keyring === true ||
        entry.use_keyring === "true" ||
        !entry.token
      ) {
        throw new Error("GLAB_CREDENTIAL: unsupported credential source");
      }
      return {
        kind:
          entry.is_oauth2 === true || entry.is_oauth2 === "true"
            ? ("oauth" satisfies "oauth")
            : ("pat" satisfies "pat"),
        token: entry.token,
      };
    } catch {
      throw new Error(
        "GLAB_CREDENTIAL: selected host token is unavailable; supply an explicit supported host credential source."
      );
    }
  };
}
