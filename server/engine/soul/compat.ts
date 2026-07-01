/**
 * Soul 向后兼容模块
 *
 * 提供原有 soulLoader.ts 的 API，确保现有代码无需修改
 */

import {
  SoulProfile,
  PersonalityMode,
  StrategyPreferences,
  MergedSoulConfig,
} from './types.js';
import {
  loadAllSouls,
  loadAgentSoul,
  initDefaultSoulFiles,
  invalidateCache,
} from './loader.js';
import {
  buildSoulProfile,
  getPersonalityStrategyDefaults,
  getMergedStrategyPreferences,
} from './builder.js';

// ===================== 缓存（向后兼容） =====================

/** 缓存的 SoulProfile */
let cachedProfile: SoulProfile | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 分钟缓存

// ===================== 向后兼容 API =====================

/**
 * 加载人格配置（向后兼容）
 *
 * 保持原有 soulLoader.ts 的 loadSoulProfile API
 */
export function loadSoulProfile(forceRefresh = false): SoulProfile {
  const now = Date.now();

  // 检查缓存
  if (!forceRefresh && cachedProfile && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedProfile;
  }

  // 使用新模块加载
  const mergedConfig = loadAllSouls(forceRefresh);

  // 转换为原有格式
  const profile = buildSoulProfile(mergedConfig);

  // 更新缓存
  cachedProfile = profile;
  cacheTimestamp = now;

  return profile;
}

/**
 * 生成人格 system message 前缀（向后兼容）
 *
 * 将 SOUL.md + USER.md 的关键信息浓缩为 system message
 */
export function buildSoulSystemMessage(): string {
  const profile = loadSoulProfile();
  const parts: string[] = [];

  // 人格核心
  parts.push(`[人格身份] ${profile.identity}`);
  parts.push(`[人格模式] ${profile.personality}`);

  if (profile.tone.length > 0) {
    parts.push(`[语气] ${profile.tone.join('；')}`);
  }

  if (profile.values.length > 0) {
    parts.push(`[价值观] ${profile.values.join('；')}`);
  }

  if (profile.forbiddenZones.length > 0) {
    parts.push(`[禁区] ${profile.forbiddenZones.join('；')}`);
  }

  // 用户画像
  if (profile.rawUserContent.trim()) {
    // 提取 USER.md 的关键信息，限制 500 字避免 token 膨胀
    const userSummary = profile.rawUserContent
      .replace(/<!--[\s\S]*?-->/g, '')   // 移除注释
      .replace(/^#+\s+/gm, '')           // 移除标题标记
      .trim()
      .slice(0, 500);
    parts.push(`[用户画像]\n${userSummary}`);
  }

  return parts.join('\n');
}

/**
 * 刷新缓存（向后兼容）
 *
 * 原有的 invalidateSoulCache 函数
 */
export function invalidateSoulCache(): void {
  cachedProfile = null;
  cacheTimestamp = 0;
  invalidateCache();
}

/**
 * 加载指定 Agent 的 SOUL 文件（向后兼容）
 */
export { loadAgentSoul };

/**
 * 初始化默认人格文件（向后兼容）
 */
export { initDefaultSoulFiles };

/**
 * 获取合并后的策略偏好（向后兼容）
 *
 * 导出 builder.ts 的函数以保持原有 API
 */
export { getMergedStrategyPreferences };

/**
 * 根据人格模式获取策略偏好覆盖（向后兼容）
 */
export { getPersonalityStrategyDefaults };