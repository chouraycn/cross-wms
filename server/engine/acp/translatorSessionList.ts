/**
 * ACP Translator Session List
 * 会话列表 - 分页游标和辅助函数
 *
 * 参考 openclaw/src/acp/translator.session-list.ts 设计
 */

import path from "node:path";

const ACP_LIST_SESSIONS_DEFAULT_PAGE_SIZE = 100;
const ACP_LIST_SESSIONS_MAX_PAGE_SIZE = 100;
const ACP_LIST_SESSIONS_MAX_CURSOR_OFFSET = 10_000;

export const ACP_LIST_SESSIONS_MAX_FETCH_LIMIT =
  ACP_LIST_SESSIONS_MAX_CURSOR_OFFSET + ACP_LIST_SESSIONS_MAX_PAGE_SIZE + 1;

export type ListSessionsCursor = {
  offset: number;
  cwd?: string;
};

export function encodeListSessionsCursor(cursor: ListSessionsCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor }), "utf8").toString("base64url");
}

export function decodeListSessionsCursor(value: string | null | undefined): ListSessionsCursor {
  if (!value) {
    return { offset: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid ACP session list cursor.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid ACP session list cursor.");
  }
  const record = parsed as Record<string, unknown>;
  if (record.v !== 1) {
    throw new Error("Unsupported ACP session list cursor.");
  }
  if (
    typeof record.offset !== "number" ||
    !Number.isInteger(record.offset) ||
    record.offset < 0 ||
    record.offset > ACP_LIST_SESSIONS_MAX_CURSOR_OFFSET
  ) {
    throw new Error("Invalid ACP session list cursor offset.");
  }
  const cwd = typeof record.cwd === "string" && record.cwd.trim() ? record.cwd.trim() : undefined;
  return {
    offset: record.offset,
    ...(cwd ? { cwd } : {}),
  };
}

export function assertAbsoluteCwd(cwd: string, method: string): void {
  if (!path.isAbsolute(cwd)) {
    throw new Error(`ACP ${method} requires an absolute cwd.`);
  }
}

export function resolveListSessionsPageSize(
  meta: Record<string, unknown> | null | undefined,
): number {
  const requested = meta ? readNumber(meta, ["limit", "pageSize"]) : undefined;
  if (requested === undefined) {
    return ACP_LIST_SESSIONS_DEFAULT_PAGE_SIZE;
  }
  return Math.min(ACP_LIST_SESSIONS_MAX_PAGE_SIZE, Math.max(1, Math.floor(requested)));
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}