/**
 * Agent 使用量追踪器
 *
 * 按模型和会话统计 token 使用与成本，支持日报汇总。
 */

export interface UsageStats {
  /** 总调用次数 */
  totalCalls: number;
  /** 总输入 token */
  totalTokensIn: number;
  /** 总输出 token */
  totalTokensOut: number;
  /** 总成本 */
  totalCost: number;
  /** 按模型细分 */
  byModel: Record<string, { calls: number; tokensIn: number; tokensOut: number; cost: number }>;
}

export interface DailyUsage {
  /** 日期（YYYY-MM-DD） */
  date: string;
  /** 当日输入 token */
  tokensIn: number;
  /** 当日输出 token */
  tokensOut: number;
  /** 当日成本 */
  cost: number;
}

/**
 * 使用量追踪器
 */
export class UsageTracker {
  private records: Array<{
    modelId: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    sessionId?: string;
    timestamp: number;
  }> = [];

  /**
   * 记录一次模型调用
   * @param modelId 模型标识
   * @param tokensIn 输入 token 数
   * @param tokensOut 输出 token 数
   * @param cost 成本
   * @param sessionId 可选会话 ID
   */
  track(modelId: string, tokensIn: number, tokensOut: number, cost: number, sessionId?: string): void {
    this.records.push({
      modelId,
      tokensIn,
      tokensOut,
      cost,
      sessionId,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取使用统计
   * @param sessionId 可选会话 ID，不传则返回全部
   * @returns 使用统计
   */
  getStats(sessionId?: string): UsageStats {
    const filtered = sessionId ? this.records.filter((r) => r.sessionId === sessionId) : this.records;
    const byModel: UsageStats['byModel'] = {};

    let totalCalls = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCost = 0;

    for (const r of filtered) {
      totalCalls++;
      totalTokensIn += r.tokensIn;
      totalTokensOut += r.tokensOut;
      totalCost += r.cost;

      if (!byModel[r.modelId]) {
        byModel[r.modelId] = { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
      }
      byModel[r.modelId].calls++;
      byModel[r.modelId].tokensIn += r.tokensIn;
      byModel[r.modelId].tokensOut += r.tokensOut;
      byModel[r.modelId].cost += r.cost;
    }

    return {
      totalCalls,
      totalTokensIn,
      totalTokensOut,
      totalCost,
      byModel,
    };
  }

  /**
   * 获取每日汇总
   * @returns 按日期排序的日报数组
   */
  getDailySummary(): DailyUsage[] {
    const map = new Map<string, DailyUsage>();
    for (const r of this.records) {
      const date = new Date(r.timestamp).toISOString().slice(0, 10);
      const existing = map.get(date) ?? { date, tokensIn: 0, tokensOut: 0, cost: 0 };
      existing.tokensIn += r.tokensIn;
      existing.tokensOut += r.tokensOut;
      existing.cost += r.cost;
      map.set(date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** 清空所有记录 */
  reset(): void {
    this.records = [];
  }
}

/** 全局使用量追踪器实例 */
export const usageTracker = new UsageTracker();
