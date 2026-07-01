/**
 * Soul 优先级管理模块
 *
 * 负责管理配置优先级和合并逻辑：
 * - 优先级顺序：system > project > user > session
 * - 同优先级时，后加载覆盖前加载
 * - 分段级别可独立覆盖
 */

import {
  SoulConfig,
  SoulPriority,
  SoulSection,
  SoulSectionType,
  MergedSoulConfig,
  StrategyPreferences,
  PersonalityMode,
} from './types.js';
import { computeHash } from './parser.js';

// ===================== 常量 =====================

/**
 * 优先级权重映射
 *
 * 数值越大优先级越高
 */
export const PRIORITY_WEIGHTS: Record<SoulPriority, number> = {
  system: 400,   // 系统级（最高）
  project: 300,  // 项目级
  user: 200,     // 用户级
  session: 100,  // 会话级（最低）
};

/**
 * 优先级排序（从高到低）
 */
export const PRIORITY_ORDER: SoulPriority[] = ['system', 'project', 'user', 'session'];

// ===================== 优先级计算 =====================

/**
 * 计算优先级顺序
 *
 * 返回按优先级从高到低排序的配置列表
 */
export function computePriorityOrder(configs: SoulConfig[]): SoulConfig[] {
  return configs.sort((a, b) => {
    const weightA = PRIORITY_WEIGHTS[a.source.priority];
    const weightB = PRIORITY_WEIGHTS[b.source.priority];

    // 优先级高的排前面
    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 同优先级时，加载时间晚的排前面（后加载覆盖前加载）
    return b.source.loadedAt - a.source.loadedAt;
  });
}

/**
 * 解决分段冲突
 *
 * 从多个分段中选择优先级最高的
 */
export function resolveSectionConflict(sections: (SoulSection | null)[]): SoulSection | null {
  // 过滤掉空分段
  const validSections = sections.filter((s): s is SoulSection => s !== null);

  if (validSections.length === 0) return null;
  if (validSections.length === 1) return validSections[0];

  // 按优先级排序
  const sorted = validSections.sort((a, b) => {
    const weightA = PRIORITY_WEIGHTS[a.source.priority];
    const weightB = PRIORITY_WEIGHTS[b.source.priority];

    if (weightA !== weightB) {
      return weightB - weightA;
    }

    // 同优先级时，加载时间晚的优先
    return b.source.loadedAt - a.source.loadedAt;
  });

  return sorted[0];
}

/**
 * 合并策略偏好
 *
 * 高优先级配置覆盖低优先级配置，但只覆盖显式设置的部分
 */
export function mergeStrategies(
  strategies: StrategyPreferences[],
  priorities: SoulPriority[]
): StrategyPreferences {
  const result: StrategyPreferences = {
    plannerThreshold: 'moderate',
    observerFastPath: false,
    maxTurnsMultiplier: 1.0,
  };

  // 按优先级从低到高应用（高优先级覆盖低优先级）
  const sortedPairs = strategies
    .map((strategy, index) => ({
      strategy,
      priority: priorities[index],
      weight: PRIORITY_WEIGHTS[priorities[index]],
    }))
    .sort((a, b) => a.weight - b.weight); // 从低到高

  for (const { strategy } of sortedPairs) {
    // 非默认值才覆盖
    if (strategy.plannerThreshold !== 'moderate') {
      result.plannerThreshold = strategy.plannerThreshold;
    }
    if (strategy.observerFastPath !== false) {
      result.observerFastPath = strategy.observerFastPath;
    }
    if (strategy.maxTurnsMultiplier !== 1.0) {
      result.maxTurnsMultiplier = strategy.maxTurnsMultiplier;
    }
  }

  return result;
}

/**
 * 合并人格模式
 *
 * 选择优先级最高的配置的人格模式
 */
export function mergePersonality(
  personalities: PersonalityMode[],
  priorities: SoulPriority[]
): PersonalityMode {
  // 找出优先级最高的非默认值
  const sortedPairs = personalities
    .map((personality, index) => ({
      personality,
      priority: priorities[index],
      weight: PRIORITY_WEIGHTS[priorities[index]],
    }))
    .sort((a, b) => b.weight - a.weight); // 从高到低

  // 返回第一个非默认值，如果都是默认值则返回 balanced
  for (const { personality } of sortedPairs) {
    if (personality !== 'balanced') {
      return personality;
    }
  }

  return 'balanced';
}

/**
 * 合并多个 Soul 配置
 *
 * 按优先级合并各个分段，高优先级覆盖低优先级
 */
export function mergeSoulConfigs(configs: SoulConfig[]): MergedSoulConfig {
  if (configs.length === 0) {
    throw new Error('无法合并空配置列表');
  }

  // 按优先级排序
  const sortedConfigs = computePriorityOrder(configs);

  // 收集所有来源
  const sources = sortedConfigs.map(c => c.source);

  // 提取所有分段
  const sectionTypes: SoulSectionType[] = ['identity', 'capabilities', 'constraints', 'style', 'knowledge'];
  const mergedSections: Record<SoulSectionType, SoulSection> = {} as Record<SoulSectionType, SoulSection>;

  for (const type of sectionTypes) {
    const sections = sortedConfigs.map(c => c[type] || null);
    const resolved = resolveSectionConflict(sections);

    if (resolved) {
      mergedSections[type] = resolved;
    } else {
      // 创建默认分段
      mergedSections[type] = {
        type,
        content: getDefaultSectionContent(type),
        source: {
          priority: 'system',
          filePath: 'default',
          loadedAt: Date.now(),
        },
        hash: computeHash(getDefaultSectionContent(type)),
      };
    }
  }

  // 合并人格模式和策略
  const personalities = sortedConfigs.map(c => c.personality);
  const priorities = sortedConfigs.map(c => c.source.priority);
  const strategies = sortedConfigs.map(c => c.strategy);

  const mergedPersonality = mergePersonality(personalities, priorities);
  const mergedStrategy = mergeStrategies(strategies, priorities);

  return {
    identity: mergedSections.identity,
    capabilities: mergedSections.capabilities,
    constraints: mergedSections.constraints,
    style: mergedSections.style,
    knowledge: mergedSections.knowledge,
    personality: mergedPersonality,
    strategy: mergedStrategy,
    sources,
  };
}

/**
 * 获取默认分段内容
 */
function getDefaultSectionContent(type: SoulSectionType): string {
  const defaults: Record<SoulSectionType, string> = {
    identity: `## 身份\n\n你是 CrossWMS 智能助手，专注于仓库管理系统（WMS）领域的智能协作。\n`,
    capabilities: `## 能力\n\n- 库存查询\n- 跨仓调拨\n- 数据分析\n- 文件操作\n- 系统诊断\n`,
    constraints: `## 约束\n\n- 不执行未经确认的危险操作\n- 不访问未授权的系统\n- 不编造不存在的数据\n`,
    style: `## 风格\n\n- 简洁直接\n- 中文优先\n- 结构化输出\n`,
    knowledge: `## 知识\n\n仓库管理系统（WMS）领域知识。\n`,
  };

  return defaults[type];
}