/**
 * AgentScenarioMatcher — Agent 场景匹配器
 *
 * 根据用户消息智能匹配最佳场景：
 * - 关键词匹配
 * - 语义相似度计算
 * - 意图提取与分析
 *
 * @module engine/agentScenarioMatcher
 */

import { agentIdentityManager, type AgentScenario } from './agentIdentity.js';
import { logger } from '../logger.js';

// ===================== 常量 =====================

/**
 * WMS 领域关键词库（按场景分类）
 */
const WMS_KEYWORD_TAXONOMY: Record<string, string[]> = {
  // 库存相关
  inventory: ['库存', '存货', '数量', '库位', '批次', '库存查询', '库存数量', '库存在线', '库存明细', '库存汇总'],
  inbound: ['入库', '收货', '采购入库', '退货入库', '入库单', '到货', '送货', '验货', '入库操作'],
  outbound: ['出库', '发货', '销售出库', '出库单', '拣货', '打包', '出库操作', '提货', '配送'],
  transfer: ['调拨', '转移', '跨仓', '库间调拨', '调拨单', '转移单', '移库'],
  location: ['库位', '库位管理', '库位查询', '库位调整', '货架', '仓位', '库区'],

  // 数据分析相关
  report: ['报表', '统计', '分析', '汇总', '报表生成', '数据报表', '统计报表', '库存报表', '出库报表', '入库报表'],
  forecast: ['预测', '趋势', 'forecast', '预测分析', '库存预测', '需求预测', '趋势分析'],

  // 操作相关
  stocktake: ['盘点', '清点', '核查', '盘点任务', '库存盘点', '定期盘点', '盘点操作'],
  replenishment: ['补货', 'replenishment', '补货建议', '补货任务', '补货操作', '自动补货'],

  // 问题诊断相关
  debug: ['问题', '错误', '异常', '诊断', '排查', '修复', '问题诊断', '错误排查'],
  datafix: ['数据', '修复', '差异', '对账', '数据修复', '数据修正', '数据异常', '库存差异'],

  // 通用
  general: ['帮助', '怎么', '如何', '请问', '我想', '帮我', '查询', '看看', '检查', '操作'],
};

/**
 * 意图动词关键词
 */
const INTENT_VERBS: Record<string, string[]> = {
  query: ['查询', '查看', '看看', '检索', '搜索', '找', '获取'],
  create: ['创建', '新增', '添加', '新建', '增加', '录入'],
  update: ['修改', '更新', '编辑', '调整', '变更', '更改'],
  delete: ['删除', '移除', '清除', '作废', '取消'],
  execute: ['执行', '操作', '处理', '办理', '进行', '完成'],
  analyze: ['分析', '统计', '汇总', '生成报表', '分析', '诊断'],
  help: ['帮助', '协助', '指导', '提示', '建议', '推荐'],
};

/**
 * 场景推荐缓存时间（毫秒）
 */
const RECOMMENDATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟

// ===================== AgentScenarioMatcher =====================

/**
 * 场景匹配结果
 */
export interface MatchResult {
  /** 场景 ID */
  scenarioId: string;
  /** 场景名称 */
  scenarioName: string;
  /** 匹配得分 (0-100) */
  score: number;
  /** 匹配类型 */
  matchType: 'exact' | 'keyword' | 'semantic' | 'fallback';
  /** 匹配的关键词 */
  matchedKeywords: string[];
  /** 关联的 Agent ID */
  agentId: string;
}

/**
 * 用户意图提取结果
 */
export interface ExtractedIntent {
  /** 原始消息 */
  originalMessage: string;
  /** 意图类型 */
  intentType: string;
  /** 实体关键词 */
  entities: string[];
  /** 领域分类 */
  domain: string[];
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * 推荐场景结果
 */
export interface RecommendedScenario extends MatchResult {
  /** 推荐理由 */
  reason: string;
  /** 是否为默认推荐 */
  isDefault: boolean;
}

// ===================== AgentScenarioMatcher =====================

/**
 * Agent 场景匹配器（单例模式）
 *
 * 核心功能：
 * 1. matchScenario(userMessage) - 根据用户消息匹配最佳场景
 * 2. extractIntent(message) - 提取用户意图
 * 3. getRecommendedScenarios() - 获取推荐场景列表
 *
 * 匹配策略：
 * 1. 精确匹配：场景 ID 或名称完全一致
 * 2. 关键词匹配：消息命中场景 tags 或领域关键词
 * 3. 语义相似度：基于关键词共现计算语义相似度
 * 4. Fallback：返回默认场景
 */
class AgentScenarioMatcher {
  /** 场景列表缓存 */
  private scenarios: AgentScenario[] = [];

  /** 领域关键词索引 */
  private domainKeywordIndex: Map<string, Set<string>> = new Map();

  /** 意图动词索引 */
  private intentVerbIndex: Map<string, string> = new Map();

  /** 推荐场景缓存 */
  private recommendationCache: Map<string, { scenarios: RecommendedScenario[]; timestamp: number }> = new Map();

