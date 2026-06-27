/**
 * Plugin Loader
 * 插件加载器 - 动态模块加载与管理
 */

export type PluginStatus = "installed" | "enabled" | "disabled" | "error" | "loading" | "uninstalling";
export type PluginType = "tool" | "agent" | "hook" | "ui" | "api" | "integration";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  type: PluginType;
  entry: string;
  dependencies?: string[];
  permissions?: string[];
  hooks?: string[];
  tools?: string[];
  keywords?: string[];
  homepage?: string;
  repository?: string;
  license?: string;
  minAppVersion?: string;
  configSchema?: Record<string, unknown>;
}

export interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  installedAt: number;
  enabledAt?: number;
  disabledAt?: number;
  errorMessage?: string;
  loadDurationMs?: number;
  activated: boolean;
  exports?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface PluginRegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  type: PluginType;
  author?: string;
  downloads: number;
  stars: number;
  verified: boolean;
  lastUpdated: number;
}

class PluginLoader {
  private readonly plugins = new Map<string, PluginInstance>();
  private readonly registry = new Map<string, PluginRegistryEntry>();
  private readonly pluginDirs: string[] = [];

  constructor() {
    this.initializeRegistry();
  }

  private initializeRegistry(): void {
    // 模拟插件市场中的可用插件
    const samplePlugins: PluginRegistryEntry[] = [
      {
        id: "wms-inventory-tools",
        name: "WMS Inventory Tools",
        version: "1.2.0",
        description: "库存管理增强工具集，支持批量操作和高级筛选",
        type: "tool",
        author: "cross-wms",
        downloads: 1250,
        stars: 45,
        verified: true,
        lastUpdated: Date.now() - 7 * 24 * 60 * 60 * 1000,
      },
      {
        id: "auto-reporter",
        name: "Auto Reporter",
        version: "0.8.0",
        description: "自动生成各类业务报表，支持多种格式导出",
        type: "integration",
        author: "cross-wms",
        downloads: 890,
        stars: 32,
        verified: true,
        lastUpdated: Date.now() - 14 * 24 * 60 * 60 * 1000,
      },
      {
        id: "smart-sorting",
        name: "Smart Sorting",
        version: "2.0.1",
        description: "智能分拣路径优化，提升出库效率",
        type: "agent",
        author: "community",
        downloads: 567,
        stars: 28,
        verified: false,
        lastUpdated: Date.now() - 3 * 24 * 60 * 60 * 1000,
      },
      {
        id: "supplier-sync",
        name: "Supplier Sync",
        version: "1.0.3",
        description: "供应商数据自动同步，支持多平台对接",
        type: "integration",
        author: "cross-wms",
        downloads: 345,
        stars: 19,
        verified: true,
        lastUpdated: Date.now() - 30 * 24 * 60 * 60 * 1000,
      },
      {
        id: "barcode-utils",
        name: "Barcode Utils",
        version: "1.5.0",
        description: "条形码生成与识别工具，支持多种格式",
        type: "tool",
        author: "community",
        downloads: 2340,
        stars: 67,
        verified: false,
        lastUpdated: Date.now() - 1 * 24 * 60 * 60 * 1000,
      },
      {
        id: "dashboard-plus",
        name: "Dashboard Plus",
        version: "1.1.0",
        description: "增强版仪表盘，更多图表和自定义视图",
        type: "ui",
        author: "cross-wms",
        downloads: 1100,
        stars: 52,
        verified: true,
        lastUpdated: Date.now() - 5 * 24 * 60 * 60 * 1000,
      },
    ];

    for (const plugin of samplePlugins) {
      this.registry.set(plugin.id, plugin);
    }
  }

  // ========== Plugin Installation ==========

  async install(pluginId: string): Promise<PluginInstance> {
    const registryEntry = this.registry.get(pluginId);
    if (!registryEntry) {
      throw new Error(`Plugin not found in registry: ${pluginId}`);
    }

    if (this.plugins.has(pluginId)) {
      const existing = this.plugins.get(pluginId)!;
      if (existing.status !== "error") {
        return existing;
      }
    }

    const manifest: PluginManifest = {
      id: registryEntry.id,
      name: registryEntry.name,
      version: registryEntry.version,
      description: registryEntry.description,
      author: registryEntry.author,
      type: registryEntry.type,
      entry: `plugins/${pluginId}/index.js`,
      permissions: [`plugin:${pluginId}`],
    };

    const instance: PluginInstance = {
      manifest,
      status: "loading",
      installedAt: Date.now(),
      activated: false,
    };

    this.plugins.set(pluginId, instance);

    // 模拟安装过程
    await this.simulateInstall(pluginId);

    instance.status = "installed";
    this.plugins.set(pluginId, instance);

    return instance;
  }

  private async simulateInstall(pluginId: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // 模拟下载、验证、解压等步骤
  }

  async uninstall(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    if (plugin.status === "enabled" || plugin.activated) {
      await this.disable(pluginId);
    }

    plugin.status = "uninstalling";
    this.plugins.set(pluginId, plugin);

    await new Promise((resolve) => setTimeout(resolve, 50));

    return this.plugins.delete(pluginId);
  }

  // ========== Plugin Activation ==========

