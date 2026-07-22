import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import type { ExtensionProvider, ExtensionManifest, ExtensionLoaderOptions, ExtensionRegistryEntry, ExtensionContext } from './extension-types.js';

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

    try {
      const context: ExtensionContext = {
        logger: this.logger,
        config,
        secrets: (key) => process.env[key] || undefined,
      };

      await entry.provider.register(context);
      entry.enabled = true;

      this.logger.info(`Enabled extension: ${id}`);
      return true;
    } catch (error) {
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
      entry.enabled = false;

      this.logger.info(`Disabled extension: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to disable extension ${id}:`, error);
      return false;
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
}

export const extensionLoader = new ExtensionLoader();