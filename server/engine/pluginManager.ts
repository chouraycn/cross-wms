/**
 * Plugin Manager — 插件管理器（增强版）
 *
 * v4.1: 在 pluginRegistry 基础上提供更完善的插件管理能力：
 * - 运行时加载/卸载插件
 * - 插件生命周期管理（install/activate/deactivate/uninstall）
 * - 插件依赖管理
 * - 插件配置管理
 * - 插件事件系统
 * - 插件健康检查
 * - 插件热重载
 */

import { pluginRegistry } from './pluginRegistry.js';
import { 
  listPlugins, 
  getPlugin, 
  getPluginByName,
  getPluginConfig, 
  setPluginConfig,
  updatePlugin,
} from '../dao/plugins.js';
import type { PluginRow } from '../db.js';
import type { PluginManifest } from '../../shared/pluginManifest.js';
import { EventEmitter } from 'events';
import { logger } from '../logger.js';

// ===================== Types =====================

interface ExtendedPluginManifest extends PluginManifest {
  dependencies?: Array<string | { name: string; version?: string; optional?: boolean }>;
  configSchema?: Record<string, unknown>;
  provides?: string[];
}

export type PluginLifecycleStatus = 
  | 'installed' 
  | 'activating' 
  | 'active' 
  | 'deactivating' 
  | 'inactive' 
  | 'error' 
  | 'uninstalling';

export interface PluginDependency {
  name: string;
  version?: string;
  optional?: boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  displayName: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  status: PluginLifecycleStatus;
  dependencies: PluginDependency[];
  provides: string[];
  configSchema: Record<string, unknown> | null;
  config: Record<string, unknown>;
  installedAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface PluginManagerStats {
  total: number;
  active: number;
  inactive: number;
  error: number;
  installed: number;
  totalTools: number;
  startTime: number;
}

type PluginEventName = 
  | 'plugin:installing'
  | 'plugin:installed'
  | 'plugin:install:error'
  | 'plugin:activating'
  | 'plugin:active'
  | 'plugin:activate:error'
  | 'plugin:deactivating'
  | 'plugin:inactive'
  | 'plugin:deactivate:error'
  | 'plugin:uninstalling'
  | 'plugin:uninstalled'
  | 'plugin:uninstall:error'
  | 'plugin:config:changed'
  | 'plugin:reloaded';

// ===================== Plugin Manager =====================

class PluginManager extends EventEmitter {
  private static instance: PluginManager;
  
  private startTime: number = Date.now();
  private activatingPlugins: Set<string> = new Set();
  private deactivatingPlugins: Set<string> = new Set();

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  // ===================== Lifecycle Management =====================

  /**
   * 安装插件（从 zip 文件）
   */
  async install(zipPath: string): Promise<PluginRow> {
    const plugin = await pluginRegistry.install(zipPath);
    this.emit('plugin:installed', plugin);
    return plugin;
  }

  /**
   * 从 Git 安装插件
   */
  async installFromGit(gitUrl: string, options?: { branch?: string; subdir?: string }): Promise<PluginRow> {
    const plugin = await pluginRegistry.installFromGit(gitUrl, options);
    this.emit('plugin:installed', plugin);
    return plugin;
  }

  /**
   * 从 npm 安装插件
   */
  async installFromNpm(packageName: string, options?: { version?: string }): Promise<PluginRow> {
    const plugin = await pluginRegistry.installFromNpm(packageName, options);
    this.emit('plugin:installed', plugin);
    return plugin;
  }

