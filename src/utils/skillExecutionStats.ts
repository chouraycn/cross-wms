/**
 * Skill Execution Stats — 技能执行统计与性能指标
 *
 * 跟踪技能执行的各项指标，用于性能分析和优化：
 * 1. 执行计数 — 成功/失败/超时次数
 * 2. 执行耗时 — 平均/最小/最大/P95/P99
 * 3. 错误率 — 各技能的失败率排名
 * 4. 热门度 — 按调用次数排序
 * 5. 趋势分析 — 近期执行趋势
 * 6. 慢查询检测 — 自动标记慢技能
 *
 * 统计数据在内存中维护，定期持久化到 localStorage。
 */

// ===================== 类型定义 =====================

/** 单次执行记录 */
interface ExecutionRecord {
  skillId: string;
  skillName: string;
  success: boolean;
  durationMs: number;
  errorMessage?: string;
  timestamp: number;
  lane?: string;
}

/** 技能统计信息 */
export interface SkillStats {
  skillId: string;
  skillName: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  successRate: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  totalDurationMs: number;
  lastExecutedAt?: number;
  lastError?: string;
  isSlow: boolean;
  slowCount: number;
}

/** 全局统计摘要 */
export interface StatsSummary {
  totalSkills: number;
  totalExecutions: number;
  totalSuccess: number;
  totalFailures: number;
  overallSuccessRate: number;
  avgDurationMs: number;
  slowSkillCount: number;
  topSkills: SkillStats[];
  slowestSkills: SkillStats[];
  highestFailureRate: SkillStats[];
}

/** 慢技能阈值配置 */
interface SlowSkillConfig {
  /** 绝对慢阈值（毫秒） */
  absoluteThresholdMs: number;
  /** 相对慢阈值（平均值的倍数） */
  relativeThreshold: number;
  /** 最少执行次数才判定为慢 */
  minExecutions: number;
}

// ===================== 常量 =====================

/** 默认慢技能配置 */
const DEFAULT_SLOW_CONFIG: SlowSkillConfig = {
  absoluteThresholdMs: 10_000, // 10 秒
  relativeThreshold: 3,         // 超过平均值 3 倍
  minExecutions: 5,             // 至少执行 5 次
};

/** 保留的历史记录条数 */
const MAX_HISTORY = 1000;

/** localStorage key */
const STORAGE_KEY = 'cdf-skill-execution-stats';

/** 持久化间隔（毫秒） */
const PERSIST_INTERVAL = 30_000;

// ===================== SkillExecutionStats 类 =====================

export class SkillExecutionStats {
  /** 各技能统计：skillId → SkillStats */
  private stats = new Map<string, SkillStats>();

  /** 执行历史（用于计算百分位数） */
  private history: ExecutionRecord[] = [];

  /** 慢技能配置 */
  private slowConfig: SlowSkillConfig;

