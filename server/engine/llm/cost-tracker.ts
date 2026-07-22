/**
 * LLM 成本计算与用量追踪
 *
 * 借鉴 OpenClaw 的 llm/cost-tracker 模式：
 * - 按 provider / model 维护单价表
 * - 记录每次调用的 token 使用量（prompt / completion / cached / reasoning）
 * - 计算调用成本（USD 或自定义货币）
 * - 支持时间窗口统计、按模型/Agent 聚合
 */

/** 用量类型 */
export interface TokenUsage {
  /** 提示词 token 数 */
  promptTokens: number;
  /** 完成 token 数 */
  completionTokens: number;
  /** 缓存命中 token 数（OpenAI prompt cache、Anthropic cache 等） */
  cachedPromptTokens?: number;
  /** 思考 token 数（reasoning tokens） */
  reasoningTokens?: number;
}

/** 模型定价（每百万 token 的价格） */
export interface ModelPricing {
  /** 模型 ID */
  modelId: string;
  /** Provider */
  provider?: string;
  /** 提示词单价（每百万 token，单位：currency） */
  promptPricePerMillion: number;
  /** 完成单价（每百万 token） */
  completionPricePerMillion: number;
  /** 缓存命中单价（每百万 token，通常为 prompt 的 10-50%） */
  cachedPromptPricePerMillion?: number;
  /** 思考 token 单价（每百万 token） */
  reasoningPricePerMillion?: number;
  /** 货币单位 */
  currency?: string;
}

/** 单次用量记录 */
export interface UsageRecord {
  /** 唯一记录 ID */
  id: string;
  /** 时间戳（ms） */
  timestamp: number;
  /** Agent ID */
  agentId: string;
  /** 会话 ID（可选） */
  sessionId?: string;
  /** Provider */
  provider: string;
  /** 模型 ID */
  modelId: string;
  /** token 用量 */
  usage: TokenUsage;
  /** 计算出的成本 */
  cost: number;
  /** 货币 */
  currency: string;
  /** 是否流式调用 */
  streaming?: boolean;
  /** 关联的请求 ID */
  requestId?: string;
}

/** 用量查询过滤 */
export interface UsageFilter {
  agentId?: string;
  sessionId?: string;
  provider?: string;
  modelId?: string;
  requestId?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
}

/** 查询选项 */
export interface UsageQueryOptions extends UsageFilter {
  limit?: number;
  offset?: number;
  descending?: boolean;
}

/** 聚合统计 */
export interface UsageAggregate {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedPromptTokens: number;
  totalReasoningTokens: number;
  totalCost: number;
  avgCostPerCall: number;
  avgLatencyMs?: number;
  byModel: Record<string, { calls: number; cost: number; tokens: number }>;
  byProvider: Record<string, { calls: number; cost: number; tokens: number }>;
  byAgent: Record<string, { calls: number; cost: number; tokens: number }>;
}

/** 配置 */
export interface CostTrackerOptions {
  /** 内存最多保留记录数（默认 10000） */
  maxRecords?: number;
  /** 默认货币 */
  defaultCurrency?: string;
  /** 内置定价表 */
  pricings?: ModelPricing[];
}

let nextRecordId = 1;

