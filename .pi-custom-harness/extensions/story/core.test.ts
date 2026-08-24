import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  StorybookIndexService,
  StorybookPortlessService,
  StorybookRenderService,
} from "../../lib/story/core";
import { story } from "./core";

test("story extension delegates list to the injected Storybook index", async () => {
  const result = await Effect.runPromise(
    story({
      cwd: "/worktree",
      request: { action: "list", component: "Callout" },
    }).pipe(
      Effect.provideService(StorybookIndexService, {
        storiesFor: () =>
          Effect.succeed([
            {
              id: "callout--default",
              title: "Callout",
              name: "Default",
              type: "story" as const,
            },
          ]),
      }),
      Effect.provideService(StorybookPortlessService, {
        urlFor: () => Effect.succeed("https://task.hydra.localhost"),
      }),
      Effect.provideService(StorybookRenderService, {
        render: () =>
          Effect.succeed({ screenshot: "story.png", consoleErrors: [] }),
      }),
    ),
  );

  expect(result).toEqual({
    action: "list",
    component: "Callout",
    stories: ["callout--default"],
  });
});

test("story extension delegates show to portless and preview render services", async () => {
  let renderedUrl = "";
  const result = await Effect.runPromise(
    story({
      cwd: "/worktree",
      request: { action: "show", component: "Callout", theme: "dark" },
    }).pipe(
      Effect.provideService(StorybookIndexService, {
        storiesFor: () =>
          Effect.succeed([
            {
              id: "callout--default",
              title: "Callout",
              name: "Default",
              type: "story" as const,
            },
          ]),
      }),
      Effect.provideService(StorybookPortlessService, {
        urlFor: () => Effect.succeed("https://task.hydra.localhost"),
      }),
      Effect.provideService(StorybookRenderService, {
        render: ({ url }) => {
          renderedUrl = url;
          return Effect.succeed({ screenshot: "story.png", consoleErrors: [] });
        },
      }),
    ),
  );

  expect(renderedUrl).toBe(
    "https://task.hydra.localhost/iframe.html?id=callout--default&viewMode=story&globals=theme:dark",
  );
  expect(result).toMatchObject({ action: "show", screenshot: "story.png" });
});
