/**
 * 移植自 openclaw/src/agents/cli-auth-epoch.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export const CLI_AUTH_EPOCH_VERSION: unknown = undefined;
export function setCliAuthEpochTestDeps(..._args: unknown[]): unknown {
  throw new Error("setCliAuthEpochTestDeps not implemented (openclaw stub)");
}
export function resetCliAuthEpochTestDeps(..._args: unknown[]): unknown {
  throw new Error("resetCliAuthEpochTestDeps not implemented (openclaw stub)");
}
export async function resolveCliAuthEpoch(..._args: unknown[]): Promise<unknown> {
  throw new Error("resolveCliAuthEpoch not implemented (openclaw stub)");
}
