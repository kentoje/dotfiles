import { Type } from "typebox";
import type { Static } from "typebox";
import { Value } from "typebox/value";

import type {
  MrContext,
  MrIdentity,
  MrSelector,
} from "../../mr/module-port.js";

const branch = Type.String({
  maxLength: 255,
  minLength: 1,
  pattern: "^[A-Za-z0-9][A-Za-z0-9/_.-]*$",
});
const createInput = Type.Object(
  {
    cwd: Type.Optional(Type.String({ minLength: 1 })),
    repository: Type.Optional(Type.String({ minLength: 1 })),
    source_branch: branch,
    target_branch: branch,
    title: Type.String({ maxLength: 255, minLength: 1, pattern: "\\S" }),
  },
  { additionalProperties: false }
);
export type MrCreationInput = Static<typeof createInput>;
export interface MrDeliveryPolicy {
  titlePrefix?: string;
  changedPathPrefix?: string;
  commitSubjectPattern?: string;
}
interface MrGuardStatus {
  context: MrContext;
  data: { selection: string; merge_request: MrIdentity | null } | null;
  error: { code: string; details?: object } | null;
  status: string;
}
export interface MrGuardHost {
  checkPolicyOnReuse?: boolean;
  status: (
    selector: Omit<MrSelector, "iid">,
    branch: string,
    signal?: AbortSignal
  ) => Promise<MrGuardStatus>;
  policy?: (
    repository: string
  ) => MrDeliveryPolicy | undefined | Promise<MrDeliveryPolicy | undefined>;
  branchEvidence?: (
    request: MrCreationInput,
    signal?: AbortSignal
  ) => Promise<{
    changed_paths: readonly string[];
    commit_subjects: readonly string[];
  }>;
}
function isMrCandidate(value: unknown): value is MrIdentity {
  return (
    value !== null &&
    typeof value === "object" &&
    "iid" in value &&
    typeof value.iid === "number" &&
    Number.isSafeInteger(value.iid) &&
    value.iid > 0 &&
    "source_branch" in value &&
    typeof value.source_branch === "string" &&
    "head_sha" in value &&
    typeof value.head_sha === "string"
  );
}
function guardResult(
  context: MrContext,
  decision: "allow" | "reuse_existing" | "blocked",
  existing_mrs: readonly MrIdentity[] = [],
  code?: string,
  expected_title: string | null = null
) {
  return {
    completed_effects: [],
    context,
    data: {
      blockers: code ? [code] : [],
      decision,
      existing_mrs,
      expected_title,
    },
    error: code
      ? {
          code,
          message: `MR creation guard: ${code}`,
          phase: "preflight",
          retryable: false,
        }
      : null,
    status: code ? "blocked" : "ok",
    warnings: [],
  };
}
async function checkDeliveryPolicy(
  host: MrGuardHost,
  request: MrCreationInput,
  policy: MrDeliveryPolicy | undefined,
  context: MrContext,
  signal?: AbortSignal
) {
  const title = policy?.titlePrefix;
  if (title && !request.title.startsWith(title)) {
    return guardResult(
      context,
      "blocked",
      [],
      "TITLE_POLICY_FAILED",
      title + request.title
    );
  }
  const changed = policy?.changedPathPrefix;
  const subjects = policy?.commitSubjectPattern;
  if (changed || subjects) {
    try {
      signal?.throwIfAborted();
      const evidence = await host.branchEvidence?.(request, signal);
      const pattern = subjects ? new RegExp(subjects, "u") : null;
      if (
        !evidence ||
        (changed &&
          !evidence.changed_paths.some((path) => path.startsWith(changed))) ||
        (pattern &&
          (!evidence.commit_subjects.length ||
            evidence.commit_subjects.some((subject) => !pattern.test(subject))))
      ) {
        return guardResult(
          context,
          "blocked",
          [],
          "DELIVERY_REQUIREMENT_FAILED"
        );
      }
    } catch {
      return guardResult(context, "blocked", [], "DELIVERY_REQUIREMENT_FAILED");
    }
  }
  return signal?.aborted
    ? guardResult(context, "blocked", [], "CANCELLED")
    : guardResult(context, "allow");
}

function decideExistingMr(
  result: MrGuardStatus,
  source_branch: string,
  target_branch: string
) {
  const { context } = result;
  const candidates = result.error?.details;
  if (result.error?.code === "AMBIGUOUS_MR") {
    const matches =
      candidates &&
      "candidates" in candidates &&
      Array.isArray(candidates.candidates)
        ? candidates.candidates.filter(isMrCandidate)
        : [];
    return guardResult(
      context,
      "blocked",
      matches,
      "DUPLICATE_OR_AMBIGUOUS_MR"
    );
  }
  if (
    result.status !== "ok" ||
    !result.data ||
    !context.host ||
    !context.repository
  ) {
    return guardResult(context, "blocked", [], "LOOKUP_FAILED");
  }
  const existing = result.data.merge_request;
  if (existing) {
    if (
      existing.source_branch === source_branch &&
      existing.target_branch === target_branch
    ) {
      return guardResult(context, "reuse_existing", [existing]);
    }
    return guardResult(
      context,
      "blocked",
      [existing],
      "DUPLICATE_OR_AMBIGUOUS_MR"
    );
  }
  if (result.data.selection !== "absent") {
    return guardResult(context, "blocked", [], "LOOKUP_FAILED");
  }
  return null;
}

export function makeMrCreationGuard(host: MrGuardHost) {
  return {
    async check_creation(input: unknown, signal?: AbortSignal) {
      if (
        !Value.Check(createInput, input) ||
        input.source_branch === input.target_branch
      ) {
        return guardResult({}, "blocked", [], "CREATION_CONTEXT_UNKNOWN");
      }
      const { cwd, repository, source_branch, target_branch } = input;
      let context: MrContext = {};
      try {
        signal?.throwIfAborted();
        const result = await host.status(
          { ...(cwd ? { cwd } : {}), ...(repository ? { repository } : {}) },
          source_branch,
          signal
        );
        ({ context } = result);
        signal?.throwIfAborted();
        const early = decideExistingMr(result, source_branch, target_branch);
        if (
          early &&
          (early.data.decision !== "reuse_existing" || !host.checkPolicyOnReuse)
        ) {
          return early;
        }
        const policy = await host.policy?.(
          `https://${context.host}/${context.repository}`
        );
        const evaluated = await checkDeliveryPolicy(
          host,
          input,
          policy,
          context,
          signal
        );
        return evaluated.data.decision === "allow" && early ? early : evaluated;
      } catch {
        return guardResult(
          context,
          "blocked",
          [],
          signal?.aborted ? "CANCELLED" : "LOOKUP_FAILED"
        );
      }
    },
  };
}
