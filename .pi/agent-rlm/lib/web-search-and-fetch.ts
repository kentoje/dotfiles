/**
 * Web search, page fetching, and library documentation for pi RLM cells.
 *
 * RLM deactivates every tool except `execute`, so the usual web tools are gone.
 * These are plain functions instead: import this file from a cell and call them.
 * Every one is a single `fetch` against an API whose key is already in the
 * environment, so nothing here can break on package resolution.
 *
 *   const web = await import(process.env.HOME + "/.pi/agent-rlm/lib/web-search-and-fetch.ts");
 *   const hits = await web.searchWebWithExa("bun shell api");
 *   const page = await web.fetchPageAsMarkdown(hits[0].url);
 */

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
const FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape";
const CONTEXT7_SEARCH_URL = "https://context7.com/api/v1/search";
const CONTEXT7_LIBRARY_URL = "https://context7.com/api/v1";

function requireApiKey(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Web helper missing credential: ${name} is not set in the environment`);
	}
	return value;
}

export interface WebSearchHit {
	title: string;
	url: string;
	/** Page excerpt, present only when the search was asked for text. */
	text?: string;
	publishedDate?: string;
}

/**
 * Searches the web and returns ranked results. This is the web search entry point.
 *
 * `includeText` costs more but saves a second round trip when a snippet is enough.
 */
export async function searchWebWithExa(
	query: string,
	options: { numResults?: number; includeText?: boolean; maxCharacters?: number } = {},
): Promise<WebSearchHit[]> {
	const { numResults = 5, includeText = true, maxCharacters = 1500 } = options;
	const response = await fetch(EXA_SEARCH_URL, {
		method: "POST",
		headers: { "x-api-key": requireApiKey("EXA_API_KEY"), "content-type": "application/json" },
		body: JSON.stringify({
			query,
			numResults,
			...(includeText ? { contents: { text: { maxCharacters } } } : {}),
		}),
	});
	if (!response.ok) {
		throw new Error(`Exa search failed with HTTP ${response.status}: ${await response.text()}`);
	}
	const body = (await response.json()) as { results?: WebSearchHit[] };
	return body.results ?? [];
}

/**
 * Fetches one page and returns it as readable markdown, boilerplate stripped.
 *
 * Try this first for reading a web page. It renders JavaScript, so it also works
 * on pages that a plain `fetch` would return empty.
 */
export async function fetchPageAsMarkdown(
	url: string,
	options: { onlyMainContent?: boolean; timeoutMs?: number } = {},
): Promise<string> {
	const { onlyMainContent = true, timeoutMs = 60_000 } = options;
	const response = await fetch(FIRECRAWL_SCRAPE_URL, {
		method: "POST",
		headers: {
			authorization: `Bearer ${requireApiKey("FIRECRAWL_API_KEY")}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent, timeout: timeoutMs }),
	});
	if (!response.ok) {
		throw new Error(`Firecrawl scrape failed with HTTP ${response.status}: ${await response.text()}`);
	}
	const body = (await response.json()) as { success?: boolean; data?: { markdown?: string } };
	const markdown = body.data?.markdown;
	if (!markdown) {
		throw new Error(`Firecrawl scrape returned no markdown for ${url}`);
	}
	return markdown;
}

/**
 * Fetches the text of several pages at once. Use as the fallback when
 * fetchPageAsMarkdown is rate limited or the site blocks the scraper.
 */
export async function fetchPagesTextWithExa(urls: string[]): Promise<Array<{ url: string; text: string }>> {
	const response = await fetch(EXA_CONTENTS_URL, {
		method: "POST",
		headers: { "x-api-key": requireApiKey("EXA_API_KEY"), "content-type": "application/json" },
		body: JSON.stringify({ urls, text: true }),
	});
	if (!response.ok) {
		throw new Error(`Exa contents failed with HTTP ${response.status}: ${await response.text()}`);
	}
	const body = (await response.json()) as { results?: Array<{ url: string; text?: string }> };
	return (body.results ?? []).map((result) => ({ url: result.url, text: result.text ?? "" }));
}

export interface Context7Library {
	/** Context7 library id, e.g. "/oven-sh/bun". Pass this to fetchLibraryDocsFromContext7. */
	id: string;
	title: string;
	description: string;
}

/** Finds the Context7 library id for a framework or package name. */
export async function findLibraryOnContext7(query: string): Promise<Context7Library[]> {
	const response = await fetch(`${CONTEXT7_SEARCH_URL}?query=${encodeURIComponent(query)}`, {
		headers: { authorization: `Bearer ${requireApiKey("CONTEXT7_API_KEY")}` },
	});
	if (!response.ok) {
		throw new Error(`Context7 search failed with HTTP ${response.status}: ${await response.text()}`);
	}
	const body = (await response.json()) as { results?: Context7Library[] };
	return body.results ?? [];
}

/**
 * Reads current library documentation, narrowed to one topic.
 *
 * Prefer this over a web search when the question is "how does this library API
 * work" - the answer comes from the library's own docs at their latest version.
 */
export async function fetchLibraryDocsFromContext7(
	libraryId: string,
	topic: string,
	options: { tokens?: number } = {},
): Promise<string> {
	const { tokens = 5000 } = options;
	const path = libraryId.replace(/^\//, "");
	const url = `${CONTEXT7_LIBRARY_URL}/${path}?type=txt&topic=${encodeURIComponent(topic)}&tokens=${tokens}`;
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${requireApiKey("CONTEXT7_API_KEY")}` },
	});
	if (!response.ok) {
		throw new Error(`Context7 docs failed with HTTP ${response.status}: ${await response.text()}`);
	}
	return await response.text();
}
