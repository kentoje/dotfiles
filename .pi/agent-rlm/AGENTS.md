# RLM mode: capabilities are functions, not tools

This session has one tool, `execute`.
Skills, MCP tools, and every extension tool are deactivated, so anything you would
normally reach for as a tool is a function you import inside a cell instead.

A cell cannot expand `~`, so import paths use `process.env.HOME`.
Read the referenced doc before using a capability; each one is short.

| Need | Do this | Details |
| --- | --- | --- |
| Web search, read a page, library docs | `import(process.env.HOME + "/.pi/agent-rlm/lib/web-search-and-fetch.ts")` | `docs/web-research.md` |
| Browse, click, fill, screenshot a page | `Bun.$\`agent-browser ...\`` | `docs/browser-automation.md` |
| Open any `aircall` URL, local or staging | Inject auth cookies first, or you get the login page | `docs/browser-automation.md` |
| Figma, Slack, Jira, other MCP servers | Import the server's exported function | `docs/mcp-without-tools.md` |
| Delegate work | `await rlm.run(prompt)`, answer lands in `handle.output_file` | - |

Docs live in `~/.pi/agent-rlm/docs/`. Two things that are easy to get wrong:

- **A screenshot is only pixels you can see if you `tools.read` it.** `Bun.$` returns a
  file path and nothing to look at.
- **For a plain JSON API, just `fetch` it.** The helpers are for search and for pages
  that need rendering or boilerplate stripping.
