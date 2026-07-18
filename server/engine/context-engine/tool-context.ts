import { logger } from '../../logger.js';

export interface ToolCallRecord {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  durationMs?: number;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
  success?: boolean;
}

export interface ToolContextConfig {
  maxHistorySize: number;
  maxToolNameLength: number;
  maxArgumentsSize: number;
  maxResultSize: number;
  trackFailures: boolean;
  trackSuccesses: boolean;
  toolUsageDecayMs: number;
}

export interface ToolStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageDurationMs: number;
  byTool: Record<string, {
    calls: number;
    successes: number;
    failures: number;
    averageDurationMs: number;
  }>;
  lastCallAt?: number;
  lastSuccessfulTool?: string;
  lastFailedTool?: string;
}

export interface ToolContextSnapshot {
  recentCalls: ToolCallRecord[];
  toolStats: ToolStats;
  activeTools: string[];
}

const DEFAULT_CONFIG: Required<ToolContextConfig> = {
  maxHistorySize: 100,
  maxToolNameLength: 100,
  maxArgumentsSize: 1024 * 1024,
  maxResultSize: 10 * 1024 * 1024,
  trackFailures: true,
  trackSuccesses: true,
  toolUsageDecayMs: 24 * 60 * 60 * 1000,
};

export class ToolContext {
  private config: Required<ToolContextConfig>;
  private callHistory: ToolCallRecord[] = [];
  private activeCalls: Map<string, ToolCallRecord> = new Map();
  private toolUsage: Map<string, {
    calls: number;
    successes: number;
    failures: number;
    totalDuration: number;
    lastUsedAt: number;
  }> = new Map();

  constructor(config: Partial<ToolContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('[ToolContext] 工具上下文初始化完成');
  }

  startToolCall(
    toolName: string,
    args: Record<string, unknown>,
    options: { id?: string; sessionId?: string; metadata?: Record<string, unknown> } = {}
  ): ToolCallRecord {
    const id = options.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const record: ToolCallRecord = {
      id,
      toolName,
      arguments: args,
      status: 'running',
      startTime: Date.now(),
      sessionId: options.sessionId,
      metadata: options.metadata,
    };

    this.activeCalls.set(id, record);
    logger.debug(`[ToolContext] 工具调用开始: ${toolName} (${id})`);
    return record;
  }

  completeToolCall(id: string, result: unknown): ToolCallRecord | null {
    const record = this.activeCalls.get(id);
    if (!record) {
      logger.warn(`[ToolContext] 未找到活动工具调用: ${id}`);
      return null;
    }

    record.status = 'completed';
    record.result = result;
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.success = true;

    this.activeCalls.delete(id);
    this.addToHistory(record);
    this.updateToolStats(record);

    logger.debug(
      `[ToolContext] 工具调用完成: ${record.toolName} (${id}), ` +
      `耗时=${record.durationMs}ms`
    );

    return { ...record };
  }

  failToolCall(id: string, error: string): ToolCallRecord | null {
    const record = this.activeCalls.get(id);
    if (!record) {
      logger.warn(`[ToolContext] 未找到活动工具调用: ${id}`);
      return null;
    }

    record.status = 'failed';
    record.error = error;
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.success = false;

    this.activeCalls.delete(id);
    this.addToHistory(record);
    this.updateToolStats(record);

    logger.warn(
      `[ToolContext] 工具调用失败: ${record.toolName} (${id}), ` +
      `错误=${error}`
    );

    return { ...record };
  }

  cancelToolCall(id: string): ToolCallRecord | null {
    const record = this.activeCalls.get(id);
    if (!record) return null;

    record.status = 'cancelled';
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;

    this.activeCalls.delete(id);
    this.addToHistory(record);

    logger.debug(`[ToolContext] 工具调用取消: ${record.toolName} (${id})`);
    return { ...record };
  }

  getToolCall(id: string): ToolCallRecord | null {
    const active = this.activeCalls.get(id);
    if (active) return { ...active };

    const history = this.callHistory.find(c => c.id === id);
    return history ? { ...history } : null;
  }

  getRecentCalls(limit: number = 20, toolName?: string): ToolCallRecord[] {
    let calls = this.callHistory;
    if (toolName) {
      calls = calls.filter(c => c.toolName === toolName);
    }
    return calls.slice(0, limit).map(c => ({ ...c }));
  }

