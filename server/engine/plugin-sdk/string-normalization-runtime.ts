/**
 * 字符串规范化 runtime shim — 面向 plugin-sdk 公共子路径的稳定入口
 *
 * 内部直接 re-export cross-wms 的 infra/string-normalization 实现，
 * 保持与 openclaw 包路径兼容的命名导出。
 *
 * 参考 openclaw/src/plugin-sdk/string-normalization-runtime.ts
 */

export {
  normalizeAtHashSlug,
  normalizeHyphenSlug,
  normalizeStringEntries,
  normalizeStringEntriesLower,
} from '../infra/string-normalization.js';