  /** 缓存的推荐场景 */
  private cachedRecommendations: RecommendedScenario[] | null = null;

  /** 缓存时间戳 */
  private cacheTimestamp = 0;

  constructor() {}

  // ===================== 初始化 =====================

  /**
   * 初始化匹配器
   */
  initialize(): void {
    // 初始化场景列表
    this.scenarios = agentIdentityManager.listScenarios();

    // 构建领域关键词索引
    this.buildDomainKeywordIndex();

    // 构建意图动词索引
    this.buildIntentVerbIndex();

    logger.debug(`[AgentScenarioMatcher] 初始化完成，共 ${this.scenarios.length} 个场景`);
  }

  // ===================== 公开接口 =====================

  /**
   * 根据用户消息匹配最佳场景
   *
   * @param userMessage 用户消息
   * @returns 匹配结果（按得分降序排列，最多返回 5 个）
   */
  matchScenario(userMessage: string): MatchResult[] {
    const normalized = this.normalizeMessage(userMessage);
    const results: MatchResult[] = [];

    for (const scenario of this.scenarios) {
      const matchResult = this.evaluateScenarioMatch(scenario, normalized);
      if (matchResult.score > 0) {
        results.push(matchResult);
      }
    }

    // 按得分降序排列
    results.sort((a, b) => b.score - a.score);

    // 返回前 5 个结果
    return results.slice(0, 5);
  }

  /**
   * 提取用户意图
   *
   * @param message 用户消息
   * @returns 提取的意图信息
   */
  extractIntent(message: string): ExtractedIntent {
    const normalized = this.normalizeMessage(message);
    const intentType = this.detectIntentType(normalized);
    const entities = this.extractEntities(normalized);
    const domain = this.classifyDomain(normalized);
    const confidence = this.calculateIntentConfidence(normalized, intentType, domain);

    return {
      originalMessage: message,
      intentType,
      entities,
      domain,
      confidence,
    };
  }

  /**
   * 获取推荐场景列表
   *
   * @param limit 返回数量限制，默认 3
   * @returns 推荐场景列表
   */
  getRecommendedScenarios(limit = 3): RecommendedScenario[] {
    // 检查缓存
    const now = Date.now();
    if (this.cachedRecommendations && now - this.cacheTimestamp < RECOMMENDATION_CACHE_TTL_MS) {
      return this.cachedRecommendations.slice(0, limit);
    }

    const recommendations: RecommendedScenario[] = [];

    // 从每个主要 Agent 中选择最高优先级的场景
    const agentIds = ['wms-expert', 'wms-analyst', 'wms-operator', 'debugger', 'general'];
    for (const agentId of agentIds) {
      const agent = agentIdentityManager.getAgent(agentId);
      if (!agent || agent.enabled === false) continue;

      const scenarios = agentIdentityManager.getScenariosForAgent(agentId);
      if (scenarios.length > 0) {
        const topScenario = scenarios[0]; // 已按 priority 排序
        recommendations.push({
          scenarioId: topScenario.id,
          scenarioName: topScenario.name,
          score: 100 - topScenario.priority,
          matchType: 'fallback',
          matchedKeywords: [],
          agentId: topScenario.agentId,
          reason: this.generateRecommendationReason(topScenario),
          isDefault: agentId === 'general',
        });
      }
    }

    // 缓存结果
    this.cachedRecommendations = recommendations;
    this.cacheTimestamp = now;

    return recommendations.slice(0, limit);
  }

  // ===================== 私有方法 =====================

  /**
   * 构建领域关键词索引
   */
  private buildDomainKeywordIndex(): void {
    this.domainKeywordIndex.clear();

    for (const [domain, keywords] of Object.entries(WMS_KEYWORD_TAXONOMY)) {
      const keywordSet = new Set<string>();
      for (const keyword of keywords) {
        keywordSet.add(keyword.toLowerCase());
        // 添加单字索引
        if (keyword.length >= 2) {
          for (let i = 0; i < keyword.length - 1; i++) {
            keywordSet.add(keyword.substring(i, i + 2));
          }
        }
      }
      this.domainKeywordIndex.set(domain, keywordSet);
    }
  }

  /**
   * 构建意图动词索引
   */
  private buildIntentVerbIndex(): void {
    this.intentVerbIndex.clear();

    for (const [intent, verbs] of Object.entries(INTENT_VERBS)) {
      for (const verb of verbs) {
        this.intentVerbIndex.set(verb.toLowerCase(), intent);
      }
    }
  }

  /**
   * 评估场景匹配度
   */
  private evaluateScenarioMatch(scenario: AgentScenario, normalizedMessage: string): MatchResult {
    let score = 0;
    let matchType: MatchResult['matchType'] = 'fallback';
    const matchedKeywords: string[] = [];

    // 1. 精确匹配场景 ID 或名称
    if (scenario.id.toLowerCase() === normalizedMessage ||
        scenario.name.toLowerCase() === normalizedMessage) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        score: 100,
        matchType: 'exact',
        matchedKeywords: [scenario.name],
        agentId: scenario.agentId,
      };
    }

