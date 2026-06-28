/**
 * Thinking Mode — 思考级别管理和解析
 *
 * 基于 openclaw 的 thinking 实现，提供思考级别的规范化、
 * 配置解析和运行时决策功能。
 *
 * 功能：
 * 1. ThinkLevel 类型定义（off, low, medium, high, xhigh, max）
 * 2. resolveThinkingProfile - 根据模型和提供者确定支持的思考级别
 * 3. listThinkingLevels - 列出支持的思考级别
 * 4. normalizeThinkLevel - 规范化思考级别
 */

import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/**
 * 思考级别枚举
 *
 * 从 off (无思考) 到 max (最大思考)，级别越高模型思考时间越长
 */
export type ThinkLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * 思考级别选项（UI 显示用）
 */
export type ThinkingLevelOption = {
  id: ThinkLevel;
  label: string;
};

/**
 * 思考级别排名（数值越高思考越深度）
 */
export const THINKING_LEVEL_RANKS: Record<ThinkLevel, number> = {
  off: 0,
  low: 20,
  medium: 30,
  high: 40,
  xhigh: 60,
  max: 70,
};

/**
 * 基础思考级别列表
 */
export const BASE_THINKING_LEVELS: ThinkLevel[] = ['off', 'low', 'medium', 'high'];

/**
 * 模型目录条目（用于思考级别决策）
 */
export interface ThinkingCatalogEntry {
  provider: string;
  id: string;
  api?: string;
  reasoning?: boolean;
  params?: Record<string, unknown>;
  compat?: {
    thinkingFormat?: string;
    supportedReasoningEfforts?: readonly string[] | null;
  } | null;
}

/**
 * 解析后的思考配置
 */
export interface ResolvedThinkingProfile {
  levels: Array<{
    id: ThinkLevel;
    label: string;
    rank: number;
  }>;
  defaultLevel?: ThinkLevel | null;
}

// ===================== 思考级别规范化 =====================

/**
 * 规范化用户提供的思考级别字符串到 canonical enum
 *
 * @param raw - 原始输入字符串
 * @returns 规范化的 ThinkLevel 或 undefined
 */
export function normalizeThinkLevel(raw?: string | null): ThinkLevel | undefined {
  if (!raw) return undefined;

  const key = raw.toLowerCase().trim();

  // 处理特殊别名
  if (key === 'on' || key === 'enable' || key === 'enabled') {
    return 'low';
  }
  if (key === 'min' || key === 'minimal') {
    return 'low';
  }
  if (key === 'mid' || key === 'med') {
    return 'medium';
  }
  if (key === 'ultra' || key === 'high') {
    return 'high';
  }
  if (key === 'extrahigh' || key === 'xhigh') {
    return 'xhigh';
  }
  if (key === 'max' || key === 'maximum') {
    return 'max';
  }

  // 精确匹配
  const validLevels: ThinkLevel[] = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];
  if (validLevels.includes(key as ThinkLevel)) {
    return key as ThinkLevel;
  }

  return undefined;
}

// ===================== 思考级别判断 =====================

/**
 * 检查是否为有效的思考级别字符串
 */
export function isValidThinkLevel(raw?: string | null): raw is string {
  return normalizeThinkLevel(raw) !== undefined;
}

/**
 * 比较两个思考级别的优先级
 *
 * @returns 正数 if a > b, 负数 if a < b, 0 if equal
 */
export function compareThinkLevels(a: ThinkLevel, b: ThinkLevel): number {
  return THINKING_LEVEL_RANKS[a] - THINKING_LEVEL_RANKS[b];
}

/**
 * 获取思考级别的排名值
 */
export function getThinkLevelRank(level: ThinkLevel): number {
  return THINKING_LEVEL_RANKS[level];
}

// ===================== 思考级别解析 =====================

/**
 * 解析模型引用获取提供者和模型 ID
 *
 * @param modelRef - 模型引用，格式: "provider/model" 或 "model"
 * @returns 提供者和模型 ID
 */
function parseModelRef(modelRef?: string | null): { provider: string; model: string } {
  if (!modelRef) return { provider: '', model: '' };

  const parts = modelRef.split('/');
  if (parts.length === 2) {
    return { provider: parts[0], model: parts[1] };
  }
  return { provider: '', model: modelRef };
}

/**
 * 检查目录条目是否支持 xhigh 级别
 */
function catalogSupportsXHigh(compat: ThinkingCatalogEntry['compat']): boolean {
  const efforts = compat?.supportedReasoningEfforts;
  if (!Array.isArray(efforts)) {
    return false;
  }
  return efforts.some((effort) => normalizeThinkLevel(effort) === 'xhigh');
}

