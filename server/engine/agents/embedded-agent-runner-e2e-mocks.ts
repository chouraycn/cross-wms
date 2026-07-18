/**
 * 移植自 openclaw/src/agents/test-helpers/embedded-agent-runner-e2e-mocks.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function installEmbeddedRunnerBaseE2eMocks(..._args: unknown[]): unknown {
  throw new Error("installEmbeddedRunnerBaseE2eMocks not implemented (openclaw stub)");
}
export function installEmbeddedRunnerFastRunE2eMocks(..._args: unknown[]): unknown {
  throw new Error("installEmbeddedRunnerFastRunE2eMocks not implemented (openclaw stub)");
}
export function installEmbeddedRunnerBackoffE2eMocks(..._args: unknown[]): unknown {
  throw new Error("installEmbeddedRunnerBackoffE2eMocks not implemented (openclaw stub)");
}
