/**
 * Unified Provider Registry — 统一模型提供商注册中心
 *
 * 解决 cross-wms 三套并行 Provider 系统的隐式耦合问题：
 *   - modelProviderRegistry：内置模型目录（ProviderInfo 元数据）
 *   - adapters/registry：API 适配器（按 ModelApiType 注册工厂）
 *   - modelsStore：用户模型配置（DB-backed）
 *
 * 这三者通过字符串 ID 隐式耦合，inferApiType() 用字符串匹配兜底。
 * 本注册中心提供：
 *   1. 显式 binding：ProviderDescriptor 一处声明 apiType + compat + endpoint
 *   2. 统一入口：register() 同时更新 modelProviderRegistry 和 adapters/registry
 *   3. 声明式描述：复用 AdapterCompatConfig 作为 provider 能力描述
 *   4. 惰性实例化 + 生命周期管理（参考 EmbeddingProviderRegistry）
 *
 * 设计原则：渐进式增强，不破坏现有 API。
 *   - 现有代码继续使用 modelProviderRegistry.getAllProviders() 等接口
 *   - 新代码通过 getUnifiedProviderRegistry() 注册和查询
 *   - register() 会自动桥接到旧注册表
 */

import { logger } from '../../logger.js';
import type { AdapterCompatConfig, ModelApiType, AdapterFactory } from '../../adapters/types.js';
import {
  registerAdapter,
  getAdapter,
  hasAdapter,
  inferApiType,
} from '../../adapters/registry.js';
import {
  registerProvider as registerModelProvider,
  unregisterProvider as unregisterModelProvider,
  getProviderById as getModelProviderById,
} from '../modelProviderRegistry.js';
import type { ProviderInfo } from '../modelCatalog.js';

// ===================== 核心类型 =====================

/**
 * Provider 描述符 — 声明式的 provider 描述
 *
 * 这是 P0-2 的核心资产，将原本散落在三处的信息合并为一处声明：
 *   1. 元数据（id, displayName, description, categories）
 *   2. API 绑定（apiType, adapterFactory?, endpoint）
 *   3. 能力声明（compat: AdapterCompatConfig）
 *   4. 认证（apiKeyEnvVar, requiresOAuth）
 */
export interface ProviderDescriptor {
  /** Provider 唯一 ID（如 'anthropic', 'openai', 'deepseek'） */
  id: string;
  /** 显示名 */
  displayName: string;
  /** 描述 */
  description?: string;
  /** 分类（如 'international', 'chinese', 'local'） */
  categories?: string[];

  // --- API 绑定 ---
  /** API 类型（显式声明，替代 inferApiType 启发式推断） */
  apiType: ModelApiType;
  /** 适配器工厂（可选；不提供则使用 apiType 对应的内置适配器） */
  adapterFactory?: AdapterFactory;
  /** 默认 API endpoint */
  defaultEndpoint?: string;

  // --- 能力声明 ---
  /** Provider 兼容性配置（复用 AdapterCompatConfig） */
  compat?: AdapterCompatConfig;

  // --- 认证 ---
  /** API Key 环境变量名 */
  apiKeyEnvVar?: string;
  /** 是否需要 OAuth 登录 */
  requiresOAuth?: boolean;
  /** 认证模式 */
  authMode?: 'api-key' | 'aws-sdk' | 'oauth' | 'token' | 'none';

  // --- 元数据 ---
  /** 是否本地部署 */
  isLocal?: boolean;
  /** 网站 */
  website?: string;
  /** 图标 URL 或标识 */
  icon?: string;

  // --- 注册选项 ---
  /** 是否内置（内置 provider 不可注销） */
  builtin?: boolean;
  /** 优先级（数字越大优先级越高，用于默认 provider 选择） */
  priority?: number;
}

/** Provider 运行时实例 */
interface ProviderRuntime {
  descriptor: ProviderDescriptor;
  /** 是否已激活（adapter 已注册） */
  activated: boolean;
  /** 注册时间 */
  registeredAt: number;
  /** 最后使用时间 */
  lastUsedAt?: number;
  /** 调用次数 */
  invokeCount: number;
}

