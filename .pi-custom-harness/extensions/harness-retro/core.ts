import { Context, Effect, Schema } from "effect";

import type { HarnessBacklogInput } from "./schema";

/** One markdown checklist item stored in the harness backlog. */
export interface HarnessBacklogItem {
  readonly title: string;
  readonly kind: "fix" | "feature";
  readonly done: boolean;
  readonly evidence: string;
  readonly proposal: string;
  readonly spec: string;
}

/** A planned heading or checkbox already present in the harness roadmap. */
export interface HarnessRoadmapReference {
  readonly kind: "heading" | "checkbox";
  readonly text: string;
}

/** Parsed contents of the backlog and the implementation roadmap. */
export interface HarnessBacklogDocuments {
  readonly backlog: string;
  readonly roadmap: string;
}

/** Result of listing existing backlog and roadmap coverage. */
export interface HarnessBacklogListResult {
  readonly action: "list";
  readonly items: ReadonlyArray<HarnessBacklogItem>;
  readonly roadmap: ReadonlyArray<HarnessRoadmapReference>;
}

/** Result of recording a new backlog checklist item. */
export interface HarnessBacklogRecordedResult {
  readonly action: "record";
  readonly status: "recorded";
  readonly item: HarnessBacklogItem;
  readonly backlog: string;
}

/** Result of refusing to copy an already listed item. */
export type HarnessBacklogExistingResult =
  | {
      readonly action: "record";
      readonly status: "existing";
      readonly source: "backlog";
      readonly item: HarnessBacklogItem;
    }
  | {
      readonly action: "record";
      readonly status: "existing";
      readonly source: "roadmap";
      readonly roadmap: HarnessRoadmapReference;
    };

export type HarnessBacklogResult =
  | HarnessBacklogListResult
  | HarnessBacklogRecordedResult
  | HarnessBacklogExistingResult;

/** A record request is missing a required field or its spec is not expect-only. */
export class HarnessBacklogValidationError extends Schema.TaggedError<HarnessBacklogValidationError>()(
  "HarnessBacklogValidationError",
  { message: Schema.String },
) {}

/** A requested docs path is not the harness backlog file. */
export class HarnessBacklogPathError extends Schema.TaggedError<HarnessBacklogPathError>()(
  "HarnessBacklogPathError",
  { message: Schema.String },
) {}

/** The backlog or roadmap file could not be read or written. */
export class HarnessBacklogFilesystemError extends Schema.TaggedError<HarnessBacklogFilesystemError>()(
  "HarnessBacklogFilesystemError",
  { message: Schema.String },
) {}

export type HarnessBacklogError =
  | HarnessBacklogValidationError
  | HarnessBacklogPathError
  | HarnessBacklogFilesystemError;

/** Filesystem seam used by the Pi-free backlog policy. */
export class HarnessBacklogFileSystemService extends Context.Service<
  HarnessBacklogFileSystemService,
  {
    readonly readDocuments: () => Effect.Effect<
      HarnessBacklogDocuments,
      HarnessBacklogFilesystemError | HarnessBacklogPathError
    >;
    readonly writeBacklog: (
      contents: string,
    ) => Effect.Effect<
      void,
      HarnessBacklogFilesystemError | HarnessBacklogPathError
    >;
  }
>()(
  "pi-custom-harness/extensions/harness-retro/HarnessBacklogFileSystemService",
) {}

const headingPattern = /^#{2,3} (.+)$/mu;
const checkboxPattern = /^- \[[ xX]\] (.+)$/mu;
const emptyBacklog = `# Harness backlog

Session-derived fixes and features for \`.pi-custom-harness\`.
This is the source of truth for work discovered during \`/harness-retro\`.
\`docs/TODO.md\` remains the implementation roadmap. Do not copy an item that is already planned there.

Each item is a markdown checkbox appended by \`harness_backlog record\`.
Recorded specs are \`describe\`/\`test\` blocks whose bodies are only \`expect\` calls. No test implementation.

## Open

## Done
`;

const bannedSpecKeywordPattern =
  /\b(?:import|export|await|async|function|class|new|const|let|var|return|throw|try|catch|finally|if|else|for|while|switch|case|default|yield|require|module|exports|Effect)\b/u;
