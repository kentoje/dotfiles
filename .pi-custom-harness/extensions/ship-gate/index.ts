import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type {
  ExtensionAPI,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { Effect, Exit, Layer, Option } from "effect";
import { GitService } from "../../lib/git/core";
import { GitLiveLayer } from "../../lib/git/live";
import { GitLabService } from "../../lib/gitlab/core";
import { GitLabLiveLayer } from "../../lib/gitlab/live";
import { MergeRequestService } from "../../lib/mr/core";
import { MergeRequestLiveLayer } from "../../lib/mr/live";
import { runHandler } from "../../lib/pi-bridge/core";
import { RepoMapService } from "../../lib/repo-map/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import {
  runShipGate,
  type ShipGateFacts,
  ShipGateFactsError,
  ShipGateFactsService,
  ShipGateGitService,
  type ShipGateOutcome,
  type ShipGateRuntimeState,
  shouldEvaluateShipGate,
} from "../../lib/ship-gate/core";
import { ShipGateGitLiveLayer } from "../../lib/ship-gate/live";
import { TicketService } from "../../lib/ticket/core";
import { TicketLiveLayer } from "../../lib/ticket/live";
import { SETTLEMENT_OUTCOME_CHANNEL } from "../notify-on-settle/core";

const MAX_ATTEMPTS = 3;
const STALE_EXTENSION_CONTEXT_MESSAGE =
  "This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession(), ctx.fork(), ctx.switchSession(), or ctx.reload(). For newSession, fork, and switchSession, move post-replacement work into withSession and use the ctx passed to withSession. For reload, do not use the old ctx after await ctx.reload().";

const isStaleExtensionContextError = (error: unknown): boolean =>
  error instanceof Error && error.message === STALE_EXTENSION_CONTEXT_MESSAGE;

/** Mutable session-only state owned by the Pi event boundary. */
export interface ShipGateSessionState extends ShipGateRuntimeState {
  attempt: number;
  records: ReadonlyArray<ShipGateOutcome["records"][number]>;
}
const resetShipGateSessionState = (state: ShipGateSessionState): void => {
  state.attempt = 0;
  state.editGeneration = 0;
  state.changedWorktrees = {};
  state.activeWorktree = undefined;
  state.verificationEvidence = { focusedByWorktree: {} };
  state.figmaBacked = false;
  state.visualReviewComplete = false;
  state.records = [];
};

/** Creates the initial state for one Pi session. */
export const createShipGateSessionState = (): ShipGateSessionState => ({
  attempt: 0,
  editGeneration: 0,
  changedWorktrees: {},
  activeWorktree: undefined,
  verificationEvidence: { focusedByWorktree: {} },
  figmaBacked: false,
  visualReviewComplete: false,
  records: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const textContent = (event: ToolResultEvent): string | undefined => {
  for (const item of event.content) {
    if (item.type === "text") return item.text;
  }
  return undefined;
};

export const verifyResult = (
  event: ToolResultEvent,
): { readonly ok: boolean; readonly worktree: string | undefined } => {
  if (event.isError) return { ok: false, worktree: undefined };
  const text = textContent(event);
  if (text === undefined) return { ok: false, worktree: undefined };
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed)
      ? {
          ok: parsed.ok === true,
          worktree:
            typeof parsed.worktree === "string" ? parsed.worktree : undefined,
        }
      : { ok: false, worktree: undefined };
  } catch {
    return { ok: false, worktree: undefined };
  }
};

/** Recognizes explicit ask-user approval from the rendered tool result. */
export const isVisualApprovalToolResult = (event: ToolResultEvent): boolean =>
  event.toolName === "ask_user" &&
  !event.isError &&
  /visual approval:\s*approve/iu.test(textContent(event) ?? "");

/** Recognizes human acknowledgement of the required visual review. */
export const isVisualReviewAcknowledgement = (text: string): boolean =>
  /(?:visual|figma)[\s-]+review[^\n]*(?:complete|done|approved|pass|good)|looks\s+good[^\n]*(?:visual|figma)/iu.test(
    text,
  );

const hasFigmaReference = (text: string): boolean =>
  /figma\.com\/|\bfigma[-\s]+backed\b/iu.test(text);

const fingerprintEditedFile = async (path: string): Promise<string> => {
  try {
    const content = await readFile(path);
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "missing";
  }
};

const settledFactsLayer = (
  state: ShipGateRuntimeState,
): Layer.Layer<
  ShipGateFactsService,
  never,
  | GitLabService
  | MergeRequestService
  | TicketService
  | ShipGateGitService
  | GitService
  | RepoMapService
