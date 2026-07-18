/**
 * 移植自 openclaw/src/agents/sessions/session-manager.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type SessionEntry = unknown;
export type FileEntry = unknown;
export type ReadonlySessionManager = unknown;
export type SessionListProgress = unknown;
export type SessionHeader = unknown;
export type NewSessionOptions = unknown;
export type SessionEntryBase = unknown;
export type SessionMessageEntry = unknown;
export type ThinkingLevelChangeEntry = unknown;
export type ModelChangeEntry = unknown;
export type CompactionEntry = unknown;
export type BranchSummaryEntry = unknown;
export type CustomEntry = unknown;
export type LabelEntry = unknown;
export type SessionInfoEntry = unknown;
export type CustomMessageEntry = unknown;
export type SessionTreeNode = unknown;
export type SessionContext = unknown;
export type SessionInfo = unknown;
export class SessionManager {
  constructor(..._args: unknown[]) { throw new Error("SessionManager not implemented (openclaw stub)"); }
}
export function migrateSessionEntries(..._args: unknown[]): unknown {
  throw new Error("migrateSessionEntries not implemented (openclaw stub)");
}
export function parseSessionEntries(..._args: unknown[]): unknown {
  throw new Error("parseSessionEntries not implemented (openclaw stub)");
}
export function getLatestCompactionEntry(..._args: unknown[]): unknown {
  throw new Error("getLatestCompactionEntry not implemented (openclaw stub)");
}
export function buildSessionContext(..._args: unknown[]): unknown {
  throw new Error("buildSessionContext not implemented (openclaw stub)");
}
export function getDefaultSessionDir(..._args: unknown[]): unknown {
  throw new Error("getDefaultSessionDir not implemented (openclaw stub)");
}
export function loadEntriesFromFile(..._args: unknown[]): unknown {
  throw new Error("loadEntriesFromFile not implemented (openclaw stub)");
}
export function findMostRecentSession(..._args: unknown[]): unknown {
  throw new Error("findMostRecentSession not implemented (openclaw stub)");
}
