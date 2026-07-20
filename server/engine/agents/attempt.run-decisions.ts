/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.run-decisions.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function resolveEmbeddedAttemptSessionWriteLockOptions(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveAttemptStreamAuthProfileId(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveUnknownToolGuardThreshold(..._args: unknown[]): unknown {
  return undefined;
}
export function shouldRunLlmOutputHooksForAttempt(..._args: unknown[]): unknown {
  return false;
}
export function resolveAttemptToolPolicyMessageProvider(..._args: unknown[]): unknown {
  return undefined;
}
