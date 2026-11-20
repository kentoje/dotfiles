# ADR-018 Reviewed project check profiles

A project-owned `project-checks.json` makes the existing project CLI entrypoint run an agreed suite. Proposals and maintenance review use static command evidence. A generated profile keeps its selected check IDs until the user proposes a different set. No optional E2E command enters a profile unless it is explicitly selected. Saving leaves execution pending, and the separate check command supplies implementation evidence.

A proposal digest covers the canonical root, current generated profile and prospective content, including project scripts. Explicit terminal execution with the matching proposal ID, or Pi confirmation of the exact target and checks, authorizes publication. The harness serializes its own writes, uses no-clobber creation and atomically replaces a reviewed managed profile. A checksummed profile distinguishes ordinary manual changes; this is ownership tracking rather than authentication. External editors do not participate in the harness lock.

The finite model checks review and stale-base rejection. A fault permits a stale save. Filesystem publication, provider command discovery and CLI behavior are covered by executable checks. The current scope covers profiles backed by package scripts and statically recognizable standalone checks.
