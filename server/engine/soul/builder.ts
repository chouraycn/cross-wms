/**
 * Soul 构建器模块
 *
 * 负责构建最终的 system prompt：
 * - 格式化分段内容
 * - 估算 token 数
 * - 生成完整 system message
 */

import {
  MergedSoulConfig,
  SoulSection,
  SoulSectionType,
  SoulProfile,
  PersonalityMode,
  StrategyPreferences,
} from './types.js';
import { loadAllSouls } from './loader.js';

// ===================== Token 估算 =====================

/**
 * 估算文本的 token 数
 *
 * 使用简单的启发式算法：
 * - 中文：约 1.5 字/token
 * - 英文：约 4 字/token
 * - 混合：取平均值
 */
export function estimateTokenCount(text: string): number {
  // 统计中文字符数（兼容 ES5 环境）
  const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;

  // 统计英文单词数（粗略）
  const englishCount = (text.match(/[a-zA-Z]+/g) || []).length;

  // 统计数字和符号
  const otherCount = text.length - chineseCount - englishCount;

  // 估算 token 数
  const chineseTokens = chineseCount / 1.5;
  const englishTokens = englishCount / 4;
  const otherTokens = otherCount / 4;

  return Math.ceil(chineseTokens + englishTokens + otherTokens);
}

/**
 * 估算分段内容的 token 数
 */
export function estimateSectionTokens(section: SoulSection): number {
  return estimateTokenCount(section.content);
}

/**
 * 估算完整配置的 token 数
 */
export function estimateConfigTokens(config: MergedSoulConfig): number {
  const sectionTypes: SoulSectionType[] = ['identity', 'capabilities', 'constraints', 'style', 'knowledge'];
  let total = 0;

  for (const type of sectionTypes) {
    total += estimateSectionTokens(config[type]);
  }

  return total;
}

// ===================== 分段格式化 =====================

/**
 * 格式化单个分段
 *
 * 将分段内容转换为适合注入 system prompt 的格式
 */
export function formatSection(section: SoulSection, includeMetadata = false): string {
  let formatted = section.content;

  // 可选：包含来源元信息（用于调试）
  if (includeMetadata) {
    const priorityLabel = {
      system: '系统级',
      project: '项目级',
      user: '用户级',
      session: '会话级',
    }[section.source.priority];

    formatted = `${formatted}\n<!-- 来源: ${priorityLabel} (${section.source.filePath}) -->`;
  }

  return formatted;
}

/**
 * 格式化分段标题
 *
 * 根据分段类型生成合适的标题
 */
function formatSectionTitle(type: SoulSectionType): string {
  const titles: Record<SoulSectionType, string> = {
    identity: '[身份定义]',
    capabilities: '[能力边界]',
    constraints: '[行为约束]',
    style: '[回复风格]',
    knowledge: '[领域知识]',
  };

  return titles[type];
}

// ===================== System Prompt 构建 =====================

/**
 * 构建完整的 system prompt
 *
 * 将合并后的配置转换为可注入 LLM 的 system message
 */
export function buildSystemPrompt(
  config?: MergedSoulConfig,
  options?: {
    includeMetadata?: boolean;
    maxTokens?: number;
  }
): string {
  const mergedConfig = config || loadAllSouls();
  const { includeMetadata = false, maxTokens = 2000 } = options || {};

  const parts: string[] = [];

  // 添加人格核心信息
  parts.push(`[人格模式] ${mergedConfig.personality}`);
  parts.push('');

  // 添加各分段内容
  const sectionTypes: SoulSectionType[] = ['identity', 'capabilities', 'constraints', 'style', 'knowledge'];

  for (const type of sectionTypes) {
    const section = mergedConfig[type];
    const formatted = formatSection(section, includeMetadata);
    parts.push(formatSectionTitle(type));
    parts.push(formatted);
    parts.push('');
  }

  // 添加策略偏好摘要
  parts.push('[策略偏好]');
  parts.push(`- Planner 触发阈值: ${mergedConfig.strategy.plannerThreshold}`);
  parts.push(`- Observer 快速路径: ${mergedConfig.strategy.observerFastPath ? '启用' : '禁用'}`);
  parts.push(`- 预算轮数乘数: ${mergedConfig.strategy.maxTurnsMultiplier}`);
  parts.push('');

  // 合并文本
  const fullPrompt = parts.join('\n');

  // 如果超过 token 限制，进行裁剪
  const estimatedTokens = estimateTokenCount(fullPrompt);
  if (estimatedTokens > maxTokens) {
    return truncatePrompt(fullPrompt, maxTokens);
  }

  return fullPrompt;
}

