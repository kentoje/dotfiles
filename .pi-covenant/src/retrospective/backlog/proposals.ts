import { Type } from "typebox";
import type { Static } from "typebox";

const text = Type.String({ maxLength: 4000, minLength: 1, pattern: "\\S" });
const evidence = Type.Array(text, { maxItems: 40, minItems: 1 });
const obligations = Type.Array(
  Type.String({ pattern: "^[A-Z][A-Z0-9_]*-[0-9]+$" }),
  { maxItems: 40 }
);
const properties = {
  evidence,
  proposed_behavior: text,
  related_obligations: Type.Optional(obligations),
  title: Type.String({ maxLength: 240, minLength: 1, pattern: "\\S" }),
};
export const retroProposalInput = Type.Object(properties, {
  additionalProperties: false,
});
export const retroStoredItem = Type.Object(
  {
    ...properties,
    duplicate_of: Type.Null(),
    id: Type.String({ pattern: "^HBR-[0-9]{3,9}$" }),
    related_obligations: obligations,
    state: Type.Union([
      Type.Literal("proposed"),
      Type.Literal("accepted"),
      Type.Literal("discarded"),
    ]),
  },
  { additionalProperties: false }
);

type StoredItem = Static<typeof retroStoredItem>;
export type RetroProposal = Static<typeof retroProposalInput>;
export type RetroItem = Omit<StoredItem, "duplicate_of"> & {
  duplicate_of: string | null;
};

export function normalizeRetroTitle(title: string) {
  return title.normalize("NFKC").trim().replaceAll(/\s+/gu, " ").toLowerCase();
}
export function applyRetroProposals(
  items: readonly RetroItem[],
  proposals: readonly RetroProposal[]
) {
  const entries = [...items];
  const titles = new Map(
    items.map((item) => [normalizeRetroTitle(item.title), item])
  );
  let next = Math.max(0, ...items.map(({ id }) => Number(id.slice(4)))) + 1;
  const recorded: string[] = [];
  const data = proposals.map((proposal) => {
    const key = normalizeRetroTitle(proposal.title);
    const existing = titles.get(key);
    if (existing) {
      return { ...existing, duplicate_of: existing.id };
    }
    if (next > 999_999_999) {
      throw new Error("BACKLOG_CONFLICT");
    }
    const item: RetroItem = {
      ...proposal,
      duplicate_of: null,
      id: `HBR-${String(next).padStart(3, "0")}`,
      related_obligations: proposal.related_obligations ?? [],
      state: "proposed" satisfies RetroItem["state"],
    };
    next += 1;
    entries.push(item);
    recorded.push(item.id);
    titles.set(key, item);
    return item;
  });
  return {
    data: { proposals: data, recorded_ids: recorded },
    items: recorded.length ? entries : items,
  };
}
