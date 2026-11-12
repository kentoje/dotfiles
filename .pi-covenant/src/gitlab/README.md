# GitLab repository read slice

The module currently implements `repository` only. It is not registered in Pi yet. Pipeline/job/log reads, private MR lookup, retry/cancel, coordination and mutation authorization remain pending. The public action catalogue still describes the full planned brick; it does not imply those actions execute.

## Host composition

From trusted host code, import makeGitlabModule from src/gitlab/module-port.ts and createGitlabReadTransport/createGlabCredentialProvider from src/foundation/module-port.ts. Feature modules cannot import foundation. Example:

```ts
const transport = createGitlabReadTransport({
  hosts: [
    {
      host: "gitlab.example.com",
      apiOrigin: "https://gitlab.example.com",
      credential: createGlabCredentialProvider({
        configPath: "/absolute/path/to/glab-cli/config.yml",
        host: "gitlab.example.com",
      }),
    },
  ],
});
const gitlab = makeGitlabModule({
  sessionCwd: process.cwd(),
  selection: { allowedHosts: ["gitlab.example.com"] },
  readProject: transport.readProject,
});
const result = await Effect.runPromise(
  gitlab.repository({
    repository: "https://gitlab.example.com/team/app",
  })
);
```

Effect is the existing `effect` library. No Covenant/TLA+ is loaded by these runtime modules. Host credentials may instead come from a trusted `(signal) => Promise<{kind: "pat" | "oauth", token: string}>` callback. Tokens never belong in tool arguments, repository context or feature host configuration. Configuration is supplied explicitly; this slice does not read global Pi settings or automatically open credentials.

## Target and read behavior

Opt-in repository-context discovery accepts explicit HTTPS/SSH/scp-style selectors, or a single distinct allowed fetch target. Equivalent fetch remotes deduplicate; origin is not preferred. `selection.remote` selects a configured remote; `selection.hostMappings` maps declared aliases to approved API authorities. Explicit cwd plus a conflicting service selector blocks. Remote-only reads have null local branch/HEAD/checkout rather than borrowing unrelated session facts. Existing ordinary worktree/project-check calls do not enable this opt-in discovery.

Only simple bounded local Git remote declarations are interpreted. Git includes, local URL rewrites/helpers, per-worktree config files, non-ASCII paths and unmapped custom SSH ports are rejected or unavailable. Global Git transport rewriting is not evaluated. An explicit remote-only selector can bypass unrelated local config; it cannot then claim local branch provenance. API authorities must be canonical, and nonstandard API subpaths are unsupported.

The host capability exposes only a fixed repository GET. There is no arbitrary method/URL, mutation port or approval flag. Production origins require HTTPS; explicitly configured loopback HTTP origins support local acceptance fixtures. Redirects are rejected. Credentials, response streaming, decoding and retries share one deadline (default 30s, bounded by the caller). At most two application attempts are allowed for network/429/502/503/504 failures, with Retry-After honored only inside the remaining deadline. Auth/schema/identity failures do not retry.

JSON is limited to 2 MiB before and after configured-secret redaction, including decompressed/chunked responses. Invalid UTF-8/JSON, missing project fields, mismatched project identity or web origin cannot pass. Error bodies/headers and raw exception diagnostics are not exposed. Returned repository data includes observed nullable default_branch and local branch/HEAD only when a matching checkout is known. HTTP auth/permission/not-found/rate-limit failures remain distinct, not empty successful lookup results.

## Credential-file bridge limits

The bridge reads only an explicit regular YAML file (at most 256 KiB) and its exact `hosts[host]` entry. It never falls back to another host, a global token, environment variables or project settings. File-backed PAT and OAuth access tokens of 8–4096 visible ASCII characters are supported. Keyring-authoritative entries, interactive login/refresh, job tokens and unsupported stores return an actionable prerequisite; provide a trusted credential callback for other supported integrations. A configured token is not proof of validity or permission: actual authentication is observed through the GET response. Secret detection beyond configured values is not claimed.

## Verification

Real temporary Git repositories and loopback HTTP fixtures exercise target selection, read-only methods, headers, redaction, malformed/mismatched responses, bounded retries, redirects, byte limits, cancellation and deadlines. No live/private GitLab API calls or real credentials are required. The repository-read model checks 52 finite states and four invariants; four deliberate faults are detected. It represents abstract dispatch/completion policy, not parser/HTTP/TLS correctness or a formal implementation refinement. The earlier CI/mutation proposal remains separately modeled and unimplemented.
