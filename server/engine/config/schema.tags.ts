/**
 * Schema 标签系统 — 从 schema-meta.ts 重导出
 *
 * 移植自 openclaw/src/config/schema.tags.ts，cross-wms 的标签词汇表
 * 和推导逻辑已统一在 schema-meta.ts 中维护。此文件保留是为了向后兼容
 * 旧的 `from "./schema.tags.js"` 导入路径。
 */
export { CONFIG_TAGS, type ConfigTag } from './schema-meta.js';
export { schemaTags as applyDerivedTagsSource } from './schema-meta.js';

import { schemaTags } from './schema-meta.js';
import type { ConfigUiHint } from './schema.js';

/** 为 UI hint 映射推导标签（openclaw applyDerivedTags 的 cross-wms 版本） */
export function applyDerivedTags(hints: Record<string, ConfigUiHint>): Record<string, ConfigUiHint> {
  const next: Record<string, ConfigUiHint> = { ...hints };
  for (const [path, hint] of Object.entries(next)) {
    if (!hint.tags || hint.tags.length === 0) {
      const derived = schemaTags.deriveTags(path);
      if (derived.length > 0) {
        next[path] = { ...hint, tags: derived };
      }
    }
  }
  return next;
}

/** 根据路径推导标签（便捷重导出） */
export function deriveTagsForPath(path: string): ReturnType<typeof schemaTags.deriveTags> {
  return schemaTags.deriveTags(path);
}
