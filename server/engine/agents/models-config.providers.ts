/**
 * 移植自 openclaw/src/agents/models-config.providers.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export { resolveImplicitProviders } from "./models-config.providers.implicit.js";
export { normalizeProviderCatalogModelsForConfig, normalizeProviders } from "./models-config.providers.normalize.js";
export { applyNativeStreamingUsageCompat } from "./models-config.providers.policy.js";
export { enforceSourceManagedProviderSecrets } from "./models-config.providers.source-managed.js";
export type { ProviderConfig } from "./models-config.providers.secrets.js";
