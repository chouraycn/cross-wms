/**
 * Skill Execution Audit Logger — 技能执行审计日志系统
 *
 * 详细记录每次技能执行的完整上下文，用于调试、分析和审计：
 * 1. 执行记录 — 每次调用的完整信息
 * 2. 输入输出 — 调用参数和返回结果
 * 3. 性能指标 — 耗时、内存、通道
 * 4. 错误追踪 — 异常栈、重试次数
 * 5. 用户上下文 — 会话、用户、触发方式
 * 6. 日志查询 — 按技能、时间、状态筛选
 * 7. 统计分析 — 成功率、平均耗时、趋势
 *
 * 日志等级：
 * - debug: 详细调试信息
 * - info:  正常执行记录
 * - warn:  警告（重试、降级等）
 * - error: 执行失败
 */

// ===================== 类型定义 =====================

/** 执行状态 */
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled';

/** 触发方式 */
export type TriggerType = 'manual' | 'slash-command' | 'keyword' | 'intent' | 'cron' | 'event' | 'chain' | 'api';

/** 执行日志等级 */
export type AuditLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 单条执行记录 */
export interface ExecutionRecord {
  /** 唯一执行 ID */
  executionId: string;
  /** 技能 ID */
  skillId: string;
  /** 技能名称 */
  skillName: string;
  /** 技能版本 */
  skillVersion?: string;
  /** 执行状态 */
  status: ExecutionStatus;
  /** 触发方式 */
  triggerType: TriggerType;
  /** 日志等级 */
  level: AuditLogLevel;
  /** 会话 ID */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
  /** 调用参数 */
  input?: Record<string, unknown>;
  /** 返回结果 */
  output?: Record<string, unknown>;
  /** 错误信息 */
  errorMessage?: string;
  /** 错误栈 */
  errorStack?: string;
  /** 执行通道 */
  lane?: string;
  /** 开始时间 */
  startedAt: number;
  /** 结束时间 */
  endedAt?: number;
  /** 执行耗时（毫秒） */
  durationMs?: number;
  /** 重试次数 */
  retryCount: number;
  /** 父执行 ID（嵌套调用时） */
  parentExecutionId?: string;
  /** 子执行 ID 列表 */
  childExecutionIds?: string[];
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/** 查询过滤器 */
export interface AuditQueryFilter {
  skillId?: string;
  skillName?: string;
  status?: ExecutionStatus | ExecutionStatus[];
  triggerType?: TriggerType | TriggerType[];
  level?: AuditLogLevel | AuditLogLevel[];
  sessionId?: string;
  startTime?: number;
  endTime?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  keyword?: string;
  limit?: number;
  offset?: number;
}

/** 查询结果 */
export interface AuditQueryResult {
  records: ExecutionRecord[];
  total: number;
  page?: number;
  pageSize?: number;
  hasMore: boolean;
}

/** 统计摘要 */
export interface AuditStatsSummary {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  successRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  topSkills: Array<{ skillId: string; skillName: string; count: number }>;
  byTriggerType: Record<TriggerType, number>;
  byHour: number[];
}

// ===================== 常量 =====================

/** 最大日志条数 */
const MAX_LOG_ENTRIES = 2000;

/** localStorage key */
const STORAGE_KEY = 'cdf-skill-audit-logs';

/** 统计时间窗口（24小时小时分布） */
const STATS_HOURS = 24;

// ===================== SkillAuditLogger 类 =====================

export class SkillAuditLogger {
  /** 执行记录 */
  private records: ExecutionRecord[] = [];

  /** 正在执行中的任务 */
  private runningExecutions = new Map<string, ExecutionRecord>();

  /** 持久化定时器 */
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadFromStorage();
    this.startAutoPersist();
  }

  // ===================== 1. 记录执行 =====================

  /**
   * 开始记录一次执行
   *
   * @returns executionId 执行 ID
   */
  startExecution(params: {
    skillId: string;
    skillName: string;
    skillVersion?: string;
    triggerType: TriggerType;
    sessionId?: string;
    userId?: string;
    input?: Record<string, unknown>;
    parentExecutionId?: string;
    lane?: string;
    metadata?: Record<string, unknown>;
  }): string {
    const executionId = this.generateExecutionId();
    const now = Date.now();

    const record: ExecutionRecord = {
      executionId,
      skillId: params.skillId,
      skillName: params.skillName,
      skillVersion: params.skillVersion,
      status: 'running',
      triggerType: params.triggerType,
      level: 'info',
      sessionId: params.sessionId,
      userId: params.userId,
      input: params.input,
      lane: params.lane,
      startedAt: now,
      retryCount: 0,
      parentExecutionId: params.parentExecutionId,
      metadata: params.metadata,
    };

    this.runningExecutions.set(executionId, record);

    // 记录父子关系
    if (params.parentExecutionId) {
      const parent = this.runningExecutions.get(params.parentExecutionId);
      if (parent) {
        if (!parent.childExecutionIds) parent.childExecutionIds = [];
        parent.childExecutionIds.push(executionId);
      }
    }

    return executionId;
  }

