/**
 * Media Provider Registry — 媒体 Provider 注册表
 *
 * 管理多模态 Provider 和 OCR Provider 的注册与查找。
 */

import type { OpenClawConfig } from "../config/types.openclaw.js";
import { describeImageWithModel, describeImagesWithModel } from "./image.js";
import { normalizeMediaProviderId } from "./provider-id.js";
import type {
  MediaUnderstandingProvider,
  MultimodalProvider,
  OcrProvider,
} from "./types.js";

export type ProviderRegistry = {
  multimodal: Map<string, MultimodalProvider>;
  ocr: Map<string, OcrProvider>;
};

export function createProviderRegistry(): ProviderRegistry {
  return {
    multimodal: new Map(),
    ocr: new Map(),
  };
}

export function registerMultimodalProvider(
  registry: ProviderRegistry,
  provider: MultimodalProvider,
): void {
  const key = normalizeMediaProviderId(provider.id);
  registry.multimodal.set(key, provider);
}

export function registerOcrProvider(
  registry: ProviderRegistry,
  provider: OcrProvider,
): void {
  const key = normalizeMediaProviderId(provider.id);
  registry.ocr.set(key, provider);
}

export function findProviderForCapability(
  registry: ProviderRegistry,
  capability: string,
  preferredId?: string,
): MultimodalProvider | undefined {
  if (preferredId) {
    const key = normalizeMediaProviderId(preferredId);
    const provider = registry.multimodal.get(key);
    if (provider && provider.capabilities.includes(capability as never)) {
      return provider;
    }
  }
  for (const provider of registry.multimodal.values()) {
    if (provider.capabilities.includes(capability as never)) {
      return provider;
    }
  }
  return undefined;
}

export function findOcrProvider(
  registry: ProviderRegistry,
  preferredId?: string,
): OcrProvider | undefined {
  if (preferredId) {
    const key = normalizeMediaProviderId(preferredId);
    return registry.ocr.get(key);
  }
  return registry.ocr.values().next().value;
}

export function getMultimodalProvider(
  registry: ProviderRegistry,
  id: string,
): MultimodalProvider | undefined {
  return registry.multimodal.get(normalizeMediaProviderId(id));
}

export function getOcrProvider(
  registry: ProviderRegistry,
  id: string,
): OcrProvider | undefined {
  return registry.ocr.get(normalizeMediaProviderId(id));
}

export function unregisterMultimodalProvider(
  registry: ProviderRegistry,
  id: string,
): boolean {
  return registry.multimodal.delete(normalizeMediaProviderId(id));
}

export function unregisterOcrProvider(
  registry: ProviderRegistry,
  id: string,
): boolean {
  return registry.ocr.delete(normalizeMediaProviderId(id));
}

export function findProvidersByCapability(
  registry: ProviderRegistry,
  capability: string,
): MultimodalProvider[] {
  const result: MultimodalProvider[] = [];
  for (const provider of registry.multimodal.values()) {
    if (provider.capabilities.includes(capability as never)) {
      result.push(provider);
    }
  }
  return result;
}

export { normalizeMediaExecutionProviderId, normalizeMediaProviderId } from "./provider-id.js";

function mergeProviderIntoRegistry(
  registry: Map<string, MediaUnderstandingProvider>,
  provider: MediaUnderstandingProvider,
  registryKey = provider.id,
) {
  const normalizedKey = normalizeMediaProviderId(registryKey);
  const existing = registry.get(normalizedKey);
  const merged = existing
    ? {
        ...existing,
        ...provider,
        capabilities: provider.capabilities ?? existing.capabilities,
        defaultModels: provider.defaultModels ?? existing.defaultModels,
        autoPriority: provider.autoPriority ?? existing.autoPriority,
        nativeDocumentInputs: provider.nativeDocumentInputs ?? existing.nativeDocumentInputs,
        documentModels: provider.documentModels ?? existing.documentModels,
      }
    : provider;
  registry.set(normalizedKey, hydrateModelBackedMediaProvider(merged));
}

function hydrateModelBackedMediaProvider(
  provider: MediaUnderstandingProvider,
): MediaUnderstandingProvider {
  if (!provider.capabilities?.includes("image")) {
    return provider;
  }
  if (provider.describeImage && provider.describeImages) {
    return provider;
  }
  return {
    ...provider,
    describeImage: provider.describeImage ?? describeImageWithModel,
    describeImages: provider.describeImages ?? describeImagesWithModel,
  };
}

export function buildMediaUnderstandingRegistry(
  overrides?: Record<string, MediaUnderstandingProvider>,
  cfg?: OpenClawConfig,
): Map<string, MediaUnderstandingProvider> {
  const registry = new Map<string, MediaUnderstandingProvider>();
  if (overrides) {
    for (const [key, provider] of Object.entries(overrides)) {
      mergeProviderIntoRegistry(registry, provider, key);
    }
  }
  return registry;
}

export function getMediaUnderstandingProvider(
  id: string,
  registry: Map<string, MediaUnderstandingProvider>,
): MediaUnderstandingProvider | undefined {
  return registry.get(normalizeMediaProviderId(id));
}
