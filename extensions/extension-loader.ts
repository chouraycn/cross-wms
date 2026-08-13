import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import type { ExtensionProvider, ExtensionManifest, ExtensionLoaderOptions, ExtensionRegistryEntry, ExtensionContext } from './extension-types.js';
import { createExtensionBridge, type ExtensionBridgeImpl } from './extension-bridge.js';

const DEFAULT_EXTENSION_DIRS = ['extensions'];

export interface CrossClawPluginConfig {
  id: string;
  activation?: {
    onStartup?: boolean;
  };
  enabledByDefault?: boolean;
  name: string;
  description: string;
  contracts?: Record<string, string[]>;
  configSchema?: Record<string, unknown>;
}

export class ExtensionLoader {
  private extensions: Map<string, ExtensionRegistryEntry> = new Map();
  private loadedDirs: Set<string> = new Set();
  private logger: ExtensionContext['logger'];
  /** 每个已启用扩展对应的 bridge 实例（禁用时调用 dispose 清理注册的能力） */
  private bridges: Map<string, ExtensionBridgeImpl> = new Map();
  /** 缓存已启用扩展的配置（用于 restoreEnabledOnStartup 之前 DB 不可用的兜底） */
  private enabledConfigs: Map<string, Record<string, unknown>> = new Map();

  constructor(options: ExtensionLoaderOptions = {}) {
    this.logger = options.logger || {
      info: (...args) => console.log('[ExtensionLoader]', ...args),
      warn: (...args) => console.warn('[ExtensionLoader] WARN:', ...args),
      error: (...args) => console.error('[ExtensionLoader] ERROR:', ...args),
      debug: () => {},
    };
  }

