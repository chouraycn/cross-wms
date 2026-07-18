/**
 * 移植自 openclaw/src/agents/models-config.providers.secrets.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { normalizeApiKeyConfig, resolveMissingProviderApiKey } from "./models-config.providers.secret-helpers.js";
export type { ProviderApiKeyResolver, ProviderAuthResolver, ProviderConfig, SecretDefaults } from "./models-config.providers.secret-helpers.js";
export function createProviderApiKeyResolver(..._args: unknown[]): unknown {
  throw new Error("createProviderApiKeyResolver not implemented (openclaw stub)");
}
export function createProviderAuthResolver(..._args: unknown[]): unknown {
  throw new Error("createProviderAuthResolver not implemented (openclaw stub)");
}
