import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import type { ExtensionProvider, ExtensionManifest, ExtensionLoaderOptions, ExtensionRegistryEntry, ExtensionContext } from './extension-types.js';

const DEFAULT_EXTENSION_DIRS = ['extensions'];

/**
 * 读取子目录的 package.json，提取 `openclaw.extensions` 字段声明的入口文件。
 * 遵循 OpenClaw 的发现规则：package.json.openclaw.extensions 优先于 index.ts。
 * 返回 null 表示该目录没有 package.json 或未声明扩展入口。
 */
async function readPackageJsonExtensionEntries(extDir: string): Promise<string[] | null> {
  const pkgJsonPath = path.join(extDir, 'package.json');
  try {
    const content = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(content) as { openclaw?: { extensions?: string[] } };
    const declared = pkg?.openclaw?.extensions;
    if (!Array.isArray(declared) || declared.length === 0) {
      return null;
    }
    // 仅保留实际存在的入口文件，避免引用了不存在的文件导致加载错误
    const existing: string[] = [];
    for (const relPath of declared) {
      const absPath = path.resolve(extDir, relPath);
      try {
        await fs.access(absPath);
        existing.push(absPath);
      } catch {
        // 声明的入口文件不存在，跳过
      }
    }
    return existing.length > 0 ? existing : null;
  } catch {
    return null;
  }
}

/**
 * 解析扩展目录的入口文件路径列表。
 *
 * 解析顺序（遵循 OpenClaw 模式）：
 *   1. package.json 中的 `openclaw.extensions` 字段（数组）—— 显式声明
 *   2. index.ts / index.js —— 约定式入口
 *   3. 都没有则返回 null（库/API 包，非运行时扩展，应静默跳过）
 */
async function resolveExtensionEntries(extDir: string): Promise<string[] | null> {
  // 1. 优先检查 package.json 的 openclaw.extensions 声明
  const declared = await readPackageJsonExtensionEntries(extDir);
  if (declared) {
    return declared;
  }

  // 2. 回退到 index.ts / index.js
  for (const indexFile of ['index.ts', 'index.js']) {
    const indexAbs = path.join(extDir, indexFile);
    try {
      await fs.access(indexAbs);
      return [indexAbs];
    } catch {
      // 不存在，尝试下一个
    }
  }

  // 3. 无入口——这是库/API 包（如 media-understanding-core、test-support），
  //    不是运行时扩展。静默跳过，不当作错误。
  return null;
}

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

          // 遵循 OpenClaw 模式：先查 package.json 的 openclaw.extensions，再回退 index.ts。
          // 库/API 包（如 media-understanding-core、test-support）没有入口文件，
          // 应静默跳过，不当作加载错误。
          const entryPaths = await resolveExtensionEntries(extDir);
          if (!entryPaths || entryPaths.length === 0) {
            this.logger.debug?.(`Skipping non-runtime extension directory: ${entry.name} (no entry point declared)`);
            continue;
          }

          const manifestPath = path.join(extDir, 'extension.json');

          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent) as ExtensionManifest;
            manifest.id = manifest.id || entry.name;
            // 保存解析到的入口路径，供 load() 使用
            (manifest as ExtensionManifest & { __entryPaths?: string[] }).__entryPaths = entryPaths;
            manifests.push(manifest);
          } catch {
            // 没有 extension.json 的目录跳过
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
    // 优先使用 discover() 解析到的入口路径；否则再次解析（兼容外部直接调用 load()）
    const entryPaths = (manifest as ExtensionManifest & { __entryPaths?: string[] }).__entryPaths
      ?? (await resolveExtensionEntries(extDir));

    if (!entryPaths || entryPaths.length === 0) {
      // 库/API 包无运行时入口——静默跳过，不输出错误日志
      this.logger.debug?.(`Skipping extension without entry point: ${manifest.id}`);
      return false;
    }

    // 取第一个入口文件（多入口扩展暂不并行加载，保持顺序语义）
    const entryPath = entryPaths[0];

    try {
      const url = pathToFileURL(entryPath).href;

      const module = await import(url) as { default: unknown };
      const exportedDefault = module.default;

      // 情况 1：类式契约（export default class ... implements ExtensionProvider）
      // 这是 ExtensionLoader 原生支持的契约，default 是可 new 的类构造器。
      if (typeof exportedDefault === 'function') {
        const ProviderClass = exportedDefault as new () => ExtensionProvider;

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
      }

      // 情况 2：对象式契约（definePluginEntry 风格，OpenClaw 原生插件）
      // 这些扩展用 openclaw/plugin-sdk/plugin-entry 的 definePluginEntry() 返回普通对象，
      // 其 register(api: OpenClawPluginApi) 依赖完整的 OpenClaw Plugin API
      // （api.registerProvider / api.registerService / api.registerTool 等），
      // 不兼容 ExtensionLoader 的 ExtensionContext（仅提供 logger/config/secrets）。
      // 这些扩展由 OpenClaw 原生加载器（loadOpenClawPlugins）处理，
      // 此处静默跳过，避免误报错误日志。
      if (
        exportedDefault &&
        typeof exportedDefault === 'object' &&
        typeof (exportedDefault as { register?: unknown }).register === 'function'
      ) {
        this.logger.debug?.(
          `Skipping OpenClaw-style plugin entry (handled by native loader): ${manifest.id}`,
        );
        return false;
      }

      // 情况 3：无效导出（既不是类，也不是含 register 的对象）
      this.logger.error(`Invalid extension entry: ${manifest.id}`);
      return false;
    } catch (error) {
      this.logger.error(`Failed to load extension ${manifest.id}:`, error);
      return false;
    }
  }

  async loadAll(): Promise<number> {
    const manifests = await this.discover();
    const results = await Promise.allSettled(manifests.map((m) => this.load(m)));
    let loadedCount = 0;
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
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