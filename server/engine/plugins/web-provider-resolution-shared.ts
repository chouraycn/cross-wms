/**
 * Shares web-provider plugin resolution helpers without eager runtime imports.
 * 移植自 openclaw/src/plugins/web-provider-resolution-shared.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type WebProviderContract = unknown;

export type WebProviderConfigKey = unknown;

export type WebProviderCandidateResolution = unknown;

export function sortPluginProviders(...args: unknown[]): unknown {
  throw new Error("not implemented: sortPluginProviders");
}

export function sortPluginProvidersForAutoDetect(...args: unknown[]): unknown {
  throw new Error("not implemented: sortPluginProvidersForAutoDetect");
}

export function resolveManifestDeclaredWebProviderCandidatePluginIds(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestDeclaredWebProviderCandidatePluginIds");
}

export function resolveManifestDeclaredWebProviderCandidates(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestDeclaredWebProviderCandidates");
}

export function resolveBundledWebProviderResolutionConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledWebProviderResolutionConfig");
}

export function mapRegistryProviders(...args: unknown[]): unknown {
  throw new Error("not implemented: mapRegistryProviders");
}