/** 内置常用模型定价（参考 2025 年公开价格） */
export const BUILTIN_PRICINGS: ModelPricing[] = [
  {
    modelId: 'gpt-4o',
    provider: 'openai',
    promptPricePerMillion: 2.5,
    completionPricePerMillion: 10,
    cachedPromptPricePerMillion: 1.25,
    currency: 'USD',
  },
  {
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    promptPricePerMillion: 0.15,
    completionPricePerMillion: 0.6,
    cachedPromptPricePerMillion: 0.075,
    currency: 'USD',
  },
  {
    modelId: 'gpt-4-turbo',
    provider: 'openai',
    promptPricePerMillion: 10,
    completionPricePerMillion: 30,
    currency: 'USD',
  },
  {
    modelId: 'claude-3-5-sonnet',
    provider: 'anthropic',
    promptPricePerMillion: 3,
    completionPricePerMillion: 15,
    cachedPromptPricePerMillion: 0.3,
    currency: 'USD',
  },
  {
    modelId: 'claude-3-5-haiku',
    provider: 'anthropic',
    promptPricePerMillion: 0.8,
    completionPricePerMillion: 4,
    cachedPromptPricePerMillion: 0.08,
    currency: 'USD',
  },
  {
    modelId: 'claude-3-opus',
    provider: 'anthropic',
    promptPricePerMillion: 15,
    completionPricePerMillion: 75,
    currency: 'USD',
  },
  {
    modelId: 'gemini-1.5-pro',
    provider: 'google',
    promptPricePerMillion: 1.25,
    completionPricePerMillion: 5,
    currency: 'USD',
  },
  {
    modelId: 'gemini-1.5-flash',
    provider: 'google',
    promptPricePerMillion: 0.075,
    completionPricePerMillion: 0.3,
    currency: 'USD',
  },
  {
    modelId: 'qwen-max',
    provider: 'qwen',
    promptPricePerMillion: 2.8,
    completionPricePerMillion: 8.4,
    currency: 'CNY',
  },
  {
    modelId: 'qwen-turbo',
    provider: 'qwen',
    promptPricePerMillion: 0.3,
    completionPricePerMillion: 0.6,
    currency: 'CNY',
  },
  {
    modelId: 'moonshot-v1-8k',
    provider: 'moonshot',
    promptPricePerMillion: 12,
    completionPricePerMillion: 12,
    currency: 'CNY',
  },
  {
    modelId: 'deepseek-chat',
    provider: 'deepseek',
    promptPricePerMillion: 1,
    completionPricePerMillion: 2,
    cachedPromptPricePerMillion: 0.1,
    currency: 'CNY',
  },
];

export class LlmCostTracker {
  private maxRecords: number;
  private defaultCurrency: string;
  private pricings = new Map<string, ModelPricing>();
  private records: UsageRecord[] = [];

  constructor(options?: CostTrackerOptions) {
    this.maxRecords = options?.maxRecords ?? 10000;
    this.defaultCurrency = options?.defaultCurrency ?? 'USD';

    // 加载内置定价
    for (const p of BUILTIN_PRICINGS) {
      this.setPricing(p);
    }
    // 允许覆盖
    if (options?.pricings) {
      for (const p of options.pricings) {
        this.setPricing(p);
      }
    }
  }

  /** 设置/更新模型定价 */
  setPricing(pricing: ModelPricing): void {
    const key = this.pricingKey(pricing.provider, pricing.modelId);
    this.pricings.set(key, {
      ...pricing,
      currency: pricing.currency ?? this.defaultCurrency,
    });
  }

  /** 移除定价 */
  removePricing(provider: string, modelId: string): boolean {
    const key = this.pricingKey(provider, modelId);
    return this.pricings.delete(key);
  }

  /** 获取模型定价 */
  getPricing(provider: string, modelId: string): ModelPricing | undefined {
    return this.pricings.get(this.pricingKey(provider, modelId));
  }

  /** 列出所有定价 */
  listPricings(): ModelPricing[] {
    return Array.from(this.pricings.values());
  }

  /** 计算 token 用量的成本 */
  calculateCost(
    provider: string,
    modelId: string,
    usage: TokenUsage,
  ): { cost: number; currency: string } {
    const pricing = this.getPricing(provider, modelId);
    if (!pricing) {
      return { cost: 0, currency: this.defaultCurrency };
    }

    const promptCost = (usage.promptTokens / 1_000_000) * pricing.promptPricePerMillion;
    const completionCost = (usage.completionTokens / 1_000_000) * pricing.completionPricePerMillion;
    const cachedCost =
      pricing.cachedPromptPricePerMillion && usage.cachedPromptTokens
        ? (usage.cachedPromptTokens / 1_000_000) * pricing.cachedPromptPricePerMillion
        : 0;
    const reasoningCost =
      pricing.reasoningPricePerMillion && usage.reasoningTokens
        ? (usage.reasoningTokens / 1_000_000) * pricing.reasoningPricePerMillion
        : 0;

    return {
      cost: round4(promptCost + completionCost + cachedCost + reasoningCost),
      currency: pricing.currency ?? this.defaultCurrency,
    };
  }

  /** 记录一次调用用量 */
  record(input: {
    agentId: string;
    provider: string;
    modelId: string;
    usage: TokenUsage;
    sessionId?: string;
    requestId?: string;
    streaming?: boolean;
    timestamp?: number;
    durationMs?: number;
  }): UsageRecord {
    const { cost, currency } = this.calculateCost(input.provider, input.modelId, input.usage);
    const record: UsageRecord = {
      id: `usage-${nextRecordId++}`,
      timestamp: input.timestamp ?? Date.now(),
      agentId: input.agentId,
      sessionId: input.sessionId,
      provider: input.provider,
      modelId: input.modelId,
      usage: input.usage,
      cost,
      currency,
      streaming: input.streaming,
      requestId: input.requestId,
    };

    this.records.push(record);
    this.evictIfNeeded();
    return record;
  }

