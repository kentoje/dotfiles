# Web research in RLM mode

No web tool exists here. `~/.pi/agent-rlm/lib/web-search-and-fetch.ts` replaces it with
plain functions, each a single `fetch` against an API whose key is already in the
environment. Nothing in it can break on package resolution.

```ts
const web = await import(process.env.HOME + "/.pi/agent-rlm/lib/web-search-and-fetch.ts");
```

| Function | Use it for |
| --- | --- |
| `searchWebWithExa(query, { numResults, includeText })` | Web search. Returns `{ title, url, text? }[]`. |
| `fetchPageAsMarkdown(url)` | Read one page as readable markdown. Renders JavaScript. |
| `fetchPagesTextWithExa(urls)` | Fallback when Firecrawl is rate limited or blocked, and for reading several pages at once. |
| `findLibraryOnContext7(name)` | Resolve a package name to a Context7 library id. |
| `fetchLibraryDocsFromContext7(id, topic)` | Current docs for a library, narrowed to a topic. |

```ts
const hits = await web.searchWebWithExa("bun shell api", { numResults: 5 });
const page = await web.fetchPageAsMarkdown(hits[0].url);

const [lib] = await web.findLibraryOnContext7("bun");
const docs = await web.fetchLibraryDocsFromContext7(lib.id, "shell");
```

Prefer Context7 over a web search when the question is "how does this library API work" -
the answer comes from the library's own docs at their current version.

For a plain JSON API, skip all of this and `fetch` it directly.

Each function throws with a named prefix (`Exa search failed`, `Firecrawl scrape failed`,
`Context7 docs failed`, `Web helper missing credential`) so a failure says which hop broke.
