// 配置包含
// 参考 openclaw/src/config/includes.ts 的设计，支持 $include 指令将其他配置文件合并进来，
// 提供循环包含检测、路径解析与深度合并

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';

// ============================================================================
// 常量
// ============================================================================

// $include 指令键名
export const INCLUDE_KEY = '$include';

// 最大嵌套深度
export const MAX_INCLUDE_DEPTH = 10;

// 单个 include 文件最大字节数
export const MAX_INCLUDE_FILE_BYTES = 2 * 1024 * 1024;

// include 路径与解析后路径的最大长度（CWE-22 加固）
export const MAX_INCLUDE_PATH_LENGTH = 4096;

// 危险对象键（防止原型污染）
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

// ============================================================================
// 类型定义
// ============================================================================

// include 解析器接口：抽象文件读取与 JSON 解析，便于测试注入
export interface IncludeResolver {
  readFile: (filePath: string) => string;
  parseJson: (raw: string) => unknown;
}

export interface ResolveConfigIncludesOptions {
  // 配置目录之外的额外允许根目录（典型来自 CROSS_WMS_INCLUDE_ROOTS）
  allowedRoots?: ReadonlyArray<string>;
}

// ============================================================================
// 错误类型
// ============================================================================

// 配置 include 错误基类
export class ConfigIncludeError extends Error {
  readonly includePath: string;
  readonly cause?: Error;

  constructor(message: string, includePath: string, cause?: Error) {
    super(message);
    this.name = 'ConfigIncludeError';
    this.includePath = includePath;
    if (cause) {
      this.cause = cause;
    }
  }
}

// 循环包含错误
export class CircularIncludeError extends ConfigIncludeError {
  readonly chain: string[];

  constructor(chain: string[]) {
    super(`Circular include detected: ${chain.join(' -> ')}`, chain[chain.length - 1] ?? '<unknown>');
    this.name = 'CircularIncludeError';
    this.chain = chain;
  }
}

// ============================================================================
// 工具函数
// ============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBlockedObjectKey(key: string): boolean {
  return BLOCKED_OBJECT_KEYS.has(key);
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT',
  );
}