  /** 查询用量记录 */
  query(options?: UsageQueryOptions): { records: UsageRecord[]; total: number } {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const descending = options?.descending ?? true;

    let filtered = this.records;
    if (options) {
      filtered = filtered.filter((r) => matchesUsageFilter(r, options));
    }

    if (descending) {
      filtered = [...filtered].reverse();
    }

    return {
      records: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  /** 获取指定时间窗口的聚合统计 */
  aggregate(filter?: UsageFilter): UsageAggregate {
    let records = this.records;
    if (filter) {
      records = records.filter((r) => matchesUsageFilter(r, filter));
    }

    const result: UsageAggregate = {
      totalCalls: records.length,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCachedPromptTokens: 0,
      totalReasoningTokens: 0,
      totalCost: 0,
      avgCostPerCall: 0,
      byModel: {},
      byProvider: {},
      byAgent: {},
    };

    for (const r of records) {
      result.totalPromptTokens += r.usage.promptTokens;
      result.totalCompletionTokens += r.usage.completionTokens;
      result.totalCachedPromptTokens += r.usage.cachedPromptTokens ?? 0;
      result.totalReasoningTokens += r.usage.reasoningTokens ?? 0;
      result.totalCost += r.cost;

      addToBucket(result.byModel, r.modelId, r);
      addToBucket(result.byProvider, r.provider, r);
      addToBucket(result.byAgent, r.agentId, r);
    }

    result.avgCostPerCall = records.length > 0 ? round4(result.totalCost / records.length) : 0;
    result.totalCost = round4(result.totalCost);

    return result;
  }

  /** 获取指定 Agent 的总成本 */
  getAgentTotalCost(agentId: string): number {
    return round4(this.records.filter((r) => r.agentId === agentId).reduce((s, r) => s + r.cost, 0));
  }

  /** 获取指定模型的总用量 */
  getModelTotalUsage(modelId: string): { calls: number; tokens: number; cost: number } {
    const records = this.records.filter((r) => r.modelId === modelId);
    return {
      calls: records.length,
      tokens: records.reduce((s, r) => s + r.usage.promptTokens + r.usage.completionTokens, 0),
      cost: round4(records.reduce((s, r) => s + r.cost, 0)),
    };
  }

  /** 获取最近 N 条记录 */
  getRecent(limit: number): UsageRecord[] {
    return [...this.records].reverse().slice(0, limit);
  }

  /** 清空记录 */
  clear(): void {
    this.records = [];
  }

  /** 当前记录数 */
  size(): number {
    return this.records.length;
  }

  private pricingKey(provider: string | undefined, modelId: string): string {
    return `${(provider ?? '').toLowerCase()}:${modelId.toLowerCase()}`;
  }

  private evictIfNeeded(): void {
    if (this.records.length > this.maxRecords) {
      const drop = this.records.length - this.maxRecords;
      this.records.splice(0, drop);
    }
  }
}

function addToBucket(
  bucket: Record<string, { calls: number; cost: number; tokens: number }>,
  key: string,
  record: UsageRecord,
): void {
  if (!bucket[key]) {
    bucket[key] = { calls: 0, cost: 0, tokens: 0 };
  }
  bucket[key].calls++;
  bucket[key].cost += record.cost;
  bucket[key].tokens += record.usage.promptTokens + record.usage.completionTokens;
}

function matchesUsageFilter(r: UsageRecord, f: UsageFilter): boolean {
  if (f.agentId !== undefined && r.agentId !== f.agentId) return false;
  if (f.sessionId !== undefined && r.sessionId !== f.sessionId) return false;
  if (f.provider !== undefined && r.provider !== f.provider) return false;
  if (f.modelId !== undefined && r.modelId !== f.modelId) return false;
  if (f.requestId !== undefined && r.requestId !== f.requestId) return false;
  if (f.fromTimestamp !== undefined && r.timestamp < f.fromTimestamp) return false;
  if (f.toTimestamp !== undefined && r.timestamp > f.toTimestamp) return false;
  return true;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 全局默认实例 */
export const llmCostTracker = new LlmCostTracker();