  async discover(dir?: string): Promise<ExtensionManifest[]> {
    const searchDirs = dir ? [dir] : DEFAULT_EXTENSION_DIRS;
    const manifests: ExtensionManifest[] = [];

    for (const baseDir of searchDirs) {
      const absDir = path.isAbsolute(baseDir) ? baseDir : path.join(process.cwd(), baseDir);
      
      try {
        const entries = await fs.readdir(absDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          
          const extDir = path.join(absDir, entry.name);
          const manifestPath = path.join(extDir, 'extension.json');
          
          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent) as ExtensionManifest;
            manifest.id = manifest.id || entry.name;
            manifests.push(manifest);
          } catch {
            continue;
          }
        }
      } catch {
        this.logger.warn(`Extension directory not found: ${absDir}`);
      }
    }

    return manifests;
  }

  async load(manifest: ExtensionManifest): Promise<boolean> {
    if (this.extensions.has(manifest.id)) {
      this.logger.warn(`Extension already loaded: ${manifest.id}`);
      return false;
    }

    const extDir = path.join(process.cwd(), 'extensions', manifest.id);
    
    try {
      const entryPath = path.join(extDir, 'index.ts');
      const url = pathToFileURL(entryPath).href;
      
      const module = await import(url) as { default: new () => ExtensionProvider };
      const ProviderClass = module.default;

      if (!ProviderClass || typeof ProviderClass !== 'function') {
        this.logger.error(`Invalid extension entry: ${manifest.id}`);
        return false;
      }

      let provider: ExtensionProvider;
      try {
        provider = new ProviderClass();
      } catch {
        this.logger.error(`Failed to instantiate extension: ${manifest.id}`);
        return false;
      }

      if (!provider || typeof provider.register !== 'function') {
        this.logger.error(`Invalid extension entry (missing register method): ${manifest.id}`);
        return false;
      }

      this.extensions.set(manifest.id, {
        id: manifest.id,
        manifest,
        provider,
        enabled: false,
      });

      this.logger.info(`Loaded extension: ${manifest.id} (${manifest.kind})`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to load extension ${manifest.id}:`, error);
      return false;
    }
  }

  async loadAll(): Promise<number> {
    const manifests = await this.discover();
    let loadedCount = 0;

    for (const manifest of manifests) {
      if (await this.load(manifest)) {
        loadedCount++;
      }
    }

    return loadedCount;
  }

  async enable(id: string, config: Record<string, unknown> = {}): Promise<boolean> {
    const entry = this.extensions.get(id);
    if (!entry) {
      this.logger.error(`Extension not found: ${id}`);
      return false;
    }

    if (entry.enabled) {
      this.logger.warn(`Extension already enabled: ${id}`);
      return false;
    }

    // 创建独立 bridge，供扩展注册能力到 server 端注册表
    const bridge = createExtensionBridge(this.logger);

    try {
      const context: ExtensionContext = {
        logger: this.logger,
        config,
        secrets: (key) => process.env[key] || undefined,
        bridge,
      };

      await entry.provider.register(context);
      // 等待 bridge 中所有动态 import 注册完成，确保返回前能力已真正注册到 server 端
      await bridge.ready();
      entry.enabled = true;
      this.bridges.set(id, bridge);
      this.enabledConfigs.set(id, config);

      // 持久化启用状态与配置（DB 可用时）
      await this.persistEnabled(id, config);

      this.logger.info(`Enabled extension: ${id}`);
      return true;
    } catch (error) {
      // 注册失败：清理已注册的部分能力
      bridge.dispose();
      this.logger.error(`Failed to enable extension ${id}:`, error);
      return false;
    }
  }

  async disable(id: string): Promise<boolean> {
    const entry = this.extensions.get(id);
    if (!entry) {
      this.logger.error(`Extension not found: ${id}`);
      return false;
    }

    if (!entry.enabled) {
      this.logger.warn(`Extension already disabled: ${id}`);
      return false;
    }

    try {
      if (entry.provider.unregister) {
        await entry.provider.unregister();
      }
      // 清理通过 bridge 注册的全部能力
      const bridge = this.bridges.get(id);
      if (bridge) {
        bridge.dispose();
        this.bridges.delete(id);
      }
      entry.enabled = false;
      this.enabledConfigs.delete(id);

      // 持久化禁用状态
      await this.persistDisabled(id);

      this.logger.info(`Disabled extension: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to disable extension ${id}:`, error);
      return false;
    }
  }

  /**
   * 启动时恢复已启用扩展：从 DB 读取 enabled=1 的扩展并重新调用 register，
   * 使其能力重新注册到 server 端各注册表。
   *
   * 必须在 loadAll() 之后、server 核心初始化完成之后调用。
   */
  async restoreEnabledOnStartup(): Promise<number> {
    let states: Array<{ id: string; config: string }> = [];
    try {
      const dao = await import('../server/dao/extensionStateDao.js');
      states = dao.listEnabledExtensionStates().map((r) => ({ id: r.id, config: r.config }));
    } catch (error) {
      this.logger.warn('restoreEnabledOnStartup: 无法加载扩展状态 DAO（DB 可能未初始化）:', error);
      return 0;
    }

    let restored = 0;
    for (const state of states) {
      const entry = this.extensions.get(state.id);
      if (!entry) {
        // 扩展已从磁盘移除但状态仍在 DB：跳过
        this.logger.warn(`restoreEnabledOnStartup: 扩展 ${state.id} 未加载，跳过恢复`);
        continue;
      }
      if (entry.enabled) {
        // 已启用（可能 enabledByDefault 等场景），跳过
        continue;
      }
      let config: Record<string, unknown> = {};
      try {
        config = state.config ? JSON.parse(state.config) : {};
      } catch {
        config = {};
      }
      try {
        const ok = await this.enable(state.id, config);
        if (ok) restored++;
      } catch (error) {
        this.logger.warn(`restoreEnabledOnStartup: 恢复扩展 ${state.id} 失败:`, error);
      }
    }
    if (restored > 0) {
      this.logger.info(`restoreEnabledOnStartup: 已恢复 ${restored} 个扩展`);
    }
    return restored;
  }

  /** 持久化扩展启用状态与配置（DB 不可用时静默跳过） */
  private async persistEnabled(id: string, config: Record<string, unknown>): Promise<void> {
    try {
      const dao = await import('../server/dao/extensionStateDao.js');
      dao.setExtensionEnabled(id, config);
    } catch (error) {
      this.logger.debug(`persistEnabled: 跳过持久化 ${id}（DB 不可用）:`, error);
    }
  }

  /** 持久化扩展禁用状态（DB 不可用时静默跳过） */
  private async persistDisabled(id: string): Promise<void> {
    try {
      const dao = await import('../server/dao/extensionStateDao.js');
      dao.setExtensionDisabled(id);
    } catch (error) {
      this.logger.debug(`persistDisabled: 跳过持久化 ${id}（DB 不可用）:`, error);
    }
  }

  get(id: string): ExtensionRegistryEntry | undefined {
    return this.extensions.get(id);
  }

  list(): ExtensionRegistryEntry[] {
    return Array.from(this.extensions.values());
  }

  listByKind(kind: string): ExtensionRegistryEntry[] {
    return Array.from(this.extensions.values()).filter(e => e.manifest.kind === kind);
  }

  getEnabled(): ExtensionRegistryEntry[] {
    return Array.from(this.extensions.values()).filter(e => e.enabled);
  }

  /** 获取已启用扩展的配置（未启用或无配置时返回空对象） */
  getConfig(id: string): Record<string, unknown> {
    return this.enabledConfigs.get(id) ?? {};
  }

  /** 获取指定扩展通过 bridge 注册的工具名列表（供调试/UI/冒烟测试） */
  getRegisteredToolNames(id: string): string[] {
    const bridge = this.bridges.get(id);
    return bridge ? bridge.getRegisteredToolNames() : [];
  }

  /**
   * 静态注册内置扩展（绕过文件系统发现）
   *
   * 用于 registry.ts 中已实例化的 Provider 直接注入已加载集合，
   * 与基于 extension.json 的 discover/load 互补。
   */
  registerStatic(id: string, provider: ExtensionProvider): boolean {
    if (this.extensions.has(id)) {
      this.logger.warn(`Extension already loaded: ${id}`);
      return false;
    }
    const manifest = provider.manifest;
    this.extensions.set(id, {
      id,
      manifest,
      provider,
      enabled: false,
    });
    this.logger.info(`Statically registered extension: ${id} (${manifest.kind})`);
    return true;
  }

  async loadPluginConfig(extDir: string): Promise<CrossClawPluginConfig | null> {
    const pluginConfigPath = path.join(extDir, 'crossclaw.plugin.json');
    try {
      const content = await fs.readFile(pluginConfigPath, 'utf-8');
      return JSON.parse(content) as CrossClawPluginConfig;
    } catch {
      return null;
    }
  }

  async loadAllWithPluginConfig(): Promise<{ loaded: number; pluginConfigs: CrossClawPluginConfig[] }> {
    const manifests = await this.discover();
    let loadedCount = 0;
    const pluginConfigs: CrossClawPluginConfig[] = [];

    for (const manifest of manifests) {
      if (await this.load(manifest)) {
        loadedCount++;
        const extDir = path.join(process.cwd(), 'extensions', manifest.id);
        const pluginConfig = await this.loadPluginConfig(extDir);
        if (pluginConfig) {
          pluginConfigs.push(pluginConfig);
        }
      }
    }

    return { loaded: loadedCount, pluginConfigs };
  }

  async registerWithPluginSdk(pluginSdk: { registerDefinition: (def: unknown) => Promise<boolean> }): Promise<number> {
    let registeredCount = 0;
    const enabled = this.getEnabled();

    for (const entry of enabled) {
      try {
        await pluginSdk.registerDefinition({
          id: entry.id,
          name: entry.manifest.name,
          description: entry.manifest.description,
          version: entry.manifest.version,
          kind: entry.manifest.kind,
        });
        registeredCount++;
      } catch (error) {
        this.logger.error(`Failed to register extension ${entry.id} with Plugin SDK:`, error);
      }
    }

    return registeredCount;
  }

  /**
   * 创建扩展：在 extensions/<id>/ 下写入 extension.json 与 index.ts 模板
   * 并立即 discover + load 注册到运行时（默认为 disabled 状态）
   */
  async create(params: {
    id: string;
    name: string;
    description?: string;
    kind?: ExtensionManifest['kind'];
    version?: string;
  }): Promise<ExtensionManifest | null> {
    const id = params.id.trim().replace(/\s+/g, '-').toLowerCase();
    if (!id) {
      this.logger.error('createExtension: id required');
      return null;
    }
    if (this.extensions.has(id)) {
      this.logger.warn(`createExtension: id already loaded: ${id}`);
      return null;
    }
    const kind: ExtensionManifest['kind'] = (params.kind as any) || 'tool';
    const version = params.version || '1.0.0';
    const name = params.name || id;
    const description = params.description || '';
    const manifest: ExtensionManifest = {
      id,
      name,
      description,
      version,
      kind,
      sdkVersion: '1.0.0',
      requiresAuth: false,
      authType: 'none',
    };

    const extDir = path.join(process.cwd(), 'extensions', id);
    try {
      await fs.mkdir(extDir, { recursive: true });
    } catch (error) {
      this.logger.error(`createExtension: mkdir failed ${extDir}:`, error);
      return null;
    }

    const manifestPath = path.join(extDir, 'extension.json');
    try {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`createExtension: write manifest failed:`, error);
      return null;
    }

    const indexTemplate = this.makeIndexTemplate(manifest);
    try {
      await fs.writeFile(path.join(extDir, 'index.ts'), indexTemplate, 'utf-8');
    } catch (error) {
      this.logger.error(`createExtension: write index.ts template failed:`, error);
    }

    // 加载进运行时
    try {
      await this.load(manifest);
    } catch (error) {
      this.logger.warn(`createExtension: auto-load failed for ${id}. Will be available on restart.`);
    }

    return manifest;
  }

  /**
   * 删除扩展：先 disable/unregister，从 registry 移除，再尝试删除磁盘目录
   */
  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const entry = this.extensions.get(id);
    if (entry) {
      if (entry.enabled) {
        try {
          if (entry.provider.unregister) await entry.provider.unregister();
        } catch (error) {
          this.logger.warn(`removeExtension: unregister ${id} failed:`, error);
        }
        const bridge = this.bridges.get(id);
        if (bridge) {
          bridge.dispose();
          this.bridges.delete(id);
        }
      }
      this.extensions.delete(id);
      this.enabledConfigs.delete(id);
    }

    // 清理持久化状态
    try {
      const dao = await import('../server/dao/extensionStateDao.js');
      dao.deleteExtensionState(id);
    } catch {
      // DB 不可用时忽略
    }

    const extDir = path.join(process.cwd(), 'extensions', id);
    try {
      const stat = await fs.stat(extDir).catch(() => null);
      if (!stat) {
        return { success: !!entry || false, message: entry ? '已从注册中移除' : '扩展不存在' };
      }
      // 递归删除目录
      await fs.rm(extDir, { recursive: true, force: true, maxRetries: 2 });
      return { success: true, message: '扩展已删除' };
    } catch (error) {
      return {
        success: !!entry,
        message: entry ? '已从注册中移除，但目录删除失败' : '扩展不存在',
      };
    }
  }

  private makeIndexTemplate(manifest: ExtensionManifest): string {
    const className = manifest.id
      .split(/[-_]/)
      .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : ''))
      .join('') + 'Extension';

    if (manifest.kind === 'tool') {
      return `import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = ${JSON.stringify(manifest, null, 2)} as ExtensionManifest;

export default class ${className} implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('${manifest.name} 已注册');

    // 通过 bridge 注册 Agent 可调用工具（启用后 Agent 即可调用 ${manifest.id}_hello）
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: '${manifest.id}_hello',
          description: '${manifest.name} 示例工具：回显输入文本',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '要回显的文本' },
            },
            required: ['text'],
          },
        },
      },
      async (args) => {
        const text = String(args.text ?? '');
        return JSON.stringify({ ok: true, echo: text, from: '${manifest.id}' });
      },
    );
  }

  unregister(): void {
    // bridge 注册的能力会由 ExtensionLoader 自动注销，无需手动清理
  }
}
`;
    }

    // 通用模板
    return `import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = ${JSON.stringify(manifest, null, 2)} as ExtensionManifest;

export default class ${className} implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('${manifest.name}(${manifest.kind}) 已注册');
    // 通过 context.bridge.registerTool / registerAdapter / registerModel / registerChannel
    // 将能力注册到 server 端注册表，使扩展真实可用。
  }

  unregister(): void {
    // bridge 注册的能力会由 ExtensionLoader 自动注销，无需手动清理
  }
}
`;
  }
}

export const extensionLoader = new ExtensionLoader();