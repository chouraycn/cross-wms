/**
 * MultilingualIntent — 多语言意图识别
 *
 * 支持中英混合指令识别，扩展复杂度评估为多语言适配。
 * 当前 assessComplexity 只用中文正则（查询|分析），需支持：
 * - 中英混合指令（"帮我 query 出库单 and 分析"）
 * - 英文指令（"query outbound orders and analyze"）
 * - 多步骤连接词识别（先...再... / first...then... / and then...）
 *
 * v6.0: P2-6 多语言意图识别
 */

// ===================== 类型定义 =====================

/** 意图类型 */
export type IntentType = 'query' | 'create' | 'update' | 'delete' | 'analyze' | 'compare' | 'summarize' | 'execute' | 'unknown';

/** 意图识别结果 */
export interface IntentResult {
  /** 主要意图 */
  primaryIntent: IntentType;
  /** 所有识别到的意图（支持多意图） */
  intents: IntentType[];
  /** 检测到的语言 */
  detectedLanguage: 'zh' | 'en' | 'mixed';
  /** 多步骤标记 */
  isMultiStep: boolean;
  /** 步骤数估算 */
  estimatedSteps: number;
  /** 匹配的关键词列表 */
  matchedKeywords: string[];
  /** 置信度 (0-1) */
  confidence: number;
}

// ===================== 常量 =====================

/** 多语言意图关键词映射 */
const INTENT_KEYWORDS: Record<IntentType, { zh: string[]; en: string[] }> = {
  query: {
    zh: ['查询', '查找', '搜索', '列出', '显示', '看看', '查一下', '获取', '找'],
    en: ['query', 'search', 'find', 'list', 'show', 'get', 'look up', 'fetch', 'retrieve'],
  },
  create: {
    zh: ['创建', '新增', '添加', '新建', '入库', '登记', '录入'],
    en: ['create', 'add', 'new', 'insert', 'register', 'make', 'build'],
  },
  update: {
    zh: ['更新', '修改', '编辑', '变更', '调整', '更改'],
    en: ['update', 'modify', 'edit', 'change', 'adjust', 'alter'],
  },
  delete: {
    zh: ['删除', '移除', '取消', '作废', '清理'],
    en: ['delete', 'remove', 'cancel', 'drop', 'clear', 'discard'],
  },
  analyze: {
    zh: ['分析', '统计', '对比', '比较', '评估', '计算', '汇总'],
    en: ['analyze', 'statistics', 'compare', 'evaluate', 'calculate', 'aggregate', 'assess'],
  },
  compare: {
    zh: ['对比', '比较', '差异', '区别'],
    en: ['compare', 'diff', 'difference', 'versus', 'vs'],
  },
  summarize: {
    zh: ['总结', '概括', '摘要', '简述', '归纳'],
    en: ['summarize', 'summary', 'brief', 'outline', 'conclude'],
  },
  execute: {
    zh: ['执行', '运行', '操作', '处理', '完成'],
    en: ['execute', 'run', 'operate', 'process', 'perform', 'do'],
  },
  unknown: {
    zh: [],
    en: [],
  },
};

/** 多步骤连接词 */
const MULTISTEP_PATTERNS = {
  zh: [
    /先[^，。,.]*[再然后接着]/,          // 先...再/然后/接着
    /并且.*还/,                           // 并且...还
    /同时.*还有?/,                        // 同时...还有
    /第[一二三四五六七八九十\d]/,          // 第一/第二
    /之后.*再/,                           // 之后...再
  ],
  en: [
    /first.*then/,                         // first...then
    /and then/,                            // and then
    /after that/,                          // after that
    /also.*and/,                           // also...and
    /next,?/,                              // next
    /finally/,                             // finally
    /additionally/,                        // additionally
  ],
};

// ===================== MultilingualIntent 类 =====================