  getActiveCalls(toolName?: string): ToolCallRecord[] {
    let calls = Array.from(this.activeCalls.values());
    if (toolName) {
      calls = calls.filter(c => c.toolName === toolName);
    }
    return calls.map(c => ({ ...c }));
  }

  getSuccessfulCalls(limit: number = 20, toolName?: string): ToolCallRecord[] {
    let calls = this.callHistory.filter(c => c.status === 'completed');
    if (toolName) {
      calls = calls.filter(c => c.toolName === toolName);
    }
    return calls.slice(0, limit).map(c => ({ ...c }));
  }

  getFailedCalls(limit: number = 20, toolName?: string): ToolCallRecord[] {
    let calls = this.callHistory.filter(c => c.status === 'failed');
    if (toolName) {
      calls = calls.filter(c => c.toolName === toolName);
    }
    return calls.slice(0, limit).map(c => ({ ...c }));
  }

  getToolStats(): ToolStats {
    const byTool: ToolStats['byTool'] = {};
    let totalCalls = 0;
    let successfulCalls = 0;
    let failedCalls = 0;
    let totalDuration = 0;

    for (const [toolName, stats] of this.toolUsage) {
      byTool[toolName] = {
        calls: stats.calls,
        successes: stats.successes,
        failures: stats.failures,
        averageDurationMs: stats.calls > 0 ? stats.totalDuration / stats.calls : 0,
      };
      totalCalls += stats.calls;
      successfulCalls += stats.successes;
      failedCalls += stats.failures;
      totalDuration += stats.totalDuration;
    }

    const lastCompleted = this.callHistory.find(c => c.status === 'completed' || c.status === 'failed');
    const lastSuccess = this.callHistory.find(c => c.status === 'completed');
    const lastFailure = this.callHistory.find(c => c.status === 'failed');

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      averageDurationMs: totalCalls > 0 ? totalDuration / totalCalls : 0,
      byTool,
      lastCallAt: lastCompleted?.endTime,
      lastSuccessfulTool: lastSuccess?.toolName,
      lastFailedTool: lastFailure?.toolName,
    };
  }

  getMostUsedTools(limit: number = 10): Array<{ toolName: string; calls: number; successRate: number }> {
    const tools = Array.from(this.toolUsage.entries()).map(([toolName, stats]) => ({
      toolName,
      calls: stats.calls,
      successRate: stats.calls > 0 ? stats.successes / stats.calls : 0,
    }));

    return tools
      .sort((a, b) => b.calls - a.calls)
      .slice(0, limit);
  }

  getToolSuccessRate(toolName: string): number {
    const stats = this.toolUsage.get(toolName);
    if (!stats || stats.calls === 0) return 0;
    return stats.successes / stats.calls;
  }

  getToolAverageDuration(toolName: string): number {
    const stats = this.toolUsage.get(toolName);
    if (!stats || stats.calls === 0) return 0;
    return stats.totalDuration / stats.calls;
  }

  hasActiveTool(toolName: string): boolean {
    for (const call of this.activeCalls.values()) {
      if (call.toolName === toolName) return true;
    }
    return false;
  }

  clearHistory(): number {
    const count = this.callHistory.length;
    this.callHistory = [];
    this.toolUsage.clear();
    logger.debug(`[ToolContext] 清空工具调用历史，共 ${count} 条`);
    return count;
  }

  getSnapshot(): ToolContextSnapshot {
    return {
      recentCalls: this.getRecentCalls(10),
      toolStats: this.getToolStats(),
      activeTools: Array.from(this.activeCalls.values()).map(c => c.toolName),
    };
  }

  private addToHistory(record: ToolCallRecord): void {
    this.callHistory.unshift({ ...record });
    if (this.callHistory.length > this.config.maxHistorySize) {
      this.callHistory = this.callHistory.slice(0, this.config.maxHistorySize);
    }
  }

  private updateToolStats(record: ToolCallRecord): void {
    const toolName = record.toolName;
    if (!this.toolUsage.has(toolName)) {
      this.toolUsage.set(toolName, {
        calls: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
        lastUsedAt: 0,
      });
    }

    const stats = this.toolUsage.get(toolName)!;
    stats.calls++;
    stats.lastUsedAt = record.endTime || Date.now();

    if (record.status === 'completed') {
      stats.successes++;
    } else if (record.status === 'failed') {
      stats.failures++;
    }

    if (record.durationMs) {
      stats.totalDuration += record.durationMs;
    }
  }
}
