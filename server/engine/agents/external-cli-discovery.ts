/**
 * 移植自 openclaw/src/agents/auth-profiles/external-cli-discovery.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ExternalCliAuthDiscovery = unknown;
export function externalCliDiscoveryNone(..._args: unknown[]): unknown {
  return undefined;
}
export function externalCliDiscoveryScoped(..._args: unknown[]): unknown {
  return undefined;
}
export function externalCliDiscoveryForProviderAuth(..._args: unknown[]): unknown {
  return undefined;
}
export function externalCliDiscoveryForConfigStatus(..._args: unknown[]): unknown {
  return undefined;
}
export function externalCliDiscoveryForProviders(..._args: unknown[]): unknown {
  return undefined;
}