export class MultilingualIntent {
  /**
   * 识别用户消息的意图。
   *
   * @param message - 用户消息文本
   * @returns 意图识别结果
   */
  recognize(message: string): IntentResult {
    const lowerMessage = message.toLowerCase();

    // 1. 检测语言
    const detectedLanguage = this.detectLanguage(message);

    // 2. 意图匹配
    const matchedIntents: Array<{ intent: IntentType; keywords: string[] }> = [];

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      if (intent === 'unknown') continue;

      const allKeywords = [...keywords.zh, ...keywords.en];
      const matched = allKeywords.filter(kw => lowerMessage.includes(kw.toLowerCase()));

      if (matched.length > 0) {
        matchedIntents.push({ intent: intent as IntentType, keywords: matched });
      }
    }

    // 3. 多步骤检测
    const isMultiStep = this.detectMultiStep(message, detectedLanguage);

    // 4. 步骤数估算
    let estimatedSteps = 1;
    if (isMultiStep) {
      // 统计连接词出现次数 + 1
      const zhMatches = MULTISTEP_PATTERNS.zh.filter(p => p.test(message)).length;
      const enMatches = MULTISTEP_PATTERNS.en.filter(p => p.test(lowerMessage)).length;
      estimatedSteps = Math.min(zhMatches + enMatches + 1, 8);
    }

    // 5. 确定主意图（匹配关键词最多的意图）
    const sortedIntents = [...matchedIntents].sort((a, b) => b.keywords.length - a.keywords.length);
    const primaryIntent = sortedIntents.length > 0 ? sortedIntents[0].intent : 'unknown';

    // 6. 收集所有匹配关键词
    const allMatchedKeywords = matchedIntents.flatMap(m => m.keywords);

    // 7. 置信度计算
    const confidence = this.calculateConfidence(matchedIntents, isMultiStep, detectedLanguage);

    return {
      primaryIntent,
      intents: sortedIntents.map(m => m.intent),
      detectedLanguage,
      isMultiStep,
      estimatedSteps,
      matchedKeywords: allMatchedKeywords,
      confidence,
    };
  }

  /**
   * 检测文本语言。
   */
  private detectLanguage(text: string): 'zh' | 'en' | 'mixed' {
    const zhChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const enChars = (text.match(/[a-zA-Z]/g) || []).length;

    if (zhChars === 0 && enChars === 0) return 'en';
    if (zhChars === 0) return 'en';
    if (enChars === 0) return 'zh';

    // 混合判断：中文比例 > 30% 且 英文比例 > 20% 为混合
    const total = zhChars + enChars;
    const zhRatio = zhChars / total;
    const enRatio = enChars / total;

    if (zhRatio > 0.3 && enRatio > 0.2) return 'mixed';
    return zhRatio > enRatio ? 'zh' : 'en';
  }

  /**
   * 检测多步骤指令。
   */
  private detectMultiStep(message: string, language: 'zh' | 'en' | 'mixed'): boolean {
    const lowerMessage = message.toLowerCase();

    // 中文模式
    if (language === 'zh' || language === 'mixed') {
      for (const pattern of MULTISTEP_PATTERNS.zh) {
        if (pattern.test(message)) return true;
      }
    }

    // 英文模式
    if (language === 'en' || language === 'mixed') {
      for (const pattern of MULTISTEP_PATTERNS.en) {
        if (pattern.test(lowerMessage)) return true;
      }
    }

    return false;
  }

  /**
   * 计算意图识别置信度。
   */
  private calculateConfidence(
    matchedIntents: Array<{ intent: IntentType; keywords: string[] }>,
    isMultiStep: boolean,
    language: 'zh' | 'en' | 'mixed',
  ): number {
    if (matchedIntents.length === 0) return 0.1;

    // 基础置信度：匹配意图数量 * 0.3
    let confidence = Math.min(matchedIntents.length * 0.3, 0.6);

    // 多意图加成
    if (matchedIntents.length >= 2) {
      confidence += 0.1;
    }

    // 多步骤加成
    if (isMultiStep) {
      confidence += 0.15;
    }

    // 混合语言微调
    if (language === 'mixed') {
      confidence -= 0.05; // 混合语言稍难识别
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * 重置（此模块无状态，接口预留）。
   */
  reset(): void {
    // 无状态模块
  }
}
