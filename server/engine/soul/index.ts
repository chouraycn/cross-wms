/**
 * Soul 模块导出入口
 *
 * 统一导出所有公共函数和类型，提供清晰的 API 接口
 */

// ===================== 类型导出 =====================

export type {
  // 基础类型
  PersonalityMode,
  StrategyPreferences,
  SoulProfile,

  // 新增类型
  SoulSectionType,
  SoulPriority,
  SoulSource,
  SoulSection,
  SoulConfig,
  MergedSoulConfig,
  SoulCacheEntry,
  SectionHashMap,
} from './types.js';

// ===================== 解析器导出 =====================

export {
  // 工具函数
  computeHash,
  safeReadFileSync,

  // 解析函数
  parseFrontMatter,
  extractSection,
  extractSections,
  parsePersonality,
  parseStrategyPreferences,
  parseIdentity,
  parseListItems,
  parseSoulMarkdown,
  parseUserMarkdown,

  // 默认值
  DEFAULT_STRATEGY,
  DEFAULT_PERSONALITY,
} from './parser.js';

// ===================== 优先级管理导出 =====================

export {
  // 常量
  PRIORITY_WEIGHTS,
  PRIORITY_ORDER,

  // 优先级函数
  computePriorityOrder,
  resolveSectionConflict,
  mergeStrategies,
  mergePersonality,
  mergeSoulConfigs,
} from './priority.js';

// ===================== 加载器导出 =====================

export {
  // 加载函数
  loadSystemSoul,
  loadProjectSoul,
  loadUserSoul,
  loadSessionSoul,
  loadAllSouls,

  // 缓存管理
  invalidateCache,
  getSectionHashMap,
} from './loader.js';

// ===================== 构建器导出 =====================

export {
  // Token 估算
  estimateTokenCount,
  estimateSectionTokens,
  estimateConfigTokens,

  // 格式化
  formatSection,

  // System Prompt 构建
  buildSystemPrompt,
  buildSoulProfile,

  // 策略偏好
  getPersonalityStrategyDefaults,
  getMergedStrategyPreferences,
} from './builder.js';

// ===================== 向后兼容 API =====================

/**
 * 加载人格配置（向后兼容）
 *
 * 保持原有 soulLoader.ts 的 API 不变
 */
export { loadSoulProfile, buildSoulSystemMessage, invalidateSoulCache, loadAgentSoul, initDefaultSoulFiles } from './compat.js';