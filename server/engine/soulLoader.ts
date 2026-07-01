/**
 * SoulLoader — 人格层加载器（重构版）
 *
 * v9.0: 模块化重构
 * - 拆分为 server/engine/soul/ 目录下的多个模块
 * - 支持优先级加载（system > project > user > session）
 * - 分段式设计（identity/capabilities/constraints/style/knowledge）
 * - KV 缓存友好，支持增量更新
 *
 * 此文件作为向后兼容入口，所有实现已迁移至 soul/ 目录
 */

// ===================== 从新模块导入所有 API =====================

// 类型必须用 export type 重导出，否则 ESM 运行时报错
export type {
  PersonalityMode,
  StrategyPreferences,
  SoulProfile,
  SoulSectionType,
  SoulPriority,
  SoulSource,
  SoulSection,
  SoulConfig,
  MergedSoulConfig,
} from './soul/index.js';

export {
  // 解析器
  parseSoulMarkdown,
  parseUserMarkdown,
  extractSections,
  parseFrontMatter,

  // 加载器
  loadSystemSoul,
  loadProjectSoul,
  loadUserSoul,
  loadSessionSoul,
  loadAllSouls,
  loadAgentSoul,

  // 构建器
  buildSystemPrompt,
  buildSoulProfile,
  estimateTokenCount,

  // 向后兼容 API
  loadSoulProfile,
  buildSoulSystemMessage,
  invalidateSoulCache,
  initDefaultSoulFiles,
  getMergedStrategyPreferences,
  getPersonalityStrategyDefaults,
} from './soul/index.js';