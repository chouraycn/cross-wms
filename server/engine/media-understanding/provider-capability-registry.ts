/**
 * Media Understanding Provider Capability Registry — 媒体能力 Provider 注册表
 *
 * 移植自 openclaw/src/media-understanding/provider-capability-registry.ts。
 * 构建 provider 能力元数据，用于过滤 shared media model entries。
 *
 * 注意：cross-wms 暂未移植完整的 plugin capability provider runtime，
 * 当前实现返回空注册表。shared media model entries 必须显式声明
 * capabilities 字段才会被识别为 active，这与 openclaw 无插件时的行为一致。
 */

import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeMediaProviderId } from "./provider-id.js";
import type {
  MediaUnderstandingCapabilityRegistry,
  MediaUnderstandingProvider,
} from "./types.js";

function mergeProviderCapabilities(
  registry: MediaUnderstandingCapabilityRegistry,
  provider: Pick<MediaUnderstandingProvider, "id" | "capabilities">,
): void {
  const normalizedKey = normalizeMediaProviderId(provider.id);
  const existing = registry.get(normalizedKey);
  registry.set(normalizedKey, {
    capabilities: provider.capabilities ?? existing?.capabilities,
  });
}

/**
 * Resolves provider ids from config that are explicitly image-capable.
 * Ported from openclaw config-provider-models.ts.
 *
 * A provider is image-capable when at least one of its declared models
 * accepts "image" in its `input` array.
 */
function resolveImageCapableConfigProviderIds(cfg?: OpenClawConfig): string[] {
  if (!cfg) {
    return [];
  }
  const models = cfg.models as Record<string, unknown> | undefined;
  const providers =
    models && typeof models === "object"
      ? (models as Record<string, unknown>).providers
      : undefined;
  if (!providers || typeof providers !== "object") {
    return [];
  }
  const providerIds: string[] = [];
  for (const [providerKey, providerCfg] of Object.entries(providers as Record<string, unknown>)) {
    if (!providerKey?.trim()) {
      continue;
    }
    if (!providerCfg || typeof providerCfg !== "object") {
      continue;
    }
    const providerModels = (providerCfg as Record<string, unknown>).models;
    if (!Array.isArray(providerModels)) {
      continue;
    }
    const hasImageCapable = providerModels.some(
      (rawModel) =>
        rawModel &&
        typeof rawModel === "object" &&
        Array.isArray((rawModel as Record<string, unknown>).input) &&
        ((rawModel as Record<string, unknown>).input as unknown[]).includes("image"),
    );
    if (hasImageCapable) {
      providerIds.push(normalizeMediaProviderId(providerKey));
    }
  }
  return providerIds;
}

/** Builds provider capability metadata used to filter shared media model entries. */
export function buildMediaUnderstandingCapabilityRegistry(
  cfg?: OpenClawConfig,
): MediaUnderstandingCapabilityRegistry {
  const registry: MediaUnderstandingCapabilityRegistry = new Map();

  // Plugin declarations own provider capability truth; cross-wms does not yet
  // register mediaUnderstandingProviders via plugin runtime, so this loop is
  // intentionally empty. When plugin capability providers are ported, restore
  // the resolvePluginCapabilityProviders() iteration here.

  for (const normalizedKey of resolveImageCapableConfigProviderIds(cfg)) {
    // Plugin declarations own provider capability truth; config auto-registration only fills gaps.
    if (!registry.has(normalizedKey)) {
      mergeProviderCapabilities(registry, {
        id: normalizedKey,
        capabilities: ["image"],
      });
    }
  }

  return registry;
}