> =>
  Layer.effect(
    ShipGateFactsService,
    Effect.gen(function* () {
      const git = yield* ShipGateGitService;
      const gitRelease = yield* GitService;
      const repoMap = yield* RepoMapService;
      const gitLab = yield* GitLabService;
      const mergeRequest = yield* MergeRequestService;
      const ticket = yield* TicketService;

      return ShipGateFactsService.of({
        factsFor: ({ cwd }): Effect.Effect<ShipGateFacts, ShipGateFactsError> =>
          Effect.gen(function* () {
            const worktree = state.activeWorktree ?? cwd;
            const commitsAheadOfBase = yield* git.commitsAheadOfBase({
              cwd: worktree,
            });
            const facts = yield* repoMap.repositoryFactsFor({ cwd: worktree });
            const releaseReadiness = yield* gitRelease.releaseReadinessFor({
              cwd: worktree,
              policy: facts.deliveryPolicy,
            });
            const currentMr =
              yield* gitLab.findOpenMergeRequestForCurrentBranch({
                cwd: worktree,
              });
            const ticketResult = yield* Effect.exit(
              ticket.current({ cwd: worktree }),
            );
            const ticketBound = Exit.isSuccess(ticketResult);
            if (Option.isNone(currentMr)) {
              return {
                worktree,
                changedWorktrees: state.changedWorktrees,
                commitsAheadOfBase,
                mergeRequestExists: false,
                unresolvedThreadCount: 0,
                ticketBound,
                verificationPolicy: facts.deliveryPolicy.verification,
                verificationEvidence: state.verificationEvidence,
                editGeneration: state.editGeneration,
                figmaBacked: state.figmaBacked,
                visualReviewComplete: state.visualReviewComplete,
                releaseReadiness,
              };
            }
            const status = yield* mergeRequest.statusFor({ cwd: worktree });
            const threads = yield* mergeRequest.threadsFor({ cwd: worktree });
            return {
              worktree,
              changedWorktrees: state.changedWorktrees,
              commitsAheadOfBase,
              mergeRequestExists: true,
              unresolvedThreadCount:
                threads.filter((thread) => !thread.resolved).length ||
                status.unresolvedCount,
              ticketBound,
              verificationPolicy: facts.deliveryPolicy.verification,
              verificationEvidence: state.verificationEvidence,
              editGeneration: state.editGeneration,
              figmaBacked: state.figmaBacked,
              visualReviewComplete: state.visualReviewComplete,
              releaseReadiness,
            };
          }).pipe(
            Effect.mapError((error) =>
              error instanceof ShipGateFactsError
                ? error
                : new ShipGateFactsError({ message: String(error) }),
            ),
          ),
      });
    }),
  );

const failureOutcome = (attempt: number, reason: string): ShipGateOutcome => ({
  kind: "blocked",
  attempts: attempt,
  blockers: [{ category: "verify", reason }],
  records: [{ attempt, blockers: [{ category: "verify", reason }] }],
  retryExhausted: attempt >= MAX_ATTEMPTS,
});

export interface ShipGateFollowUp {
  readonly message: {
    readonly customType: "ship-gate-blocked";
    readonly content: Array<{ type: "text"; text: string }>;
    readonly display: true;
    readonly details: ShipGateOutcome;
  };
  readonly options: {
    readonly deliverAs: "followUp";
    readonly triggerTurn: true;
  };
}

/** Builds the exact Pi follow-up contract for a blocked outcome. */
export const makeShipGateFollowUp = (
  outcome: ShipGateOutcome,
): ShipGateFollowUp => ({
  message: {
    customType: "ship-gate-blocked",
    content: [{ type: "text", text: JSON.stringify(outcome) }],
    display: true,
    details: outcome,
  },
  options: { deliverAs: "followUp", triggerTurn: true },
});

const sendBlockedFollowUp = (
  pi: ExtensionAPI,
  outcome: ShipGateOutcome,
): void => {
  try {
    const followUp = makeShipGateFollowUp(outcome);
    pi.sendMessage(followUp.message, followUp.options);
  } catch (error) {
    if (isStaleExtensionContextError(error)) return;
    throw error;
  }
};

const absolutePathFromToolInput = (
  input: Record<string, unknown>,
): string | undefined => {
  const path = input.path;
  return typeof path === "string" && path.startsWith("/") ? path : undefined;
};

const worktreeForEditedPath = (path: string): string | undefined => {
  const match = /^(.*\/\.pi\/worktrees\/[^/]+\/[^/]+)/u.exec(path);
  return match?.[1];
};

