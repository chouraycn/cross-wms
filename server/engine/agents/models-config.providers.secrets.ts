/**
 * Ported from openclaw/src/agents/models-config.providers.secrets.ts
 *
 * Provider API key and auth resolver creation.
 * Cross-wms degradation: returns no-op resolvers without secret helpers.
 */

export { normalizeApiKeyConfig, resolveMissingProviderApiKey } from "./models-config.providers.secret-helpers.js";
export type { ProviderApiKeyResolver, ProviderAuthResolver, ProviderConfig, SecretDefaults } from "./models-config.providers.secret-helpers.js";

/** Creates a provider API key resolver. */
export function createProviderApiKeyResolver(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have provider API key resolution.
  return { resolve: () => undefined };
}

/** Creates a provider auth resolver. */
export function createProviderAuthResolver(..._args: unknown[]): Record<string, unknown> {
  // Cross-wms does not have provider auth resolution.
  return { resolve: () => undefined };
}