  /** 持久化定时器 */
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<SlowSkillConfig>) {
    this.slowConfig = { ...DEFAULT_SLOW_CONFIG, ...config };
    this.loadFromStorage();
    this.startAutoPersist();
  }

  // ===================== 1. 记录执行 =====================

  /**
   * 记录一次技能执行
   *
   * @param skillId - 技能 ID
   * @param skillName - 技能名称
   * @param success - 是否成功
   * @param durationMs - 执行耗时（毫秒）
   * @param errorMessage - 错误信息（如果失败）
   * @param lane - 执行通道
   */
  recordExecution(
    skillId: string,
    skillName: string,
    success: boolean,
    durationMs: number,
    errorMessage?: string,
    lane?: string,
  ): void {
    const now = Date.now();

    // 记录历史
    this.history.push({
      skillId,
      skillName,
      success,
      durationMs,
      errorMessage,
      timestamp: now,
      lane,
    });

    // 限制历史记录数量
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }

    // 更新统计
    let stats = this.stats.get(skillId);
    if (!stats) {
      stats = this.createEmptyStats(skillId, skillName);
      this.stats.set(skillId, stats);
    }

    stats.totalExecutions++;
    stats.totalDurationMs += durationMs;
    stats.lastExecutedAt = now;

    if (success) {
      stats.successCount++;
    } else {
      stats.failureCount++;
      stats.lastError = errorMessage;
      // 简单判定：耗时 > 30s 认为是超时
      if (durationMs > 30_000) {
        stats.timeoutCount++;
      }
    }

    // 更新耗时统计
    stats.minDurationMs = Math.min(stats.minDurationMs, durationMs);
    stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
    stats.avgDurationMs = stats.totalDurationMs / stats.totalExecutions;

    // 更新成功率
    stats.successRate = stats.totalExecutions > 0
      ? stats.successCount / stats.totalExecutions
      : 0;

    // 重新计算百分位数（基于该技能的历史记录）
    this.updatePercentiles(stats);

    // 更新慢技能标记
    this.updateSlowFlag(stats);
  }

  /**
   * 创建空的统计对象
   */
  private createEmptyStats(skillId: string, skillName: string): SkillStats {
    return {
      skillId,
      skillName,
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      successRate: 0,
      avgDurationMs: 0,
      minDurationMs: Infinity,
      maxDurationMs: 0,
      p50DurationMs: 0,
      p95DurationMs: 0,
      p99DurationMs: 0,
      totalDurationMs: 0,
      isSlow: false,
      slowCount: 0,
    };
  }

  // ===================== 2. 百分位数计算 =====================

  /**
   * 更新指定技能的百分位数
   */
  private updatePercentiles(stats: SkillStats): void {
    const skillRecords = this.history.filter((r) => r.skillId === stats.skillId);
    const durations = skillRecords.map((r) => r.durationMs).sort((a, b) => a - b);

    if (durations.length === 0) return;

    stats.p50DurationMs = this.percentile(durations, 0.5);
    stats.p95DurationMs = this.percentile(durations, 0.95);
    stats.p99DurationMs = this.percentile(durations, 0.99);
  }

  /**
   * 计算百分位数
   *
   * @param sorted - 已排序的数组
   * @param p - 百分位（0-1）
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.floor(sorted.length * p);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  // ===================== 3. 慢技能检测 =====================

  /**
   * 更新慢技能标记
   */
  private updateSlowFlag(stats: SkillStats): void {
    if (stats.totalExecutions < this.slowConfig.minExecutions) {
      stats.isSlow = false;
      return;
    }

    // 绝对阈值判定
    const isAbsolutelySlow = stats.p95DurationMs > this.slowConfig.absoluteThresholdMs;

    // 相对阈值判定（相对于所有技能的平均耗时）
    const globalAvg = this.getGlobalAverageDuration();
    const isRelativelySlow = globalAvg > 0 && stats.avgDurationMs > globalAvg * this.slowConfig.relativeThreshold;

    stats.isSlow = isAbsolutelySlow || isRelativelySlow;

    if (stats.isSlow) {
      stats.slowCount++;
    }
  }

  /**
   * 获取所有技能的平均耗时
   */
  private getGlobalAverageDuration(): number {
    let total = 0;
    let count = 0;
    for (const stats of this.stats.values()) {
      total += stats.avgDurationMs;
      count++;
    }
    return count > 0 ? total / count : 0;
  }

  // ===================== 4. 查询接口 =====================

  /**
   * 获取单个技能的统计信息
   */
  getSkillStats(skillId: string): SkillStats | undefined {
    return this.stats.get(skillId);
  }

  /**
   * 获取所有技能的统计信息
   */
  getAllStats(): SkillStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * 获取全局统计摘要
   *
   * @param topN - 排名返回前 N 个
   */
  getSummary(topN = 10): StatsSummary {
    const allStats = this.getAllStats();

    let totalExecutions = 0;
    let totalSuccess = 0;
    let totalFailures = 0;
    let totalDuration = 0;

    for (const s of allStats) {
      totalExecutions += s.totalExecutions;
      totalSuccess += s.successCount;
      totalFailures += s.failureCount;
      totalDuration += s.totalDurationMs;
    }

    const overallSuccessRate = totalExecutions > 0 ? totalSuccess / totalExecutions : 0;
    const avgDurationMs = totalExecutions > 0 ? totalDuration / totalExecutions : 0;

    // 按调用次数排序（热门）
    const topSkills = [...allStats]
      .sort((a, b) => b.totalExecutions - a.totalExecutions)
      .slice(0, topN);

    // 按 P95 耗时排序（最慢）
    const slowestSkills = [...allStats]
      .filter((s) => s.totalExecutions >= this.slowConfig.minExecutions)
      .sort((a, b) => b.p95DurationMs - a.p95DurationMs)
      .slice(0, topN);

    // 按失败率排序（最高）
    const highestFailureRate = [...allStats]
      .filter((s) => s.totalExecutions >= this.slowConfig.minExecutions)
      .sort((a, b) => {
        const aFailureRate = a.totalExecutions > 0 ? a.failureCount / a.totalExecutions : 0;
        const bFailureRate = b.totalExecutions > 0 ? b.failureCount / b.totalExecutions : 0;
        return bFailureRate - aFailureRate;
      })
      .slice(0, topN);

    const slowSkillCount = allStats.filter((s) => s.isSlow).length;

    return {
      totalSkills: allStats.length,
      totalExecutions,
      totalSuccess,
      totalFailures,
      overallSuccessRate,
      avgDurationMs,
      slowSkillCount,
      topSkills,
      slowestSkills,
      highestFailureRate,
    };
  }

  // ===================== 5. 数据管理 =====================

  /**
   * 重置指定技能的统计
   */
  resetSkill(skillId: string): void {
    this.stats.delete(skillId);
    this.history = this.history.filter((r) => r.skillId !== skillId);
  }

  /**
   * 重置所有统计
   */
  resetAll(): void {
    this.stats.clear();
    this.history = [];
    this.saveToStorage();
  }

  /**
   * 清理旧数据
   *
   * @param olderThanMs - 保留最近多少毫秒的数据
   */
  cleanupOldData(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const before = this.history.length;
    this.history = this.history.filter((r) => r.timestamp >= cutoff);
    const removed = before - this.history.length;

    // 重新计算所有统计
    // 注意：这里简化处理，完整重算需要基于过滤后的历史
    // 实际项目中可能需要更精确的重算逻辑
    return removed;
  }

  // ===================== 6. 持久化 =====================

  /**
   * 从 localStorage 加载数据
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw) as {
        stats: Array<[string, SkillStats]>;
        history: ExecutionRecord[];
      };

      if (data.stats) {
        for (const [id, stat] of data.stats) {
          this.stats.set(id, stat);
        }
      }
      if (data.history) {
        this.history = data.history;
      }
    } catch {
      // 加载失败，忽略
    }
  }

  /**
   * 保存到 localStorage
   */
  saveToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const data = {
        stats: Array.from(this.stats.entries()),
        history: this.history.slice(-500), // 只持久化最近 500 条
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 存储失败（可能配额不够），忽略
    }
  }

  /**
   * 开始自动持久化
   */
  private startAutoPersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setInterval(() => {
      this.saveToStorage();
    }, PERSIST_INTERVAL);
  }

  /**
   * 停止自动持久化
   */
  stopAutoPersist(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
  }

  // ===================== 7. 导出 =====================

  /**
   * 导出统计数据为 CSV
   */
  exportCSV(): string {
    const headers = [
      'skillId',
      'skillName',
      'totalExecutions',
      'successCount',
      'failureCount',
      'successRate',
      'avgDurationMs',
      'p50DurationMs',
      'p95DurationMs',
      'p99DurationMs',
      'isSlow',
    ];

    const rows = this.getAllStats().map((s) => [
      s.skillId,
      s.skillName,
      s.totalExecutions,
      s.successCount,
      s.failureCount,
      (s.successRate * 100).toFixed(2) + '%',
      s.avgDurationMs.toFixed(2),
      s.p50DurationMs.toFixed(2),
      s.p95DurationMs.toFixed(2),
      s.p99DurationMs.toFixed(2),
      s.isSlow ? '是' : '否',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

// ===================== Module-level Singleton =====================

/** 技能执行统计单例 */
export const skillExecutionStats = new SkillExecutionStats();

// ===================== 辅助函数 =====================

/**
 * 格式化耗时为可读字符串
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}