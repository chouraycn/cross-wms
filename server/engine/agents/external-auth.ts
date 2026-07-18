/**
 * 移植自 openclaw/src/agents/auth-profiles/external-auth.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export function listRuntimeExternalAuthProfiles(..._args: unknown[]): unknown {
  throw new Error("listRuntimeExternalAuthProfiles not implemented (openclaw stub)");
}
export function overlayExternalAuthProfiles(..._args: unknown[]): unknown {
  throw new Error("overlayExternalAuthProfiles not implemented (openclaw stub)");
}
export function syncPersistedExternalCliAuthProfiles(..._args: unknown[]): unknown {
  throw new Error("syncPersistedExternalCliAuthProfiles not implemented (openclaw stub)");
}
export const testing_external_auth: unknown = undefined;
