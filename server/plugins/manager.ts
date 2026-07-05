/**
 * 插件管理器
 *
 * 负责插件的加载、初始化、卸载和生命周期管理。
 * 支持内置插件和第三方插件。
 */

import fs from 'fs';
import path from 'path';
import type {
  IPlugin,
  PluginMetadata,
  PluginModule,
  PluginRuntimeConfig,
  PluginLogger,
  PluginStorage,
  PluginEventBus,
  PluginInitContext,
} from './types.js';
import { isProviderPlugin } from './providerPlugin.js';
import { registerAdapter } from '../adapters/registry.js';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';

/** 已加载的插件实例 */
interface LoadedPlugin {
  instance: IPlugin;
  metadata: PluginMetadata;
  initialized: boolean;
  config: PluginRuntimeConfig;
}

/** 插件状态 */
export type PluginStatus = 'loaded' | 'initializing' | 'ready' | 'error' | 'disabled';

/** 插件管理器 */
class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private initialized = false;
  private pluginDir: string;

  constructor() {
    this.pluginDir = path.join(AppPaths.userDataDir, 'plugins');
    this.ensurePluginDir();
  }

  /** 确保插件目录存在 */
  private ensurePluginDir(): void {
    try {
      if (!fs.existsSync(this.pluginDir)) {
        fs.mkdirSync(this.pluginDir, { recursive: true });
      }
    } catch (e) {
      logger.warn('[PluginManager] 无法创建插件目录:', e);
    }
  }

  /**
   * 初始化插件管理器
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('[PluginManager] 正在初始化插件管理器...');

    try {
      // 加载第三方插件
      await this.loadExternalPlugins();
    } catch (e) {
      logger.error('[PluginManager] 加载第三方插件失败:', e);
    }

    this.initialized = true;
    logger.info(`[PluginManager] 插件管理器初始化完成，共加载 ${this.plugins.size} 个插件`);
  }

  /**
   * 加载外部插件
   */
  private async loadExternalPlugins(): Promise<void> {
    try {
      if (!fs.existsSync(this.pluginDir)) return;

      const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.join(this.pluginDir, entry.name);
        try {
          await this.loadPluginFromDir(pluginPath);
        } catch (e) {
          logger.error(`[PluginManager] 加载插件 ${entry.name} 失败:`, e);
        }
      }
    } catch (e) {
      logger.error('[PluginManager] 扫描插件目录失败:', e);
    }
  }

  /**
   * 从目录加载插件
   */
  private async loadPluginFromDir(pluginPath: string): Promise<void> {
    const packageJsonPath = path.join(pluginPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      logger.warn(`[PluginManager] 插件目录缺少 package.json: ${pluginPath}`);
      return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const pluginMetadata = packageJson.crosswmsPlugin || packageJson.plugin;

    if (!pluginMetadata || !pluginMetadata.id) {
      logger.warn(`[PluginManager] 插件缺少元数据: ${pluginPath}`);
      return;
    }

    // 查找入口文件
    let entryFile = packageJson.main || 'index.js';
    const entryPath = path.join(pluginPath, entryFile);

    if (!fs.existsSync(entryPath)) {
      logger.warn(`[PluginManager] 插件入口文件不存在: ${entryPath}`);
      return;
    }

    // 动态加载插件模块
    const module = await import(entryPath) as PluginModule;
    const pluginExport = module.default;
    const instance = typeof pluginExport === 'function' ? pluginExport() : pluginExport;

    if (!instance || !instance.metadata) {
      logger.warn(`[PluginManager] 插件导出无效: ${pluginPath}`);
      return;
    }

    this.registerPlugin(instance);
  }

  /**
   * 注册插件（内置插件调用此方法
   */
  registerPlugin(plugin: IPlugin): void {
    const { id } = plugin.metadata;

    if (this.plugins.has(id)) {
      logger.warn(`[PluginManager] 插件已存在，跳过: ${id}`);
      return;
    }

    this.plugins.set(id, {
      instance: plugin,
      metadata: plugin.metadata,
      initialized: false,
      config: {},
    });

    logger.info(`[PluginManager] 已注册插件: ${id} v${plugin.metadata.version}`);
  }

  /**
   * 初始化所有插件
   */
  async initializeAllPlugins(): Promise<void> {
    for (const [id, plugin] of this.plugins.entries()) {
      if (plugin.initialized) continue;

      try {
        logger.debug(`[PluginManager] 正在初始化插件: ${id}`);
        plugin.initialized = true;

        if (plugin.instance.initialize) {
          const context = this.createPluginContext(id);
          await plugin.instance.initialize(context);
        }

        // Provider 插件：注册适配器
        if (isProviderPlugin(plugin.instance)) {
          const supportedProviders = plugin.instance.metadata.supportedProviders || [];
          for (const provider of supportedProviders) {
            const adapter = plugin.instance.createAdapter(provider);
            if (adapter) {
              registerAdapter(adapter.apiType, () => adapter);
              logger.debug(`[PluginManager] 注册 Provider 适配器: ${provider} -> ${adapter.apiType}`);
            }
          }
        }

        logger.info(`[PluginManager] 插件初始化完成: ${id}`);
      } catch (e) {
        plugin.initialized = false;
        logger.error(`[PluginManager] 插件初始化失败: ${id}`, e);
      }
    }
  }

  /**
   * 创建插件上下文
   */
  private createPluginContext(pluginId: string): PluginInitContext {
    const pluginLogger: PluginLogger = {
      debug: (msg, ...args) => logger.debug(`[Plugin:${pluginId}] ${msg}`, ...args),
      info: (msg, ...args) => logger.info(`[Plugin:${pluginId}] ${msg}`, ...args),
      warn: (msg, ...args) => logger.warn(`[Plugin:${pluginId}] ${msg}`, ...args),
      error: (msg, ...args) => logger.error(`[Plugin:${pluginId}] ${msg}`, ...args),
    };

    const pluginStorage: PluginStorage = {
      get: async (key: string) => {
        const storePath = path.join(this.pluginDir, pluginId, 'storage.json');
        try {
          if (fs.existsSync(storePath)) {
            const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
            return data[key];
          }
        } catch { /* ignore */ }
        return undefined;
      },
      set: async (key: string, value: unknown) => {
        const storePath = path.join(this.pluginDir, pluginId, 'storage.json');
        try {
          const dir = path.dirname(storePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          let data: Record<string, unknown> = {};
          if (fs.existsSync(storePath)) {
            data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
          }
          data[key] = value;
          fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
        } catch (e) {
          logger.error(`[Plugin:${pluginId}] 存储写入失败:`, e);
        }
      },
      remove: async (key: string) => {
        const storePath = path.join(this.pluginDir, pluginId, 'storage.json');
        try {
          if (fs.existsSync(storePath)) {
            const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
            delete data[key];
            fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
          }
        } catch { /* ignore */ }
      },
      clear: async () => {
        const storePath = path.join(this.pluginDir, pluginId, 'storage.json');
        try {
          if (fs.existsSync(storePath)) {
            fs.unlinkSync(storePath);
          }
        } catch { /* ignore */ }
      },
    };

    const eventBus: PluginEventBus = {
      on: (_event, _handler) => { /* TODO: 实现事件总线 */ },
      off: (_event, _handler) => { /* TODO */ },
      emit: (_event, _data) => { /* TODO */ },
    };

    return {
      config: this.plugins.get(pluginId)?.config || {},
      logger: pluginLogger,
      storage: pluginStorage,
      events: eventBus,
    };
  }

  /**
   * 获取所有已加载插件列表
   */
  getPlugins(): Array<{
    id: string;
    name: string;
    version: string;
    type: PluginMetadata['type'];
    description?: string;
    initialized: boolean;
  }> {
    return Array.from(this.plugins.values()).map(p => ({
      id: p.metadata.id,
      name: p.metadata.name,
      version: p.metadata.version,
      type: p.metadata.type,
      description: p.metadata.description,
      initialized: p.initialized,
    }));
  }

  /**
   * 获取指定插件
   */
  getPlugin(id: string): IPlugin | undefined {
    return this.plugins.get(id)?.instance;
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(id: string): Promise<boolean> {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    try {
      if (plugin.instance.destroy) {
        await plugin.instance.destroy();
      }
      this.plugins.delete(id);
      logger.info(`[PluginManager] 插件已卸载: ${id}`);
      return true;
    } catch (e) {
      logger.error(`[PluginManager] 卸载插件失败: ${id}`, e);
      return false;
    }
  }

  /**
   * 销毁插件管理器
   */
  async destroy(): Promise<void> {
    for (const [id] of this.plugins) {
      await this.unloadPlugin(id);
    }
    this.initialized = false;
  }
}

/** 全局插件管理器实例 */
export const pluginManager = new PluginManager();