function safeRealpath(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

// 判断 candidate 是否位于 root 目录内（词法包含）
function isPathInside(root: string, candidate: string): boolean {
  const normalizedRoot = path.normalize(root);
  const normalizedCandidate = path.normalize(candidate);
  if (normalizedRoot === normalizedCandidate) {
    return true;
  }
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
  return normalizedCandidate.startsWith(rootWithSep);
}

// ============================================================================
// 深度合并
// ============================================================================

// 深度合并：数组拼接、对象递归合并、原始类型 source 胜出
export function deepMerge(target: unknown, source: unknown): unknown {
  if (Array.isArray(target) && Array.isArray(source)) {
    return [...target, ...source];
  }
  if (isPlainObject(target) && isPlainObject(source)) {
    const result: Record<string, unknown> = { ...target };
    for (const key of Object.keys(source)) {
      if (isBlockedObjectKey(key)) {
        continue;
      }
      result[key] = key in result ? deepMerge(result[key], source[key]) : source[key];
    }
    return result;
  }
  return source;
}

// ============================================================================
// include 文件哈希
// ============================================================================

// 计算 include 文件原始内容的 SHA-256 哈希，用于变更检测与缓存
export function hashConfigIncludeRaw(raw: string | null): string {
  const hash = crypto.createHash('sha256');
  if (raw === null) {
    hash.update('missing');
  } else {
    hash.update('present\0');
    hash.update(raw, 'utf-8');
  }
  return hash.digest('hex');
}

// ============================================================================
// include 处理器
// ============================================================================

type IncludeRoot = {
  rootDir: string;
  rootRealDir: string;
};

class IncludeProcessor {
  private readonly visited: Set<string>;
  private readonly depth: number;
  private readonly configRoot: IncludeRoot;
  private readonly allowedRoots: ReadonlyArray<IncludeRoot>;

  constructor(
    private readonly basePath: string,
    private readonly resolver: IncludeResolver,
    rootDir?: string,
    allowedRoots?: ReadonlyArray<IncludeRoot>,
    visited?: Set<string>,
    depth?: number,
  ) {
    const configRootDir = path.normalize(rootDir ?? path.dirname(basePath));
    this.configRoot = {
      rootDir: configRootDir,
      rootRealDir: path.normalize(safeRealpath(configRootDir)),
    };
    this.allowedRoots = allowedRoots ?? [];
    this.visited = visited ?? new Set([path.normalize(basePath)]);
    this.depth = depth ?? 0;
  }

  process(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.process(item));
    }
    if (!isPlainObject(obj)) {
      return obj;
    }
    if (!(INCLUDE_KEY in obj)) {
      return this.processObject(obj);
    }
    return this.processInclude(obj);
  }

  private processObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isBlockedObjectKey(key)) {
        continue;
      }
      result[key] = this.process(value);
    }
    return result;
  }

  private processInclude(obj: Record<string, unknown>): unknown {
    const includeValue = obj[INCLUDE_KEY];
    const otherKeys = Object.keys(obj).filter((k) => k !== INCLUDE_KEY);
    const included = this.resolveInclude(includeValue);

    if (otherKeys.length === 0) {
      return included;
    }

    if (!isPlainObject(included)) {
      throw new ConfigIncludeError(
        'Sibling keys require included content to be an object',
        typeof includeValue === 'string' ? includeValue : INCLUDE_KEY,
      );
    }

    const rest: Record<string, unknown> = {};
    for (const key of otherKeys) {
      if (isBlockedObjectKey(key)) {
        continue;
      }
      rest[key] = this.process(obj[key]);
    }
    return deepMerge(included, rest);
  }

  private resolveInclude(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.loadFile(value);
    }
    if (Array.isArray(value)) {
      return value.reduce<unknown>((merged, item) => {
        if (typeof item !== 'string') {
          throw new ConfigIncludeError(
            `Invalid $include array item: expected string, got ${typeof item}`,
            String(item),
          );
        }
        return deepMerge(merged, this.loadFile(item));
      }, {});
    }
    throw new ConfigIncludeError(
      `Invalid $include value: expected string or array of strings, got ${typeof value}`,
      String(value),
    );
  }

  private loadFile(includePath: string): unknown {
    const resolvedPath = this.resolvePath(includePath);
    this.checkCircular(resolvedPath);
    this.checkDepth(includePath);

    let raw: string;
    try {
      raw = this.resolver.readFile(resolvedPath);
    } catch (err) {
      if (err instanceof ConfigIncludeError) {
        throw err;
      }
      throw new ConfigIncludeError(
        `Failed to read include file: ${includePath} (resolved: ${resolvedPath})`,
        includePath,
        err instanceof Error ? err : undefined,
      );
    }

    let parsed: unknown;
    try {
      parsed = this.resolver.parseJson(raw);
    } catch (err) {
      throw new ConfigIncludeError(
        `Failed to parse include file: ${includePath} (resolved: ${resolvedPath})`,
        includePath,
        err instanceof Error ? err : undefined,
      );
    }

    return this.processNested(resolvedPath, parsed);
  }

  private resolvePath(includePath: string): string {
    if (includePath.includes('\0')) {
      throw new ConfigIncludeError('Include path must not contain null bytes', includePath);
    }
    if (includePath.length >= MAX_INCLUDE_PATH_LENGTH) {
      throw new ConfigIncludeError(
        `Include path exceeds maximum length (${MAX_INCLUDE_PATH_LENGTH} characters)`,
        includePath,
      );
    }

    const configDir = path.dirname(this.basePath);
    const resolved = path.isAbsolute(includePath) ? includePath : path.resolve(configDir, includePath);
    const normalized = path.normalize(resolved);

    if (normalized.length >= MAX_INCLUDE_PATH_LENGTH) {
      throw new ConfigIncludeError(
        `Resolved include path exceeds maximum length (${MAX_INCLUDE_PATH_LENGTH} characters)`,
        includePath,
      );
    }

    // 安全检查：拒绝配置目录与允许根目录之外的路径（CWE-22 路径穿越）
    const lexicalMatch = this.findContainingRoot(normalized, 'rootDir');
    if (!lexicalMatch) {
      throw new ConfigIncludeError(
        `Include path escapes config directory: ${includePath} (root: ${this.configRoot.rootDir})`,
        includePath,
      );
    }

    // 解析符号链接并再次校验，防止符号链接绕过
    try {
      const real = fs.realpathSync(normalized);
      const realMatch = this.findContainingRoot(real, 'rootRealDir');
      if (!realMatch) {
        throw new ConfigIncludeError(
          `Include path resolves outside config directory (symlink): ${includePath} (root: ${this.configRoot.rootDir})`,
          includePath,
        );
      }
      return normalized;
    } catch (err) {
      if (err instanceof ConfigIncludeError) {
        throw err;
      }
      if (isNotFoundError(err)) {
        // 文件尚不存在，词法包含检查已足够
        return normalized;
      }
      throw new ConfigIncludeError(
        `Failed to resolve include file realpath: ${includePath} (resolved: ${normalized})`,
        includePath,
        err instanceof Error ? err : undefined,
      );
    }
  }

  private findContainingRoot(candidate: string, field: 'rootDir' | 'rootRealDir'): IncludeRoot | null {
    if (isPathInside(this.configRoot[field], candidate)) {
      return this.configRoot;
    }
    for (const root of this.allowedRoots) {
      if (isPathInside(root[field], candidate)) {
        return root;
      }
    }
    return null;
  }

  private checkCircular(resolvedPath: string): void {
    if (this.visited.has(resolvedPath)) {
      throw new CircularIncludeError([...this.visited, resolvedPath]);
    }
  }

  private checkDepth(includePath: string): void {
    if (this.depth >= MAX_INCLUDE_DEPTH) {
      throw new ConfigIncludeError(
        `Maximum include depth (${MAX_INCLUDE_DEPTH}) exceeded at: ${includePath}`,
        includePath,
      );
    }
  }

  private processNested(resolvedPath: string, parsed: unknown): unknown {
    const nested = new IncludeProcessor(
      resolvedPath,
      this.resolver,
      this.configRoot.rootDir,
      this.allowedRoots,
      new Set([...this.visited, resolvedPath]),
      this.depth + 1,
    );
    return nested.process(parsed);
  }
}

