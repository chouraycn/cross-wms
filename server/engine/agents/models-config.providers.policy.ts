/**
 * 移植自 openclaw/src/agents/models-config.providers.policy.ts
 *
 * Applies provider plugin policy to configured model provider settings.
 * cross-wms 简化实现：提供基本的策略应用接口，默认为透传。
 */

export type ProviderConfig = Record<string, unknown>;

/** Applies native-streaming usage compatibility policy to the provider map. */
export function applyNativeStreamingUsageCompat(
  providers: Record<string, ProviderConfig>,
): Record<string, ProviderConfig> {
  // Simplified: return providers as-is (no streaming policy in cross-wms)
  return providers;
}

/** Normalizes a provider config according to provider-specific runtime policy. */
export function normalizeProviderSpecificConfig(
  _providerKey: string,
  provider: ProviderConfig,
): ProviderConfig {
  // Simplified: return provider as-is (no provider-specific policy in cross-wms)
  return provider;
}

/** Resolves a provider-specific API key env lookup policy when one exists. */
export function resolveProviderConfigApiKeyResolver(
  _providerKey: string,
  _provider?: ProviderConfig,
): ((env: NodeJS.ProcessEnv) => string | undefined) | undefined {
  // Simplified: no provider-specific API key resolver in cross-wms
  return undefined;
}
