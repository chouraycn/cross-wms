/**
 * 字段帮助文本 — 从 schema-meta.ts 重导出
 *
 * 移植自 openclaw/src/config/schema.help.ts，cross-wms 的帮助文本定义
 * 已统一在 schema-meta.ts 中维护。此文件保留是为了向后兼容旧的
 * `from "./schema.help.js"` 导入路径。
 */
export { schemaHelp as FIELD_HELP } from './schema-meta.js';
