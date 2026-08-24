import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  buildStoryPreviewUrl,
  runStoryAction,
  type StorybookActionInput,
  type StorybookIndexError,
  StorybookIndexService,
  StorybookPortlessService,
  type StorybookRenderCapture,
  StorybookRenderError,
  StorybookRenderService,
  type StorybookViewport,
} from "./core";

type StoryRequest = StorybookActionInput["request"];
type StoryRender = (input: {
  readonly url: string;
  readonly viewport: StorybookViewport | undefined;
}) => Effect.Effect<StorybookRenderCapture, StorybookRenderError>;

const entries = [
  {
    id: "callout--default",
    title: "Callout",
    name: "Default",
    type: "story" as const,
  },
  {
    id: "callout--with-icon",
    title: "Callout",
    name: "With Icon",
    type: "story" as const,
  },
  {
    id: "other--default",
    title: "Other",
    name: "Default",
    type: "story" as const,
  },
];

const run = (
  request: StoryRequest,
  overrides?: {
    readonly stories?: typeof entries;
    readonly render?: StoryRender;
  },
) =>
  runStoryAction({ cwd: "/worktree", request }).pipe(
    Effect.provideService(StorybookIndexService, {
      storiesFor: () => Effect.succeed(overrides?.stories ?? entries),
    }),
    Effect.provideService(StorybookPortlessService, {
      urlFor: () => Effect.succeed("https://task.hydra.localhost"),
    }),
    Effect.provideService(StorybookRenderService, {
      render:
        overrides?.render ??
        (() =>
          Effect.succeed({ screenshot: "/tmp/story.png", consoleErrors: [] })),
    }),
  );

test("list discovers matching component stories and skips other entries", async () => {
  await expect(
    Effect.runPromise(run({ action: "list", component: "Callout" })),
  ).resolves.toEqual({
    action: "list",
    component: "Callout",
    stories: ["callout--default", "callout--with-icon"],
  });
});

test("show reports no stories without resolving URL or rendering", async () => {
  await expect(
    Effect.runPromise(
      run({ action: "show", component: "Missing" }, { stories: [] }),
    ),
  ).rejects.toMatchObject({
    _tag: "StorybookIndexError",
    message: 'Storybook has no stories for component "Missing".',
  } satisfies Partial<StorybookIndexError>);
});

test("preview URL targets iframe and carries story/theme", () => {
  expect(
    buildStoryPreviewUrl({
      baseUrl: "https://task.hydra.localhost/",
      storyId: "callout--default",
      theme: "dark",
    }),
  ).toBe(
    "https://task.hydra.localhost/iframe.html?id=callout--default&viewMode=story&globals=theme:dark",
  );
});

test("show passes viewport and theme URL to render service", async () => {
  let received:
    | { readonly url: string; readonly viewport: unknown }
    | undefined;
  const result = await Effect.runPromise(
    run(
      {
        action: "show",
        component: "Callout",
        story: "With Icon",
        viewport: { width: 1280, height: 800 },
        theme: "dark",
      },
      {
        render: (input) => {
          received = input;
          return Effect.succeed({
            screenshot: "story.png",
            consoleErrors: ["warn"],
          });
        },
      },
    ),
  );
  expect(received).toEqual({
    url: "https://task.hydra.localhost/iframe.html?id=callout--with-icon&viewMode=story&globals=theme:dark",
    viewport: { width: 1280, height: 800 },
  });
  expect(result).toMatchObject({
    action: "show",
    screenshot: "story.png",
    consoleErrors: ["warn"],
  });
});

test("show preserves render failures as typed failures", async () => {
  await expect(
    Effect.runPromise(
      run(
        { action: "show", component: "Callout" },
        {
          render: () =>
            Effect.fail(
              new StorybookRenderError({ message: "browser unavailable" }),
            ),
        },
      ),
    ),
  ).rejects.toMatchObject({
    _tag: "StorybookRenderError",
    message: "browser unavailable",
  });
});
