import { buildToolPlan } from './planner.js';
import type {
  BuildToolPlanOptions,
  ToolDescriptor,
  ToolPlan,
  ToolPlanEntry,
} from './types.js';

export type ToolCategory =
  | 'file'
  | 'code'
  | 'web'
  | 'data'
  | 'system'
  | 'communication'
  | 'media'
  | 'search'
  | 'utility';

export interface ToolSemanticMetadata {
  keywords: string[];
  category: ToolCategory;
  useFrequency: number;
  lastUsed: number;
  successRate: number;
}

export interface SemanticRoutingContext {
  query?: string;
  recentToolNames?: string[];
  agentCapabilities?: string[];
}

export interface RankedToolPlanEntry extends ToolPlanEntry {
  relevanceScore: number;
  reasoning: string;
}

export type SemanticToolPlan = ToolPlan & {
  ranked: readonly RankedToolPlanEntry[];
};

const CATEGORY_KEYWORDS: Record<ToolCategory, readonly string[]> = {
  file: [
    'file', 'read', 'write', '文件', '读取', '写入', 'document', '文档',
    'path', '路径', 'directory', '目录', 'folder', 'open', '打开', 'save', '保存',
  ],
  code: [
    'code', 'function', '函数', 'refactor', '重构', 'compile', '编译', 'lint',
    'type', '类型', 'symbol', '符号', 'import', '导入', 'class', '类', 'method', '方法',
    '代码', '变量', 'variable',
  ],
  web: [
    'web', 'http', 'url', 'fetch', '网络', '网页', 'request', '请求', 'api',
    'download', '下载', 'browser', '浏览器', 'page', '页面', 'endpoint', '端点',
  ],
  data: [
    'data', 'database', '数据库', 'query', '查询', 'sql', 'table', '表',
    'record', '记录', 'json', 'csv', 'store', '存储', 'cache', '缓存', 'schema', '模式',
  ],
  system: [
    'system', 'shell', 'exec', 'command', '命令', '进程', 'process', 'env',
    '环境变量', 'platform', '平台', 'os', '终端', 'terminal', 'run', '运行', 'spawn',
  ],
  communication: [
    'communication', 'message', '消息', 'send', '发送', 'email', '邮件', 'chat',
    '聊天', 'notify', '通知', 'reply', '回复', 'channel', '频道', 'push', '推送',
  ],
  media: [
    'media', 'image', '图片', 'audio', '音频', 'video', '视频', 'photo', '照片',
    'render', '渲染', 'transcode', '转码', 'transcribe', '转录', 'speech', '语音',
  ],
  search: [
    'search', 'find', '查找', 'grep', 'glob', '搜索', 'locate', '定位',
    'match', '匹配', 'index', '索引', 'scan', '扫描', 'list', '列出',
  ],
  utility: [
    'utility', 'helper', '辅助', 'format', '格式化', 'convert', '转换', 'parse',
    '解析', 'validate', '验证', 'hash', '哈希', 'uuid', 'random', '随机', 'time', '时间',
  ],
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'or', 'in', 'on', 'for',
  'with', 'by', 'as', 'at', 'be', 'this', 'that', 'it', 'from',
  '的', '了', '是', '在', '和', '与', '或', '及', '以', '为', '用', '给', '把', '被',
  '一', '个', '这', '那', '它', '从',
]);

const DEFAULT_USAGE_CACHE_CAPACITY = 128;
const SUCCESS_RATE_ALPHA = 0.2;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const asciiMatches = text.toLowerCase().match(/[a-z0-9]+/g);
  if (asciiMatches) {
    for (const match of asciiMatches) {
      if (match.length > 1 && !STOP_WORDS.has(match)) {
        tokens.push(match);
      }
    }
  }
  const lower = text.toLowerCase();
  for (const keywords of Object.values(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (/[\u4e00-\u9fa5]/.test(keyword) && lower.includes(keyword)) {
        tokens.push(keyword);
      }
    }
  }
  return tokens;
}