  /**
   * 记录执行成功
   */
  recordSuccess(
    executionId: string,
    output?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): void {
    const record = this.runningExecutions.get(executionId);
    if (!record) return;

    const now = Date.now();
    record.status = 'success';
    record.level = 'info';
    record.output = output;
    record.endedAt = now;
    record.durationMs = now - record.startedAt;
    if (metadata) {
      record.metadata = { ...record.metadata, ...metadata };
    }

    this.finalizeRecord(record);
  }

  /**
   * 记录执行失败
   */
  recordFailure(
    executionId: string,
    error: Error | string,
    metadata?: Record<string, unknown>,
  ): void {
    const record = this.runningExecutions.get(executionId);
    if (!record) return;

    const now = Date.now();
    record.status = 'failed';
    record.level = 'error';
    record.errorMessage = typeof error === 'string' ? error : error.message;
    record.errorStack = typeof error === 'object' && 'stack' in error ? (error as Error).stack : undefined;
    record.endedAt = now;
    record.durationMs = now - record.startedAt;
    if (metadata) {
      record.metadata = { ...record.metadata, ...metadata };
    }

    this.finalizeRecord(record);
  }

  /**
   * 记录执行超时
   */
  recordTimeout(executionId: string, timeoutMs: number): void {
    const record = this.runningExecutions.get(executionId);
    if (!record) return;

    const now = Date.now();
    record.status = 'timeout';
    record.level = 'warn';
    record.errorMessage = `Execution timed out after ${timeoutMs}ms`;
    record.endedAt = now;
    record.durationMs = timeoutMs;

    this.finalizeRecord(record);
  }

  /**
   * 记录执行取消
   */
  recordCancellation(executionId: string, reason?: string): void {
    const record = this.runningExecutions.get(executionId);
    if (!record) return;

    const now = Date.now();
    record.status = 'cancelled';
    record.level = 'warn';
    record.errorMessage = reason || 'Execution cancelled';
    record.endedAt = now;
    record.durationMs = now - record.startedAt;

    this.finalizeRecord(record);
  }

  /**
   * 记录重试
   */
  recordRetry(executionId: string, attempt: number, error?: Error): void {
    const record = this.runningExecutions.get(executionId);
    if (!record) return;

    record.retryCount = attempt;
    if (error) {
      record.level = 'warn';
    }
  }

  /**
   * 完成记录并存入历史
   */
  private finalizeRecord(record: ExecutionRecord): void {
    this.runningExecutions.delete(record.executionId);
    this.records.unshift(record);

    // 限制日志数量
    if (this.records.length > MAX_LOG_ENTRIES) {
      this.records = this.records.slice(0, MAX_LOG_ENTRIES);
    }
  }

  // ===================== 2. 查询 =====================

  /**
   * 查询执行记录
   */
  query(filter: AuditQueryFilter = {}): AuditQueryResult {
    let results = [...this.records];

    // 过滤
    if (filter.skillId) {
      results = results.filter((r) => r.skillId === filter.skillId);
    }
    if (filter.skillName) {
      results = results.filter((r) =>
        r.skillName.toLowerCase().includes(filter.skillName!.toLowerCase()),
      );
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter((r) => statuses.includes(r.status));
    }
    if (filter.triggerType) {
      const types = Array.isArray(filter.triggerType) ? filter.triggerType : [filter.triggerType];
      results = results.filter((r) => types.includes(r.triggerType));
    }
    if (filter.level) {
      const levels = Array.isArray(filter.level) ? filter.level : [filter.level];
      const levelOrder: AuditLogLevel[] = ['debug', 'info', 'warn', 'error'];
      const minLevel = Math.min(...levels.map((l) => levelOrder.indexOf(l)));
      results = results.filter((r) => levelOrder.indexOf(r.level) >= minLevel);
    }
    if (filter.sessionId) {
      results = results.filter((r) => r.sessionId === filter.sessionId);
    }
    if (filter.startTime) {
      results = results.filter((r) => r.startedAt >= filter.startTime!);
    }
    if (filter.endTime) {
      results = results.filter((r) => r.startedAt <= filter.endTime!);
    }
    if (filter.minDurationMs !== undefined) {
      results = results.filter((r) => (r.durationMs ?? 0) >= filter.minDurationMs!);
    }
    if (filter.maxDurationMs !== undefined) {
      results = results.filter((r) => (r.durationMs ?? 0) <= filter.maxDurationMs!);
    }
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      results = results.filter(
        (r) =>
          r.skillName.toLowerCase().includes(kw) ||
          r.skillId.toLowerCase().includes(kw) ||
          (r.errorMessage && r.errorMessage.toLowerCase().includes(kw)),
      );
    }

    const total = results.length;

    // 分页
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    const paged = results.slice(offset, offset + limit);

