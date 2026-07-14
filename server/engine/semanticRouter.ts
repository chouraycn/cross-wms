/**
 * Semantic Router — 语义路由层
 *
 * 实现基于关键词分类的工具智能推荐：
 * 1. 定义工具分类（文件操作、代码生成、搜索、数据处理、WMS业务、海关编码等）
 * 2. 每个分类定义关键词和权重
 * 3. 根据用户消息内容计算各分类的匹配分数
 * 4. 返回排序后的工具推荐列表
 * 5. 支持上下文感知的工具排序
 *
 * 核心流程：
 *   用户消息 → 分词提取 → 分类匹配 → 权重计算 → 排序推荐
 *
 * 参考：
 *   - keywordTriggerEngine.ts 的单例模式和配置管理
 *   - openclaw 的 CATEGORY_KEYWORDS 设计
 */

import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 工具分类 */
export type ToolCategory =
  | 'file'
  | 'code'
  | 'search'
  | 'data'
  | 'system'
  | 'web'
  | 'wms'
  | 'customs'
  | 'inventory'
  | 'order'
  | 'report'
  | 'memory'
  | 'media'
  | 'utility';

/** 分类关键词配置 */
export interface CategoryKeywordConfig {
  keywords: string[];
  weight: number;
}

/** 语义匹配结果 */
export interface SemanticMatchResult {
  category: ToolCategory;
  categoryName: string;
  matchedKeywords: string[];
  matchScore: number;
  confidence: number;
  reason: string;
}

/** 语义路由配置 */
export interface SemanticRouterConfig {
  enabled: boolean;
  threshold: number;
  maxRecommendations: number;
  caseSensitive: boolean;
  ignoreStopWords: boolean;
  positionWeightEnabled: boolean;
  contextBoostEnabled: boolean;
}

/** 路由上下文 */
export interface RouterContext {
  sessionId?: string;
  userId?: string;
  recentCategories?: ToolCategory[];
  agentCapabilities?: string[];
}

/** 工具推荐项 */
export interface ToolRecommendation {
  toolName: string;
  category: ToolCategory;
  relevanceScore: number;
  reasoning: string;
}

// ===================== 常量 =====================

/** 默认配置 */
const DEFAULT_CONFIG: SemanticRouterConfig = {
  enabled: true,
  threshold: 0.2,
  maxRecommendations: 10,
  caseSensitive: false,
  ignoreStopWords: true,
  positionWeightEnabled: true,
  contextBoostEnabled: true,
};

/** 分类中文名称映射 */
const CATEGORY_NAMES: Record<ToolCategory, string> = {
  file: '文件操作',
  code: '代码生成',
  search: '搜索查找',
  data: '数据处理',
  system: '系统命令',
  web: '网络工具',
  wms: 'WMS业务',
  customs: '海关编码',
  inventory: '库存管理',
  order: '订单管理',
  report: '报表分析',
  memory: '记忆系统',
  media: '媒体处理',
  utility: '实用工具',
};

