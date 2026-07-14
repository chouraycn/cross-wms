/**
 * Keyword Trigger Engine — 关键字自动触发引擎
 *
 * 实现 AI 对话中的关键字自动启动能力：
 * 1. 从 SKILL.md frontmatter 的 `triggers` 字段提取触发关键词
 * 2. 在用户消息中进行关键词匹配（支持中英文）
 * 3. 根据匹配结果自动触发相关 Skill
 * 4. 支持配置触发阈值、匹配模式
 *
 * 核心流程：
 *   用户消息 → 关键词提取 → 匹配 Skill → 自动触发
 *
 * 配置项：
 *   - enabled: 是否启用关键词触发
 *   - threshold: 匹配阈值（0-1），超过阈值才触发
 *   - matchMode: 匹配模式（exact: 精确匹配, fuzzy: 模糊匹配, semantic: 语义匹配）
 *   - maxTriggersPerMessage: 单条消息最多触发多少个 Skill
 */

import { logger } from '../logger.js';
import { skillRegistry } from './skillRegistry.js';
import { SkillDiscovery } from './skillDiscovery.js';
import type { RegisteredSkill } from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 匹配模式 */
export type KeywordMatchMode = 'exact' | 'fuzzy' | 'semantic';

/** 触发配置 */
export interface KeywordTriggerConfig {
  enabled: boolean;
  threshold: number;
  matchMode: KeywordMatchMode;
  maxTriggersPerMessage: number;
  caseSensitive: boolean;
  ignoreStopWords: boolean;
}

/** 关键词触发规则 */
export interface KeywordTriggerRule {
  skillId: string;
  skillName: string;
  keywords: string[];
  weight: number;
}

/** 触发匹配结果 */
export interface KeywordMatchResult {
  skillId: string;
  skillName: string;
  matchedKeywords: string[];
  matchScore: number;
  reason: string;
}

/** 触发上下文 */
export interface TriggerContext {
  sessionId: string;
  userId?: string;
  message: string;
  agentId?: string;
}

// ===================== 常量 =====================

/** 默认配置 */
const DEFAULT_CONFIG: KeywordTriggerConfig = {
  enabled: true,
  threshold: 0.3,
  matchMode: 'fuzzy',
  maxTriggersPerMessage: 3,
  caseSensitive: false,
  ignoreStopWords: true,
};

