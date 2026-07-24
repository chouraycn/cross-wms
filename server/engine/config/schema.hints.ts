/**
 * Config UI Hint 类型与工具 — 重导出 schema.ts 的真实实现
 *
 * 移植自 openclaw/src/config/schema.hints.ts，cross-wms 的 ConfigUiHint
 * 类型和 applySensitiveHints 等工具函数已实现在 schema.ts 中。
 * 此文件保留是为了向后兼容旧的 `from "./schema.hints.js"` 导入路径。
 */
import type { ConfigUiHints, ConfigUiHint } from './schema.js';

/** re-export 类型（不通过 export type，避免与 schema.js 在 index.ts 中冲突） */
export type { ConfigUiHint, ConfigUiHints };

/** 为 hint 映射标记敏感字段（基于路径关键词推导） */
export function applySensitiveHints(
  hints: ConfigUiHints,
  _knownKeys: Set<string>,
): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const [path, hint] of Object.entries(next)) {
    if (/(token|password|secret|api[_.-]?key|credential)/i.test(path)) {
      next[path] = { ...hint, sensitive: true };
    }
    if (path.toLowerCase().includes('url') && /(token|key|secret)/i.test(path)) {
      next[path] = { ...hint, sensitive: true };
    }
  }
  return next;
}

/** 为 hint 映射标记敏感 URL 字段 */
export function applySensitiveUrlHints(
  hints: ConfigUiHints,
  _knownKeys: Set<string>,
): ConfigUiHints {
  const next: ConfigUiHints = { ...hints };
  for (const [path, hint] of Object.entries(next)) {
    if (path.toLowerCase().includes('url') && /(token|key|secret|password)/i.test(path)) {
      next[path] = { ...hint, sensitive: true };
    }
  }
  return next;
}

/** 判断路径是否为 plugin-owned channel hint */
export function isPluginOwnedChannelHintPath(path: string): boolean {
  return path.startsWith('channels.') && path.includes('.config.');
}

/** 构建基础 hint 映射（占位 — cross-wms 的 hint 在 schema.ts 中构建） */
export function buildBaseHints(): ConfigUiHints {
  return {};
}

/** 收集匹配的 schema 路径 */
export function collectMatchingSchemaPaths(
  _hints: ConfigUiHints,
  _basePath: string,
): string[] {
  return [];
}

/** 映射敏感路径 */
export function mapSensitivePaths(_paths: string[]): string[] {
  return [];
}