  async enable(pluginId: string): Promise<PluginInstance> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not installed: ${pluginId}`);
    }

    if (plugin.status === "enabled" && plugin.activated) {
      return plugin;
    }

    // 检查依赖
    if (plugin.manifest.dependencies) {
      for (const dep of plugin.manifest.dependencies) {
        const depPlugin = this.plugins.get(dep);
        if (!depPlugin || depPlugin.status !== "enabled") {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    plugin.status = "loading";
    this.plugins.set(pluginId, plugin);

    const startTime = Date.now();

    try {
      // 模拟加载插件
      plugin.exports = await this.loadPluginModule(plugin);
      plugin.activated = true;
      plugin.status = "enabled";
      plugin.enabledAt = Date.now();
      plugin.loadDurationMs = Date.now() - startTime;
    } catch (error) {
      plugin.status = "error";
      plugin.errorMessage = error instanceof Error ? error.message : String(error);
      this.plugins.set(pluginId, plugin);
      throw error;
    }

    this.plugins.set(pluginId, plugin);
    return plugin;
  }

  async disable(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    if (plugin.status !== "enabled" && !plugin.activated) {
      return true;
    }

    // 检查是否有其他插件依赖此插件
    const dependents = Array.from(this.plugins.values()).filter(
      (p) => p.status === "enabled" && p.manifest.dependencies?.includes(pluginId),
    );

    if (dependents.length > 0) {
      throw new Error(
        `Cannot disable: required by ${dependents.map((d) => d.manifest.name).join(", ")}`,
      );
    }

    plugin.activated = false;
    plugin.status = "disabled";
    plugin.disabledAt = Date.now();
    plugin.exports = undefined;
    this.plugins.set(pluginId, plugin);

    return true;
  }

  private async loadPluginModule(plugin: PluginInstance): Promise<Record<string, unknown>> {
    // 模拟插件加载
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 模拟插件导出
    const exports: Record<string, unknown> = {
      activate: () => {
        console.log(`[plugin] ${plugin.manifest.name} activated`);
      },
      deactivate: () => {
        console.log(`[plugin] ${plugin.manifest.name} deactivated`);
      },
      info: {
        name: plugin.manifest.name,
        version: plugin.manifest.version,
      },
    };

    return exports;
  }

  // ========== Query ==========

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  listPlugins(options?: {
    status?: PluginStatus;
    type?: PluginType;
  }): PluginInstance[] {
    let plugins = Array.from(this.plugins.values());

    if (options?.status) {
      plugins = plugins.filter((p) => p.status === options.status);
    }
    if (options?.type) {
      plugins = plugins.filter((p) => p.manifest.type === options.type);
    }

    return plugins.sort((a, b) => b.installedAt - a.installedAt);
  }

  // ========== Registry ==========

  searchRegistry(query: string, type?: PluginType): PluginRegistryEntry[] {
    let results = Array.from(this.registry.values());

    if (type) {
      results = results.filter((p) => p.type === type);
    }

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q),
      );
    }

    return results.sort((a, b) => b.downloads - a.downloads);
  }

  getRegistryEntry(pluginId: string): PluginRegistryEntry | undefined {
    return this.registry.get(pluginId);
  }

  listRegistry(type?: PluginType): PluginRegistryEntry[] {
    let plugins = Array.from(this.registry.values());
    if (type) {
      plugins = plugins.filter((p) => p.type === type);
    }
    return plugins.sort((a, b) => b.downloads - a.downloads);
  }

  // ========== Plugin Config ==========

  getPluginConfig(pluginId: string): Record<string, unknown> {
    const plugin = this.plugins.get(pluginId);
    return plugin?.config ?? {};
  }

  setPluginConfig(pluginId: string, config: Record<string, unknown>): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    plugin.config = { ...plugin.config, ...config };
    this.plugins.set(pluginId, plugin);
    return true;
  }

  // ========== Plugin Directory ==========

  addPluginDir(dir: string): void {
    if (!this.pluginDirs.includes(dir)) {
      this.pluginDirs.push(dir);
    }
  }

  removePluginDir(dir: string): boolean {
    const index = this.pluginDirs.indexOf(dir);
    if (index >= 0) {
      this.pluginDirs.splice(index, 1);
      return true;
    }
    return false;
  }

  listPluginDirs(): string[] {
    return [...this.pluginDirs];
  }

  // ========== Stats ==========

  getStats(): {
    installed: number;
    enabled: number;
    disabled: number;
    error: number;
    byType: Record<string, number>;
    registrySize: number;
  } {
    const plugins = Array.from(this.plugins.values());
    const byType: Record<string, number> = {};

    for (const plugin of plugins) {
      byType[plugin.manifest.type] = (byType[plugin.manifest.type] ?? 0) + 1;
    }

    return {
      installed: plugins.length,
      enabled: plugins.filter((p) => p.status === "enabled").length,
      disabled: plugins.filter((p) => p.status === "disabled").length,
      error: plugins.filter((p) => p.status === "error").length,
      byType,
      registrySize: this.registry.size,
    };
  }

  clear(): void {
    this.plugins.clear();
    this.registry.clear();
    this.pluginDirs.length = 0;
  }
}

const PLUGIN_LOADER_INSTANCE = new PluginLoader();

export function getPluginLoader(): PluginLoader {
  return PLUGIN_LOADER_INSTANCE;
}

export async function installPlugin(pluginId: string): Promise<PluginInstance> {
  return PLUGIN_LOADER_INSTANCE.install(pluginId);
}

export async function enablePlugin(pluginId: string): Promise<PluginInstance> {
  return PLUGIN_LOADER_INSTANCE.enable(pluginId);
}

export async function disablePlugin(pluginId: string): Promise<boolean> {
  return PLUGIN_LOADER_INSTANCE.disable(pluginId);
}

export function resetPluginLoaderForTests(): void {
  PLUGIN_LOADER_INSTANCE.clear();
}

export type { PluginLoader };