  /**
   * 激活插件（启用）
   */
  async activate(pluginId: string): Promise<PluginRow | undefined> {
    const plugin = getPlugin(pluginId);
    if (!plugin) return undefined;

    if (this.activatingPlugins.has(pluginId)) {
      logger.warn(`[PluginManager] 插件 ${pluginId} 正在激活中，跳过重复请求`);
      return plugin;
    }

    try {
      this.activatingPlugins.add(pluginId);
      this.emit('plugin:activating', pluginId);

      // 检查依赖
      const depsOk = await this.checkDependencies(pluginId);
      if (!depsOk.ok) {
        throw new Error(`依赖检查失败: ${depsOk.reason}`);
      }

      // 激活依赖的插件
      await this.activateDependencies(pluginId);

      const result = await pluginRegistry.enable(pluginId);
      
      if (result?.status === 'enabled') {
        this.emit('plugin:active', pluginId);
        logger.info(`[PluginManager] 插件已激活: ${plugin.name}@${plugin.version}`);
      } else if (result?.status === 'error') {
        this.emit('plugin:activate:error', pluginId, '激活失败，状态为 error');
      }

      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.emit('plugin:activate:error', pluginId, errorMsg);
      logger.error(`[PluginManager] 插件激活失败 ${pluginId}:`, errorMsg);
      throw e;
    } finally {
      this.activatingPlugins.delete(pluginId);
    }
  }

  /**
   * 停用插件（禁用）
   */
  async deactivate(pluginId: string): Promise<PluginRow | undefined> {
    const plugin = getPlugin(pluginId);
    if (!plugin) return undefined;

    if (this.deactivatingPlugins.has(pluginId)) {
      logger.warn(`[PluginManager] 插件 ${pluginId} 正在停用中，跳过重复请求`);
      return plugin;
    }

    try {
      this.deactivatingPlugins.add(pluginId);
      this.emit('plugin:deactivating', pluginId);

      // 检查是否有其他插件依赖此插件
      const dependents = this.getDependents(pluginId);
      const activeDependents = dependents.filter(dep => {
        const depPlugin = getPlugin(dep);
        return depPlugin?.status === 'enabled';
      });

      if (activeDependents.length > 0) {
        // 先停用依赖此插件的其他插件
        for (const depId of activeDependents) {
          await this.deactivate(depId);
        }
      }

      const result = await pluginRegistry.disable(pluginId);
      
      if (result?.status === 'disabled') {
        this.emit('plugin:inactive', pluginId);
        logger.info(`[PluginManager] 插件已停用: ${plugin.name}@${plugin.version}`);
      }

      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.emit('plugin:deactivate:error', pluginId, errorMsg);
      logger.error(`[PluginManager] 插件停用失败 ${pluginId}:`, errorMsg);
      throw e;
    } finally {
      this.deactivatingPlugins.delete(pluginId);
    }
  }

  /**
   * 卸载插件
   */
  async uninstall(pluginId: string): Promise<boolean> {
    const plugin = getPlugin(pluginId);
    if (!plugin) return false;

    try {
      this.emit('plugin:uninstalling', pluginId);

      // 先停用
      if (plugin.status === 'enabled') {
        await this.deactivate(pluginId);
      }

      const success = await pluginRegistry.uninstall(pluginId);
      
      if (success) {
        this.emit('plugin:uninstalled', pluginId);
        logger.info(`[PluginManager] 插件已卸载: ${plugin.name}@${plugin.version}`);
      } else {
        this.emit('plugin:uninstall:error', pluginId, '卸载失败');
      }

      return success;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      this.emit('plugin:uninstall:error', pluginId, errorMsg);
      logger.error(`[PluginManager] 插件卸载失败 ${pluginId}:`, errorMsg);
      return false;
    }
  }

  /**
   * 重新加载插件
   */
  async reload(pluginId: string): Promise<PluginRow | undefined> {
    const plugin = getPlugin(pluginId);
    if (!plugin) return undefined;

    const wasActive = plugin.status === 'enabled';
    
    if (wasActive) {
      await this.deactivate(pluginId);
    }
    
    const result = await this.activate(pluginId);
    this.emit('plugin:reloaded', pluginId);
    
    return result;
  }

  // ===================== Dependency Management =====================

