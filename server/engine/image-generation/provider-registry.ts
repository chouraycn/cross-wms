/**
 * Registry for image-generation providers.
 *
 * 移植自 openclaw/src/image-generation/provider-registry.ts
 *
 * Providers can be registered programmatically and are resolved by
 * canonical id or alias.
 */

import type { ImageGenerationProvider } from "./types.js";

type ProviderWithPriority = ImageGenerationProvider & {
  _priority?: number;
};

const providers: Map<string, ProviderWithPriority> = new Map();
const aliasMap: Map<string, ProviderWithPriority> = new Map();

function normalizeId(id: string | undefined): string {
  if (!id || typeof id !== "string") return "";
  return id.trim().toLowerCase();
}

/**
 * Register an image-generation provider.
 * @param provider - Provider instance
 * @param priority - Priority (lower number = higher priority, default 100)
 */
export function registerImageGenerationProvider(
  provider: ImageGenerationProvider,
  priority: number = 100,
): void {
  const canonicalId = normalizeId(provider.id);
  if (!canonicalId) {
    throw new Error("Provider id is required");
  }

  const providerWithPriority = provider as ProviderWithPriority;
  providerWithPriority._priority = priority;

  providers.set(canonicalId, providerWithPriority);
  aliasMap.set(canonicalId, providerWithPriority);

  // Register aliases
  if (provider.aliases && Array.isArray(provider.aliases)) {
    for (const alias of provider.aliases) {
      const normalizedAlias = normalizeId(alias);
      if (normalizedAlias) {
        aliasMap.set(normalizedAlias, providerWithPriority);
      }
    }
  }
}

/**
 * Unregister an image-generation provider by id.
 */
export function unregisterImageGenerationProvider(providerId: string): boolean {
  const normalized = normalizeId(providerId);
  const provider = providers.get(normalized);
  if (!provider) return false;

  providers.delete(normalized);
  aliasMap.delete(normalized);

  if (provider.aliases) {
    for (const alias of provider.aliases) {
      const normalizedAlias = normalizeId(alias);
      if (normalizedAlias && aliasMap.get(normalizedAlias) === provider) {
        aliasMap.delete(normalizedAlias);
      }
    }
  }

  return true;
}

/**
 * List all registered providers.
 */
export function listImageGenerationProviders(): ImageGenerationProvider[] {
  return Array.from(providers.values());
}

/**
 * List configured (available) providers, sorted by priority (lower number = higher priority).
 */
export function listConfiguredImageGenerationProviders(): ImageGenerationProvider[] {
  return Array.from(providers.values())
    .filter((p) => !p.isConfigured || p.isConfigured())
    .sort((a, b) => {
      const aPriority = a._priority ?? 100;
      const bPriority = b._priority ?? 100;
      return aPriority - bPriority;
    });
}

/**
 * Get a provider by canonical id or alias.
 */
export function getImageGenerationProvider(
  providerId: string | undefined,
): ImageGenerationProvider | undefined {
  const normalized = normalizeId(providerId);
  if (!normalized) return undefined;
  return aliasMap.get(normalized);
}

/**
 * Get the default (first available) provider.
 */
export function getDefaultImageGenerationProvider(): ImageGenerationProvider | undefined {
  const configured = listConfiguredImageGenerationProviders();
  return configured.length > 0 ? configured[0] : undefined;
}
