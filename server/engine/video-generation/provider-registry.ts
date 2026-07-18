/**
 * Video Generation Provider Registry — 视频生成 Provider 注册表
 */

import type { VideoGenerationProvider } from "./types.js";

type ProviderWithPriority = VideoGenerationProvider & {
  _priority?: number;
};

const providers: Map<string, ProviderWithPriority> = new Map();
const aliasMap: Map<string, ProviderWithPriority> = new Map();

function normalizeId(id: string | undefined): string {
  if (!id || typeof id !== "string") return "";
  return id.trim().toLowerCase();
}

/** 注册一个视频生成 Provider */
export function registerVideoProvider(
  provider: VideoGenerationProvider,
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

  if (provider.aliases && Array.isArray(provider.aliases)) {
    for (const alias of provider.aliases) {
      const normalizedAlias = normalizeId(alias);
      if (normalizedAlias) {
        aliasMap.set(normalizedAlias, providerWithPriority);
      }
    }
  }
}

/** 注销视频生成 Provider */
export function unregisterVideoProvider(providerId: string): boolean {
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

/** 列出所有已注册 Provider */
export function listVideoProviders(): VideoGenerationProvider[] {
  return Array.from(providers.values());
}

/** 列出已配置（可用）Provider，按优先级排序 */
export function listConfiguredVideoProviders(): VideoGenerationProvider[] {
  return Array.from(providers.values())
    .filter((p) => !p.isConfigured || p.isConfigured())
    .sort((a, b) => {
      const aPriority = a._priority ?? 100;
      const bPriority = b._priority ?? 100;
      return aPriority - bPriority;
    });
}

/** 通过 id 或 alias 获取 Provider */
export function getVideoProvider(
  providerId: string | undefined,
): VideoGenerationProvider | undefined {
  const normalized = normalizeId(providerId);
  if (!normalized) return undefined;
  return aliasMap.get(normalized);
}

/** 获取默认（首个可用）Provider */
export function getDefaultVideoProvider(): VideoGenerationProvider | undefined {
  const configured = listConfiguredVideoProviders();
  return configured.length > 0 ? configured[0] : undefined;
}

/** 清空所有已注册 Provider（主要用于测试） */
export function clearVideoProviders(): void {
  providers.clear();
  aliasMap.clear();
}
