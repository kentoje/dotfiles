import { Schema } from "effect";

const projectSchema = Schema.Struct({
  default_branch: Schema.NullOr(Schema.NonEmptyString),
  id: Schema.Int.check(
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)
  ),
  path_with_namespace: Schema.NonEmptyString,
  web_url: Schema.NonEmptyString,
});
/** Decode complete repository data without trusting omitted identifiers or substituting another project. */
export function decodeGitlabProject(
  body: unknown,
  expectedPath: string,
  expectedHost: string
) {
  const project = Schema.decodeUnknownSync(projectSchema)(body);
  if (project.path_with_namespace !== expectedPath) {
    throw new Error("TARGET_MISMATCH");
  }
  const url = new URL(project.web_url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.host !== expectedHost ||
    url.search ||
    url.hash ||
    decodeURIComponent(url.pathname).replace(/\/$/u, "") !== `/${expectedPath}`
  ) {
    throw new Error("MALFORMED_RESPONSE");
  }
  return project;
}
