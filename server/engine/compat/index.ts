/**
 * Compat 兼容层 - Barrel 导出
 *
 * 汇总向后兼容相关的功能，包括遗留命名映射等。
 */

// 类型定义
export {
  PROJECT_NAME,
  LEGACY_PROJECT_NAMES,
  MANIFEST_KEY,
  LEGACY_MANIFEST_KEYS,
  MACOS_APP_SOURCES_DIR,
} from './types.js';
export type {
  LegacyNameMapping,
  CompatWarning,
  CompatOptions,
} from './types.js';

// 遗留命名兼容
export {
  LegacyNameMapper,
  legacyNameMapper,
  resolveLegacyName,
  isLegacyName,
  getLegacyMapping,
  normalizeProjectName,
  isProjectName,
} from './legacy-names.js';
