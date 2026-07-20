/**
 * 移植自 openclaw/src/agents/auth-profiles/external-cli-sync.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExternalCliResolvedProfile = unknown;
export type ExternalCliAuthProfileOptions = unknown;
export function isSafeToUseExternalCliCredential(..._args: unknown[]): unknown {
  return false;
}
export function readExternalCliBootstrapCredential(..._args: unknown[]): unknown {
  return undefined;
}
export function readExternalCliFallbackCredential(..._args: unknown[]): unknown {
  return undefined;
}
export function resolveExternalCliAuthProfiles(..._args: unknown[]): unknown {
  return undefined;
}