// ===================== Provider 思考配置映射 =====================

/**
 * Provider 思考级别支持映射
 *
 * 定义不同提供者的思考级别支持情况
 */
interface ProviderThinkingSupport {
  defaultLevel: ThinkLevel;
  supportedLevels: ThinkLevel[];
  binary?: boolean; // 是否仅支持 off/on 二级
}

/**
 * Provider 思考配置注册表
 */
const PROVIDER_THINKING_PROFILES: Record<string, ProviderThinkingSupport> = {
  'anthropic': {
    defaultLevel: 'medium',
    supportedLevels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'],
  },
  'openai': {
    defaultLevel: 'low',
    supportedLevels: ['off', 'low', 'medium', 'high'],
  },
  'google': {
    defaultLevel: 'low',
    supportedLevels: ['off', 'low', 'medium', 'high'],
  },
  'deepseek': {
    defaultLevel: 'medium',
    supportedLevels: ['off', 'low', 'medium', 'high'],
  },
  'moonshot': {
    defaultLevel: 'low',
    supportedLevels: ['off', 'low', 'medium', 'high'],
    binary: false,
  },
  'minimax': {
    defaultLevel: 'low',
    supportedLevels: ['off', 'low', 'medium', 'high'],
    binary: false,
  },
};

/**
 * 获取 Provider 的思考级别配置
 */
function getProviderThinkingProfile(provider: string): ProviderThinkingSupport | null {
  const normalized = provider.toLowerCase().trim();
  return PROVIDER_THINKING_PROFILES[normalized] || null;
}

// ===================== 思考级别解析主函数 =====================

/**
 * 根据提供者和模型确定支持的思考级别
 *
 * @param params - 解析参数
 * @param params.provider - 提供者名称
 * @param params.model - 模型 ID
 * @param params.catalog - 模型目录条目
 * @returns 解析后的思考配置
 */
export function resolveThinkingProfile(params: {
  provider?: string | null;
  model?: string | null;
  catalog?: ThinkingCatalogEntry[];
}): ResolvedThinkingProfile {
  const { provider, model, catalog } = params;
  const { provider: providerId, model: modelId } = parseModelRef(model);

  // 如果有目录条目，优先使用目录配置
  if (catalog && provider && model) {
    const normalizedProvider = provider.toLowerCase().trim();
    const catalogEntry = catalog.find(
      (entry) =>
        entry.provider.toLowerCase() === normalizedProvider &&
        (entry.id === modelId || entry.id === model),
    );

    if (catalogEntry) {
      // 检查目录条目是否显式禁用思考
      if (catalogEntry.reasoning === false) {
        return buildOffOnlyProfile();
      }

      // 检查是否支持 xhigh
      const supportsXHigh = catalogSupportsXHigh(catalogEntry.compat);
      const levels: Array<{ id: ThinkLevel; label: string; rank: number }> = BASE_THINKING_LEVELS.map((id) => ({
        id,
        label: id,
        rank: THINKING_LEVEL_RANKS[id],
      }));

      if (supportsXHigh) {
        levels.push({ id: 'xhigh', label: 'xhigh', rank: THINKING_LEVEL_RANKS.xhigh });
      }

      return {
        levels,
        defaultLevel: catalogEntry.reasoning === true ? 'low' : 'off',
      };
    }
  }

  // 使用 Provider 配置
  if (providerId) {
    const providerProfile = getProviderThinkingProfile(providerId);
    if (providerProfile) {
      if (providerProfile.binary) {
        return buildBinaryProfile(providerProfile.defaultLevel);
      }

      const levels = providerProfile.supportedLevels.map((id) => ({
        id,
        label: id,
        rank: THINKING_LEVEL_RANKS[id],
      }));

      return {
        levels,
        defaultLevel: providerProfile.defaultLevel,
      };
    }
  }

  // 默认基础配置
  return buildBaseProfile('medium');
}

/**
 * 构建基础思考配置
 */
function buildBaseProfile(defaultLevel?: ThinkLevel | null): ResolvedThinkingProfile {
  return {
    levels: BASE_THINKING_LEVELS.map((id) => ({
      id,
      label: id,
      rank: THINKING_LEVEL_RANKS[id],
    })),
    defaultLevel: defaultLevel ?? 'medium',
  };
}

/**
 * 构建仅 off 配置
 */
function buildOffOnlyProfile(): ResolvedThinkingProfile {
  return {
    levels: [{ id: 'off', label: 'off', rank: THINKING_LEVEL_RANKS.off }],
    defaultLevel: 'off',
  };
}

/**
 * 构建二级配置（off/on）
 */