/** Registers the non-tool agent-settled stop gate. */
export default function registerShipGate(pi: ExtensionAPI): void {
  const state = createShipGateSessionState();
  let sessionActive = true;
  const inFlightControllers = new Set<AbortController>();

  pi.on("input", (event) => {
    if (!sessionActive) return;
    if (hasFigmaReference(event.text)) state.figmaBacked = true;
    if (isVisualReviewAcknowledgement(event.text)) {
      state.visualReviewComplete = true;
    }
  });

  pi.on("tool_call", (event) => {
    if (!sessionActive) return;
    if (event.toolName.toLowerCase().includes("figma"))
      state.figmaBacked = true;
  });

  pi.on("tool_result", async (event) => {
    if (!sessionActive) return;
    if (event.toolName === "worktree" && !event.isError) {
      const text = textContent(event);
      if (text !== undefined) {
        try {
          const parsed: unknown = JSON.parse(text);
          if (isRecord(parsed) && typeof parsed.path === "string") {
            state.activeWorktree = parsed.path;
          }
        } catch {
          // Ignore non-JSON worktree failures.
        }
      }
    }
    if (
      event.toolName === "ticket" &&
      !event.isError &&
      isRecord(event.details)
    ) {
      const binding = event.details.binding;
      if (isRecord(binding) && typeof binding.worktree === "string") {
        state.activeWorktree = binding.worktree;
      }
    }
    if (event.toolName === "edit" && !event.isError) {
      state.editGeneration += 1;
      const editedPath = absolutePathFromToolInput(event.input);
      const worktree =
        editedPath === undefined
          ? state.activeWorktree
          : (worktreeForEditedPath(editedPath) ?? state.activeWorktree);
      if (worktree !== undefined) {
        const previousFingerprint = state.changedWorktrees?.[worktree] ?? "";
        const fileFingerprint =
          editedPath === undefined
            ? String(state.editGeneration)
            : await fingerprintEditedFile(editedPath);
        state.changedWorktrees = {
          ...(state.changedWorktrees ?? {}),
          [worktree]: createHash("sha256")
            .update(previousFingerprint)
            .update(editedPath ?? "unknown")
            .update(fileFingerprint)
            .digest("hex"),
        };
      }
    }
    if (isVisualApprovalToolResult(event)) {
      state.visualReviewComplete = true;
    }
    if (event.toolName === "verify") {
      const result = verifyResult(event);
      if (result.ok && result.worktree !== undefined) {
        state.verificationEvidence = {
          ...state.verificationEvidence,
          focusedByWorktree: {
            ...(state.verificationEvidence.focusedByWorktree ?? {}),
            [result.worktree]:
              state.changedWorktrees?.[result.worktree] ??
              String(state.editGeneration),
          },
        };
      }
    }
  });

  pi.on("session_shutdown", () => {
    sessionActive = false;
    for (const controller of inFlightControllers) controller.abort();
    inFlightControllers.clear();
    resetShipGateSessionState(state);
  });

  pi.on("agent_settled", async (_event, context) => {
    try {
      if (!sessionActive || !shouldEvaluateShipGate(state)) return;
      const cwd = context.cwd;
      const parentSignal = context.signal;
      if (!sessionActive) return;

      const attempt = state.attempt + 1;
      const runtimeState: ShipGateRuntimeState = {
        editGeneration: state.editGeneration,
        changedWorktrees: state.changedWorktrees,
        activeWorktree: state.activeWorktree,
        verificationEvidence: state.verificationEvidence,
        figmaBacked: state.figmaBacked,
        visualReviewComplete: state.visualReviewComplete,
      };
      const controller = new AbortController();
      const onParentAbort = () => controller.abort();
      parentSignal?.addEventListener("abort", onParentAbort, { once: true });
      if (parentSignal?.aborted) controller.abort();
      inFlightControllers.add(controller);

      let outcome: ShipGateOutcome | { block: true; reason: string };
      try {
        outcome = await runHandler(
          runShipGate({ cwd, attempt, state: runtimeState }).pipe(
            Effect.provide(
              settledFactsLayer(runtimeState).pipe(
                Layer.provide(GitLabLiveLayer),
                Layer.provide(MergeRequestLiveLayer),
                Layer.provide(TicketLiveLayer),
                Layer.provide(ShipGateGitLiveLayer),
                Layer.provide(GitLiveLayer),
                Layer.provide(RepoMapLiveLayer),
              ),
            ),
          ),
          {
            signal: controller.signal,
            failurePrefix: "Ship gate",
          },
        );
      } finally {
        inFlightControllers.delete(controller);
        parentSignal?.removeEventListener("abort", onParentAbort);
      }

      if (!sessionActive) return;
      const resolved =
        "block" in outcome ? failureOutcome(attempt, outcome.reason) : outcome;
      if (resolved.kind === "blocked") {
        pi.events.emit(SETTLEMENT_OUTCOME_CHANNEL, {
          sessionId: context.sessionManager.getSessionId(),
          outcome: "ship-gate-failed",
          failureId: `ship-gate-attempt-${attempt}`,
          message: resolved.blockers.map(({ reason }) => reason).join(" "),
        });
      }
      state.records = [...state.records, ...resolved.records];
      if (
        sessionActive &&
        resolved.kind === "blocked" &&
        !resolved.retryExhausted
      ) {
        sendBlockedFollowUp(pi, { ...resolved, records: state.records });
      }
    } catch (error) {
      if (isStaleExtensionContextError(error)) return;
      throw error;
    }
  });
}
