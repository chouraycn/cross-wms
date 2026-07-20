/**
 * 移植自 openclaw/src/agents/models-config.providers.policy.runtime.ts
 *
 * Runtime-policy bridge for provider config normalization. These helpers
 * apply identity-only defaults in cross-wms since the plugin hooks
 * infrastructure is not available.
 */

/** Apply provider native-streaming usage compatibility policy — identity in cross-wms. */
export function applyProviderNativeStreamingUsagePolicy(
  _providerKey: string,
  provider: Record<string, unknown>,
): Record<string, unknown> {
  // cross-wms does not have plugin runtime hooks; return provider unchanged.
  return provider;
}

/** Normalize provider config through any already-available plugin policy hook — identity in cross-wms. */
export function normalizeProviderConfigPolicy(
  _providerKey: string,
  provider: Record<string, unknown>,
): Record<string, unknown> {
  // cross-wms does not have plugin runtime hooks; return provider unchanged.
  return provider;
}

/** Resolve a provider API-key policy function — returns undefined in cross-wms. */
export function resolveProviderConfigApiKeyPolicy(
  _providerKey: string,
  _provider?: Record<string, unknown>,
): ((env: NodeJS.ProcessEnv) => string | undefined) | undefined {
  // cross-wms does not have plugin runtime hooks; no API key policy available.
  return undefined;
}