function buildBinaryProfile(defaultLevel?: ThinkLevel | null): ResolvedThinkingProfile {
  return {
    levels: [
      { id: 'off', label: 'off', rank: THINKING_LEVEL_RANKS.off },
      { id: 'low', label: 'on', rank: THINKING_LEVEL_RANKS.low },
    ],
    defaultLevel,
  };
}

// ===================== 思考级别列表 =====================

/**
 * 列出指定提供者和模型支持的思考级别
 *
 * @param provider - 提供者名称
 * @param model - 模型 ID
 * @param catalog - 模型目录条目
 * @returns 支持的思考级别列表
 */
export function listThinkingLevels(
  provider?: string | null,
  model?: string | null,
  catalog?: ThinkingCatalogEntry[],
): ThinkLevel[] {
  const profile = resolveThinkingProfile({ provider, model, catalog });
  return profile.levels.map((level) => level.id);
}

/**
 * 列出带显示标签的思考级别选项
 */
export function listThinkingLevelOptions(
  provider?: string | null,
  model?: string | null,
  catalog?: ThinkingCatalogEntry[],
): ThinkingLevelOption[] {
  const profile = resolveThinkingProfile({ provider, model, catalog });
  return profile.levels.map(({ id, label }) => ({ id, label }));
}

// ===================== 思考级别验证 =====================

/**
 * 检查指定思考级别是否被支持
 */
export function isThinkingLevelSupported(params: {
  provider?: string | null;
  model?: string | null;
  level: ThinkLevel;
  catalog?: ThinkingCatalogEntry[];
}): boolean {
  const { provider, model, level, catalog } = params;
  return listThinkingLevels(provider, model, catalog).includes(level);
}

/**
 * 解析并验证思考级别，如果不支持则降级到最近的支持级别
 */
export function resolveSupportedThinkingLevel(params: {
  provider?: string | null;
  model?: string | null;
  level: ThinkLevel;
  catalog?: ThinkingCatalogEntry[];
}): ThinkLevel {
  const { provider, model, level, catalog } = params;

  if (isThinkingLevelSupported({ provider, model, level, catalog })) {
    return level;
  }

  // 降级到最接近的支持级别
  const supportedLevels = listThinkingLevels(provider, model, catalog);
  const requestedRank = THINKING_LEVEL_RANKS[level];

  // 优先找 rank <= 请求级别的最高级别
  const downgraded = supportedLevels
    .filter((l) => l !== 'off' && THINKING_LEVEL_RANKS[l] <= requestedRank)
    .sort((a, b) => THINKING_LEVEL_RANKS[b] - THINKING_LEVEL_RANKS[a])[0];

  if (downgraded) {
    return downgraded;
  }

  // 找最低的非 off 级别
  const lowestNonOff = supportedLevels.find((l) => l !== 'off');
  return lowestNonOff ?? 'off';
}

// ===================== 思考级别默认值 =====================

/**
 * 解析指定模型和提供者的默认思考级别
 */
export function resolveThinkingDefault(params: {
  provider: string;
  model: string;
  catalog?: ThinkingCatalogEntry[];
}): ThinkLevel {
  const { provider, model, catalog } = params;
  const profile = resolveThinkingProfile({ provider, model, catalog });
  return profile.defaultLevel ?? 'medium';
}

// ===================== 思考级别格式化 =====================

/**
 * 格式化思考级别列表为字符串
 */
export function formatThinkingLevels(
  provider?: string | null,
  model?: string | null,
  separator = ', ',
  catalog?: ThinkingCatalogEntry[],
): string {
  const profile = resolveThinkingProfile({ provider, model, catalog });
  return profile.levels.map(({ label }) => label).join(separator);
}

// ===================== 思考配置验证 =====================

/**
 * 验证思考配置是否有效
 */
export function validateThinkingConfig(config: {
  level?: ThinkLevel | string;
  provider?: string;
  model?: string;
}): { valid: boolean; normalizedLevel?: ThinkLevel; error?: string } {
  const { level, provider, model } = config;

  if (!level) {
    return { valid: true, normalizedLevel: undefined };
  }

  const normalized = normalizeThinkLevel(level);
  if (!normalized) {
    return {
      valid: false,
      error: `无效的思考级别: ${level}。支持的级别: off, low, medium, high, xhigh, max`,
    };
  }

  // 检查是否支持
  if (provider && model) {
    if (!isThinkingLevelSupported({ provider, model, level: normalized })) {
      const supported = listThinkingLevels(provider, model);
      const nearest = resolveSupportedThinkingLevel({ provider, model, level: normalized });
      logger.warn(
        `思考级别 ${normalized} 不被 ${provider}/${model} 支持，将使用 ${nearest}`,
      );
    }
  }

  return { valid: true, normalizedLevel: normalized };
}
