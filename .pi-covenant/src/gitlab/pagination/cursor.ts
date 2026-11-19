import { createHash } from "node:crypto";

import { Schema } from "effect";

import type { GitlabWireResult } from "../transport/ports.js";

const collection = Schema.decodeUnknownSync(Schema.Array(Schema.Unknown));

function cursorDigest(identity: readonly unknown[], projectId: number) {
  return createHash("sha256")
    .update(JSON.stringify([identity, projectId]))
    .digest("hex");
}
function parseGitlabCursor(cursor: string, identity: readonly unknown[]) {
  const parts =
    /^v1\.(?<project>[1-9][0-9]{0,15})\.(?<digest>[a-f0-9]{64})\.(?<page>[1-9][0-9]{0,15})$/u.exec(
      cursor
    )?.groups;
  const projectId = Number(parts?.project);
  const page = Number(parts?.page);
  if (
    !Number.isSafeInteger(projectId) ||
    !Number.isSafeInteger(page) ||
    page < 2 ||
    parts?.digest !== cursorDigest(identity, projectId)
  ) {
    throw new Error("INVALID_CURSOR");
  }
  return { page, projectId };
}
/** Reject stale target paths and mismatched filters before a credential or HTTP request. */
export function validateGitlabCursor(
  cursor: string | undefined,
  identity: readonly unknown[]
) {
  if (cursor !== undefined) {
    parseGitlabCursor(cursor, identity);
  }
}
/** Bind the verified numeric project identity as well as the path and full query. */
export function gitlabPageQuery(
  cursor: string | undefined,
  identity: readonly unknown[],
  projectId: number
) {
  const parsed =
    cursor === undefined ? null : parseGitlabCursor(cursor, identity);
  if (parsed && parsed.projectId !== projectId) {
    throw new Error("INVALID_CURSOR");
  }
  const digest = cursorDigest(identity, projectId);
  return {
    cursorFor: (next: number) => `v1.${projectId}.${digest}.${next}`,
    page: parsed?.page ?? 1,
  };
}

/** A page is complete only with consistent provider continuation evidence. */
export function decodeGitlabPage(
  wire: Extract<GitlabWireResult, { kind: "ok" }>,
  page: number,
  pageSize: number
) {
  const { pagination } = wire;
  const rows = collection(wire.body);
  if (
    !pagination ||
    rows.length > pageSize ||
    (pagination.page !== null && pagination.page !== String(page)) ||
    (pagination.perPage !== null && pagination.perPage !== String(pageSize))
  ) {
    throw new Error("INCOMPLETE_PAGINATION");
  }
  if (
    pagination.next !== null &&
    !/^(?:[1-9][0-9]*)?$/u.test(pagination.next)
  ) {
    throw new Error("INCOMPLETE_PAGINATION");
  }
  const next =
    pagination.next === null ? pagination.linkNext : Number(pagination.next);
  if (pagination.next === null && pagination.linkNext === null) {
    throw new Error("INCOMPLETE_PAGINATION");
  }
  if (
    (next !== 0 && (!Number.isSafeInteger(next) || next !== page + 1)) ||
    (pagination.linkNext !== null && pagination.linkNext !== next)
  ) {
    throw new Error("INCOMPLETE_PAGINATION");
  }
  return { next: next || null, rows };
}
