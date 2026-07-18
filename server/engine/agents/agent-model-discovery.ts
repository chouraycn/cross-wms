/**
 * 移植自 openclaw/src/agents/agent-model-discovery.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type { DiscoverAuthStorageOptions } from "./agent-auth-discovery.js";
export { addEnvBackedAgentCredentials, resolveAgentCredentialsForDiscovery } from "./agent-auth-discovery.js";
export function normalizeDiscoveredAgentModel(..._args: unknown[]): unknown {
  throw new Error("normalizeDiscoveredAgentModel not implemented (openclaw stub)");
}
export function discoverAuthStorage(..._args: unknown[]): unknown {
  throw new Error("discoverAuthStorage not implemented (openclaw stub)");
}
export function discoverModels(..._args: unknown[]): unknown {
  throw new Error("discoverModels not implemented (openclaw stub)");
}
