import { Effect } from "effect";

import {
  runStoryAction,
  type StorybookActionInput,
  type StorybookToolError,
  type StorybookToolResult,
} from "../../lib/story/core";
import type { StoryInput } from "./schema";

/** Input to one Pi-free story action, with the worktree cwd supplied by Pi. */
export interface StoryActionInput {
  readonly cwd: string;
  readonly request: StoryInput;
}

/** Observable result of a story list or show action. */
export type StoryResult = StorybookToolResult;

/** Typed failures returned by story discovery, URL resolution, or rendering. */
export type StoryError = StorybookToolError;

/** Runs a Storybook action through the injected Pi-free service seams. */
export const story = Effect.fn("story")(function* ({
  cwd,
  request,
}: StoryActionInput) {
  return yield* runStoryAction({
    cwd,
    request,
  } satisfies StorybookActionInput);
});
