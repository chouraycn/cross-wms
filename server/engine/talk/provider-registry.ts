/**
 * Talk provider registry stores realtime voice provider factories.
 *
 * 自包含实现，参考 openclaw/src/talk/provider-registry.ts。
 * 用本地内存注册表替代 openclaw 的插件能力运行时，并内置国内语音 provider 别名。
 */
import {
  DOMESTIC_REALTIME_VOICE_PROVIDER_ALIASES,
  type RealtimeVoiceProviderId,
  type RealtimeVoiceProviderPlugin,
  type TalkRuntimeConfig,
} from "./provider-types.js";

/** 规范化 provider id：去空白、转小写。 */
export function normalizeRealtimeVoiceProviderId(
  providerId: string | undefined,
): RealtimeVoiceProviderId | undefined {
  if (typeof providerId !== "string") {
    return undefined;
  }
  const normalized = providerId.trim().toLowerCase();
  return normalized || undefined;
}

// ============================================================================
// 模块级内存注册表
// ============================================================================

const registry = new Map<string, RealtimeVoiceProviderPlugin>();

/** 国内 provider 别名 → 标准 id 的反查映射（含中文别名）。 */
const domesticAliasToId = new Map<string, string>();
for (const [canonicalId, aliases] of Object.entries(DOMESTIC_REALTIME_VOICE_PROVIDER_ALIASES)) {
  for (const alias of aliases) {
    domesticAliasToId.set(alias.trim().toLowerCase(), canonicalId);
  }
  // 标准 id 本身也作为别名
  domesticAliasToId.set(canonicalId, canonicalId);
}

/** 将 provider id 或别名解析为标准 id（仅对国内 provider 已知别名生效）。 */
export function canonicalizeDomesticProviderAlias(
  providerId: string | undefined,
): string | undefined {
  const normalized = normalizeRealtimeVoiceProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  return domesticAliasToId.get(normalized) ?? normalized;
}

/** 注册一个 realtime voice provider 到全局注册表。 */
export function registerRealtimeVoiceProvider(
  provider: RealtimeVoiceProviderPlugin,
): void {
  const id = normalizeRealtimeVoiceProviderId(provider.id);
  if (!id) {
    throw new Error("Realtime voice provider id is required");
  }
  registry.set(id, { ...provider, id });
}

/** 注销一个 realtime voice provider。 */
export function unregisterRealtimeVoiceProvider(providerId: string | undefined): void {
  const id = normalizeRealtimeVoiceProviderId(providerId);
  if (!id) {
    return;
  }
  registry.delete(id);
}

/** 清空注册表（主要供测试使用）。 */
export function clearRealtimeVoiceProviderRegistry(): void {
  registry.clear();
}

/** 构建 canonical 与 alias 反查映射。 */
function buildProviderMaps(): {
  canonical: Map<string, RealtimeVoiceProviderPlugin>;
  aliases: Map<string, RealtimeVoiceProviderPlugin>;
} {
  const canonical = new Map<string, RealtimeVoiceProviderPlugin>();
  const aliases = new Map<string, RealtimeVoiceProviderPlugin>();
  for (const provider of registry.values()) {
    canonical.set(provider.id, provider);
    for (const alias of provider.aliases ?? []) {
      const normalizedAlias = normalizeRealtimeVoiceProviderId(alias);
      if (normalizedAlias && !aliases.has(normalizedAlias)) {
        aliases.set(normalizedAlias, provider);
      }
    }
    // 国内 provider 别名也注册到 aliases
    const domesticAliases = DOMESTIC_REALTIME_VOICE_PROVIDER_ALIASES[
      provider.id as keyof typeof DOMESTIC_REALTIME_VOICE_PROVIDER_ALIASES
    ];
    if (domesticAliases) {
      for (const alias of domesticAliases) {
        const normalizedAlias = alias.trim().toLowerCase();
        if (normalizedAlias && !aliases.has(normalizedAlias)) {
          aliases.set(normalizedAlias, provider);
        }
      }
    }
  }
  return { canonical, aliases };
}

/**
 * Lists canonical realtime voice provider plugins in registry order.
 */
export function listRealtimeVoiceProviders(
  _cfg?: TalkRuntimeConfig,
): RealtimeVoiceProviderPlugin[] {
  return [...registry.values()];
}

/**
 * Resolves a realtime voice provider by canonical id or declared alias.
 */
export function getRealtimeVoiceProvider(
  providerId: string | undefined,
  _cfg?: TalkRuntimeConfig,
): RealtimeVoiceProviderPlugin | undefined {
  const normalized = normalizeRealtimeVoiceProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  // 先按国内别名反查标准 id
  const domesticCanonical = domesticAliasToId.get(normalized);
  if (domesticCanonical && registry.has(domesticCanonical)) {
    return registry.get(domesticCanonical);
  }
  // 直接按标准 id 查找
  const direct = registry.get(normalized);
  if (direct) {
    return direct;
  }
  // 再按声明的别名查找
  return buildProviderMaps().aliases.get(normalized);
}

/**
 * Converts a realtime voice provider id or alias into the canonical provider id when known.
 */
export function canonicalizeRealtimeVoiceProviderId(
  providerId: string | undefined,
  cfg?: TalkRuntimeConfig,
): RealtimeVoiceProviderId | undefined {
  const normalized = normalizeRealtimeVoiceProviderId(providerId);
  if (!normalized) {
    return undefined;
  }
  // Unknown ids stay normalized so validation can report the same operator-facing value.
  return getRealtimeVoiceProvider(normalized, cfg)?.id ?? normalized;
}