/**
 * 裁剪 prompt 以符合 token 限制
 *
 * 保留最重要的分段，删除次要分段
 */
function truncatePrompt(prompt: string, maxTokens: number): string {
  const lines = prompt.split('\n');

  // 优先级：identity > constraints > capabilities > style > knowledge
  // 简单策略：保留前半部分（包含 identity 和 constraints）
  const keepRatio = maxTokens / estimateTokenCount(prompt);
  const keepLines = Math.floor(lines.length * keepRatio * 0.8);

  const truncated = lines.slice(0, keepLines).join('\n');
  return truncated + '\n\n[注：内容已裁剪以符合 token 限制]';
}

/**
 * 构建 SoulProfile（向后兼容）
 *
 * 将新的分段式配置转换为原有的 SoulProfile 格式
 */
export function buildSoulProfile(config?: MergedSoulConfig): SoulProfile {
  const mergedConfig = config || loadAllSouls();

  // 从分段内容中提取列表项
  const tone = extractListItems(mergedConfig.style.content, '语气', '风格');
  const values = extractListItems(mergedConfig.constraints.content, '价值观');
  const forbiddenZones = extractListItems(mergedConfig.constraints.content, '禁区', '约束');

  // 提取身份描述
  const identity = extractIdentity(mergedConfig.identity.content);

  // 构建原始内容（向后兼容）
  const rawSoulContent = [
    mergedConfig.identity.content,
    mergedConfig.capabilities.content,
    mergedConfig.constraints.content,
    mergedConfig.style.content,
  ].join('\n\n');

  const rawUserContent = mergedConfig.knowledge.content;

  return {
    identity,
    personality: mergedConfig.personality,
    tone,
    values,
    forbiddenZones,
    strategy: mergedConfig.strategy,
    rawSoulContent,
    rawUserContent,
  };
}

// ===================== 辅助函数 =====================

/**
 * 从分段内容中提取列表项
 */
function extractListItems(content: string, ...sectionNames: string[]): string[] {
  // 尝试多个可能的分段名称
  for (const name of sectionNames) {
    const sectionRegex = new RegExp(`^##\\s+${name}[\\s\\S]*?(?=^##\\s+|^---\\s*$|$)`, 'm');
    const match = content.match(sectionRegex);

    if (match) {
      return match[0]
        .split('\n')
        .filter(l => /^\s*[-*]\s+/.test(l))
        .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
        .filter(Boolean);
    }
  }

  return [];
}

/**
 * 从身份分段中提取身份描述
 */
function extractIdentity(content: string): string {
  const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('<!'));
  return lines[0]?.replace(/^[-*]\s*/, '').trim() || 'CrossWMS 智能助手';
}

/**
 * 根据人格模式获取策略偏好默认值
 *
 * 在配置未显式定义策略偏好时，根据 personality 推断
 */
export function getPersonalityStrategyDefaults(personality: PersonalityMode): StrategyPreferences {
  switch (personality) {
    case 'cautious':
      return {
        plannerThreshold: 'simple',    // 简单任务也触发 Planner
        observerFastPath: false,        // 不跳过反思
        maxTurnsMultiplier: 0.8,        // 更早收敛
      };
    case 'efficient':
      return {
        plannerThreshold: 'complex',    // 只有复杂任务才触发 Planner
        observerFastPath: true,         // 跳过反思，快速执行
        maxTurnsMultiplier: 1.2,        // 更宽松的轮数预算
      };
    case 'balanced':
    default:
      return {
        plannerThreshold: 'moderate',
        observerFastPath: false,
        maxTurnsMultiplier: 1.0,
      };
  }
}

/**
 * 获取合并后的策略偏好
 *
 * 结合配置值和 personality 默认值
 */
export function getMergedStrategyPreferences(config?: MergedSoulConfig): StrategyPreferences {
  const mergedConfig = config || loadAllSouls();
  const defaults = getPersonalityStrategyDefaults(mergedConfig.personality);

  // 配置值优先，未定义的部分使用 personality 默认值
  return {
    plannerThreshold: mergedConfig.strategy.plannerThreshold !== 'moderate'
      ? mergedConfig.strategy.plannerThreshold
      : defaults.plannerThreshold,
    observerFastPath: mergedConfig.strategy.observerFastPath !== false
      ? mergedConfig.strategy.observerFastPath
      : defaults.observerFastPath,
    maxTurnsMultiplier: mergedConfig.strategy.maxTurnsMultiplier !== 1.0
      ? mergedConfig.strategy.maxTurnsMultiplier
      : defaults.maxTurnsMultiplier,
  };
}