/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/helpers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type RuntimeAuthState = unknown;
export function resolveOverloadFailoverBackoffMs(..._args: unknown[]): unknown {
  throw new Error("resolveOverloadFailoverBackoffMs not implemented (openclaw stub)");
}
export function resolveOverloadProfileRotationLimit(..._args: unknown[]): unknown {
  throw new Error("resolveOverloadProfileRotationLimit not implemented (openclaw stub)");
}
export function resolveRateLimitProfileRotationLimit(..._args: unknown[]): unknown {
  throw new Error("resolveRateLimitProfileRotationLimit not implemented (openclaw stub)");
}
export function resolveSameModelRateLimitRetryDelayMs(..._args: unknown[]): unknown {
  throw new Error("resolveSameModelRateLimitRetryDelayMs not implemented (openclaw stub)");
}
export function resolveNextSameModelRateLimitRetryCount(..._args: unknown[]): unknown {
  throw new Error("resolveNextSameModelRateLimitRetryCount not implemented (openclaw stub)");
}
export function scrubAnthropicRefusalMagic(..._args: unknown[]): unknown {
  throw new Error("scrubAnthropicRefusalMagic not implemented (openclaw stub)");
}
export function createCompactionDiagId(..._args: unknown[]): unknown {
  throw new Error("createCompactionDiagId not implemented (openclaw stub)");
}
export function resolveMaxRunRetryIterations(..._args: unknown[]): unknown {
  throw new Error("resolveMaxRunRetryIterations not implemented (openclaw stub)");
}
export function resolveActiveErrorContext(..._args: unknown[]): unknown {
  throw new Error("resolveActiveErrorContext not implemented (openclaw stub)");
}
export function isAssistantForModelRef(..._args: unknown[]): unknown {
  throw new Error("isAssistantForModelRef not implemented (openclaw stub)");
}
export function resolveReportedModelRef(..._args: unknown[]): unknown {
  throw new Error("resolveReportedModelRef not implemented (openclaw stub)");
}
export function buildUsageAgentMetaFields(..._args: unknown[]): unknown {
  throw new Error("buildUsageAgentMetaFields not implemented (openclaw stub)");
}
export function buildErrorAgentMeta(..._args: unknown[]): unknown {
  throw new Error("buildErrorAgentMeta not implemented (openclaw stub)");
}
export function resolveFinalAssistantVisibleText(..._args: unknown[]): unknown {
  throw new Error("resolveFinalAssistantVisibleText not implemented (openclaw stub)");
}
export function resolveFinalAssistantRawText(..._args: unknown[]): unknown {
  throw new Error("resolveFinalAssistantRawText not implemented (openclaw stub)");
}
export const RUNTIME_AUTH_REFRESH_MARGIN_MS: unknown = undefined;
export const RUNTIME_AUTH_REFRESH_RETRY_MS: unknown = undefined;
export const RUNTIME_AUTH_REFRESH_MIN_DELAY_MS: unknown = undefined;
export const MAX_SAME_MODEL_RATE_LIMIT_RETRIES: unknown = undefined;
