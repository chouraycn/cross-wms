/**
 * glob 模式处理工具
 *
 * 提供 glob 模式的规范化、路径匹配与文件系统展开能力，
 * 支持 `*`（单层通配）、`**`（递归通配）、`?`（单字符）与字符类 `[abc]`。
 * 基于 node:fs/promises 实现，不引入额外依赖。
 *
 * 参考自 openclaw/src/agents/glob-pattern.ts。
 */
import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';

/** expandGlob 的选项。 */
export interface ExpandGlobOptions {
  /** 搜索根目录，默认为 process.cwd()。 */
  cwd?: string;
  /** 是否返回绝对路径，默认 false（返回相对 cwd 的路径）。 */
  absolute?: boolean;
  /** 是否包含隐藏文件（以 . 开头），默认 false。 */
  dot?: boolean;
  /** 递归最大深度，默认无限制。 */
  maxDepth?: number;
}

/**
 * 规范化 glob 模式：
 * - 统一路径分隔符为 /
 * - 合并连续的 / 为单个
 * - 去除开头的 ./
 * - 保留开头的 /（绝对路径）与 ** 通配
 * @param pattern 原始 glob 模式
 */
export function normalizeGlob(pattern: string): string {
  if (typeof pattern !== 'string' || !pattern) {
    return '';
  }
  let p = pattern.replace(/\\/g, '/').replace(/\/+/g, '/');
  // 去除开头的 ./
  while (p.startsWith('./')) {
    p = p.slice(2);
  }
  return p;
}

/**
 * 判断给定路径是否匹配一个或多个 glob 模式。
 *
 * 支持 `*`（匹配除 / 外的任意字符）、`**`（匹配任意层级，含 /）、
 * `?`（匹配单个非 / 字符）与字符类 `[abc]`、`[!abc]`。
 *
 * @param targetPath 待匹配的路径（会先经过 normalizeGlob 规范化）
 * @param patterns glob 模式字符串或数组
 */
export function matchGlob(targetPath: string, patterns: string | string[]): boolean {
  if (typeof targetPath !== 'string' || !targetPath) {
    return false;
  }
  const normalizedPath = normalizeGlob(targetPath);
  const list = Array.isArray(patterns)
    ? patterns.map(normalizeGlob).filter((p) => p.length > 0)
    : [normalizeGlob(patterns)].filter((p) => p.length > 0);
  if (list.length === 0) {
    return false;
  }
  for (const pattern of list) {
    const re = globToRegExp(pattern);
    if (re.test(normalizedPath)) {
      return true;
    }
  }
  return false;
}

/**
 * 在文件系统中展开 glob 模式，返回匹配的文件路径列表。
 *
 * 支持 `**` 递归遍历目录。当模式不包含通配符时直接判断文件是否存在。
 *
 * @param pattern glob 模式
 * @param options 展开选项
 */
export async function expandGlob(
  pattern: string,
  options?: ExpandGlobOptions,
): Promise<string[]> {
  const cwd = options?.cwd ?? process.cwd();
  const absolute = options?.absolute === true;
  const dot = options?.dot === true;
  const maxDepth = options?.maxDepth;

  const normalized = normalizeGlob(pattern);
  if (!normalized) {
    return [];
  }

  // 无通配符时直接判断文件是否存在
  if (!hasGlobMeta(normalized)) {
    const fullPath = path.isAbsolute(normalized)
      ? normalized
      : path.resolve(cwd, normalized);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile() || stat.isDirectory()) {
        return [absolute ? fullPath : path.relative(cwd, fullPath)];
      }
    } catch {
      return [];
    }
    return [];
  }

  const results = new Set<string>();
  const isAbsolute = path.isAbsolute(normalized);
  const basePath = isAbsolute ? '' : cwd;
  // 将模式按 / 切分为段，逐段匹配
  const segments = normalized.split('/').filter((s) => s.length > 0);

  await walkSegments(basePath, segments, 0, results, {
    cwd,
    absolute,
    dot,
    maxDepth,
    currentDepth: 0,
  });

  return Array.from(results).sort();
}

/** 递归遍历文件系统段，收集匹配结果。 */
async function walkSegments(
  currentDir: string,
  segments: string[],
  segIndex: number,
  results: Set<string>,
  ctx: {
    cwd: string;
    absolute: boolean;
    dot: boolean;
    maxDepth?: number;
    currentDepth: number;
  },
): Promise<void> {
  if (segIndex >= segments.length) {
    return;
  }
  if (ctx.maxDepth !== undefined && ctx.currentDepth > ctx.maxDepth) {
    return;
  }

  const segment = segments[segIndex];
  const isLast = segIndex === segments.length - 1;

  // 处理 ** 递归通配
  if (segment === '**') {
    // ** 可以匹配零层或多层目录
    // 先尝试匹配零层：直接处理下一段
    await walkSegments(currentDir, segments, segIndex + 1, results, {
      ...ctx,
      currentDepth: ctx.currentDepth + 1,
    });

    // 再递归遍历所有子目录
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (!ctx.dot && entry.name.startsWith('.')) {
        continue;
      }
      const childDir = path.join(currentDir, entry.name);
      // 对每个子目录，继续用 ** 段匹配
      await walkSegments(childDir, segments, segIndex, results, {
        ...ctx,
        currentDepth: ctx.currentDepth + 1,
      });
    }
    return;
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  const matcher = globToRegExp(segment);
  for (const entry of entries) {
    if (!ctx.dot && entry.name.startsWith('.') && !segment.startsWith('.')) {
      continue;
    }
    if (!matcher.test(entry.name)) {
      continue;
    }
    const entryPath = currentDir ? path.join(currentDir, entry.name) : entry.name;
    if (isLast) {
      // 最后一段，匹配文件或目录
      const relative = path.relative(ctx.cwd, entryPath);
      results.add(ctx.absolute ? path.resolve(ctx.cwd, relative) : relative);
    } else if (entry.isDirectory()) {
      // 非最后段，必须是目录才能继续深入
      await walkSegments(entryPath, segments, segIndex + 1, results, {
        ...ctx,
        currentDepth: ctx.currentDepth + 1,
      });
    }
  }
}

/** 判断模式是否包含 glob 元字符。 */
function hasGlobMeta(pattern: string): boolean {
  return /[*?\[]/.test(pattern);
}

/**
 * 将 glob 模式转换为正则表达式。
 * - `**` 匹配任意字符（含 /）
 * - `*` 匹配除 / 外的任意字符
 * - `?` 匹配单个非 / 字符
 * - `[abc]` / `[!abc]` 字符类
 */
function globToRegExp(pattern: string): RegExp {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // ** 匹配任意字符（含 /）
        re += '.*';
        i += 2;
        // 跳过紧跟的 /
        if (pattern[i] === '/') {
          i += 1;
        }
        continue;
      }
      // * 匹配除 / 外的任意字符
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (char === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if (char === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) {
        re += '\\[';
        i += 1;
        continue;
      }
      let cls = pattern.slice(i + 1, end);
      // [!...] 取反
      if (cls.startsWith('!')) {
        cls = `^${cls.slice(1)}`;
      }
      re += `[${cls}]`;
      i = end + 1;
      continue;
    }
    // 转义正则元字符
    if (/[-^$.+(){}|\\]/.test(char)) {
      re += `\\${char}`;
    } else {
      re += char;
    }
    i += 1;
  }
  re += '$';
  return new RegExp(re);
}

logger.debug('[Agents:GlobPattern] Module loaded');
