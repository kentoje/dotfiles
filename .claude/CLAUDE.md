## File Search Policy

**Grep, Glob, `bash grep`, and `bash find` are disabled.** Use FFF MCP tools for ALL file search and content search operations. This applies to the main agent AND all subagents.

| Blocked tool | FFF replacement |
|---|---|
| Glob | `mcp__fff__find_files` |
| Grep | `mcp__fff__grep` |
| Multiple greps | `mcp__fff__multi_grep` |

FFF returns relative paths. Use `realpath` to get absolute paths when needed.

`fff-mcp` is an MCP server binary, not a standalone CLI. In shell contexts (e.g. `ctx_batch_execute`), use `realpath` on FFF results to build absolute paths.
