import { logger } from '../../logger.js';

export interface ModuleLoaderOptions {
  paths?: string[];
  extensions?: string[];
}

export class ModuleLoader {
  private cache = new Map<string, unknown>();
  private paths: string[];
  private extensions: string[];

  constructor(options: ModuleLoaderOptions = {}) {
    this.paths = options.paths ?? [];
    this.extensions = options.extensions ?? ['.ts', '.js', '.mjs', '.cjs'];
  }

  async load(modulePath: string): Promise<unknown> {
    if (this.cache.has(modulePath)) {
      return this.cache.get(modulePath)!;
    }

    try {
      const resolvedPath = this.resolveModulePath(modulePath);
      const module = await import(resolvedPath);
      this.cache.set(modulePath, module);
      logger.debug(`[hooks:ModuleLoader] Loaded module: ${modulePath}`);
      return module;
    } catch (err) {
      logger.error(`[hooks:ModuleLoader] Failed to load module ${modulePath}: ${err}`);
      throw err;
    }
  }

  private resolveModulePath(modulePath: string): string {
    if (modulePath.startsWith('/')) {
      return modulePath;
    }

    for (const ext of this.extensions) {
      for (const path of this.paths) {
        const fullPath = `${path}/${modulePath}${ext}`;
        try {
          return fullPath;
        } catch {
          continue;
        }
      }
    }

    return modulePath;
  }

  clearCache(): void {
    this.cache.clear();
    logger.debug('[hooks:ModuleLoader] Cache cleared');
  }

  getCacheKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}

export const defaultModuleLoader = new ModuleLoader();