/** 分类关键词与权重配置 */
const CATEGORY_KEYWORDS: Record<ToolCategory, CategoryKeywordConfig> = {
  file: {
    keywords: [
      'file', 'read', 'write', '文件', '读取', '写入', 'document', '文档',
      'path', '路径', 'directory', '目录', 'folder', 'open', '打开', 'save', '保存',
      'create', '创建', 'delete', '删除', 'modify', '修改', 'edit', '编辑',
      'upload', '上传', 'download', '下载', 'export', '导出', 'import', '导入',
      'csv', 'excel', 'pdf', 'txt', 'json', 'xml',
    ],
    weight: 1.0,
  },
  code: {
    keywords: [
      'code', 'function', '函数', 'refactor', '重构', 'compile', '编译', 'lint',
      'type', '类型', 'symbol', '符号', 'import', '导入', 'class', '类', 'method', '方法',
      '代码', '变量', 'variable', 'debug', '调试', 'bug', '错误', 'fix', '修复',
      'implement', '实现', '开发', 'develop', 'program', '编程', 'script', '脚本',
      'api', '接口', 'module', '模块', 'package', '包', 'library', '库',
      'git', 'commit', 'push', 'pull', 'branch', '分支', 'merge', '合并',
    ],
    weight: 1.0,
  },
  search: {
    keywords: [
      'search', 'find', '查找', 'grep', 'glob', '搜索', 'locate', '定位',
      'match', '匹配', 'index', '索引', 'scan', '扫描', 'list', '列出',
      'query', '查询', '检索', 'seek', '寻找', 'explore', '探索',
    ],
    weight: 0.9,
  },
  data: {
    keywords: [
      'data', 'database', '数据库', 'query', '查询', 'sql', 'table', '表',
      'record', '记录', 'json', 'csv', 'store', '存储', 'cache', '缓存', 'schema', '模式',
      '数据', '分析', 'analysis', 'statistics', '统计', 'chart', '图表',
      'transform', '转换', 'process', '处理', 'migrate', '迁移',
    ],
    weight: 1.0,
  },
  system: {
    keywords: [
      'system', 'shell', 'exec', 'command', '命令', '进程', 'process', 'env',
      '环境变量', 'platform', '平台', 'os', '终端', 'terminal', 'run', '运行', 'spawn',
      'bash', 'cli', '脚本', 'script', '权限', 'permission', '配置', 'config',
      'setting', '设置', 'install', '安装', 'uninstall', '卸载',
    ],
    weight: 0.9,
  },
  web: {
    keywords: [
      'web', 'http', 'url', 'fetch', '网络', '网页', 'request', '请求', 'api',
      'download', '下载', 'browser', '浏览器', 'page', '页面', 'endpoint', '端点',
      '网络请求', 'http请求', 'rest', 'restful', 'websocket', 'ws',
      'scrape', '爬虫', 'crawl', '抓取',
    ],
    weight: 0.9,
  },
  wms: {
    keywords: [
      'wms', '仓库', 'warehouse', '仓储', '库存', 'inventory', '入库', '出库',
      'inbound', 'outbound', '调拨', 'transfer', '盘点', 'stocktake',
      '库位', 'location', '货架', 'shelf', '批次', 'batch', '序列号', 'serial',
      'sku', '商品', 'product', '物料', 'material',
      '收货', 'receipt', '发货', 'ship', '配送', 'delivery',
      'wms系统', '仓库管理', '仓储管理',
    ],
    weight: 1.2,
  },
  customs: {
    keywords: [
      'hscode', 'hs编码', '海关编码', '海关', 'customs', '报关', '清关',
      'tariff', '关税', 'tax', '税费', 'duty', '进口', 'export', '出口',
      'import', '申报', 'declare', 'declaration', '商检', 'inspection',
      '原产地', 'origin', '贸易', 'trade', '跨境', 'cross-border',
    ],
    weight: 1.3,
  },
  inventory: {
    keywords: [
      'inventory', '库存', 'stock', '库存量', '库存查询', '库存管理',
      '库存盘点', 'stocktake', '库存预警', 'alert', '库存周转', 'turnover',
      'available', '可用库存', 'on-hand', '在库', 'reserved', '预留',
      'replenishment', '补货', '缺货', 'out of stock', '滞销', 'slow moving',
    ],
    weight: 1.1,
  },
  order: {
    keywords: [
      'order', '订单', 'purchase', '采购', 'sale', '销售', '销售订单',
      '采购订单', 'po', 'so', '订单管理', 'order management',
      '发货单', 'invoice', '发票', '收据', 'receipt',
      '退货', 'return', '退款', 'refund', '换货', 'exchange',
    ],
    weight: 1.1,
  },
  report: {
    keywords: [
      'report', '报表', '报告', 'analysis', '分析', 'statistics', '统计',
      'dashboard', '仪表盘', 'kpi', '指标', '趋势', 'trend',
      '同比', '环比', '对比', 'comparison', '汇总', 'summary',
      '日报', 'daily', '周报', 'weekly', '月报', 'monthly',
    ],
    weight: 1.0,
  },
  memory: {
    keywords: [
      'memory', '记忆', 'remember', '记住', 'recall', '回忆', 'forget', '忘记',
      '知识', 'knowledge', '经验', 'experience', '历史', 'history',
      '笔记', 'note', '文档', 'document', 'wiki', '百科',
    ],
    weight: 0.9,
  },
  media: {
    keywords: [
      'media', 'image', '图片', 'audio', '音频', 'video', '视频', 'photo', '照片',
      'render', '渲染', 'transcode', '转码', 'transcribe', '转录', 'speech', '语音',
      'ocr', '文字识别', '截图', 'screenshot', '录制', 'record',
    ],
    weight: 0.8,
  },
  utility: {
    keywords: [
      'utility', 'helper', '辅助', 'format', '格式化', 'convert', '转换', 'parse',
      '解析', 'validate', '验证', 'hash', '哈希', 'uuid', 'random', '随机', 'time', '时间',
      '工具', '计算器', 'calculator', '单位转换', 'converter',
    ],
    weight: 0.7,
  },
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
  '请', '帮', '我', '你', '他', '她', '它', '我们', '你们', '他们',
  '一下', '看看', '看看', '说', '讲', '告诉', '知道', '明白', '了解',
]);

