/**
 * Soul 解析器模块
 *
 * 负责解析 SOUL.md 和 USER.md 文件，包括：
 * - Markdown 解析
 * - YAML Front Matter 解析
 * - 分段提取
 * - 元数据提取
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import {
  SoulConfig,
  SoulSection,
  SoulSectionType,
  SoulSource,
  PersonalityMode,
  StrategyPreferences,
} from './types.js';

// ===================== 默认值 =====================

/** 默认策略偏好 */
export const DEFAULT_STRATEGY: StrategyPreferences = {
  plannerThreshold: 'moderate',
  observerFastPath: false,
  maxTurnsMultiplier: 1.0,
};

/** 默认人格模式 */
export const DEFAULT_PERSONALITY: PersonalityMode = 'balanced';

// ===================== 工具函数 =====================

/**
 * 计算内容哈希
 */
export function computeHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * 安全读取文件（同步版本）
 *
 * 此函数为解析器提供简单的文件读取功能
 * 注意：loader.ts 中有更完整的带缓存的版本
 */
export function safeReadFileSync(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // 读取失败，返回空
  }
  return '';
}

// ===================== 解析器 =====================

/**
 * 解析 YAML Front Matter
 *
 * 从 Markdown 内容中提取 YAML 元数据
 */
export function parseFrontMatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return {};

  try {
    // 简单 YAML 解析（不支持复杂结构）
    const yaml = match[1];
    const result: Record<string, unknown> = {};

    yaml.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value: unknown = line.slice(colonIndex + 1).trim();

        // 基本类型转换
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (/^\d+$/.test(value as string)) value = parseInt(value as string, 10);
        else if (/^\d+\.\d+$/.test(value as string)) value = parseFloat(value as string);
        else if (/^['"](.*)['"]$/.test(value as string)) {
          value = (value as string).slice(1, -1);
        }

        result[key] = value;
      }
    });

    return result;
  } catch {
    return {};
  }
}

/**
 * 提取 Markdown 某个 ## 节的内容
 */
export function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(`^##\\s+${heading}[\\s\\S]*?(?=^##\\s+|^---\\s*$|$)`, 'm');
  const match = content.match(regex);
  return match ? match[0] : null;
}

/**
 * 提取所有分段内容
 *
 * 按照分段类型提取完整内容
 */
export function extractSections(
  content: string,
  source: SoulSource
): Record<SoulSectionType, SoulSection | null> {
  const sections: Record<SoulSectionType, SoulSection | null> = {
    identity: null,
    capabilities: null,
    constraints: null,
    style: null,
    knowledge: null,
  };

  // 映射分段名称（支持中英文）
  const sectionMapping: Record<SoulSectionType, string[]> = {
    identity: ['身份', 'Identity', 'identity'],
    capabilities: ['能力', 'Capabilities', 'capabilities'],
    constraints: ['约束', '禁区', 'Constraints', 'constraints'],
    style: ['风格', '语气', 'Style', 'style'],
    knowledge: ['知识', 'Knowledge', 'knowledge'],
  };

  // 遍历每种分段类型
  for (const [type, headings] of Object.entries(sectionMapping)) {
    for (const heading of headings) {
      const sectionContent = extractSection(content, heading);
      if (sectionContent) {
        sections[type as SoulSectionType] = {
          type: type as SoulSectionType,
          content: sectionContent,
          source,
          hash: computeHash(sectionContent),
        };
        break;
      }
    }
  }

  return sections;
}

/**
 * 从 SOUL.md 内容中解析 personality 字段
 */
export function parsePersonality(content: string): PersonalityMode {
  const match = content.match(/-?\s*\*{0,2}personality\*{0,2}\s*[:：]\s*`?(cautious|efficient|balanced)`?/i);
  if (match) {
    const mode = match[1].toLowerCase() as PersonalityMode;
    if (['cautious', 'efficient', 'balanced'].includes(mode)) return mode;
  }
  return DEFAULT_PERSONALITY;
}

/**
 * 从 SOUL.md 内容中解析策略偏好
 */
export function parseStrategyPreferences(content: string): StrategyPreferences {
  const prefs = { ...DEFAULT_STRATEGY };

  // plannerThreshold
  const ptMatch = content.match(/`plannerThreshold`\s*[:：]\s*`?(simple|moderate|complex)`?/i);
  if (ptMatch) prefs.plannerThreshold = ptMatch[1].toLowerCase() as StrategyPreferences['plannerThreshold'];

  // observerFastPath
  const ofpMatch = content.match(/`observerFastPath`\s*[:：]\s*`?(true|false)`?/i);
  if (ofpMatch) prefs.observerFastPath = ofpMatch[1].toLowerCase() === 'true';

  // maxTurnsMultiplier
  const mtmMatch = content.match(/`maxTurnsMultiplier`\s*[:：]\s*`?([\d.]+)`?/);
  if (mtmMatch) prefs.maxTurnsMultiplier = parseFloat(mtmMatch[1]) || 1.0;

  return prefs;
}

/**
 * 从 SOUL.md 内容中提取身份描述
 */
export function parseIdentity(content: string): string {
  const section = extractSection(content, '身份');
  if (!section) return 'CrossWMS 智能助手';
  // 取第一行非空内容
  const lines = section.split('\n').filter(l => l.trim() && !l.trim().startsWith('<!--'));
  return lines[0]?.replace(/^[-*]\s*/, '').trim() || 'CrossWMS 智能助手';
}

/**
 * 从 SOUL.md 内容中提取列表项
 */
export function parseListItems(content: string, sectionName: string): string[] {
  const section = extractSection(content, sectionName);
  if (!section) return [];
  return section
    .split('\n')
    .filter(l => /^\s*[-*]\s+/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}

/**
 * 解析完整的 SOUL.md 文件
 */
export function parseSoulMarkdown(
  content: string,
  source: SoulSource
): SoulConfig {
  const sections = extractSections(content, source);
  const personality = parsePersonality(content);
  const strategy = parseStrategyPreferences(content);

  return {
    source,
    identity: sections.identity || undefined,
    capabilities: sections.capabilities || undefined,
    constraints: sections.constraints || undefined,
    style: sections.style || undefined,
    knowledge: sections.knowledge || undefined,
    personality,
    strategy,
    rawContent: content,
  };
}

/**
 * 解析 USER.md 文件
 *
 * USER.md 主要提供用户画像信息，作为 knowledge 分段
 */
export function parseUserMarkdown(
  content: string,
  source: SoulSource
): SoulConfig {
  const sections = extractSections(content, source);

  // 将 USER.md 的内容作为 knowledge 分段
  const knowledgeContent = content.trim()
    ? `## 用户画像\n\n${content.replace(/^---[\s\S]*?---\s*\n/, '').trim()}`
    : '';

  return {
    source,
    identity: sections.identity || undefined,
    capabilities: sections.capabilities || undefined,
    constraints: sections.constraints || undefined,
    style: sections.style || undefined,
    knowledge: knowledgeContent
      ? {
          type: 'knowledge',
          content: knowledgeContent,
          source,
          hash: computeHash(knowledgeContent),
        }
      : undefined,
    personality: DEFAULT_PERSONALITY,
    strategy: DEFAULT_STRATEGY,
    rawContent: content,
  };
}