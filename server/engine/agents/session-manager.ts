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
  // Stub: session management not fully ported
}
export function migrateSessionEntries(..._args: unknown[]): unknown {
  return undefined;
}
export function parseSessionEntries(..._args: unknown[]): unknown {
  return undefined;
}
export function getLatestCompactionEntry(..._args: unknown[]): unknown {
  return undefined;
}
export function buildSessionContext(..._args: unknown[]): unknown {
  return undefined;
}
export function getDefaultSessionDir(..._args: unknown[]): unknown {
  return undefined;
}
export function loadEntriesFromFile(..._args: unknown[]): unknown {
  return undefined;
}
export function findMostRecentSession(..._args: unknown[]): unknown {
  return [];
}