// ===================== 语义路由引擎 =====================

export class SemanticRouter {
  /** 配置 */
  private config: SemanticRouterConfig = { ...DEFAULT_CONFIG };

  /** 是否已初始化 */
  private initialized = false;

  /** 分类统计 */
  private stats = {
    totalQueries: 0,
    totalMatches: 0,
    categoryMatchCounts: new Map<ToolCategory, number>(),
    recentResults: [] as Array<{
      timestamp: number;
      query: string;
      topCategory: ToolCategory;
      topScore: number;
    }>,
  };

  constructor(config?: Partial<SemanticRouterConfig>) {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
  }

  // ===================== 1. 初始化 =====================

  /**
   * 初始化语义路由引擎
   */
  initialize(): void {
    if (this.initialized) {
      logger.debug('[SemanticRouter] Already initialized');
      return;
    }

    this.initialized = true;
    const categoryCount = Object.keys(CATEGORY_KEYWORDS).length;
    const totalKeywords = Object.values(CATEGORY_KEYWORDS).reduce(
      (sum, cfg) => sum + cfg.keywords.length,
      0,
    );

    logger.info(
      `[SemanticRouter] Initialized with ${categoryCount} categories and ${totalKeywords} keywords`,
    );
  }

  // ===================== 2. 分词与关键词提取 =====================

  /**
   * 从消息中提取关键词（支持中英文）
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
      tokens.push(match[0].toLowerCase());
    }

    if (this.config.ignoreStopWords) {
      return tokens.filter(t => !STOP_WORDS.has(t.toLowerCase()));
    }

    return tokens;
  }

  // ===================== 3. 分类匹配 =====================

  /**
   * 匹配消息的语义分类
   */
  matchCategories(message: string, context?: RouterContext): SemanticMatchResult[] {
    if (!this.config.enabled) {
      return [];
    }

    const lowerMessage = this.config.caseSensitive ? message : message.toLowerCase();
    const results: SemanticMatchResult[] = [];

    for (const category of Object.keys(CATEGORY_KEYWORDS) as ToolCategory[]) {
      const categoryConfig = CATEGORY_KEYWORDS[category];
      const matchedKeywords: string[] = [];

      for (const keyword of categoryConfig.keywords) {
        const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
        if (lowerMessage.includes(lowerKeyword)) {
          matchedKeywords.push(keyword);
        }
      }

      if (matchedKeywords.length === 0) {
        continue;
      }

      const baseScore = this.computeBaseScore(matchedKeywords, categoryConfig, lowerMessage);
      let finalScore = baseScore;

      if (this.config.positionWeightEnabled) {
        finalScore += this.computePositionBoost(matchedKeywords, lowerMessage);
      }

      if (this.config.contextBoostEnabled && context?.recentCategories) {
        finalScore += this.computeContextBoost(category, context.recentCategories);
      }

      finalScore = Math.min(1.0, finalScore);

      if (finalScore >= this.config.threshold) {
        results.push({
          category,
          categoryName: CATEGORY_NAMES[category],
          matchedKeywords,
          matchScore: finalScore,
          confidence: finalScore,
          reason: this.buildReason(category, matchedKeywords, finalScore),
        });
      }
    }

    results.sort((a, b) => b.matchScore - a.matchScore);

    this.stats.totalQueries++;
    if (results.length > 0) {
      this.stats.totalMatches++;
      const topCategory = results[0].category;
      this.stats.categoryMatchCounts.set(
        topCategory,
        (this.stats.categoryMatchCounts.get(topCategory) || 0) + 1,
      );
      this.stats.recentResults.unshift({
        timestamp: Date.now(),
        query: message.substring(0, 100),
        topCategory,
        topScore: results[0].matchScore,
      });
      if (this.stats.recentResults.length > 50) {
        this.stats.recentResults.pop();
      }
    }

    return results;
  }

