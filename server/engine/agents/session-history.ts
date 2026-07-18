/**
 * 移植自 openclaw/src/agents/cli-runner/session-history.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveAutoCliSessionReseedHistoryChars(..._args: unknown[]): unknown {
  throw new Error("resolveAutoCliSessionReseedHistoryChars not implemented (openclaw stub)");
}
export function buildCliSessionHistoryPrompt(..._args: unknown[]): unknown {
  throw new Error("buildCliSessionHistoryPrompt not implemented (openclaw stub)");
}
export function hasCliSessionTranscript(..._args: unknown[]): unknown {
  throw new Error("hasCliSessionTranscript not implemented (openclaw stub)");
}
export function loadCliSessionHistoryMessages(..._args: unknown[]): unknown {
  throw new Error("loadCliSessionHistoryMessages not implemented (openclaw stub)");
}
export function loadCliSessionContextEngineMessages(..._args: unknown[]): unknown {
  throw new Error("loadCliSessionContextEngineMessages not implemented (openclaw stub)");
}
export function loadCliSessionReseedMessages(..._args: unknown[]): unknown {
  throw new Error("loadCliSessionReseedMessages not implemented (openclaw stub)");
}
export const MAX_CLI_SESSION_HISTORY_FILE_BYTES: unknown = undefined;
export const MAX_CLI_SESSION_HISTORY_MESSAGES: unknown = undefined;
export const MAX_CLI_SESSION_RESEED_HISTORY_CHARS: unknown = undefined;
export const MAX_AUTO_CLI_SESSION_RESEED_HISTORY_CHARS: unknown = undefined;