const statementCallPattern = /(?:^|[;\n{])\s*([A-Za-z_$][\w$]*)\s*\(/gu;
const allowedStatementCalls: Record<string, true> = {
  describe: true,
  test: true,
  it: true,
  expect: true,
};
const normalizeTitle = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[`*_~]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

/** Removes surrounding Markdown fences from a recorded behavior spec. */
const unwrapHarnessBacklogSpecFence = (value: string): string => {
  const trimmed = value.trim();
  const fenced = trimmed.match(
    /^```(?:ts|typescript|js|javascript)?\r?\n([\s\S]*?)\r?\n```$/u,
  );
  return (fenced?.[1] ?? trimmed).trim();
};

/** Accepts only describe/test blocks whose bodies are expect calls, with no test implementation. */
export const validateHarnessBacklogSpec = (
  spec: string,
): Effect.Effect<string, HarnessBacklogValidationError> => {
  const unwrapped = unwrapHarnessBacklogSpecFence(spec);
  if (unwrapped.length === 0) {
    return Effect.fail(
      new HarnessBacklogValidationError({
        message: "harness_backlog record requires a describe/test spec.",
      }),
    );
  }
  const withoutComments = unwrapped
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
  if (
    !/\bdescribe\s*\(/u.test(withoutComments) ||
    !/\b(?:test|it)\s*\(/u.test(withoutComments)
  ) {
    return Effect.fail(
      new HarnessBacklogValidationError({
        message:
          "harness_backlog record spec must include describe and test blocks.",
      }),
    );
  }
  if (!/\bexpect\s*\(/u.test(withoutComments)) {
    return Effect.fail(
      new HarnessBacklogValidationError({
        message:
          "harness_backlog record spec must include expect calls that name the desired behavior.",
      }),
    );
  }
  if (/\.(?:only|skip|todo)\b/u.test(withoutComments)) {
    return Effect.fail(
      new HarnessBacklogValidationError({
        message:
          "harness_backlog record spec must not include test implementation.",
      }),
    );
  }
  const withoutStrings = withoutComments
    .replace(/`(?:\\.|[^\\`])*`/gu, '""')
    .replace(/'(?:\\.|[^\\'])*'/gu, '""')
    .replace(/"(?:\\.|[^\\"])*"/gu, '""');
  if (bannedSpecKeywordPattern.test(withoutStrings)) {
    return Effect.fail(
      new HarnessBacklogValidationError({
        message:
          "harness_backlog record spec must not include test implementation.",
      }),
    );
  }
  if (
    /=/u.test(withoutStrings.replace(/=>/gu, " ").replace(/[!=<>]=+/gu, " "))
  ) {
    return Effect.fail(
      new HarnessBacklogValidationError({
        message:
          "harness_backlog record spec must not include test implementation.",
      }),
    );
  }
  for (const match of withoutStrings.matchAll(statementCallPattern)) {
    const name = match[1];
    if (name !== undefined && allowedStatementCalls[name] !== true) {
      return Effect.fail(
        new HarnessBacklogValidationError({
          message:
            "harness_backlog record spec must not include test implementation.",
        }),
      );
    }
  }
  return Effect.succeed(unwrapped);
};

const collectIndentedFence = (
  lines: ReadonlyArray<string>,
  start: number,
): { readonly spec: string; readonly next: number } => {
  let index = start;
  while (index < lines.length && (lines[index] ?? "").trim() === "") {
    index += 1;
  }
  const open = lines[index] ?? "";
  const openMatch = open.match(
    /^(\s*)```(?:ts|typescript|js|javascript)?\s*$/u,
  );
  if (openMatch === null) {
    return { spec: "", next: index };
  }
  const indent = openMatch[1] ?? "";
  index += 1;
  const body: string[] = [];
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "```") {
      index += 1;
      break;
    }
    body.push(line.startsWith(indent) ? line.slice(indent.length) : line);
    index += 1;
  }
  return { spec: body.join("\n").trim(), next: index };
};