function detectCategory(text: string): ToolCategory {
  const lower = text.toLowerCase();
  let best: ToolCategory = 'utility';
  let bestScore = 0;
  for (const category of Object.keys(CATEGORY_KEYWORDS) as ToolCategory[]) {
    let score = 0;
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (lower.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return best;
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

export class SemanticRouter {
  private readonly usageStats = new Map<string, ToolSemanticMetadata>();
  private readonly capacity: number;
  private readonly now: () => number;

  constructor(options?: { now?: () => number; cacheCapacity?: number }) {
    this.now = options?.now ?? (() => Date.now());
    this.capacity = options?.cacheCapacity ?? DEFAULT_USAGE_CACHE_CAPACITY;
  }

  extractMetadata(descriptor: ToolDescriptor): ToolSemanticMetadata {
    const text = [
      descriptor.name,
      descriptor.title ?? '',
      descriptor.description,
    ].join(' ');
    return {
      keywords: uniqueTokens(tokenize(text)),
      category: detectCategory(text),
      useFrequency: 0,
      lastUsed: 0,
      successRate: 1,
    };
  }

  getUsageStats(toolName: string): ToolSemanticMetadata | undefined {
    return this.usageStats.get(toolName);
  }

  scoreRelevance(query: string, metadata: ToolSemanticMetadata): number {
    const queryTokens = uniqueTokens(tokenize(query));
    if (queryTokens.length === 0 || metadata.keywords.length === 0) {
      return this.scoreFromUsage(metadata);
    }
    const keywordSet = new Set(metadata.keywords);
    let matched = 0;
    for (const token of queryTokens) {
      if (keywordSet.has(token)) {
        matched += 1;
      }
    }
    const keywordScore = matched / queryTokens.length;
    const usageScore = this.scoreFromUsage(metadata);
    const combined = keywordScore * 0.7 + usageScore * 0.3;
    return Math.min(Math.max(combined, 0), 1);
  }

  private scoreFromUsage(metadata: ToolSemanticMetadata): number {
    const frequencyScore = Math.min(metadata.useFrequency / 10, 1);
    const successScore = metadata.successRate;
    const elapsed = Math.max(this.now() - metadata.lastUsed, 0);
    const recencyScore =
      metadata.lastUsed === 0
        ? 0
        : elapsed < ONE_HOUR_MS
          ? 1
          : elapsed < ONE_DAY_MS
            ? 0.5
            : 0.1;
    return frequencyScore * 0.4 + successScore * 0.3 + recencyScore * 0.3;
  }

  recordUsage(toolName: string, success: boolean): void {
    const existing = this.usageStats.get(toolName);
    const base: ToolSemanticMetadata = existing ?? {
      keywords: [],
      category: 'utility',
      useFrequency: 0,
      lastUsed: 0,
      successRate: 1,
    };
    const updated: ToolSemanticMetadata = {
      keywords: base.keywords,
      category: base.category,
      useFrequency: base.useFrequency + 1,
      lastUsed: this.now(),
      successRate:
        base.successRate * (1 - SUCCESS_RATE_ALPHA) +
        (success ? 1 : 0) * SUCCESS_RATE_ALPHA,
    };
    if (!existing && this.usageStats.size >= this.capacity) {
      const oldestKey = this.usageStats.keys().next().value;
      if (oldestKey !== undefined) {
        this.usageStats.delete(oldestKey);
      }
    }
    if (existing) {
      this.usageStats.delete(toolName);
    }
    this.usageStats.set(toolName, updated);
  }

  recommend(
    query: string,
    tools: readonly ToolDescriptor[],
    limit?: number,
  ): RankedToolPlanEntry[] {
    const ranked: RankedToolPlanEntry[] = [];
    for (const descriptor of tools) {
      if (!descriptor.executor) {
        continue;
      }
      const metadata = this.resolveStats(descriptor);
      const relevanceScore = this.scoreRelevance(query, metadata);
      ranked.push({
        descriptor,
        executor: descriptor.executor,
        relevanceScore,
        reasoning: this.buildReasoning(query, metadata, relevanceScore),
      });
    }
    ranked.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.descriptor.name.localeCompare(b.descriptor.name);
    });
    return limit === undefined ? ranked : ranked.slice(0, Math.max(limit, 0));
  }

  buildSemanticToolPlan(
    options: BuildToolPlanOptions & { semanticContext?: SemanticRoutingContext },
  ): SemanticToolPlan {
    const { semanticContext, ...planOptions } = options;
    const plan = buildToolPlan(planOptions);
    const query = semanticContext?.query ?? '';
    const recentToolNames = new Set(semanticContext?.recentToolNames ?? []);
    const capabilities = semanticContext?.agentCapabilities ?? [];
    const effectiveQuery =
      capabilities.length > 0 ? `${query} ${capabilities.join(' ')}`.trim() : query;

    const ranked: RankedToolPlanEntry[] = plan.visible.map((entry) => {
      const metadata = this.resolveStats(entry.descriptor);
      let score = this.scoreRelevance(effectiveQuery, metadata);
      let reasoning = this.buildReasoning(effectiveQuery, metadata, score);
      if (recentToolNames.has(entry.descriptor.name)) {
        score = Math.min(score + 0.1, 1);
        reasoning = `${reasoning}; 最近使用过`;
      }
      return {
        ...entry,
        relevanceScore: score,
        reasoning,
      };
    });
    ranked.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.descriptor.name.localeCompare(b.descriptor.name);
    });
    return { ...plan, ranked };
  }

  private resolveStats(descriptor: ToolDescriptor): ToolSemanticMetadata {
    const extracted = this.extractMetadata(descriptor);
    const cached = this.usageStats.get(descriptor.name);
    if (!cached) {
      return extracted;
    }
    return {
      keywords: extracted.keywords,
      category: extracted.category,
      useFrequency: cached.useFrequency,
      lastUsed: cached.lastUsed,
      successRate: cached.successRate,
    };
  }

  private buildReasoning(
    query: string,
    metadata: ToolSemanticMetadata,
    score: number,
  ): string {
    const parts: string[] = [];
    const queryTokens = uniqueTokens(tokenize(query));
    const keywordSet = new Set(metadata.keywords);
    const matched = queryTokens.filter((token) => keywordSet.has(token));
    if (matched.length > 0) {
      parts.push(`关键词匹配: ${matched.join(', ')}`);
    }
    if (metadata.useFrequency > 0) {
      parts.push(`使用频率: ${metadata.useFrequency}`);
      parts.push(`成功率: ${metadata.successRate.toFixed(2)}`);
    }
    parts.push(`分类: ${metadata.category}`);
    parts.push(`相关性: ${score.toFixed(2)}`);
    return parts.join('; ');
  }
}