/** Provider 注册中心统计 */
export interface ProviderRegistryStats {
  total: number;
  activated: number;
  builtin: number;
  custom: number;
  byApiType: Record<ModelApiType, number>;
  byCategory: Record<string, number>;
  totalInvokes: number;
}

// ===================== 统一注册中心 =====================

/**
 * 统一 Provider 注册中心
 *
 * 全局单例，通过 getUnifiedProviderRegistry() 获取。
 */
export class UnifiedProviderRegistry {
  private static instance: UnifiedProviderRegistry | null = null;

  /** Provider 运行时实例（id → runtime） */
  private runtimes: Map<string, ProviderRuntime> = new Map();

  /** 默认 provider ID */
  private defaultProviderId: string | null = null;

  private constructor() {}

  /** 获取单例 */
  static getInstance(): UnifiedProviderRegistry {
    if (!UnifiedProviderRegistry.instance) {
      UnifiedProviderRegistry.instance = new UnifiedProviderRegistry();
    }
    return UnifiedProviderRegistry.instance;
  }

  /** 重置单例（仅供测试） */
  static resetInstance(): void {
    UnifiedProviderRegistry.instance = null;
  }

  // ===================== 注册与注销 =====================

  /**
   * 注册 Provider — 声明式注册，自动桥接到旧注册表
   *
   * @param descriptor - Provider 描述符
   * @param options - 注册选项
   * @returns 是否注册成功
   */
  register(
    descriptor: ProviderDescriptor,
    options: { isDefault?: boolean; activate?: boolean } = {},
  ): boolean {
    const { isDefault = false, activate = true } = options;

    // 校验
    if (!descriptor.id || !descriptor.displayName) {
      logger.error('[UnifiedProviderRegistry] Missing required fields: id or displayName');
      return false;
    }

    if (this.runtimes.has(descriptor.id)) {
      logger.warn(`[UnifiedProviderRegistry] Provider ${descriptor.id} already registered, overriding`);
    }

    // 注册到运行时
    const runtime: ProviderRuntime = {
      descriptor,
      activated: false,
      registeredAt: Date.now(),
      invokeCount: 0,
    };
    this.runtimes.set(descriptor.id, runtime);

    // 桥接 1：注册 adapter factory（如果提供了自定义工厂）
    if (descriptor.adapterFactory) {
      registerAdapter(descriptor.apiType, descriptor.adapterFactory);
      logger.debug(
        `[UnifiedProviderRegistry] Bridged adapter for ${descriptor.id} (apiType=${descriptor.apiType})`,
      );
    }

    // 桥接 2：注册到 modelProviderRegistry（转换为 ProviderInfo）
    const providerInfo = this.descriptorToProviderInfo(descriptor);
    if (providerInfo) {
      registerModelProvider(providerInfo);
      logger.debug(
        `[UnifiedProviderRegistry] Bridged modelProviderRegistry for ${descriptor.id}`,
      );
    }

    // 激活（默认 true）
    if (activate) {
      runtime.activated = true;
    }

    // 设置默认
    if (isDefault || (!this.defaultProviderId && descriptor.priority !== undefined)) {
      this.defaultProviderId = descriptor.id;
    } else if (!this.defaultProviderId) {
      this.defaultProviderId = descriptor.id;
    }

    logger.info(
      `[UnifiedProviderRegistry] Registered provider: ${descriptor.id} (apiType=${descriptor.apiType}, builtin=${descriptor.builtin ?? false})`,
    );
    return true;
  }

