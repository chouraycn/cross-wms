import { logger } from '../../logger.js';
import type { PluginInstance, PluginManifest, PluginCapabilityKind } from './types.js';
import type { PluginStatus } from './status.js';

/**
 * 插件注册表 — 注册 / 查找 / 列表 / 状态管理
 *
 * 与 server/engine/pluginRegistry.ts 的关系：
 * - pluginRegistry.ts 是与 DB 集成的应用层单例（install/enable/disable）
 * - 本模块是纯内存注册表，跟踪当前进程内已加载的插件实例，方便 loader / lifecycle / health-checker 使用
 *
 * 通过显式 reset API 让测试可以隔离运行。
 */

/** 注册表项 */
export interface RegistryEntry {
  pluginId: string;
  manifest: PluginManifest;
  instance?: unknown;
  capabilities: PluginCapabilityKind[];
  status: PluginStatus;
  registeredAt: number;
  updatedAt: number;
}

class PluginRegistryImpl {
  private entries = new Map<string, RegistryEntry>();

  /** 注册一个插件实例 */
  register(plugin: PluginInstance): RegistryEntry {
    const existing = this.entries.get(plugin.id);
    const now = Date.now();
    const entry: RegistryEntry = {
      pluginId: plugin.id,
      manifest: plugin.manifest,
      instance: plugin.module,
      capabilities: plugin.capabilities,
      status: plugin.status,
      registeredAt: existing?.registeredAt ?? now,
      updatedAt: now,
    };
    this.entries.set(plugin.id, entry);
    logger.debug(`[Plugins:Registry] Registered ${plugin.id}`);
    return entry;
  }

  /** 仅注册 manifest（用于尚未实例化的插件） */
  registerManifest(manifest: PluginManifest, options: { capabilities?: PluginCapabilityKind[]; status?: PluginStatus } = {}): RegistryEntry {
    const now = Date.now();
    const existing = this.entries.get(manifest.id);
    const entry: RegistryEntry = {
      pluginId: manifest.id,
      manifest,
      capabilities: options.capabilities ?? [],
      status: options.status ?? 'installed',
      registeredAt: existing?.registeredAt ?? now,
      updatedAt: now,
    };
    this.entries.set(manifest.id, entry);
    logger.debug(`[Plugins:Registry] Registered manifest ${manifest.id}`);
    return entry;
  }

  /** 注销插件 */
  unregister(pluginId: string): boolean {
    const existed = this.entries.delete(pluginId);
    if (existed) {
      logger.debug(`[Plugins:Registry] Unregistered ${pluginId}`);
    }
    return existed;
  }

  /** 查找单个插件 */
  find(pluginId: string): RegistryEntry | undefined {
    return this.entries.get(pluginId);
  }

  /** 插件是否已注册 */
  has(pluginId: string): boolean {
    return this.entries.has(pluginId);
  }

  /** 列出所有已注册插件 */
  list(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /** 按状态过滤 */
  listByStatus(status: PluginStatus): RegistryEntry[] {
    return this.list().filter((e) => e.status === status);
  }

  /** 按能力过滤 */
  listByCapability(capability: PluginCapabilityKind): RegistryEntry[] {
    return this.list().filter((e) => e.capabilities.includes(capability));
  }

  /** 更新状态 */
  setStatus(pluginId: string, status: PluginStatus): boolean {
    const entry = this.entries.get(pluginId);
    if (!entry) return false;
    entry.status = status;
    entry.updatedAt = Date.now();
    return true;
  }

  /** 更新能力列表 */
  setCapabilities(pluginId: string, capabilities: PluginCapabilityKind[]): boolean {
    const entry = this.entries.get(pluginId);
    if (!entry) return false;
    entry.capabilities = [...capabilities];
    entry.updatedAt = Date.now();
    return true;
  }

  /** 更新实例 */
  setInstance(pluginId: string, instance: unknown): boolean {
    const entry = this.entries.get(pluginId);
    if (!entry) return false;
    entry.instance = instance;
    entry.updatedAt = Date.now();
    return true;
  }

  /** 更新 manifest（用于更新场景） */
  setManifest(pluginId: string, manifest: PluginManifest): boolean {
    const entry = this.entries.get(pluginId);
    if (!entry) return false;
    entry.manifest = manifest;
    entry.updatedAt = Date.now();
    return true;
  }

  /** 注册表大小 */
  size(): number {
    return this.entries.size;
  }

  /** 清空（仅用于测试） */
  clear(): void {
    this.entries.clear();
  }

  /** 导出快照（用于持久化或调试） */
  snapshot(): RegistryEntry[] {
    return this.list().map((e) => ({ ...e, capabilities: [...e.capabilities] }));
  }
}

/** 全局单例（与 pluginRegistry.ts 单例解耦） */
export const pluginRuntimeRegistry = new PluginRegistryImpl();

/** 测试辅助：返回一个全新的注册表实例 */
export function createPluginRegistry(): PluginRegistryImpl {
  return new PluginRegistryImpl();
}

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const createEmptyPluginRegistry: any = undefined as any;

// 降级类型桩：对应 openclaw 中 registry.ts 的完整类型/函数
export type PluginRecord = RegistryEntry;
export type PluginRegistry = PluginRegistryImpl;
export type PluginHttpRouteRegistration = { [key: string]: unknown };

export function normalizeAnyChannelId(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}
