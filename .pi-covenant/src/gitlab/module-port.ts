import { readGitlabRepository } from "./repository/read.js";
import type {
  GitlabReaderHost,
  GitlabReadInvocation,
} from "./transport/ports.js";
/** The initial GitLab module exposes repository reads only; CI and mutation ports are not implemented. */
export function makeGitlabModule(host: GitlabReaderHost) {
  return {
    repository: (input: unknown = {}, invocation: GitlabReadInvocation = {}) =>
      readGitlabRepository(host, input, invocation),
  };
}
/** Host callbacks carry credential-free inputs and sanitized results across the module boundary. */
export type {
  GitlabReaderHost,
  GitlabReadInvocation,
  GitlabWireResult,
} from "./transport/ports.js";
