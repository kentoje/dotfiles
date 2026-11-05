import { spawnSync } from "node:child_process";
import { copyFile, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv.slice(2).find((argument) => argument !== "--");
if (!source) {
  throw new Error("Usage: pnpm setup:covenant /path/to/covenant");
}
const version = spawnSync(source, ["--version"], {
  encoding: "utf-8",
  timeout: 10_000,
});
if (version.status !== 0 || !version.stdout.startsWith("covenant ")) {
  throw new Error("Selected file is not an executable Covenant CLI");
}
const directory = fileURLToPath(new URL("../.covenant/bin/", import.meta.url));
await mkdir(directory, { recursive: true });
await copyFile(source, join(directory, "covenant"));
await chmod(join(directory, "covenant"), 0o755);
console.log(`Installed local ${version.stdout.trim()}`);
