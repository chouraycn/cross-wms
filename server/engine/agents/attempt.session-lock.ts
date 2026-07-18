/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.session-lock.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type TrustedSessionFileSnapshot = unknown;
export type EmbeddedAttemptSessionFileOwner = unknown;
export type EmbeddedAttemptSessionLockController = unknown;
export class EmbeddedAttemptSessionTakeoverError {
  constructor(..._args: unknown[]) { throw new Error("EmbeddedAttemptSessionTakeoverError not implemented (openclaw stub)"); }
}
export function acquireEmbeddedAttemptSessionFileOwner(..._args: unknown[]): unknown {
  throw new Error("acquireEmbeddedAttemptSessionFileOwner not implemented (openclaw stub)");
}
export function resetEmbeddedAttemptSessionFileOwnersForTest(..._args: unknown[]): unknown {
  throw new Error("resetEmbeddedAttemptSessionFileOwnersForTest not implemented (openclaw stub)");
}
export function createEmbeddedAttemptSessionLockController(..._args: unknown[]): unknown {
  throw new Error("createEmbeddedAttemptSessionLockController not implemented (openclaw stub)");
}
export function installPromptSubmissionLockRelease(..._args: unknown[]): unknown {
  throw new Error("installPromptSubmissionLockRelease not implemented (openclaw stub)");
}