  /**
   * 计算基础匹配分数
   */
  private computeBaseScore(
    matchedKeywords: string[],
    categoryConfig: CategoryKeywordConfig,
    _message: string,
  ): number {
    const matchRatio = matchedKeywords.length / categoryConfig.keywords.length;
    const coverageScore = Math.min(1.0, matchRatio * 2);
    const quantityBonus = Math.min(0.3, matchedKeywords.length * 0.05);
    return (coverageScore + quantityBonus) * categoryConfig.weight;
  }

  /**
   * 计算位置权重加分（关键词出现在消息开头权重更高）
   */
  private computePositionBoost(matchedKeywords: string[], message: string): number {
    let boost = 0;
    const messageLength = message.length || 1;

    for (const keyword of matchedKeywords) {
      const index = message.indexOf(keyword.toLowerCase());
      if (index === -1) continue;

      const positionRatio = index / messageLength;
      if (positionRatio < 0.1) {
        boost += 0.08;
      } else if (positionRatio < 0.3) {
        boost += 0.05;
      } else if (positionRatio < 0.5) {
        boost += 0.02;
      }
    }

    return Math.min(0.15, boost);
  }

  /**
   * 计算上下文加分（最近使用过的分类获得额外权重）
   */
  private computeContextBoost(category: ToolCategory, recentCategories: ToolCategory[]): number {
    const recentCount = recentCategories.filter(c => c === category).length;
    if (recentCount === 0) return 0;

    const boost = recentCount * 0.08;
    return Math.min(0.2, boost);
  }

  /**
   * 构建匹配理由
   */
  private buildReason(
    category: ToolCategory,
    matchedKeywords: string[],
    score: number,
  ): string {
    const parts: string[] = [];

    parts.push(`分类: ${CATEGORY_NAMES[category]} (${category})`);

    if (matchedKeywords.length > 0) {
      const topKeywords = matchedKeywords.slice(0, 5);
      parts.push(`匹配关键词: ${topKeywords.join(', ')}`);
      if (matchedKeywords.length > 5) {
        parts.push(`等${matchedKeywords.length}个`);
      }
    }

    parts.push(`匹配分数: ${score.toFixed(2)}`);
    parts.push(`阈值: ${this.config.threshold}`);

    return parts.join('; ');
  }

  // ===================== 4. 工具推荐 =====================

  /**
   * 根据消息获取排序后的工具分类推荐
   */
  getCategoryRecommendations(
    message: string,
    context?: RouterContext,
  ): SemanticMatchResult[] {
    const results = this.matchCategories(message, context);
    return results.slice(0, this.config.maxRecommendations);
  }