/** 中英文停用词 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'or', 'in', 'on', 'for',
  'with', 'by', 'as', 'at', 'be', 'this', 'that', 'it', 'from', 'has', 'have',
  'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'can',
  'not', 'but', 'if', 'then', 'else', 'its', 'your', 'you', 'we', 'our',
  'they', 'them', 'their', 'all', 'any', 'some', 'more', 'less', 'than', 'so',
  'no', 'yes', 'out', 'up', 'down', 'about', 'into', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'right',
  'now', 'new', 'old', 'first', 'last', 'long', 'little', 'own', 'right',
  'big', 'high', 'different', 'small', 'large', 'next', 'early', 'young',
  'important', 'public', 'bad', 'same', 'able',
  '的', '了', '是', '在', '和', '与', '或', '及', '以', '为', '用', '给', '把', '被',
  '一', '个', '这', '那', '它', '从', '到', '有', '不', '也', '都', '很', '就', '还',
  '要', '会', '可以', '能', '应该', '可能', '必须', '一定', '已经', '正在', '曾经',
  '将', '会', '得', '过', '着', '了', '吗', '呢', '吧', '啊', '哦', '呀', '呢',
  '什么', '怎么', '为什么', '哪里', '谁', '几', '多少', '哪', '哪', '每', '各', '某',
  '所有', '任何', '一些', '很多', '很少', '没有', '无数', '许多', '若干', '全部',
]);

// ===================== 关键词触发引擎 =====================

export class KeywordTriggerEngine {
  /** 触发规则索引：关键词 → 规则列表 */
  private keywordIndex = new Map<string, KeywordTriggerRule[]>();

  /** Skill ID → 规则映射 */
  private skillRules = new Map<string, KeywordTriggerRule>();

  /** 配置 */
  private config: KeywordTriggerConfig = { ...DEFAULT_CONFIG };

  /** 是否已初始化 */
  private initialized = false;

  /** 触发统计 */
  private stats = {
    totalTriggers: 0,
    totalMatchAttempts: 0,
    matchSuccessCount: 0,
    skillTriggerCounts: new Map<string, number>(),
    keywordTriggerCounts: new Map<string, number>(),
    recentTriggers: [] as Array<{
      timestamp: number;
      message: string;
      skillId: string;
      skillName: string;
      matchedKeywords: string[];
      score: number;
    }>,
  };

  constructor(config?: Partial<KeywordTriggerConfig>) {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
  }

  // ===================== 1. 初始化与注册 =====================

  /**
   * 初始化引擎（从 Skill Registry 加载触发规则）
   */
  initialize(): void {
    if (this.initialized) {
      logger.debug('[KeywordTriggerEngine] Already initialized');
      return;
    }

    this.loadRulesFromRegistry();
    this.initialized = true;

    logger.info(`[KeywordTriggerEngine] Initialized with ${this.skillRules.size} skill rules`);
  }

  /**
   * 从 Skill Registry 加载触发规则
   */
  private loadRulesFromRegistry(): void {
    this.keywordIndex.clear();
    this.skillRules.clear();

    const skills = skillRegistry.getAllSkills();
    for (const skill of skills) {
      const rule = this.extractTriggerRule(skill);
      if (rule && rule.keywords.length > 0) {
        this.registerRule(rule);
      }
    }
  }

  /**
   * 从 Skill 定义中提取触发规则
   * 支持多种触发字段格式：
   * - trigger: "hscode"（单个触发词，OpenClaw 格式）
   * - triggers: ["hscode", "编码"]（多个触发词，标准格式）
   * - tags: ["wms", "海关"]（标签也作为关键词）
   * - name: "HS Code 助手"（技能名称）
   */
  private extractTriggerRule(skill: RegisteredSkill): KeywordTriggerRule | null {
    const { definition } = skill;

    let keywords: string[] = [];

    if (definition.trigger && typeof definition.trigger === 'string') {
      keywords.push(definition.trigger);
    }

    if (definition.triggers && Array.isArray(definition.triggers)) {
      keywords = [...keywords, ...definition.triggers];
    }

    if (definition.tags && Array.isArray(definition.tags)) {
      keywords = [...keywords, ...definition.tags];
    }

    if (definition.name) {
      keywords.push(definition.name);
    }

    keywords = keywords.filter(k => k && k.trim().length >= 2);

    if (keywords.length === 0) {
      return null;
    }

    return {
      skillId: definition.id,
      skillName: definition.name || definition.id,
      keywords: keywords.map(k => this.config.caseSensitive ? k.trim() : k.trim().toLowerCase()),
      weight: (definition as any).triggerWeight ?? 1.0,
    };
  }

  /**
   * 注册触发规则
   */
  registerRule(rule: KeywordTriggerRule): void {
    this.skillRules.set(rule.skillId, rule);

    for (const keyword of rule.keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, []);
      }
      this.keywordIndex.get(keyword)!.push(rule);
    }

    logger.debug(`[KeywordTriggerEngine] Registered rule for skill "${rule.skillName}" with ${rule.keywords.length} keywords`);
  }

  /**
   * 注销触发规则
   */
  unregisterRule(skillId: string): void {
    const rule = this.skillRules.get(skillId);
    if (!rule) return;

    for (const keyword of rule.keywords) {
      const rules = this.keywordIndex.get(keyword);
      if (rules) {
        this.keywordIndex.set(keyword, rules.filter(r => r.skillId !== skillId));
      }
    }

    this.skillRules.delete(skillId);
    logger.debug(`[KeywordTriggerEngine] Unregistered rule for skill "${skillId}"`);
  }

  /**
   * 刷新规则（重新从 Registry 加载）
   */
  refreshRules(): void {
    logger.debug('[KeywordTriggerEngine] Refreshing rules...');
    this.loadRulesFromRegistry();
  }

  // ===================== 2. 关键词匹配 =====================

  /**
   * 从消息中提取关键词
   */
  extractKeywords(message: string): string[] {
    const text = this.config.caseSensitive ? message : message.toLowerCase();
    const tokens: string[] = [];

    const chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
    const englishPattern = /[a-z0-9_-]{2,}/gi;

    let match;
    while ((match = chinesePattern.exec(text)) !== null) {
      tokens.push(match[0]);
    }

    englishPattern.lastIndex = 0;
    while ((match = englishPattern.exec(text)) !== null) {
      tokens.push(match[0]);
    }

    if (this.config.ignoreStopWords) {
      return tokens.filter(t => !STOP_WORDS.has(t.toLowerCase()));
    }

    return tokens;
  }

  /**
   * 匹配消息中的关键词，返回匹配的 Skill
   */
  matchMessage(message: string, context?: TriggerContext): KeywordMatchResult[] {
    if (!this.config.enabled) {
      return [];
    }

    const keywords = this.extractKeywords(message);
    if (keywords.length === 0) {
      return [];
    }

    const results: KeywordMatchResult[] = [];
    const matchedSkillIds = new Set<string>();

    for (const keyword of keywords) {
      const rules = this.keywordIndex.get(keyword) ?? [];

      for (const rule of rules) {
        if (matchedSkillIds.has(rule.skillId)) continue;

        const score = this.computeMatchScore(keyword, rule, message);
        if (score >= this.config.threshold) {
          const matchedKeywords = this.findMatchingKeywords(rule, message);

          results.push({
            skillId: rule.skillId,
            skillName: rule.skillName,
            matchedKeywords,
            matchScore: score,
            reason: this.buildReason(rule, matchedKeywords, score),
          });

          matchedSkillIds.add(rule.skillId);
        }
      }
    }

    results.sort((a, b) => b.matchScore - a.matchScore);
    const finalResults = results.slice(0, this.config.maxTriggersPerMessage);

    this.stats.totalMatchAttempts++;
    if (finalResults.length > 0) {
      this.stats.matchSuccessCount++;
      for (const match of finalResults) {
        this.stats.totalTriggers++;
        this.stats.skillTriggerCounts.set(match.skillId, (this.stats.skillTriggerCounts.get(match.skillId) || 0) + 1);
        for (const kw of match.matchedKeywords) {
          this.stats.keywordTriggerCounts.set(kw, (this.stats.keywordTriggerCounts.get(kw) || 0) + 1);
        }
        this.stats.recentTriggers.unshift({
          timestamp: Date.now(),
          message: message.substring(0, 100),
          skillId: match.skillId,
          skillName: match.skillName,
          matchedKeywords: match.matchedKeywords,
          score: match.matchScore,
        });
        if (this.stats.recentTriggers.length > 50) {
          this.stats.recentTriggers.pop();
        }
      }
    }

    return finalResults;
  }

  /**
   * 检查关键词是否是完整单词（词边界检查）
   */
  private isFullWordMatch(keyword: string, message: string): boolean {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
    
    const regex = new RegExp(`(?:^|\\s|[^a-zA-Z0-9\u4e00-\u9fa5_-])${lowerKeyword}(?:$|\\s|[^a-zA-Z0-9\u4e00-\u9fa5_-])`, 'g');
    return regex.test(lowerMessage);
  }

  /**
   * 计算关键词在消息中的位置权重（开头权重更高）
   */
  private computePositionWeight(keyword: string, message: string): number {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
    const index = lowerMessage.indexOf(lowerKeyword);
    
    if (index === -1) return 0;
    if (index === 0) return 0.3;
    if (index < message.length * 0.3) return 0.2;
    if (index < message.length * 0.5) return 0.1;
    return 0;
  }

  /**
   * 计算匹配分数
   */
  private computeMatchScore(keyword: string, rule: KeywordTriggerRule, message: string): number {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    let score = 0;

    switch (this.config.matchMode) {
      case 'exact':
        if (this.isFullWordMatch(keyword, message)) {
          score = 1.0;
        } else if (lowerMessage.includes(keyword)) {
          score = 0.7;
        }
        break;

      case 'fuzzy':
        const matchedCount = rule.keywords.filter(k => lowerMessage.includes(k)).length;
        const matchedKeywords = rule.keywords.filter(k => lowerMessage.includes(k));
        
        if (matchedCount === 0) {
          score = 0;
          break;
        }
        
        const matchRatio = matchedCount / rule.keywords.length;
        let baseScore = Math.max(0.3, matchRatio) * rule.weight;
        
        for (const mk of matchedKeywords) {
          baseScore += this.computePositionWeight(mk, message);
        }
        
        if (this.isFullWordMatch(keyword, message)) {
          baseScore += 0.2;
        } else if (lowerMessage.includes(keyword)) {
          baseScore += 0.1;
        }
        
        score = Math.min(1.0, baseScore);
        break;

      case 'semantic':
        score = this.computeSemanticScore(rule, message);
        break;
    }

    return score;
  }

  /**
   * 计算语义匹配分数（简化版）
   */
  private computeSemanticScore(rule: KeywordTriggerRule, message: string): number {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const matchedCount = rule.keywords.filter(k => lowerMessage.includes(k)).length;

    if (matchedCount === 0) return 0;

    const baseScore = matchedCount / rule.keywords.length;

    let contextBonus = 0;
    const skillTerms = [...rule.keywords, rule.skillName.toLowerCase()];
    for (const term of skillTerms) {
      if (term.length >= 3 && lowerMessage.includes(term)) {
        contextBonus += 0.1;
      }
    }

    return Math.min(1.0, baseScore + contextBonus) * rule.weight;
  }

  /**
   * 找出匹配的关键词列表
   */
  private findMatchingKeywords(rule: KeywordTriggerRule, message: string): string[] {
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    return rule.keywords.filter(k => lowerMessage.includes(k));
  }

  /**
   * 构建匹配理由
   */
  private buildReason(rule: KeywordTriggerRule, matchedKeywords: string[], score: number): string {
    const parts: string[] = [];

    if (matchedKeywords.length > 0) {
      parts.push(`匹配关键词: ${matchedKeywords.join(', ')}`);
    }

    parts.push(`匹配模式: ${this.config.matchMode}`);
    parts.push(`匹配分数: ${score.toFixed(2)}`);
    parts.push(`阈值: ${this.config.threshold}`);

    return parts.join('; ');
  }

  // ===================== 3. 触发执行 =====================

  /**
   * 执行匹配到的 Skill（返回触发结果，由上层决定是否实际执行）
   */
  async triggerMatchedSkills(
    message: string,
    context: TriggerContext,
  ): Promise<Array<{ result: KeywordMatchResult; skill?: RegisteredSkill }>> {
    const matches = this.matchMessage(message, context);
    if (matches.length === 0) {
      return [];
    }

    const results: Array<{ result: KeywordMatchResult; skill?: RegisteredSkill }> = [];

    for (const match of matches) {
      const skill = skillRegistry.getSkill(match.skillId);

      if (skill) {
        logger.info(`[KeywordTriggerEngine] Triggering skill "${match.skillName}" for message: "${message.substring(0, 50)}..."`);
        logger.debug(`[KeywordTriggerEngine] Trigger reason: ${match.reason}`);
      }

      results.push({
        result: match,
        skill,
      });
    }

    return results;
  }

  // ===================== 4. 配置管理 =====================

  /**
   * 获取当前配置
   */
  getConfig(): KeywordTriggerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<KeywordTriggerConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`[KeywordTriggerEngine] Config updated: ${JSON.stringify(this.config)}`);

    if (!this.config.caseSensitive) {
      this.refreshRules();
    }
  }

  /**
   * 启用/禁用关键词触发
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`[KeywordTriggerEngine] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalRules: number;
    totalKeywords: number;
    totalTriggers: number;
    totalMatchAttempts: number;
    matchSuccessCount: number;
    matchSuccessRate: number;
    skillTriggerCounts: Record<string, number>;
    keywordTriggerCounts: Record<string, number>;
    topSkills: Array<{ skillId: string; skillName: string; count: number }>;
    topKeywords: Array<{ keyword: string; count: number }>;
    recentTriggers: Array<{
      timestamp: number;
      message: string;
      skillId: string;
      skillName: string;
      matchedKeywords: string[];
      score: number;
    }>;
    config: KeywordTriggerConfig;
  } {
    const skillCounts = Array.from(this.stats.skillTriggerCounts.entries())
      .map(([skillId, count]) => ({
        skillId,
        skillName: this.skillRules.get(skillId)?.skillName || skillId,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const keywordCounts = Array.from(this.stats.keywordTriggerCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRules: this.skillRules.size,
      totalKeywords: this.keywordIndex.size,
      totalTriggers: this.stats.totalTriggers,
      totalMatchAttempts: this.stats.totalMatchAttempts,
      matchSuccessCount: this.stats.matchSuccessCount,
      matchSuccessRate: this.stats.totalMatchAttempts > 0
        ? this.stats.matchSuccessCount / this.stats.totalMatchAttempts
        : 0,
      skillTriggerCounts: Object.fromEntries(this.stats.skillTriggerCounts),
      keywordTriggerCounts: Object.fromEntries(this.stats.keywordTriggerCounts),
      topSkills: skillCounts,
      topKeywords: keywordCounts,
      recentTriggers: this.stats.recentTriggers,
      config: this.getConfig(),
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalTriggers: 0,
      totalMatchAttempts: 0,
      matchSuccessCount: 0,
      skillTriggerCounts: new Map<string, number>(),
      keywordTriggerCounts: new Map<string, number>(),
      recentTriggers: [],
    };
    logger.info('[KeywordTriggerEngine] Stats reset');
  }

  // ===================== 5. 辅助方法 =====================

  /**
   * 检查单个关键词是否匹配
   */
  matchesKeyword(keyword: string, message: string): boolean {
    const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    return lowerMessage.includes(lowerKeyword);
  }

  /**
   * 获取所有已注册的关键词
   */
  getAllKeywords(): string[] {
    return Array.from(this.keywordIndex.keys());
  }

  /**
   * 获取指定 Skill 的触发规则
   */
  getRuleBySkillId(skillId: string): KeywordTriggerRule | undefined {
    return this.skillRules.get(skillId);
  }
}

// ===================== 单例导出 =====================

const KEYWORD_TRIGGER_ENGINE_INSTANCE = new KeywordTriggerEngine();

export function getKeywordTriggerEngine(): KeywordTriggerEngine {
  return KEYWORD_TRIGGER_ENGINE_INSTANCE;
}

export function initKeywordTriggerEngine(config?: Partial<KeywordTriggerConfig>): void {
  if (config) {
    KEYWORD_TRIGGER_ENGINE_INSTANCE.updateConfig(config);
  }
  KEYWORD_TRIGGER_ENGINE_INSTANCE.initialize();
}

