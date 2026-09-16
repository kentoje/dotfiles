import { expect, test } from "bun:test";

import {
  DefaultRepositoryFactsConfiguration,
  FallbackWorktreeRoot,
  resolveWorktreeRoot,
} from "./core";

test("falls back to ~/.pi/worktrees when config and PI_WORKTREE_ROOT are unset", () => {
  expect(
    resolveWorktreeRoot({
      configuredRoot: undefined,
      environmentValue: undefined,
    }),
  ).toBe(FallbackWorktreeRoot);
});

test("treats blank PI_WORKTREE_ROOT as unset and uses ~/.pi/worktrees", () => {
  expect(
    resolveWorktreeRoot({
      configuredRoot: undefined,
      environmentValue: "   ",
    }),
  ).toBe(FallbackWorktreeRoot);
});

test("uses PI_WORKTREE_ROOT when configuration omits worktreeRoot", () => {
  expect(
    resolveWorktreeRoot({
      configuredRoot: undefined,
      environmentValue: "/Volumes/HomeX/kento/.pi/worktrees",
    }),
  ).toBe("/Volumes/HomeX/kento/.pi/worktrees");
});

test("prefers an explicit configuration worktreeRoot over PI_WORKTREE_ROOT", () => {
  expect(
    resolveWorktreeRoot({
      configuredRoot: "/tmp/worktrees",
      environmentValue: "/Volumes/HomeX/kento/.pi/worktrees",
    }),
  ).toBe("/tmp/worktrees");
});

test("default configuration exposes the product repository fleet", () => {
  expect(DefaultRepositoryFactsConfiguration.repositories).toEqual([
    expect.objectContaining({ name: "hydra" }),
    expect.objectContaining({ name: "dashboard-v4" }),
    expect.objectContaining({ name: "conversation-center-ext" }),
    expect.objectContaining({ name: "analytics-extension" }),
    expect.objectContaining({ name: "assets-page" }),
  ]);
  expect(
    DefaultRepositoryFactsConfiguration.repositories.every(({ path }) =>
      path.startsWith("/"),
    ),
  ).toBe(true);
});