  /**
   * 获取主分类（最高分的分类）
   */
  getPrimaryCategory(message: string, context?: RouterContext): ToolCategory | null {
    const results = this.matchCategories(message, context);
    return results.length > 0 ? results[0].category : null;
  }

  /**
   * 判断消息是否属于某个分类
   */
  isCategory(message: string, category: ToolCategory, context?: RouterContext): boolean {
    const results = this.matchCategories(message, context);
    return results.some(r => r.category === category);
  }

  /**
   * 获取分类的详细信息
   */
  getCategoryInfo(category: ToolCategory): {
    name: string;
    keywordCount: number;
    weight: number;
  } {
    const config = CATEGORY_KEYWORDS[category];
    return {
      name: CATEGORY_NAMES[category],
      keywordCount: config.keywords.length,
      weight: config.weight,
    };
  }

  /**
   * 列出所有分类
   */
  listCategories(): Array<{
    category: ToolCategory;
    name: string;
    keywordCount: number;
    weight: number;
  }> {
    return (Object.keys(CATEGORY_KEYWORDS) as ToolCategory[]).map(category => ({
      category,
      name: CATEGORY_NAMES[category],
      keywordCount: CATEGORY_KEYWORDS[category].keywords.length,
      weight: CATEGORY_KEYWORDS[category].weight,
    }));
  }

  // ===================== 5. 配置管理 =====================

  /**
   * 获取当前配置
   */
  getConfig(): SemanticRouterConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SemanticRouterConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`[SemanticRouter] Config updated: ${JSON.stringify(this.config)}`);
  }

  /**
   * 启用/禁用语义路由
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`[SemanticRouter] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  // ===================== 6. 统计信息 =====================

  /**
   * 获取统计信息
   */
  getStats(): {
    totalQueries: number;
    totalMatches: number;
    matchRate: number;
    categoryMatchCounts: Record<string, number>;
    topCategories: Array<{ category: ToolCategory; name: string; count: number }>;
    recentResults: Array<{
      timestamp: number;
      query: string;
      topCategory: ToolCategory;
      topScore: number;
    }>;
    config: SemanticRouterConfig;
  } {
    const categoryCounts = Array.from(this.stats.categoryMatchCounts.entries())
      .map(([category, count]) => ({
        category,
        name: CATEGORY_NAMES[category],
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalQueries: this.stats.totalQueries,
      totalMatches: this.stats.totalMatches,
      matchRate: this.stats.totalQueries > 0
        ? this.stats.totalMatches / this.stats.totalQueries
        : 0,
      categoryMatchCounts: Object.fromEntries(this.stats.categoryMatchCounts),
      topCategories: categoryCounts,
      recentResults: this.stats.recentResults,
      config: this.getConfig(),
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalQueries: 0,
      totalMatches: 0,
      categoryMatchCounts: new Map(),
      recentResults: [],
    };
    logger.info('[SemanticRouter] Stats reset');
  }

  // ===================== 7. 自定义分类管理 =====================

  /**
   * 获取指定分类的关键词
   */
  getCategoryKeywords(category: ToolCategory): string[] {
    return [...CATEGORY_KEYWORDS[category].keywords];
  }

  /**
   * 检查关键词是否存在于某分类
   */
  hasKeyword(category: ToolCategory, keyword: string): boolean {
    const lowerKeyword = this.config.caseSensitive ? keyword : keyword.toLowerCase();
    return CATEGORY_KEYWORDS[category].keywords.some(
      k => (this.config.caseSensitive ? k : k.toLowerCase()) === lowerKeyword,
    );
  }
}

// ===================== 单例导出 =====================

const SEMANTIC_ROUTER_INSTANCE = new SemanticRouter();

export function getSemanticRouter(): SemanticRouter {
  return SEMANTIC_ROUTER_INSTANCE;
}

export function initSemanticRouter(config?: Partial<SemanticRouterConfig>): void {
  if (config) {
    SEMANTIC_ROUTER_INSTANCE.updateConfig(config);
  }
  SEMANTIC_ROUTER_INSTANCE.initialize();
}
