/**
 * * Resolves plugin ids that should load during Gateway startup.
 * 移植自 openclaw/src/plugins/gateway-startup-plugin-ids.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type GatewayStartupPluginPlan = unknown;

export type MemoryEmbeddingStartupProviderSource = unknown;

export type ConfiguredMemoryEmbeddingStartupProviderOwner = unknown;

export function collectConfiguredMemoryEmbeddingStartupProviderOwners(...args: unknown[]): unknown {
  throw new Error("not implemented: collectConfiguredMemoryEmbeddingStartupProviderOwners");
}

export function collectConfiguredMemoryEmbeddingProviderIds(...args: unknown[]): unknown {
  throw new Error("not implemented: collectConfiguredMemoryEmbeddingProviderIds");
}

export function collectUnregisteredConfiguredMemoryEmbeddingProviders(...args: unknown[]): unknown {
  throw new Error("not implemented: collectUnregisteredConfiguredMemoryEmbeddingProviders");
}

export function resolveGatewayStartupMetadataPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGatewayStartupMetadataPluginIds");
}

export function createGatewayStartupMetadataPluginIdScope(...args: unknown[]): unknown {
  throw new Error("not implemented: createGatewayStartupMetadataPluginIdScope");
}

export function resolveConfigValidationMetadataPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigValidationMetadataPluginIds");
}

export function createConfigValidationMetadataPluginIdScope(...args: unknown[]): unknown {
  throw new Error("not implemented: createConfigValidationMetadataPluginIdScope");
}

export function isMetadataSnapshotScopedForGatewayStartup(...args: unknown[]): unknown {
  throw new Error("not implemented: isMetadataSnapshotScopedForGatewayStartup");
}

export function resolveChannelPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelPluginIds");
}

export function resolveChannelPluginIdsFromRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelPluginIdsFromRegistry");
}

export function resolveConfiguredDeferredChannelPluginIdsFromRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredDeferredChannelPluginIdsFromRegistry");
}

export function resolveConfiguredDeferredChannelPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredDeferredChannelPluginIds");
}

export function resolveGatewayStartupPluginPlanFromRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGatewayStartupPluginPlanFromRegistry");
}

export function resolveGatewayStartupPluginIdsFromRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGatewayStartupPluginIdsFromRegistry");
}

export function loadGatewayStartupPluginPlan(...args: unknown[]): unknown {
  throw new Error("not implemented: loadGatewayStartupPluginPlan");
}

export function resolveGatewayStartupPluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGatewayStartupPluginIds");
}

