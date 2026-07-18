/**
 * 移植自 openclaw/src/agents/embedded-agent-helpers/bootstrap.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function stripThoughtSignatures(..._args: unknown[]): unknown {
  throw new Error("stripThoughtSignatures not implemented (openclaw stub)");
}
export function resolveBootstrapMaxChars(..._args: unknown[]): unknown {
  throw new Error("resolveBootstrapMaxChars not implemented (openclaw stub)");
}
export function resolveBootstrapTotalMaxChars(..._args: unknown[]): unknown {
  throw new Error("resolveBootstrapTotalMaxChars not implemented (openclaw stub)");
}
export function resolveBootstrapPromptTruncationWarningMode(..._args: unknown[]): unknown {
  throw new Error("resolveBootstrapPromptTruncationWarningMode not implemented (openclaw stub)");
}
export function ensureSessionHeader(..._args: unknown[]): unknown {
  throw new Error("ensureSessionHeader not implemented (openclaw stub)");
}
export function buildBootstrapContextFiles(..._args: unknown[]): unknown {
  throw new Error("buildBootstrapContextFiles not implemented (openclaw stub)");
}
export function sanitizeGoogleTurnOrdering(..._args: unknown[]): unknown {
  throw new Error("sanitizeGoogleTurnOrdering not implemented (openclaw stub)");
}
export const DEFAULT_BOOTSTRAP_MAX_CHARS: unknown = undefined;
export const DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS: unknown = undefined;
export const DEFAULT_BOOTSTRAP_PROMPT_TRUNCATION_WARNING_MODE: unknown = undefined;
