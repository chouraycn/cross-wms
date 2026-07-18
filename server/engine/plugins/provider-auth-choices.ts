/**
 * Builds provider auth choice lists from plugin setup metadata.
 * 移植自 openclaw/src/plugins/provider-auth-choices.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type ProviderAuthChoiceMetadata = unknown;

export type ProviderOnboardAuthFlag = unknown;

export function resolveManifestProviderAuthChoices(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestProviderAuthChoices");
}

export function resolveManifestProviderAuthChoice(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestProviderAuthChoice");
}

export function resolveManifestProviderApiKeyChoice(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestProviderApiKeyChoice");
}

export function resolveManifestDeprecatedProviderAuthChoice(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestDeprecatedProviderAuthChoice");
}

export function resolveManifestProviderOnboardAuthFlags(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveManifestProviderOnboardAuthFlags");
}

export function resolveProviderOnboardAuthFlags(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveProviderOnboardAuthFlags");
}