  /**
   * 注销 Provider
   */
  unregister(id: string): boolean {
    const runtime = this.runtimes.get(id);
    if (!runtime) return false;

    if (runtime.descriptor.builtin) {
      logger.warn(`[UnifiedProviderRegistry] Cannot unregister builtin provider: ${id}`);
      return false;
    }

    // 从 modelProviderRegistry 注销
    unregisterModelProvider(id);

    // 从运行时移除
    this.runtimes.delete(id);

    // 重置默认
    if (this.defaultProviderId === id) {
      const remaining = Array.from(this.runtimes.values()).sort(
        (a, b) => (b.descriptor.priority ?? 0) - (a.descriptor.priority ?? 0),
      );
      this.defaultProviderId = remaining[0]?.descriptor.id ?? null;
    }

    logger.info(`[UnifiedProviderRegistry] Unregistered provider: ${id}`);
    return true;
  }

  /** 检查 provider 是否已注册 */
  has(id: string): boolean {
    return this.runtimes.has(id);
  }

  /** 获取 provider 描述符 */
  getDescriptor(id: string): ProviderDescriptor | undefined {
    return this.runtimes.get(id)?.descriptor;
  }

  /** 获取所有 provider 描述符 */
  getAllDescriptors(): ProviderDescriptor[] {
    return Array.from(this.runtimes.values()).map((r) => r.descriptor);
  }

  /** 获取所有已激活的 provider 描述符 */
  getActiveDescriptors(): ProviderDescriptor[] {
    return Array.from(this.runtimes.values())
      .filter((r) => r.activated)
      .map((r) => r.descriptor);
  }

  // ===================== 查询与解析 =====================

  /**
   * 获取 adapter 实例 — 显式 binding，替代 inferApiType 启发式
   *
   * @param id - Provider ID
   * @returns adapter 实例或 null
   */
  getAdapter(id: string): ReturnType<typeof getAdapter> {
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      logger.warn(`[UnifiedProviderRegistry] Provider not found: ${id}`);
      return null;
    }

    const apiType = runtime.descriptor.apiType;
    if (!hasAdapter(apiType)) {
      logger.error(
        `[UnifiedProviderRegistry] No adapter registered for apiType=${apiType} (provider=${id})`,
      );
      return null;
    }

