import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { logger } from '../../logger.js';
import type { FunctionLoaderOptions, LoadedFunction } from './types.js';

type CacheEntry = {
  fn: LoadedFunction;
  loadedAt: number;
};

const DEFAULT_MAX_MODULE_SIZE = 5 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export class FunctionLoader {
  private options: Required<FunctionLoaderOptions>;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(options: FunctionLoaderOptions = {}) {
    this.options = {
      allowedPaths: options.allowedPaths ?? [],
      maxModuleSizeBytes: options.maxModuleSizeBytes ?? DEFAULT_MAX_MODULE_SIZE,
      enableCache: options.enableCache ?? true,
      cacheTTLMs: options.cacheTTLMs ?? DEFAULT_CACHE_TTL_MS,
    };
  }

  async load(modulePath: string, exportName?: string): Promise<LoadedFunction> {
    const resolvedPath = path.resolve(modulePath);

    this.validatePath(resolvedPath);
    this.validateFileSize(resolvedPath);

    const cacheKey = `${resolvedPath}:${exportName ?? 'default'}`;

    if (this.options.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.loadedAt < this.options.cacheTTLMs) {
        logger.debug(`[FunctionLoader] Cache hit: ${cacheKey}`);
        return cached.fn;
      }
    }

    const fn = await this.loadModule(resolvedPath, exportName);
    const loadedFn: LoadedFunction = {
      id: cacheKey,
      name: exportName ?? path.basename(resolvedPath, path.extname(resolvedPath)),
      sourcePath: resolvedPath,
      loadedAt: Date.now(),
      fn,
    };

    if (this.options.enableCache) {
      this.cache.set(cacheKey, { fn: loadedFn, loadedAt: Date.now() });
    }

    logger.debug(`[FunctionLoader] Loaded: ${resolvedPath}${exportName ? `#${exportName}` : ''}`);
    return loadedFn;
  }

  private async loadModule(modulePath: string, exportName?: string): Promise<(...args: unknown[]) => unknown> {
    let code: string;
    try {
      code = fs.readFileSync(modulePath, 'utf-8');
    } catch {
      throw new Error(`Cannot read module file: ${modulePath}`);
    }

    const exports: Record<string, unknown> = {};
    const moduleObj = { exports };

    const cjsCode = this.transformEsmToCjs(code);

    try {
      const sandbox = {
        module: moduleObj,
        exports,
        require: (id: string) => {
          throw new Error(`require('${id}') is not supported in function loader sandbox`);
        },
        console,
        setTimeout,
        clearTimeout,
        Promise,
      };

      const script = new vm.Script(cjsCode, { filename: modulePath });
      const context = vm.createContext(sandbox);
      script.runInContext(context);
    } catch (err) {
      throw new Error(`Failed to load module ${modulePath}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const mod = moduleObj.exports;

    let fn: unknown;

    if (exportName) {
      if (typeof mod === 'object' && mod !== null) {
        const modObj = mod as Record<string, unknown>;
        fn = modObj[exportName];
        if (!fn) {
          throw new Error(`Export '${exportName}' not found in ${modulePath}`);
        }
      } else {
        throw new Error(`Export '${exportName}' not found in ${modulePath}`);
      }
    } else {
      if (typeof mod === 'function') {
        fn = mod;
      } else if (typeof mod === 'object' && mod !== null) {
        const modObj = mod as Record<string, unknown>;
        fn = modObj.default ?? Object.values(modObj).find(v => typeof v === 'function');
        if (!fn) {
          throw new Error(`No function export found in ${modulePath}`);
        }
      } else {
        fn = mod;
      }
    }

    if (typeof fn !== 'function') {
      throw new Error(`Export '${exportName ?? 'default'}' is not a function`);
    }

    return fn as (...args: unknown[]) => unknown;
  }

  private transformEsmToCjs(code: string): string {
    let result = code;

    result = result.replace(
      /export\s+default\s+(function\s+\w+|\(\)|async\s+function|\(\)|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=)/g,
      'module.exports = $1',
    );

    result = result.replace(
      /export\s+(function\s+(\w+))/g,
      'exports.$2 = $1',
    );

    result = result.replace(
      /export\s+(const|let|var)\s+(\w+)/g,
      '$1 $2; exports.$2 = $2',
    );

    result = result.replace(
      /export\s+\{([^}]+)\}/g,
      (_, names: string) => {
        const parts = names.split(',').map(n => n.trim());
        return parts.map(n => `exports.${n} = ${n}`).join('; ');
      },
    );

    return result;
  }

  private validatePath(targetPath: string): void {
    if (this.options.allowedPaths.length === 0) {
      return;
    }

    for (const allowed of this.options.allowedPaths) {
      const resolvedAllowed = path.resolve(allowed);
      if (targetPath.startsWith(resolvedAllowed)) {
        return;
      }
    }

    throw new Error(`Path not allowed: ${targetPath}`);
  }

  private validateFileSize(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > this.options.maxModuleSizeBytes) {
        throw new Error(
          `Module too large: ${stats.size} bytes (max: ${this.options.maxModuleSizeBytes} bytes)`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Module too large')) {
        throw err;
      }
      throw new Error(`Cannot read module file: ${filePath}`);
    }
  }

  invalidate(modulePath: string, exportName?: string): boolean {
    const resolvedPath = path.resolve(modulePath);
    const cacheKey = `${resolvedPath}:${exportName ?? 'default'}`;
    const existed = this.cache.has(cacheKey);
    this.cache.delete(cacheKey);

    if (!exportName) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${resolvedPath}:`)) {
          this.cache.delete(key);
        }
      }
    }

    if (existed) {
      logger.debug(`[FunctionLoader] Invalidated cache: ${cacheKey}`);
    }
    return existed;
  }

  clearCache(): void {
    this.cache.clear();
    logger.debug('[FunctionLoader] Cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  isCached(modulePath: string, exportName?: string): boolean {
    const resolvedPath = path.resolve(modulePath);
    const cacheKey = `${resolvedPath}:${exportName ?? 'default'}`;
    const entry = this.cache.get(cacheKey);

    if (!entry) return false;
    if (Date.now() - entry.loadedAt >= this.options.cacheTTLMs) {
      this.cache.delete(cacheKey);
      return false;
    }

    return true;
  }

  getAllowedPaths(): string[] {
    return [...this.options.allowedPaths];
  }

  setCacheTTL(ttlMs: number): void {
    this.options.cacheTTLMs = ttlMs;
  }

  enableCache(): void {
    this.options.enableCache = true;
  }

  disableCache(): void {
    this.options.enableCache = false;
  }
}

export function createFunctionLoader(options?: FunctionLoaderOptions): FunctionLoader {
  return new FunctionLoader(options);
}