/** Parses markdown checklist items from the harness backlog file. */
export const parseHarnessBacklogItems = (
  contents: string,
): ReadonlyArray<HarnessBacklogItem> => {
  const items: HarnessBacklogItem[] = [];
  const lines = contents.split(/\r?\n/u);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const heading = line.match(/^- \[([ xX])\] (.+)$/u);
    if (heading === null) {
      index += 1;
      continue;
    }
    const done = heading[1] !== " ";
    const title = heading[2]?.trim() ?? "";
    index += 1;
    let kind: "fix" | "feature" | undefined;
    let evidence = "";
    let proposal = "";
    let spec = "";
    while (index < lines.length) {
      const body = lines[index] ?? "";
      if (/^- \[[ xX]\] /u.test(body) || /^## /u.test(body)) {
        break;
      }
      const field = body.match(/^\s+- (Kind|Evidence|Proposal):\s*(.*)$/u);
      if (field !== null) {
        const label = field[1];
        const value = field[2]?.trim() ?? "";
        if (label === "Kind" && (value === "fix" || value === "feature")) {
          kind = value;
        }
        if (label === "Evidence") {
          evidence = value;
        }
        if (label === "Proposal") {
          proposal = value;
        }
        index += 1;
        continue;
      }
      if (/^\s+- Spec:\s*$/u.test(body)) {
        index += 1;
        const collected = collectIndentedFence(lines, index);
        spec = collected.spec;
        index = collected.next;
        continue;
      }
      index += 1;
    }
    if (title.length === 0 || kind === undefined) {
      continue;
    }
    items.push({ title, kind, done, evidence, proposal, spec });
  }
  return items;
};

/** Parses roadmap headings and checkboxes that already plan harness work. */
export const parseHarnessRoadmapReferences = (
  contents: string,
): ReadonlyArray<HarnessRoadmapReference> => {
  const references: HarnessRoadmapReference[] = [];
  for (const line of contents.split(/\r?\n/u)) {
    const heading = line.match(headingPattern)?.[1]?.trim();
    if (heading !== undefined && heading.length > 0) {
      references.push({ kind: "heading", text: heading });
      continue;
    }
    const checkbox = line.match(checkboxPattern)?.[1]?.trim();
    if (checkbox !== undefined && checkbox.length > 0) {
      references.push({ kind: "checkbox", text: checkbox });
    }
  }
  return references;
};

const findExistingBacklogItem = (
  items: ReadonlyArray<HarnessBacklogItem>,
  title: string,
): HarnessBacklogItem | undefined => {
  const normalized = normalizeTitle(title);
  return items.find((item) => normalizeTitle(item.title) === normalized);
};

const findExistingRoadmapReference = (
  references: ReadonlyArray<HarnessRoadmapReference>,
  title: string,
): HarnessRoadmapReference | undefined => {
  const normalized = normalizeTitle(title);
  return references.find(
    (reference) => normalizeTitle(reference.text) === normalized,
  );
};

const requireRecordFields = (
  input: HarnessBacklogInput,
): Effect.Effect<
  {
    readonly title: string;
    readonly kind: "fix" | "feature";
    readonly evidence: string;
    readonly proposal: string;
    readonly spec: string;
  },
  HarnessBacklogValidationError
> =>
  Effect.gen(function* () {
    const title = input.title?.trim() ?? "";
    const evidence = input.evidence?.trim() ?? "";
    const proposal = input.proposal?.trim() ?? "";
    const kind = input.kind;
    if (title.length === 0 || evidence.length === 0 || proposal.length === 0) {
      return yield* new HarnessBacklogValidationError({
        message:
          "harness_backlog record requires title, evidence, proposal, and spec.",
      });
    }
    if (kind !== "fix" && kind !== "feature") {
      return yield* new HarnessBacklogValidationError({
        message: "harness_backlog record requires kind fix or feature.",
      });
    }
    const spec = yield* validateHarnessBacklogSpec(input.spec ?? "");
    return { title, kind, evidence, proposal, spec };
  });

const formatItem = (item: HarnessBacklogItem): string => {
  const specLines = item.spec
    .trim()
    .split("\n")
    .map((line) => `    ${line}`);
  return [
    `- [${item.done ? "x" : " "}] ${item.title}`,
    "",
    `  - Kind: ${item.kind}`,
    `  - Evidence: ${item.evidence}`,
    `  - Proposal: ${item.proposal}`,
    "  - Spec:",
    "",
    "    ```ts",
    ...specLines,
    "    ```",
    "",
  ].join("\n");
};