  /**
   * 获取插件的依赖列表
   */
  getDependencies(pluginId: string): PluginDependency[] {
    const plugin = getPlugin(pluginId);
    if (!plugin) return [];

    try {
      const manifest: ExtendedPluginManifest = JSON.parse(plugin.manifest_json);
      const deps = manifest.dependencies;
      if (!deps || !Array.isArray(deps)) return [];
      
      return deps.map(dep => {
        if (typeof dep === 'string') {
          return { name: dep };
        }
        return dep as PluginDependency;
      });
    } catch {
      return [];
    }
  }

  /**
   * 检查依赖是否满足
   */
  async checkDependencies(pluginId: string): Promise<{ ok: boolean; reason?: string }> {
    const deps = this.getDependencies(pluginId);
    
    for (const dep of deps) {
      const depPlugin = getPluginByName(dep.name);
      
      if (!depPlugin) {
        if (dep.optional) continue;
        return { ok: false, reason: `缺少必需依赖: ${dep.name}` };
      }

      if (dep.version) {
        // 简单的版本比较（仅做前缀匹配）
        if (!depPlugin.version.startsWith(dep.version.replace(/\^|~/, ''))) {
          if (dep.optional) continue;
          return { ok: false, reason: `依赖版本不匹配: ${dep.name} 需要 ${dep.version}，当前 ${depPlugin.version}` };
        }
      }
    }

    return { ok: true };
  }

  /**
   * 激活所有依赖插件
   */
  private async activateDependencies(pluginId: string): Promise<void> {
    const deps = this.getDependencies(pluginId);
    
    for (const dep of deps) {
      if (dep.optional) continue;
      
      const depPlugin = getPluginByName(dep.name);
      if (depPlugin && depPlugin.status !== 'enabled') {
        await this.activate(depPlugin.id);
      }
    }
  }

  /**
   * 获取依赖于指定插件的所有插件
   */
  getDependents(pluginId: string): string[] {
    const plugin = getPlugin(pluginId);
    if (!plugin) return [];

    const allPlugins = listPlugins(undefined, undefined, 1, 1000);
    const dependents: string[] = [];

    for (const p of allPlugins.items) {
      if (p.id === pluginId) continue;
      
      const deps = this.getDependencies(p.id);
      if (deps.some(d => d.name === plugin.name)) {
        dependents.push(p.id);
      }
    }

    return dependents;
  }

  // ===================== Configuration Management =====================

  /**
   * 获取插件配置
   */
  getConfig(pluginId: string): Record<string, unknown> {
    return getPluginConfig(pluginId);
  }

  /**
   * 更新插件配置
   */
  setConfig(pluginId: string, config: Record<string, unknown>): boolean {
    const result = setPluginConfig(pluginId, config);
    if (result) {
      this.emit('plugin:config:changed', pluginId, config);
      return true;
    }
    return false;
  }

  /**
   * 获取插件配置 schema
   */
  getConfigSchema(pluginId: string): Record<string, unknown> | null {
    const plugin = getPlugin(pluginId);
    if (!plugin) return null;

    try {
      const manifest: ExtendedPluginManifest = JSON.parse(plugin.manifest_json);
      return (manifest.configSchema as Record<string, unknown>) || null;
    } catch {
      return null;
    }
  }

  /**
   * 重置插件配置为默认值
   */
  resetConfig(pluginId: string): Record<string, unknown> {
    const schema = this.getConfigSchema(pluginId);
    const defaultConfig: Record<string, unknown> = {};

    if (schema?.fields && Array.isArray(schema.fields)) {
      for (const field of schema.fields as Array<{ key: string; default?: unknown }>) {
        if (field.default !== undefined) {
          defaultConfig[field.key] = field.default;
        }
      }
    }

    this.setConfig(pluginId, defaultConfig);
    return defaultConfig;
  }

  // ===================== Query & Stats =====================

