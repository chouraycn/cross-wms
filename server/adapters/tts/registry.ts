/**
 * TTS Provider 注册表 — 可插拔语音合成适配器的发现与加载中心。
 *
 * 镜像 server/adapters/registry.ts 的惰性加载机制：内置 Provider 仅在首次
 * getTtsProvider 时通过动态 import() 加载，避免启动时全量导入。外部注册的
 * 同步工厂仍被支持。注册表键为 TTSProviderId，支持通过别名解析。
 */

import type {
  ITTSProvider,
  TTSProviderFactory,
  TTSProviderId,
} from './types.js';
import { logger } from '../../logger.js';

/** 注册项：同步工厂 或 惰性加载器（返回工厂的 Promise）。 */
type ProviderFactoryLoader = TTSProviderFactory | (() => Promise<TTSProviderFactory>);

/** Provider 注册表 — 存储 providerId → 加载器。 */
const providerRegistry = new Map<TTSProviderId, ProviderFactoryLoader>();

/** 别名表 — alias → canonical providerId。 */
const aliasRegistry = new Map<string, TTSProviderId>();

/** 已加载的工厂缓存（避免重复动态 import）。 */
const factoryCache = new Map<TTSProviderId, TTSProviderFactory>();

/** 进行中的动态 import Promise（防止并发重复加载）。 */
const loadingPromises = new Map<TTSProviderId, Promise<TTSProviderFactory>>();

/** 已实例化的 Provider 缓存（单例，元数据只读可安全复用）。 */
const instanceCache = new Map<TTSProviderId, ITTSProvider>();

/**
 * 规范化 Provider 标识：将别名解析为 canonical id，未知值原样返回。
 */
export function normalizeProviderId(id: string): TTSProviderId | undefined {
  const trimmed = id?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (providerRegistry.has(trimmed as TTSProviderId)) {
    return trimmed as TTSProviderId;
  }
  return aliasRegistry.get(trimmed);
}

/**
 * 注册 TTS Provider。
 *
 * @param providerId - Provider 标识
 * @param loader - 同步工厂函数 或 返回工厂的惰性加载器
 * @param aliases - 可选别名列表（如 'azure-openai' → 'openai'）
 */
export function registerTtsProvider(
  providerId: TTSProviderId,
  loader: ProviderFactoryLoader,
  aliases?: string[],
): void {
  providerRegistry.set(providerId, loader);
  factoryCache.delete(providerId);
  loadingPromises.delete(providerId);
  instanceCache.delete(providerId);
  if (aliases) {
    for (const alias of aliases) {
      aliasRegistry.set(alias.trim().toLowerCase(), providerId);
    }
  }
  logger.info(`[TtsRegistry] 已注册 Provider: ${providerId}`);
}

/**
 * 获取 Provider 实例（惰性加载 + 单例缓存）。
 *
 * 内置 Provider 首次调用会动态 import 对应模块并缓存工厂；
 * 外部注册的同步工厂每次注册后缓存首个实例复用。
 */
export async function getTtsProvider(
  providerId: TTSProviderId | string,
): Promise<ITTSProvider | null> {
  const canonicalId = normalizeProviderId(String(providerId));
  if (!canonicalId) {
    logger.error(`[TtsRegistry] 未找到 Provider: ${providerId}`);
    return null;
  }

  // 命中实例缓存
  const cachedInstance = instanceCache.get(canonicalId);
  if (cachedInstance) return cachedInstance;

  // 命中工厂缓存
  const cachedFactory = factoryCache.get(canonicalId);
  if (cachedFactory) {
    const instance = cachedFactory();
    instanceCache.set(canonicalId, instance);
    return instance;
  }

  const loader = providerRegistry.get(canonicalId);
  if (!loader) {
    logger.error(`[TtsRegistry] 未找到 Provider: ${canonicalId}`);
    return null;
  }

  const result = loader();

  // 惰性加载器返回 Promise<TTSProviderFactory>
  if (result instanceof Promise) {
    // 复用进行中的加载，避免并发重复 import
    let loadingPromise = loadingPromises.get(canonicalId);
    if (!loadingPromise) {
      loadingPromise = result;
      loadingPromises.set(canonicalId, loadingPromise);
    }

    try {
      const factory = await loadingPromise;
      factoryCache.set(canonicalId, factory);
      const instance = factory();
      instanceCache.set(canonicalId, instance);
      return instance;
    } catch (err) {
      logger.error(`[TtsRegistry] 加载 Provider ${canonicalId} 失败:`, err);
      return null;
    } finally {
      loadingPromises.delete(canonicalId);
    }
  }

  // 同步工厂直接创建实例
  const instance = result;
  instanceCache.set(canonicalId, instance);
  return instance;
}

/**
 * 检查 Provider 是否已注册。
 */
export function hasTtsProvider(providerId: string): boolean {
  return normalizeProviderId(providerId) !== undefined;
}

/**
 * 列出所有已注册 Provider 的标识（canonical id）。
 */
export function listTtsProviderIds(): TTSProviderId[] {
  return Array.from(providerRegistry.keys());
}

/**
 * 列出所有已注册 Provider 的静态元数据（不触发动态 import，仅用同步工厂缓存）。
 *
 * 用于 UI 选择器等轻量场景：优先返回已缓存实例的元数据；未加载的 Provider
 * 返回其 id 与 label 占位，label 在首次加载后补全。调用方若需完整元数据，
 * 应先 await getTtsProvider。
 */
export function listTtsProviderMetadata(): Array<
  Pick<ITTSProvider, 'id' | 'label'> & { configured?: boolean }
> {
  const ids = listTtsProviderIds();
  return ids.map((id) => {
    const instance = instanceCache.get(id);
    if (instance) {
      return { id: instance.id, label: instance.label };
    }
    return { id, label: id };
  });
}

/**
 * 清空注册表与缓存（仅用于测试隔离）。
 */
export function resetTtsRegistry(): void {
  providerRegistry.clear();
  aliasRegistry.clear();
  factoryCache.clear();
  loadingPromises.clear();
  instanceCache.clear();
}
