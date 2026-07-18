// TTS provider 注册核心，维护 provider 注册表与默认 provider。
// 参考 openclaw/src/tts/provider-registry-core.ts 的规范化与别名解析思路。

/** TTS provider 描述信息。 */
export interface TtsProvider {
  /** provider 唯一标识（注册时会被规范化为小写形式）。 */
  id: string;
  /** provider 别名列表，用于 lookup 时做兼容匹配。 */
  aliases?: readonly string[];
  /** provider 展示名称。 */
  label?: string;
  /** 自动选择时的排序权重，数值越小优先级越高。 */
  autoSelectOrder?: number;
}

/** 将 provider 标识规范化为小写并去除首尾空白，空值返回 undefined。 */
function normalizeProviderId(providerId: string | undefined): string | undefined {
  if (typeof providerId !== "string") {
    return undefined;
  }
  const trimmed = providerId.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * 统一的 TTS provider 注册核心。
 * 维护 provider 注册表，支持别名解析、规范化查找与默认 provider 管理。
 */
export class TtsProviderRegistry {
  private readonly providers = new Map<string, TtsProvider>();
  private defaultProviderId: string | undefined;

  /** 注册一个 provider，相同 id 将覆盖既有条目。首次注册自动设为默认。 */
  register(provider: TtsProvider): void {
    const id = normalizeProviderId(provider.id);
    if (!id) {
      throw new Error("TTS provider id 不能为空");
    }
    const normalized: TtsProvider = { ...provider, id };
    this.providers.set(id, normalized);
    if (this.defaultProviderId === undefined) {
      this.defaultProviderId = id;
    }
  }

  /** 按名称查找 provider，支持别名匹配，未找到返回 undefined。 */
  lookup(name: string | undefined): TtsProvider | undefined {
    const normalized = normalizeProviderId(name);
    if (!normalized) {
      return undefined;
    }
    const direct = this.providers.get(normalized);
    if (direct) {
      return direct;
    }
    for (const provider of this.providers.values()) {
      if (provider.aliases?.some((alias) => normalizeProviderId(alias) === normalized)) {
        return provider;
      }
    }
    return undefined;
  }

  /** 列出所有已注册的 provider。 */
  list(): TtsProvider[] {
    return [...this.providers.values()];
  }

  /** 获取默认 provider，未设置或已被移除时返回 undefined。 */
  getDefault(): TtsProvider | undefined {
    if (this.defaultProviderId === undefined) {
      return undefined;
    }
    return this.providers.get(this.defaultProviderId);
  }

  /** 设置默认 provider，name 必须对应已注册的 provider。 */
  setDefault(name: string): void {
    const normalized = normalizeProviderId(name);
    if (!normalized || !this.providers.has(normalized)) {
      throw new Error(`TTS provider "${name ?? ""}" 未注册`);
    }
    this.defaultProviderId = normalized;
  }
}

/** 默认 TTS provider 注册表单例。 */
export const defaultTtsRegistry = new TtsProviderRegistry();
