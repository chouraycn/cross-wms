/**
 * 移植自 openclaw/src/agents/cli-runner/execute.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function setCliRunnerExecuteTestDeps(..._args: unknown[]): unknown {
  throw new Error("setCliRunnerExecuteTestDeps not implemented (openclaw stub)");
}
export function buildCliExecLogLine(..._args: unknown[]): unknown {
  throw new Error("buildCliExecLogLine not implemented (openclaw stub)");
}
export function buildCliEnvAuthLog(..._args: unknown[]): unknown {
  throw new Error("buildCliEnvAuthLog not implemented (openclaw stub)");
}
export function executePreparedCliRun(..._args: unknown[]): unknown {
  throw new Error("executePreparedCliRun not implemented (openclaw stub)");
}
