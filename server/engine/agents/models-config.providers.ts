/**
 * Provider-config public barrel. It centralizes provider normalization,
 * implicit discovery, policy hooks, and secret enforcement imports for
 * models-config callers.
 * Ported from openclaw/src/agents/models-config.providers.ts
 */

export { resolveImplicitProviders } from "./models-config.providers.implicit.js";
export { normalizeProviderCatalogModelsForConfig, normalizeProviders } from "./models-config.providers.normalize.js";
export { applyNativeStreamingUsageCompat } from "./models-config.providers.policy.js";
export { enforceSourceManagedProviderSecrets } from "./models-config.providers.source-managed.js";
export type { ProviderConfig } from "./models-config.providers.secrets.js";