    // 2. 场景标签关键词匹配
    for (const tag of scenario.tags || []) {
      const normalizedTag = tag.toLowerCase();
      if (normalizedMessage.includes(normalizedTag)) {
        score += 20;
        matchedKeywords.push(tag);
        matchType = 'keyword';
      }
    }

    // 3. 领域关键词匹配
    const domainMatches = this.matchDomainKeywords(normalizedMessage);
    score += domainMatches.score;
    matchedKeywords.push(...domainMatches.keywords);
    if (domainMatches.keywords.length > 0 && matchType !== 'keyword') {
      matchType = 'semantic';
    }

    // 4. 场景优先级作为微调因子
    // priority 越小越优先，最大影响 10 分
    const priorityBonus = Math.max(0, 10 - scenario.priority);

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      score: Math.min(100, score + priorityBonus),
      matchType: score > 0 ? matchType : 'fallback',
      matchedKeywords: [...new Set(matchedKeywords)],
      agentId: scenario.agentId,
    };
  }

  /**
   * 匹配领域关键词
   */
  private matchDomainKeywords(message: string): { score: number; keywords: string[] } {
    let totalScore = 0;
    const matchedKeywords: string[] = [];

    for (const [domain, keywords] of this.domainKeywordIndex.entries()) {
      for (const keyword of keywords) {
        if (message.includes(keyword)) {
          // 核心关键词分数更高
          const isCoreKeyword = WMS_KEYWORD_TAXONOMY[domain]?.includes(keyword);
          const keywordScore = isCoreKeyword ? 15 : 5;
          totalScore += keywordScore;
          matchedKeywords.push(keyword);
        }
      }
    }

    return { score: totalScore, keywords: [...new Set(matchedKeywords)] };
  }

  /**
   * 标准化消息
   */
  private normalizeMessage(message: string): string {
    return message
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, '');
  }

  /**
   * 检测意图类型
   */
  private detectIntentType(message: string): string {
    const words = message.split(/\s+/);

    for (const word of words) {
      const intent = this.intentVerbIndex.get(word);
      if (intent) return intent;
    }

    // 默认意图类型判断
    if (message.includes('怎么') || message.includes('如何') || message.includes('?')) {
      return 'help';
    }
    if (message.includes('多少') || message.includes('查询') || message.includes('查看')) {
      return 'query';
    }
    if (message.includes('统计') || message.includes('报表') || message.includes('分析')) {
      return 'analyze';
    }

    return 'query'; // 默认为查询
  }

  /**
   * 提取实体关键词
   */
  private extractEntities(message: string): string[] {
    const entities: string[] = [];

    // 匹配常见实体模式
    const patterns = [
      /SKU[\s:：]?([^\s,，]+)/gi,
      /订单[\s:：]?([^\s,，]+)/gi,
      /单号[\s:：]?([^\s,，]+)/gi,
      /批次[\s:：]?([^\s,，]+)/gi,
      /库位[\s:：]?([^\s,，]+)/gi,
      /仓库[\s:：]?([^\s,，]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        entities.push(match[0]);
      }
    }

    return entities;
  }

  /**
   * 分类领域
   */
  private classifyDomain(message: string): string[] {
    const domains: string[] = [];

    for (const [domain, keywords] of Object.entries(WMS_KEYWORD_TAXONOMY)) {
      let matchCount = 0;
      for (const keyword of keywords) {
        if (message.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }
      // 至少匹配 2 个关键词才认为属于该领域
      if (matchCount >= 2) {
        domains.push(domain);
      }
    }

    return domains;
  }

  /**
   * 计算意图置信度
   */
  private calculateIntentConfidence(message: string, intentType: string, domain: string[]): number {
    let confidence = 0.5; // 基础置信度

    // 意图类型明确加 0.1
    if (intentType !== 'query') {
      confidence += 0.1;
    }

    // 领域明确加 0.2
    if (domain.length > 0) {
      confidence += 0.2;
    }

    // 消息长度适中（10-50字）置信度更高
    const msgLen = message.replace(/\s/g, '').length;
    if (msgLen >= 5 && msgLen <= 100) {
      confidence += 0.1;
    }

    // 包含问号或语气词
    if (message.includes('?') || message.includes('？') || message.includes('吗')) {
      confidence += 0.1;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * 生成推荐理由
   */
  private generateRecommendationReason(scenario: AgentScenario): string {
    const agent = agentIdentityManager.getAgent(scenario.agentId);
    const agentName = agent?.name || scenario.agentId;

    if (scenario.description) {
      return scenario.description;
    }

    return `${agentName} - ${scenario.name}`;
  }

  /**
   * 清除推荐缓存
   */
  clearCache(): void {
    this.cachedRecommendations = null;
    this.cacheTimestamp = 0;
    this.recommendationCache.clear();
  }
}

// ===================== 单例导出 =====================

/** AgentScenarioMatcher 单例 */
export const agentScenarioMatcher = new AgentScenarioMatcher();