  /**
   * 获取插件详情（包含丰富信息）
   */
  getPluginInfo(pluginId: string): PluginInfo | null {
    const plugin = getPlugin(pluginId);
    if (!plugin) return null;

    const manifest = this.safeParseManifest(plugin.manifest_json);
    const deps = this.getDependencies(pluginId);
    const config = this.getConfig(pluginId);
    const configSchema = this.getConfigSchema(pluginId);

    return {
      id: plugin.id,
      name: plugin.name,
      displayName: plugin.display_name,
      version: plugin.version,
      author: plugin.author,
      description: plugin.description,
      icon: plugin.icon,
      status: this.mapStatus(plugin.status),
      dependencies: deps,
      provides: manifest?.provides || [],
      configSchema,
      config,
      installedAt: plugin.installed_at,
      updatedAt: plugin.updated_at,
      metadata: this.safeParseJson(plugin.metadata),
    };
  }

  /**
   * 列出所有插件
   */
  listPlugins(
    status?: string,
    search?: string,
    page: number = 1,
    pageSize: number = 20
  ): { items: PluginInfo[]; total: number } {
    const result = listPlugins(status, search, page, pageSize);
    const items = result.items
      .map(p => this.getPluginInfo(p.id))
      .filter((p): p is PluginInfo => p !== null);

    return { items, total: result.total };
  }

  /**
   * 获取统计信息
   */
  getStats(): PluginManagerStats {
    const all = listPlugins(undefined, undefined, 1, 1000);
    const health = pluginRegistry.getHealth();

    let active = 0;
    let inactive = 0;
    let error = 0;
    let installed = 0;

    for (const plugin of all.items) {
      switch (plugin.status) {
        case 'enabled':
          active++;
          break;
        case 'disabled':
          inactive++;
          break;
        case 'error':
          error++;
          break;
        case 'installed':
          installed++;
          break;
      }
    }

    return {
      total: all.total,
      active,
      inactive,
      error,
      installed,
      totalTools: health.loaded,
      startTime: this.startTime,
    };
  }

  /**
   * 获取健康状态
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    activePlugins: number;
    totalPlugins: number;
    errors: string[];
  } {
    const health = pluginRegistry.getHealth();
    const stats = this.getStats();
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (stats.error > 0) {
      status = stats.error > 2 ? 'unhealthy' : 'degraded';
    }

    return {
      status,
      activePlugins: stats.active,
      totalPlugins: stats.total,
      errors: health.errors,
    };
  }

  // ===================== Bulk Operations =====================

  /**
   * 批量激活插件
   */
  async bulkActivate(pluginIds: string[]): Promise<{ 
    success: string[]; 
    failed: Array<{ id: string; error: string }> 
  }> {
    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of pluginIds) {
      try {
        const result = await this.activate(id);
        if (result?.status === 'enabled') {
          success.push(id);
        } else {
          failed.push({ id, error: '激活失败' });
        }
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return { success, failed };
  }

  /**
   * 批量停用插件
   */
  async bulkDeactivate(pluginIds: string[]): Promise<{ 
    success: string[]; 
    failed: Array<{ id: string; error: string }> 
  }> {
    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of pluginIds) {
      try {
        const result = await this.deactivate(id);
        if (result?.status === 'disabled') {
          success.push(id);
        } else {
          failed.push({ id, error: '停用失败' });
        }
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return { success, failed };
  }

  // ===================== Event System =====================

  /**
   * 监听插件事件
   */
  onPluginEvent(event: PluginEventName, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  /**
   * 移除插件事件监听
   */
  offPluginEvent(event: PluginEventName, listener: (...args: unknown[]) => void): this {
    return this.off(event, listener);
  }

  // ===================== Helpers =====================

  private safeParseManifest(json: string): ExtendedPluginManifest | null {
    try {
      return JSON.parse(json) as ExtendedPluginManifest;
    } catch {
      return null;
    }
  }

  private safeParseJson(json: string): Record<string, unknown> {
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private mapStatus(dbStatus: string): PluginLifecycleStatus {
    switch (dbStatus) {
      case 'enabled':
        return 'active';
      case 'disabled':
        return 'inactive';
      case 'installed':
        return 'installed';
      case 'error':
        return 'error';
      case 'uninstalled':
        return 'inactive';
      default:
        return 'inactive';
    }
  }
}

// ===================== Singleton Export =====================

export const pluginManager = PluginManager.getInstance();
