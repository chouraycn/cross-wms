// 共享的会话成本与用量记账类型契约。
// 降级：agents/usage.js 未导出 NormalizedUsage，此处本地定义兼容类型
export type NormalizedUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
};
import type {
  SessionUsageTimePoint as SharedSessionUsageTimePoint,
  SessionUsageTimeSeries as SharedSessionUsageTimeSeries,
} from "../shared/session-usage-timeseries-types.js";

export type CostBreakdown = {
  total?: number;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type ParsedUsageEntry = {
  usage: NormalizedUsage;
  costTotal?: number;
  costBreakdown?: CostBreakdown;
  provider?: string;
  model?: string;
  timestamp?: Date;
};

export type ParsedTranscriptEntry = {
  message: Record<string, unknown>;
  role?: "user" | "assistant";
  timestamp?: Date;
  durationMs?: number;
  usage?: NormalizedUsage;
  costTotal?: number;
  costBreakdown?: CostBreakdown;
  provider?: string;
  model?: string;
  stopReason?: string;
  toolNames: string[];
  toolResultCounts: { total: number; errors: number };
};

export type CostUsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  // 按 token 类型细分的成本（来自可用时的实际 API 数据）
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  missingCostEntries: number;
};

type CostUsageDailyEntry = CostUsageTotals & {
  date: string;
};

export type CostUsageSummary = {
  updatedAt: number;
  days: number;
  daily: CostUsageDailyEntry[];
  totals: CostUsageTotals;
  cacheStatus?: {
    status: "fresh" | "partial" | "stale" | "refreshing";
    cachedFiles: number;
    pendingFiles: number;
    staleFiles: number;
    refreshedAt?: number;
  };
};

export type UsageCacheStatus = NonNullable<CostUsageSummary["cacheStatus"]>;

export type SessionDailyUsage = {
  date: string; // YYYY-MM-DD
  tokens: number;
  cost: number;
};

export type SessionDailyMessageCounts = {
  date: string; // YYYY-MM-DD
  total: number;
  user: number;
  assistant: number;
  toolCalls: number;
  toolResults: number;
  errors: number;
};

export type SessionUtcQuarterHourMessageCounts = {
  date: string; // YYYY-MM-DD (UTC)
  quarterIndex: number; // 0-95, UTC 15 分钟桶（index = floor((utcH * 60 + utcM) / 15)）
  total: number;
  user: number;
  assistant: number;
  toolCalls: number;
  toolResults: number;
  errors: number;
};

export type SessionUtcQuarterHourTokenUsage = {
  date: string; // YYYY-MM-DD (UTC)
  quarterIndex: number; // 0-95, UTC 15 分钟桶（index = floor((utcH * 60 + utcM) / 15)）
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  // 使用与 CostUsageTotals 相同的 token 总计基准：存在 usage.total 时使用之，
  // 否则 input + output + cacheRead + cacheWrite。这有意区别于
  // 旧版 dailyBreakdown.tokens，后者保留既有分量求和行为，
  // 直到每日用量桶单独重构。
  totalTokens: number;
  totalCost: number;
};

export type SessionLatencyStats = {
  count: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

export type SessionDailyLatency = SessionLatencyStats & {
  date: string; // YYYY-MM-DD
};

export type SessionDailyModelUsage = {
  date: string; // YYYY-MM-DD
  provider?: string;
  model?: string;
  tokens: number;
  cost: number;
  count: number;
};

export type SessionMessageCounts = {
  total: number;
  user: number;
  assistant: number;
  toolCalls: number;
  toolResults: number;
  errors: number;
};

export type SessionToolUsage = {
  totalCalls: number;
  uniqueTools: number;
  tools: Array<{ name: string; count: number }>;
};

export type SessionModelUsage = {
  provider?: string;
  model?: string;
  count: number;
  totals: CostUsageTotals;
};

export type SessionCostSummary = CostUsageTotals & {
  sessionId?: string;
  sessionFile?: string;
  firstActivity?: number;
  lastActivity?: number;
  durationMs?: number;
  activityDates?: string[]; // YYYY-MM-DD 会话有活动的日期
  dailyBreakdown?: SessionDailyUsage[]; // 每日 token/cost 细分
  dailyMessageCounts?: SessionDailyMessageCounts[];
  utcQuarterHourMessageCounts?: SessionUtcQuarterHourMessageCounts[]; // UTC 15 分钟桶，用于精确小时统计
  utcQuarterHourTokenUsage?: SessionUtcQuarterHourTokenUsage[]; // UTC 15 分钟桶，用于精确 token 马赛克统计
  dailyLatency?: SessionDailyLatency[];
  dailyModelUsage?: SessionDailyModelUsage[];
  messageCounts?: SessionMessageCounts;
  toolUsage?: SessionToolUsage;
  modelUsage?: SessionModelUsage[];
  latency?: SessionLatencyStats;
};

export type DiscoveredSession = {
  sessionId: string;
  sessionFile: string;
  mtime: number;
  firstUserMessage?: string;
};

export type SessionUsageTimePoint = SharedSessionUsageTimePoint;

export type SessionUsageTimeSeries = SharedSessionUsageTimeSeries;

export type SessionLogEntry = {
  timestamp: number;
  role: "user" | "assistant" | "tool" | "toolResult";
  content: string;
  tokens?: number;
  cost?: number;
};
