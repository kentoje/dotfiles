import { Context, Effect, Schema } from "effect";

/** A Storybook story index entry used to resolve component stories. */
export interface StorybookStoryEntry {
  readonly id: string;
  readonly title: string;
  readonly name: string;
  readonly type: "story";
}

/** A viewport name or explicit browser viewport size for a story render. */
export type StorybookViewport =
  | string
  | {
      readonly width: number;
      readonly height: number;
    };

/** A screenshot and browser diagnostics captured from a Storybook preview iframe. */
export interface StorybookRenderCapture {
  readonly screenshot: string;
  readonly consoleErrors: ReadonlyArray<string>;
}

/** A failure while reading the Storybook index. */
export class StorybookIndexError extends Schema.TaggedError<StorybookIndexError>()(
  "StorybookIndexError",
  { message: Schema.String },
) {}

/** A failure while resolving the worktree's Storybook portless route. */
export class StorybookPortlessError extends Schema.TaggedError<StorybookPortlessError>()(
  "StorybookPortlessError",
  { message: Schema.String },
) {}

/** A failure while navigating or capturing a Storybook preview iframe. */
export class StorybookRenderError extends Schema.TaggedError<StorybookRenderError>()(
  "StorybookRenderError",
  { message: Schema.String },
) {}

/** The Storybook index seam, which keeps story discovery deterministic in core tests. */
export class StorybookIndexService extends Context.Service<
  StorybookIndexService,
  {
    readonly storiesFor: (input: {
      readonly cwd: string;
      readonly component: string;
    }) => Effect.Effect<
      ReadonlyArray<StorybookStoryEntry>,
      StorybookIndexError
    >;
  }
>()("pi-custom-harness/lib/story/StorybookIndexService") {}

/** The portless seam that resolves the current worktree's Storybook base URL. */
export class StorybookPortlessService extends Context.Service<
  StorybookPortlessService,
  {
    readonly urlFor: (input: {
      readonly cwd: string;
    }) => Effect.Effect<string, StorybookPortlessError>;
  }
>()("pi-custom-harness/lib/story/StorybookPortlessService") {}

/** The browser seam that only navigates preview iframes and captures their output. */
export class StorybookRenderService extends Context.Service<
  StorybookRenderService,
  {
    readonly render: (input: {
      readonly url: string;
      readonly viewport: StorybookViewport | undefined;
    }) => Effect.Effect<StorybookRenderCapture, StorybookRenderError>;
  }
>()("pi-custom-harness/lib/story/StorybookRenderService") {}

/** Every typed failure a story action can return. */
export type StorybookToolError =
  | StorybookIndexError
  | StorybookPortlessError
  | StorybookRenderError;

/** Builds the Storybook preview iframe URL without manager chrome. */
export const buildStoryPreviewUrl = (input: {
  readonly baseUrl: string;
  readonly storyId: string;
  readonly theme: string | undefined;
}): string => {
  const previewUrl = new URL(input.baseUrl);
  previewUrl.pathname = `${previewUrl.pathname.replace(/\/+$/u, "")}/iframe.html`;
  previewUrl.search = `?id=${encodeURIComponent(input.storyId)}&viewMode=story`;
  if (input.theme !== undefined) {
    previewUrl.search += `&globals=theme:${encodeURIComponent(input.theme)}`;
  }
  return previewUrl.toString();
};

const normalized = (value: string): string => value.trim().toLowerCase();

const storyBelongsToComponent = (
  entry: StorybookStoryEntry,
  component: string,
): boolean => {
  const wanted = normalized(component);
  if (wanted.length === 0) return false;
  const title = normalized(entry.title);
  const titleLeaf = title.split("/").at(-1) ?? title;
  const idPrefix = normalized(entry.id).split("--")[0] ?? "";
  return title === wanted || titleLeaf === wanted || idPrefix === wanted;
};

const storyForSelector = (
  entries: ReadonlyArray<StorybookStoryEntry>,
  selector: string | undefined,
): StorybookStoryEntry | undefined => {
  if (selector === undefined) return entries[0];
  const wanted = normalized(selector);
  return entries.find(
    (entry) =>
      normalized(entry.id) === wanted ||
      normalized(entry.name) === wanted ||
      normalized(entry.id).endsWith(`--${wanted}`),
  );
};

/** The stable result returned by story list. */
export interface StorybookListResult {
  readonly action: "list";
  readonly component: string;
  readonly stories: ReadonlyArray<string>;
}

/** The stable result returned by story show. */
export interface StorybookShowResult {
  readonly action: "show";
  readonly component: string;
  readonly story: string;
  readonly screenshot: string;
  readonly url: string;
  readonly consoleErrors: ReadonlyArray<string>;
}

/** The observable result of either Storybook action. */
export type StorybookToolResult = StorybookListResult | StorybookShowResult;

/** Input consumed by the Pi-free story action core. */
export interface StorybookActionInput {
  readonly cwd: string;
  readonly request: {
    readonly action: "list" | "show";
    readonly component: string;
    readonly story?: string;
    readonly viewport?: StorybookViewport;
    readonly theme?: string;
  };
}

/** Discovers or renders Hydra stories through injected index, route, and browser seams. */
export const runStoryAction = Effect.fn("runStoryAction")(function* ({
  cwd,
  request,
}: StorybookActionInput) {
  const index = yield* StorybookIndexService;
  const entries = (yield* index.storiesFor({
    cwd,
    component: request.component,
  }))
    .filter((entry) => storyBelongsToComponent(entry, request.component))
    .sort((left, right) => left.id.localeCompare(right.id));

  switch (request.action) {
    case "list":
      return {
        action: "list",
        component: request.component,
        stories: entries.map((entry) => entry.id),
      } satisfies StorybookListResult;
    case "show": {
      if (entries.length === 0) {
        return yield* new StorybookIndexError({
          message: `Storybook has no stories for component "${request.component}".`,
        });
      }
      const entry = storyForSelector(entries, request.story);
      if (entry === undefined) {
        return yield* new StorybookIndexError({
          message: `Storybook story "${request.story}" was not found for component "${request.component}".`,
        });
      }
      const portless = yield* StorybookPortlessService;
      const baseUrl = yield* portless.urlFor({ cwd });
      const url = buildStoryPreviewUrl({
        baseUrl,
        storyId: entry.id,
        theme: request.theme,
      });
      const render = yield* StorybookRenderService;
      const capture = yield* render.render({
        url,
        viewport: request.viewport,
      });
      return {
        action: "show",
        component: request.component,
        story: entry.id,
        screenshot: capture.screenshot,
        url,
        consoleErrors: capture.consoleErrors,
      } satisfies StorybookShowResult;
    }
    default: {
      const exhaustive: never = request.action;
      return exhaustive;
    }
  }
});
