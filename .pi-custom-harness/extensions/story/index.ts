import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect, Schema } from "effect";

import { runTool } from "../../lib/pi-bridge/core";
import {
  StorybookIndexError,
  StorybookIndexService,
  StorybookPortlessError,
  StorybookPortlessService,
  type StorybookRenderCapture,
  StorybookRenderError,
  StorybookRenderService,
  type StorybookStoryEntry,
  type StorybookViewport,
} from "../../lib/story/core";
import { type StoryResult, story } from "./core";
import { type StoryInput, StoryParams } from "./schema";

const StoryIndexEntry = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.String,
  name: Schema.String,
  type: Schema.Literal("story"),
});
const StoryIndexDocument = Schema.Struct({
  entries: Schema.optional(Schema.Record(Schema.String, StoryIndexEntry)),
});
const decodeStoryIndex = Schema.decodeUnknownEffect(StoryIndexDocument);

const decodeStories = (
  value: Schema.Schema.Type<typeof StoryIndexDocument>,
): ReadonlyArray<StorybookStoryEntry> =>
  Object.entries(value.entries ?? {}).map(([entryId, entry]) => ({
    id: entry.id ?? entryId,
    title: entry.title,
    name: entry.name,
    type: "story",
  }));

const liveStorybookIndex = StorybookIndexService.of({
  storiesFor: ({ cwd }) =>
    Effect.tryPromise({
      try: async () => {
        const baseUrl = process.env.PI_STORYBOOK_URL ?? "http://localhost:6008";
        const response = await fetch(
          `${baseUrl.replace(/\/+$/u, "")}/index.json`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const decoded = await Effect.runPromise(
          decodeStoryIndex(await response.json()),
        );
        return decodeStories(decoded);
      },
      catch: (cause) =>
        new StorybookIndexError({
          message: `Storybook index lookup failed for ${cwd}: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    }),
});

const runCommand = (
  program: string,
  arguments_: ReadonlyArray<string>,
  cwd: string,
): Effect.Effect<unknown, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(program, arguments_, { cwd });
        let output = "";
        let errorOutput = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          errorOutput += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) resolve(output.trim());
          else
            reject(
              new Error(
                errorOutput.trim() ||
                  `${program} exited with ${code ?? "unknown"}`,
              ),
            );
        });
      }),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

const commandOutputText = (
  output: unknown,
  command: string,
): Effect.Effect<string, Error> =>
  typeof output === "string"
    ? Effect.succeed(output)
    : Effect.fail(new Error(`${command} returned non-text output.`));

const runPortlessGet = (
  cwd: string,
): Effect.Effect<string, StorybookPortlessError> =>
  runCommand("portless", ["get", "storybook"], cwd).pipe(
    Effect.flatMap((output) => commandOutputText(output, "portless")),
    Effect.flatMap((output) => {
      const url = output.split(/\s+/u)[0];
      return url === undefined || url.length === 0
        ? Effect.fail(
            new StorybookPortlessError({
              message: "Storybook portless URL lookup returned no URL.",
            }),
          )
        : Effect.succeed(url);
    }),
    Effect.mapError((cause) =>
      cause instanceof StorybookPortlessError
        ? cause
        : new StorybookPortlessError({
            message: `Storybook portless URL lookup failed: ${cause.message}`,
          }),
    ),
  );

const liveStorybookPortless = StorybookPortlessService.of({
  urlFor: ({ cwd }) => runPortlessGet(cwd),
});

const viewportArguments = (
  viewport: StorybookViewport | undefined,
): ReadonlyArray<string> => {
  if (viewport === undefined) return [];
  if (typeof viewport === "string") return ["set", "viewport", viewport];
  return ["set", "viewport", String(viewport.width), String(viewport.height)];
};

const liveStorybookRender = StorybookRenderService.of({
  render: ({ url, viewport }) => {
    const screenshotPath = join(tmpdir(), `pi-story-${randomUUID()}.png`);
    const open = runCommand(
      "agent-browser",
      ["--session", "storybook", "open", url],
      process.cwd(),
    );
    const viewportArgs = viewportArguments(viewport);
    const setViewport =
      viewportArgs.length === 0
        ? Effect.succeed<unknown>(undefined)
        : runCommand(
            "agent-browser",
            ["--session", "storybook", ...viewportArgs],
            process.cwd(),
          );
    const capture = setViewport.pipe(
      Effect.andThen(
        runCommand(
          "agent-browser",
          ["--session", "storybook", "screenshot", screenshotPath],
          process.cwd(),
        ),
      ),
      Effect.andThen(
        runCommand(
          "agent-browser",
          ["--session", "storybook", "errors", "--json"],
          process.cwd(),
        ),
      ),
      Effect.flatMap(
        (errorOutput): Effect.Effect<StorybookRenderCapture, Error> =>
          typeof errorOutput === "string"
            ? Effect.succeed({
                screenshot: screenshotPath,
                consoleErrors: errorOutput.length === 0 ? [] : [errorOutput],
              })
            : Effect.fail(
                new Error(
                  "Storybook browser errors command returned non-text output.",
                ),
              ),
      ),
    );
    return open.pipe(
      Effect.andThen(capture),
      Effect.ensuring(
        runCommand(
          "agent-browser",
          ["--session", "storybook", "close"],
          process.cwd(),
        ).pipe(Effect.ignore),
      ),
      Effect.mapError((cause) =>
        cause instanceof StorybookRenderError
          ? cause
          : new StorybookRenderError({
              message: `Storybook preview render failed for ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
            }),
      ),
    );
  },
});

const successText = (value: StoryResult) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  details: value,
});

const failureDetails = (params: StoryInput, reason: string): StoryResult =>
  params.action === "list"
    ? { action: "list", component: params.component, stories: [] }
    : {
        action: "show",
        component: params.component,
        story: params.story ?? "",
        screenshot: "",
        url: "",
        consoleErrors: [reason],
      };

/** Registers Hydra-only Storybook list and preview render actions. */
export default function registerStory(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "story",
    label: "Storybook story",
    description:
      "List Hydra Storybook stories or render one through its preview iframe.",
    promptSnippet: "Discover or render a Hydra Storybook story",
    promptGuidelines: [
      "Use story list before story show when the story selector is uncertain.",
      "Story show captures the preview iframe, never Storybook manager chrome.",
    ],
    parameters: StoryParams,
    async execute(_toolCallId, params: StoryInput, signal, _onUpdate, ctx) {
      const effect = story({ cwd: ctx.cwd, request: params }).pipe(
        Effect.provideService(StorybookIndexService, liveStorybookIndex),
        Effect.provideService(StorybookPortlessService, liveStorybookPortless),
        Effect.provideService(StorybookRenderService, liveStorybookRender),
        Effect.map(successText),
      );
      return runTool(effect, {
        signal,
        failurePrefix: "Story",
        failureResult: (reason) => ({
          content: [{ type: "text" as const, text: reason }],
          details: failureDetails(params, reason),
          isError: true,
        }),
      });
    },
  });
}