const appendItem = (contents: string, item: HarnessBacklogItem): string => {
  const source = contents.trim().length === 0 ? emptyBacklog : contents;
  const formatted = formatItem(item);
  const doneHeading = /^## Done\s*$/mu.exec(source);
  if (doneHeading !== null && doneHeading.index !== undefined) {
    const before = source.slice(0, doneHeading.index).replace(/\s*$/u, "\n\n");
    const after = source.slice(doneHeading.index);
    return `${before}${formatted}${after.startsWith("\n") ? after : `\n${after}`}`;
  }
  const trimmed = source.endsWith("\n") ? source : `${source}\n`;
  const separator = trimmed.endsWith("\n\n") ? "" : "\n";
  return `${trimmed}${separator}${formatted}`;
};

/** Builds the follow-up prompt injected by `/harness-retro`. */
export const makeHarnessRetroFollowUpText = (focus: string): string => {
  const focusLine =
    focus.trim().length === 0
      ? "No extra focus was provided. Use the current session."
      : `Operator focus: ${focus.trim()}`;
  return [
    "Run a harness retrospective for this session only.",
    focusLine,
    "Inspect the current conversation for harness friction: missing tools, blocked commands, extra bash, wrong paths, or broken contracts.",
    "Read `.pi-custom-harness/docs/BACKLOG.md` and `.pi-custom-harness/docs/TODO.md`, or call `harness_backlog` with action `list`.",
    "For each pain point, decide whether it is already listed as a backlog checkbox or already planned in `docs/TODO.md`.",
    "If it is already listed, report the existing checkbox title or roadmap line and do not write a twin.",
    "If it is new, call `harness_backlog` with action `record`, kind `fix` or `feature`, plus title, evidence, proposal, and spec.",
    "Record a markdown checklist item. Do not invent ticket ids or HB prefixes.",
    "The spec must be a TypeScript describe/test block whose bodies contain only expect calls that name the desired behavior.",
    "Do not write test implementation: no setup, no fixtures, no helpers, no imports, no awaits, no assignments, and no calls other than describe, test, it, and expect.",
    "Record at most three items. Do not edit `docs/TODO.md`. Do not implement the proposed harness change.",
  ].join("\n");
};

/** Lists existing backlog checklist items and roadmap coverage. */
export const listHarnessBacklog = Effect.fn("listHarnessBacklog")(function* () {
  const fileSystem = yield* HarnessBacklogFileSystemService;
  const documents = yield* fileSystem.readDocuments();
  return {
    action: "list",
    items: parseHarnessBacklogItems(documents.backlog),
    roadmap: parseHarnessRoadmapReferences(documents.roadmap),
  } satisfies HarnessBacklogListResult;
});

/** Records a new checklist item only when the title is absent from backlog and roadmap. */
export const recordHarnessBacklogItem = Effect.fn("recordHarnessBacklogItem")(
  function* (input: HarnessBacklogInput) {
    const fields = yield* requireRecordFields(input);
    const fileSystem = yield* HarnessBacklogFileSystemService;
    const documents = yield* fileSystem.readDocuments();
    const items = parseHarnessBacklogItems(documents.backlog);
    const existingItem = findExistingBacklogItem(items, fields.title);
    if (existingItem !== undefined) {
      return {
        action: "record",
        status: "existing",
        source: "backlog",
        item: existingItem,
      } satisfies HarnessBacklogExistingResult;
    }
    const existingRoadmap = findExistingRoadmapReference(
      parseHarnessRoadmapReferences(documents.roadmap),
      fields.title,
    );
    if (existingRoadmap !== undefined) {
      return {
        action: "record",
        status: "existing",
        source: "roadmap",
        roadmap: existingRoadmap,
      } satisfies HarnessBacklogExistingResult;
    }
    const item: HarnessBacklogItem = {
      title: fields.title,
      kind: fields.kind,
      done: false,
      evidence: fields.evidence,
      proposal: fields.proposal,
      spec: fields.spec,
    };
    const backlog = appendItem(documents.backlog, item);
    yield* fileSystem.writeBacklog(backlog);
    return {
      action: "record",
      status: "recorded",
      item,
      backlog,
    } satisfies HarnessBacklogRecordedResult;
  },
);

/** Executes list or record against the injected docs filesystem. */
export const runHarnessBacklog = Effect.fn("runHarnessBacklog")(function* (
  input: HarnessBacklogInput,
) {
  switch (input.action) {
    case "list":
      return yield* listHarnessBacklog();
    case "record":
      return yield* recordHarnessBacklogItem(input);
    default: {
      const _exhaustive: never = input.action;
      return _exhaustive;
    }
  }
});
