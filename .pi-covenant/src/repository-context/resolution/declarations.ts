import { lstat } from "node:fs/promises";
import { join } from "node:path";

import { Schema } from "effect";

import { readContextMetadata } from "./metadata.js";

const capabilityId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/u)
);
const profileSchema = Schema.Struct({
  checks: Schema.NonEmptyArray(Schema.Struct({ id: capabilityId })).check(
    Schema.isMaxLength(64)
  ),
});
const capabilitiesSchema = Schema.Struct({
  capabilities: Schema.NonEmptyArray(Schema.Struct({ id: capabilityId })).check(
    Schema.isMaxLength(64)
  ),
});
const servicesSchema = Schema.Struct({
  jira_project: Schema.String.check(Schema.isPattern(/^[A-Z][A-Z0-9]{1,19}$/u)),
});

async function readDeclaration<A>(path: string, decode: (value: unknown) => A) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile()) {
      return null;
    }
    const content = await readContextMetadata(path, 1_048_576);
    return content === null ? null : decode(JSON.parse(content));
  } catch {
    return null;
  }
}

/** Resolve checked-in project declarations as local metadata; they confer no authentication or execution authority. */
export async function discoverProjectDeclarations(project: string) {
  const manifestPath = join(project, "project-checks.json");
  const servicesPath = join(project, "project-services.json");
  const capabilitiesPath = join(project, "project-capabilities.json");
  const [profile, services, optional] = await Promise.all([
    readDeclaration(manifestPath, Schema.decodeUnknownSync(profileSchema)),
    readDeclaration(
      servicesPath,
      Schema.decodeUnknownSync(servicesSchema, { onExcessProperty: "error" })
    ),
    readDeclaration(
      capabilitiesPath,
      Schema.decodeUnknownSync(capabilitiesSchema)
    ),
  ]);
  return {
    available_capabilities: [
      ...new Set([
        ...(profile?.checks.map((check) => check.id) ?? []),
        ...(optional?.capabilities.map((capability) => capability.id) ?? []),
      ]),
    ],
    jira_project: services?.jira_project ?? null,
    project_cli_manifest: profile ? manifestPath : null,
    sources: [
      ...(profile
        ? [
            { fact: "available_capabilities", source: manifestPath },
            { fact: "project_cli_manifest", source: manifestPath },
          ]
        : []),
      ...(services ? [{ fact: "jira_project", source: servicesPath }] : []),
      ...(optional
        ? [{ fact: "available_capabilities", source: capabilitiesPath }]
        : []),
    ],
    unavailable: [
      ...(profile || optional
        ? []
        : [
            {
              fact: "available_capabilities",
              reason: "No valid local project check profile is declared.",
            },
          ]),
      ...(services
        ? []
        : [
            {
              fact: "jira_project",
              reason: "No valid local Jira project is declared.",
            },
          ]),
    ],
  };
}
