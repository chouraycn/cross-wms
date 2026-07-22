/**
 * Plugin SDK 运行时 — 主执行运行时
 *
 * 这是 Plugin SDK 的顶层入口，组合加载器、生命周期、沙箱、权限、事件总线，
 * 提供统一的插件执行运行时。
 *
 * 与现有 ./registry.ts 的关系：
 * - ./registry.ts 是纯内存注册表（跟踪已加载插件实例）
 * - 本文件是运行时编排器，组合所有子系统
 *
 * 设计要点：
 * - 懒加载：运行时不主动加载插件，由调用方触发
 * - 错误隔离：单个插件错误不影响其他插件
 * - 统一 API：提供 install/uninstall/enable/disable/execute 等高层接口
 */

import { logger } from '../../logger.js';
import type { PluginManifest, PluginInstance, PluginContext } from './types.js';
import { pluginRuntimeRegistry } from './registry.js';
import type { RegistryEntry } from './registry.js';
import { createPluginContext, destroyPluginContext } from './plugin-context.js';
import { executeInPluginSandbox } from './plugin-sandbox.js';
import {
  activatePlugin,
  deactivatePlugin,
  installPluginEntry,
  uninstallPluginEntry,
  updatePluginEntry,
  getPluginLifecycleState,
  isPluginActive,
  type LifecycleOperationResult,
} from './plugin-lifecycle.js';
import {
  loadPluginEntry,
  unloadPluginEntry,
  loadPluginsBatch,
  type PluginLoadResult,
  type PluginBatchLoadResult,
  type LoadPluginOptions,
} from './plugin-loader.js';
import {
  validatePluginManifest,
  normalizePluginManifest,
  assertValidManifest,
} from './plugin-manifest.js';
import {
  getPluginHealth,
  runHealthCheck,
  type HealthSnapshot,
} from './health-checker.js';
import { getGlobalEventBus } from './plugin-events.js';
import type { PluginEventBusImpl } from './plugin-events.js';
import { toPluginSdkError, PluginSdkError } from './plugin-errors.js';
import { SDK_VERSION, SDK_COMPATIBLE_RANGE } from './plugin-constants.js';

// ===================== 运行时配置 =====================

/** 运行时配置 */
export interface PluginRuntimeConfig {
  /** 是否自动启用新安装的插件 */
  autoEnable?: boolean;
  /** 是否自动授予低风险权限 */
  autoGrantLowRisk?: boolean;
  /** 允许的 fetch 域名白名单 */
  allowedDomains?: string[];
  /** 默认注册模式 */
  defaultRegistrationMode?: LoadPluginOptions['registrationMode'];
}

const DEFAULT_RUNTIME_CONFIG: Required<PluginRuntimeConfig> = {
  autoEnable: false,
  autoGrantLowRisk: true,
  allowedDomains: [],
  defaultRegistrationMode: 'full',
};

// ===================== 运行时实例 =====================

/** Plugin SDK 运行时 */
export class PluginRuntime {
  private config: Required<PluginRuntimeConfig>;
  private initialized = false;

  constructor(config: PluginRuntimeConfig = {}) {
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
  }

  /** 获取 SDK 版本 */
  getSdkVersion(): string {
    return SDK_VERSION;
  }

  /** 获取 SDK 兼容范围 */
  getSdkCompatibleRange(): string {
    return SDK_COMPATIBLE_RANGE;
  }

  /** 获取全局事件总线 */
  getEventBus(): PluginEventBusImpl {
    return getGlobalEventBus();
  }

  /** 获取运行时配置 */
  getConfig(): Readonly<Required<PluginRuntimeConfig>> {
    return { ...this.config };
  }