// ============================================================================
// 默认解析器
// ============================================================================

const defaultResolver: IncludeResolver = {
  readFile: (filePath) => fs.readFileSync(filePath, 'utf-8'),
  parseJson: (raw) => JSON.parse(raw),
};

// ============================================================================
// 循环包含检测（不加载文件内容，仅扫描 include 链）
// ============================================================================

// 检测 include 链是否存在循环：从指定配置文件出发，递归扫描 $include 指令
// 返回检测到的循环链（空数组表示无循环）
export function detectIncludeCycle(
  configPath: string,
  resolver: IncludeResolver = defaultResolver,
  allowedRoots: ReadonlyArray<string> = [],
): string[] {
  const roots: IncludeRoot[] = allowedRoots
    .filter((entry) => typeof entry === 'string' && entry.length > 0 && path.isAbsolute(entry))
    .map((entry) => {
      const rootDir = path.normalize(entry);
      return { rootDir, rootRealDir: path.normalize(safeRealpath(rootDir)) };
    });

  try {
    const processor = new IncludeProcessor(configPath, resolver, undefined, roots);
    // 读取并处理顶层文件以触发循环检测
    const raw = resolver.readFile(path.normalize(configPath));
    const parsed = resolver.parseJson(raw);
    processor.process(parsed);
    return [];
  } catch (err) {
    if (err instanceof CircularIncludeError) {
      return err.chain;
    }
    // 其他错误（文件不存在、解析失败等）不视为循环
    logger.debug(`[config] detectIncludeCycle 跳过 ${configPath}: ${(err as Error).message}`);
    return [];
  }
}

// ============================================================================
// 公开 API：resolveConfigIncludes
// ============================================================================

// 解析配置对象中的所有 $include 指令，返回合并后的配置对象
export function resolveConfigIncludes(
  obj: unknown,
  configPath: string,
  resolver: IncludeResolver = defaultResolver,
  options: ResolveConfigIncludesOptions = {},
): unknown {
  const allowedRoots: IncludeRoot[] = (options.allowedRoots ?? [])
    .filter((entry) => typeof entry === 'string' && entry.length > 0 && path.isAbsolute(entry))
    .map((entry) => {
      const rootDir = path.normalize(entry);
      return { rootDir, rootRealDir: path.normalize(safeRealpath(rootDir)) };
    });

  const processor = new IncludeProcessor(configPath, resolver, undefined, allowedRoots);
  return processor.process(obj);
}

// ============================================================================
// include 路径解析（写场景）
// ============================================================================

// 解析 include 写入目标路径，校验其位于配置目录或允许根目录内
export function resolveConfigIncludeWritePath(params: {
  configPath: string;
  includePath: string;
  allowedRoots?: readonly string[];
}): string {
  const resolvedPath = path.normalize(path.resolve(params.includePath));
  const roots = [path.dirname(params.configPath), ...(params.allowedRoots ?? [])]
    .filter((root) => path.isAbsolute(root))
    .map((root) => path.normalize(root));

  if (!roots.some((root) => isPathInside(root, resolvedPath))) {
    throw new ConfigIncludeError(
      `Include write path escapes config directory: ${params.includePath}`,
      params.includePath,
    );
  }

  const canonicalPath = path.normalize(safeRealpath(resolvedPath));
  const realRoots = roots.map((root) => path.normalize(safeRealpath(root)));
  if (!realRoots.some((root) => isPathInside(root, canonicalPath))) {
    throw new ConfigIncludeError(
      `Include write path resolves outside config directory (symlink): ${params.includePath}`,
      params.includePath,
    );
  }
  return canonicalPath;
}
