// Manifest metadata registry builder for media-understanding providers without
// loading plugin runtime code.
// Ported from openclaw/src/media-understanding/manifest-metadata.ts.
// Simplified for cross-wms: removed plugin manifest dependency, provides
// builder function signature and types for future implementation.
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeMediaProviderId } from "./provider-id.js";
import type {
  MediaUnderstandingCapability,
  MediaUnderstandingDocumentModelDefaults,
  MediaUnderstandingProvider,
} from "./types.js";

type MediaUnderstandingProviderMetadata = {
  capabilities?: MediaUnderstandingCapability[];
  defaultModels?: Partial<Record<MediaUnderstandingCapability, string>>;
  autoPriority?: Partial<Record<MediaUnderstandingCapability, number>>;
  nativeDocumentInputs?: Array<"pdf">;
  documentModels?: Partial<Record<"pdf", MediaUnderstandingDocumentModelDefaults>>;
};

type MediaUnderstandingProviderWithMetadata = MediaUnderstandingProvider &
  MediaUnderstandingProviderMetadata;

type PluginManifestLike = {
  id?: string;
  contracts?: {
    mediaUnderstandingProviders?: string[];
  };
  mediaUnderstandingProviderMetadata?: Record<string, MediaUnderstandingProviderMetadata>;
};

type ManifestMetadataSnapshot = {
  plugins: PluginManifestLike[];
};

/**
 * Builds a media provider registry from trusted manifest metadata without loading plugin code.
 *
 * Cross-wms note: Full manifest loading depends on the plugin system which is
 * not yet ported. This function accepts a pre-built snapshot and validates
 * provider metadata against declared contracts.
 */
export function buildMediaUnderstandingManifestMetadataRegistry(
  snapshot?: ManifestMetadataSnapshot,
): Map<string, MediaUnderstandingProviderWithMetadata> {
  const registry = new Map<string, MediaUnderstandingProviderWithMetadata>();
  if (!snapshot?.plugins) {
    return registry;
  }
  for (const plugin of snapshot.plugins) {
    const declaredProviders = new Set(
      (plugin.contracts?.mediaUnderstandingProviders ?? []).map((providerId) =>
        normalizeMediaProviderId(providerId),
      ),
    );
    for (const [providerId, metadata] of Object.entries(
      plugin.mediaUnderstandingProviderMetadata ?? {},
    )) {
      const normalizedProviderId = normalizeMediaProviderId(providerId);
      if (!normalizedProviderId || !declaredProviders.has(normalizedProviderId)) {
        continue;
      }
      registry.set(normalizedProviderId, {
        id: normalizedProviderId,
        capabilities: metadata.capabilities,
        defaultModels: metadata.defaultModels,
        autoPriority: metadata.autoPriority,
        nativeDocumentInputs: metadata.nativeDocumentInputs,
        documentModels: metadata.documentModels,
      });
    }
  }
  return registry;
}
