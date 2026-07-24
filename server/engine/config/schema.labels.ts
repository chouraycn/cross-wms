/**
 * 字段标签 — 从 schema-meta.ts 的 schemaHints 推导
 *
 * 移植自 openclaw/src/config/schema.labels.ts，cross-wms 的字段标签
 * 已统一在 schema-meta.ts 的 schemaHints 中维护（取 title 字段）。
 * 此文件保留是为了向后兼容旧的 `from "./schema.labels.js"` 导入路径。
 */
import { schemaHints } from './schema-meta.js';

/** 字段路径 → 标签映射（从 schemaHints.title 推导） */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(schemaHints)
    .filter(([, meta]) => Boolean(meta.title))
    .map(([path, meta]) => [path, meta.title!]),
);