  /** 更新运行时配置 */
  updateConfig(updates: Partial<PluginRuntimeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ===================== 加载 =====================

  /** 加载单个插件 */
  async load(
    manifestRaw: unknown,
    installPath: string,
    options: LoadPluginOptions = {},
  ): Promise<PluginLoadResult> {
    return loadPluginEntry(manifestRaw, installPath, {
      ...options,
      registrationMode: options.registrationMode ?? this.config.defaultRegistrationMode,
    });
  }

  /** 批量加载插件 */
  async loadBatch(
    plugins: Array<{ manifest: unknown; installPath: string }>,
    options: LoadPluginOptions = {},
  ): Promise<PluginBatchLoadResult> {
    return loadPluginsBatch(plugins, {
      ...options,
      registrationMode: options.registrationMode ?? this.config.defaultRegistrationMode,
    });
  }

  /** 卸载插件 */
  async unload(pluginId: string): Promise<boolean> {
    return unloadPluginEntry(pluginId);
  }

  // ===================== 生命周期 =====================

  /** 安装插件 */
  async install(
    manifestRaw: unknown,
    config?: Record<string, unknown>,
  ): Promise<LifecycleOperationResult> {
    assertValidManifest(manifestRaw);
    const manifest = normalizePluginManifest(manifestRaw);
    return installPluginEntry(manifest, config);
  }

  /** 启用插件 */
  async activate(
    manifest: PluginManifest,
    config?: Record<string, unknown>,
  ): Promise<LifecycleOperationResult> {
    const result = await activatePlugin(manifest, config);
    return result;
  }

  /** 禁用插件 */
  async deactivate(pluginId: string): Promise<LifecycleOperationResult> {
    return deactivatePlugin(pluginId);
  }

  /** 卸载插件 */
  async uninstall(pluginId: string): Promise<LifecycleOperationResult> {
    return uninstallPluginEntry(pluginId);
  }

  /** 更新插件 */
  async update(
    manifest: PluginManifest,
    fromVersion: string,
    config?: Record<string, unknown>,
  ): Promise<LifecycleOperationResult> {
    return updatePluginEntry(manifest, fromVersion, config);
  }

  // ===================== 执行 =====================

  /** 在插件沙箱中执行函数 */
  async execute<T>(
    pluginId: string,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    const entry = pluginRuntimeRegistry.find(pluginId);
    if (!entry) {
      throw new PluginSdkError(
        `插件 ${pluginId} 未注册`,
        'PLUGIN_NOT_FOUND',
        pluginId,
      );
    }

    if (!isPluginActive(pluginId)) {
      throw new PluginSdkError(
        `插件 ${pluginId} 未启用 (当前状态: ${getPluginLifecycleState(pluginId)})`,
        'PLUGIN_NOT_ACTIVE',
        pluginId,
      );
    }

    const result = await executeInPluginSandbox(entry.manifest, fn);
    if (!result.ok) {
      throw toPluginSdkError(
        result.error ? new Error(result.error) : new Error('执行失败'),
        pluginId,
      );
    }
    return result.value as T;
  }

  /** 为插件创建上下文 */
  createContext(
    manifest: PluginManifest,
    config?: Record<string, unknown>,
  ): PluginContext {
    return createPluginContext({
      manifest,
      config,
      allowedDomains: this.config.allowedDomains.length > 0
        ? this.config.allowedDomains
        : undefined,
    });
  }

  // ===================== 查询 =====================

  /** 查找插件 */
  find(pluginId: string): RegistryEntry | undefined {
    return pluginRuntimeRegistry.find(pluginId);
  }

  /** 列出所有已注册插件 */
  list(): RegistryEntry[] {
    return pluginRuntimeRegistry.list();
  }

  /** 列出已启用的插件 */
  listActive(): RegistryEntry[] {
    return pluginRuntimeRegistry.list().filter((e) => isPluginActive(e.pluginId));
  }

  /** 获取插件健康状态 */
  getHealth(pluginId?: string) {
    if (pluginId) {
      return getPluginHealth(pluginId);
    }
    return runHealthCheck();
  }

  /** 执行健康检查 */
  runHealthCheck(): HealthSnapshot {
    return runHealthCheck();
  }

  // ===================== Manifest 工具 =====================

  /** 校验 manifest */
  validateManifest(manifest: unknown) {
    return validatePluginManifest(manifest);
  }

  /** 规范化 manifest */
  normalizeManifest(manifest: unknown): PluginManifest {
    return normalizePluginManifest(manifest);
  }

  // ===================== 清理 =====================

  /** 销毁运行时（卸载所有插件） */
  async destroy(): Promise<void> {
    const entries = pluginRuntimeRegistry.list();
    for (const entry of entries) {
      try {
        await this.unload(entry.pluginId);
      } catch (err) {
        logger.error(`[PluginRuntime] 卸载 ${entry.pluginId} 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.initialized = false;
    logger.info('[PluginRuntime] 运行时已销毁');
  }
}

// ===================== 默认运行时实例 =====================

/** 默认运行时单例 */
let defaultRuntime: PluginRuntime | null = null;

/** 获取默认运行时单例 */
export function getPluginRuntime(config?: PluginRuntimeConfig): PluginRuntime {
  if (!defaultRuntime) {
    defaultRuntime = new PluginRuntime(config);
  } else if (config) {
    defaultRuntime.updateConfig(config);
  }
  return defaultRuntime;
}

/** 重置默认运行时（用于测试） */
export function resetPluginRuntime(): void {
  if (defaultRuntime) {
    defaultRuntime.destroy().catch((err) => {
      logger.error(`[PluginRuntime] 重置时销毁失败: ${err instanceof Error ? err.message : String(err)}`);
    });
    defaultRuntime = null;
  }
}

// 重新导出常用 API
export {
  pluginRuntimeRegistry,
  type RegistryEntry,
  type PluginLoadResult,
  type PluginBatchLoadResult,
  type LoadPluginOptions,
  type LifecycleOperationResult,
  type HealthSnapshot,
};