    return {
      records: paged,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      hasMore: offset + limit < total,
    };
  }

  /**
   * 获取单条记录详情
   */
  getRecord(executionId: string): ExecutionRecord | undefined {
    return this.records.find((r) => r.executionId === executionId)
      || this.runningExecutions.get(executionId);
  }

  // ===================== 3. 统计 =====================

  /**
   * 获取统计摘要
   *
   * @param hours 统计最近多少小时
   */
  getStats(hours = 24): AuditStatsSummary {
    const startTime = Date.now() - hours * 60 * 60 * 1000;
    const recent = this.records.filter((r) => r.startedAt >= startTime);

    let successCount = 0;
    let failureCount = 0;
    let timeoutCount = 0;
    const durations: number[] = [];
    const skillCounts = new Map<string, { skillId: string; skillName: string; count: number }>();
    const byTriggerType: Record<TriggerType, number> = {
      manual: 0, 'slash-command': 0, keyword: 0, intent: 0,
      cron: 0, event: 0, chain: 0, api: 0,
    };
    const byHour = new Array(STATS_HOURS).fill(0);

    for (const r of recent) {
      if (r.status === 'success') successCount++;
      if (r.status === 'failed') failureCount++;
      if (r.status === 'timeout') timeoutCount++;
      if (r.durationMs) durations.push(r.durationMs);

      const existing = skillCounts.get(r.skillId);
      if (existing) {
        existing.count++;
      } else {
        skillCounts.set(r.skillId, { skillId: r.skillId, skillName: r.skillName, count: 1 });
      }

      byTriggerType[r.triggerType] = (byTriggerType[r.triggerType] || 0) + 1;

      const hourIndex = Math.floor((Date.now() - r.startedAt) / (60 * 60 * 1000));
      if (hourIndex < STATS_HOURS) {
        byHour[STATS_HOURS - 1 - hourIndex]++;
      }
    }

    const sortedDurations = durations.sort((a, b) => a - b);
    const topSkills = Array.from(skillCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalExecutions: recent.length,
      successCount,
      failureCount,
      timeoutCount,
      successRate: recent.length > 0 ? successCount / recent.length : 0,
      avgDurationMs: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
      p50DurationMs: this.percentile(sortedDurations, 0.5),
      p95DurationMs: this.percentile(sortedDurations, 0.95),
      p99DurationMs: this.percentile(sortedDurations, 0.99),
      topSkills,
      byTriggerType,
      byHour,
    };
  }

  /**
   * 百分位数计算
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  // ===================== 4. 数据管理 =====================

  /**
   * 清空日志
   */
  clearLogs(): void {
    this.records = [];
    this.saveToStorage();
  }

  /**
   * 导出日志为 JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.records, null, 2);
  }

  /**
   * 导出日志为 CSV
   */
  exportCSV(): string {
    const headers = [
      'executionId', 'skillId', 'skillName', 'status', 'triggerType',
      'level', 'sessionId', 'startedAt', 'endedAt', 'durationMs',
      'retryCount', 'errorMessage',
    ];

    const rows = this.records.map((r) => [
      r.executionId,
      r.skillId,
      r.skillName,
      r.status,
      r.triggerType,
      r.level,
      r.sessionId || '',
      new Date(r.startedAt).toISOString(),
      r.endedAt ? new Date(r.endedAt).toISOString() : '',
      r.durationMs ?? '',
      r.retryCount,
      r.errorMessage?.replace(/\n/g, ' ').replace(/"/g, '""') || '',
    ]);

    return [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');
  }

  // ===================== 5. 持久化 =====================

  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.records = data;
      }
    } catch {
      // 加载失败
    }
  }

  saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      // 只持久化最近的 500 条
      const toSave = this.records.slice(0, 500);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // 存储失败
    }
  }

  private startAutoPersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setInterval(() => {
      this.saveToStorage();
    }, 60_000); // 每分钟持久化一次
  }

  stopAutoPersist(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }

  // ===================== 6. 辅助方法 =====================

  private generateExecutionId(): string {
    return 'exec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  /**
   * 获取当前执行中的任务数
   */
  getRunningCount(): number {
    return this.runningExecutions.size;
  }

  /**
   * 获取总记录数
   */
  getTotalCount(): number {
    return this.records.length;
  }
}

// ===================== Module-level Singleton =====================

/** 技能审计日志单例 */
export const skillAuditLogger = new SkillAuditLogger();

// ===================== 便捷函数 =====================

/**
 * 包装异步函数，自动记录执行日志
 */
export async function withAuditLog<T>(
  params: {
    skillId: string;
    skillName: string;
    triggerType: TriggerType;
    sessionId?: string;
    input?: Record<string, unknown>;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const executionId = skillAuditLogger.startExecution(params);

  try {
    const result = await fn();
    skillAuditLogger.recordSuccess(executionId, { result });
    return result;
  } catch (error) {
    skillAuditLogger.recordFailure(executionId, error as Error);
    throw error;
  }
}