    runtime.lastUsedAt = Date.now();
    runtime.invokeCount++;
    return getAdapter(apiType);
  }

  /**
   * 解析 provider 的 API 类型 — 显式查找，替代 inferApiType 字符串匹配
   *
   * @param id - Provider ID
   * @returns ModelApiType 或 null（如果 provider 未注册）
   */
  resolveApiType(id: string): ModelApiType | null {
    const runtime = this.runtimes.get(id);
    return runtime?.descriptor.apiType ?? null;
  }

  /**
   * 获取 provider 的 compat 配置
   */
  getCompat(id: string): AdapterCompatConfig | undefined {
    return this.runtimes.get(id)?.descriptor.compat;
  }

  /**
   * 获取默认 provider ID
   */
  getDefaultProviderId(): string | null {
    return this.defaultProviderId;
  }

  /**
   * 设置默认 provider
   */
  setDefaultProvider(id: string): boolean {
    if (!this.runtimes.has(id)) {
      logger.warn(`[UnifiedProviderRegistry] Cannot set default to unknown provider: ${id}`);
      return false;
    }
    this.defaultProviderId = id;
    logger.info(`[UnifiedProviderRegistry] Default provider set to: ${id}`);
    return true;
  }

  // ===================== 分类查询 =====================

  /** 按分类获取 providers */
  getByCategory(category: string): ProviderDescriptor[] {
    return this.getAllDescriptors().filter((d) => d.categories?.includes(category));
  }

  /** 获取本地 providers */
  getLocalProviders(): ProviderDescriptor[] {
    return this.getAllDescriptors().filter((d) => d.isLocal);
  }

  /** 获取需要 OAuth 的 providers */
  getOAuthProviders(): ProviderDescriptor[] {
    return this.getAllDescriptors().filter((d) => d.requiresOAuth);
  }

  // ===================== 统计 =====================

  /** 获取注册中心统计 */
  getStats(): ProviderRegistryStats {
    const stats: ProviderRegistryStats = {
      total: this.runtimes.size,
      activated: 0,
      builtin: 0,
      custom: 0,
      byApiType: {
        'openai-chat': 0,
        'openai-completions': 0,
        'anthropic-messages': 0,
        'google-generative-ai': 0,
      },
      byCategory: {},
      totalInvokes: 0,
    };

    for (const runtime of this.runtimes.values()) {
      if (runtime.activated) stats.activated++;
      if (runtime.descriptor.builtin) stats.builtin++;
      else stats.custom++;

      stats.byApiType[runtime.descriptor.apiType]++;
      stats.totalInvokes += runtime.invokeCount;

      for (const cat of runtime.descriptor.categories ?? []) {
        stats.byCategory[cat] = (stats.byCategory[cat] ?? 0) + 1;
      }
    }

    return stats;
  }

  /** 获取健康状态 */
  getHealth(): { total: number; activated: number; withAdapter: number } {
    let withAdapter = 0;
    let activated = 0;
    for (const runtime of this.runtimes.values()) {
      if (runtime.activated) activated++;
      if (hasAdapter(runtime.descriptor.apiType)) withAdapter++;
    }
    return { total: this.runtimes.size, activated, withAdapter };
  }

  // ===================== 内部实现 =====================

  /**
   * 将 ProviderDescriptor 转换为 ProviderInfo（用于桥接 modelProviderRegistry）
   *
   * 注意：ProviderInfo 的字段与 ProviderDescriptor 不完全一致，
   * 此处只做最小映射，保留现有 ProviderInfo 的 models 列表。
   */
  private descriptorToProviderInfo(descriptor: ProviderDescriptor): ProviderInfo | null {
    // 从现有 modelProviderRegistry 获取已有的 ProviderInfo（保留 models 列表）
    const existing = getModelProviderById(descriptor.id);
    if (existing) {
      // 合并：保留现有 models/baseUrl/authType，更新可变元数据
      return {
        ...existing,
        name: descriptor.displayName,
        description: descriptor.description ?? existing.description,
        categories: (descriptor.categories as ProviderInfo['categories']) ?? existing.categories,
        isLocal: descriptor.isLocal ?? existing.isLocal,
        icon: descriptor.icon ?? existing.icon,
      };
    }

    // 全新 provider，创建最小 ProviderInfo
    // 注意：models 列表为空，需要通过 model catalog API 单独注册
    // baseUrl 和 authType 使用默认值，后续可通过 catalog API 更新
    return {
      id: descriptor.id as ProviderInfo['id'],
      name: descriptor.displayName,
      baseUrl: descriptor.defaultEndpoint ?? '',
      authType: descriptor.authMode === 'none' ? 'none' : 'api-key',
      models: [],
      categories: (descriptor.categories as ProviderInfo['categories']) ?? [],
      isLocal: descriptor.isLocal ?? false,
      description: descriptor.description ?? '',
      icon: descriptor.icon,
    } as ProviderInfo;
  }
}

// ===================== 便捷导出 =====================

/** 获取全局统一 Provider 注册中心单例 */
export function getUnifiedProviderRegistry(): UnifiedProviderRegistry {
  return UnifiedProviderRegistry.getInstance();
}

/**
 * 显式解析 provider 的 API 类型 — 替代 inferApiType 的字符串匹配
 *
 * 优先从 UnifiedProviderRegistry 显式查找，
 * 找不到时回退到 inferApiType（保持向后兼容）。
 *
 * @param provider - Provider ID 或名称
 * @param apiEndpoint - 可选 endpoint（仅 fallback 时使用）
 */
export function resolveApiTypeExplicitly(
  provider?: string,
  apiEndpoint?: string,
): ModelApiType {
  if (provider) {
    const registry = getUnifiedProviderRegistry();
    const explicit = registry.resolveApiType(provider);
    if (explicit) {
      return explicit;
    }
  }

  // 回退到 inferApiType（保持向后兼容）
  return inferApiType(provider, apiEndpoint);
}
