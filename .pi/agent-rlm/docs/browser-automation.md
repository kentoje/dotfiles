# Browser automation in RLM mode

`agent-browser` is a CLI, so drive it with `Bun.$`.
It ships its own version-matched docs: `await Bun.$\`agent-browser skills get core --full\`.text()`.

```ts
await Bun.$`agent-browser open ${url}`;
const snapshot = await Bun.$`agent-browser snapshot -i`.text();
await Bun.$`agent-browser click @e1`;
await Bun.$`agent-browser fill @e2 "text"`;
await Bun.$`agent-browser close`;
```

Snapshot refs (`@e1`, `@e2`) come from the last snapshot.
Re-snapshot after every navigation or significant DOM change.

Because the snapshot is a value, filter it in the cell rather than reading the whole
accessibility tree into the conversation.

## Seeing a screenshot

`Bun.$` gives you a file path. The mounted `tools.read` forwards the image into the
cell result, where it becomes pixels you can actually look at:

```ts
await Bun.$`agent-browser screenshot shot.png`;
await tools.read({ path: "shot.png" });
```

Use this for any judgement about layout, spacing, colour, or alignment.
Reading the DOM is not a substitute for looking at the render.

## Aircall URLs need auth first

Any hostname containing `aircall`, local dev included, needs cookies injected before you
open it. Local dev URLs come from `portless list`, never a bare `localhost:<port>`.
Staging is `https://dashboard.aircall-staging.com`.

```ts
const { persistAgentBrowserAuth } = await import(
  process.env.HOME + "/.claude/mcp-servers/aircall-personal-tools/tools/persist-agent-browser-auth.ts"
);
await persistAgentBrowserAuth({ url });
await Bun.$`agent-browser --session aircall-local open ${url}`;
```

Cookies are host-only, so pass the exact URL you will open, worktree subdomain included.
A mismatched host means no cookie and a redirect to the staging login.
Re-auth per worktree host and whenever a session goes stale.

The helper needs `STAGING_509_PASSWORD` in the environment.
It only writes to the `aircall-local` session; a parallel worker on its own session name
has to propagate the cookies itself.
