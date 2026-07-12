/**
 * Tool Execution Stats — 工具执行监控与统计
 *
 * 记录工具执行的时间、成功率、失败原因等指标：
 * 1. 执行时间分布（P50/P90/P99）
 * 2. 成功/失败计数和比率
 * 3. 错误类型分布
 * 4. 重试次数统计
 * 5. 超时次数统计
 * 6. 实时健康状态
 *
 * v11.1: 新增工具执行监控与统计
 */

import { logger } from '../logger.js';
import * as fs from 'fs';
import * as path from 'path';
import { AppPaths } from '../config/appPaths.js';

// ===================== 类型定义 =====================

export interface ToolExecutionRecord {
  toolName: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  success: boolean;
  errorType?: 'timeout' | 'abort' | 'transient' | 'permanent' | 'validation' | 'unknown';
  errorMessage?: string;
  retryCount: number;
  timedOut: boolean;
  resultSize?: number;
}

export interface ToolStats {
  toolName: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  retryCount: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p90DurationMs: number;
  p99DurationMs: number;
  errorTypes: Record<string, number>;
  lastCallAt: number;
  lastErrorAt?: number;
  lastError?: string;
  healthScore: number; // 0-100
}

export interface ToolHealthStatus {
  toolName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  healthScore: number;
  consecutiveFailures: number;
  lastFailureAt?: number;
  suggestion?: string;
}

// ===================== 常量 =====================

const MAX_RECORDS_PER_TOOL = 100;
const STATS_WINDOW_MS = 60 * 60 * 1000; // 1 小时
const HEALTH_SCORE_THRESHOLD_DEGRADED = 70;
const HEALTH_SCORE_THRESHOLD_UNHEALTHY = 30;
const STATS_SNAPSHOT_FILE = 'tool-stats-snapshot.json';
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟持久化一次
// P1-4: 跟踪的工具数上限 — 防止动态 MCP 工具名导致 Map 无限增长
const MAX_TRACKED_TOOLS = 200;

// ===================== 状态 =====================

class ToolExecutionStatsManager {
  private records: Map<string, ToolExecutionRecord[]> = new Map();
  private stats: Map<string, ToolStats> = new Map();
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotPath: string;

  constructor() {
    this.snapshotPath = path.join(AppPaths.dataDir, STATS_SNAPSHOT_FILE);
    this.loadSnapshot();
  }

  /**
   * v11.1: 从磁盘加载上次快照，恢复 healthScore 和 consecutiveFailures
   * 防止进程重启后降级判断失效
   */
  private loadSnapshot(): void {
    try {
      if (!fs.existsSync(this.snapshotPath)) return;
      const content = fs.readFileSync(this.snapshotPath, 'utf8');
      const data = JSON.parse(content) as { stats: ToolStats[] };
      if (data.stats && Array.isArray(data.stats)) {
        for (const s of data.stats) {
          this.stats.set(s.toolName, s);
        }
        logger.info(`[ToolStats] Loaded ${data.stats.length} tool stats from snapshot`);
      }
    } catch (err) {
      logger.warn('[ToolStats] Failed to load snapshot:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * v11.1: 持久化当前 stats 到磁盘
   */
  saveSnapshot(): void {
    try {
      const data = {
        savedAt: Date.now(),
        stats: Array.from(this.stats.values()),
      };
      fs.writeFileSync(this.snapshotPath, JSON.stringify(data), 'utf8');
      logger.debug(`[ToolStats] Saved ${data.stats.length} tool stats to snapshot`);
    } catch (err) {
      logger.warn('[ToolStats] Failed to save snapshot:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * v11.1: 启动定时持久化
   */
  startAutoSnapshot(): void {
    if (this.snapshotTimer) return;
    this.snapshotTimer = setInterval(() => {
      this.saveSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
    if (typeof this.snapshotTimer.unref === 'function') {
      this.snapshotTimer.unref();
    }
  }

  /**
   * v11.1: 停止定时持久化并保存最终快照
   */
  stopAutoSnapshot(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.saveSnapshot();
  }

  /**
   * 记录一次工具执行
   * P1-4: 当跟踪工具数超过 MAX_TRACKED_TOOLS 时，淘汰 healthScore 最高的（最健康）的工具记录
   */
  record(execution: Omit<ToolExecutionRecord, 'durationMs'>): void {
    const durationMs = execution.endTime - execution.startTime;
    const record: ToolExecutionRecord = { ...execution, durationMs };

    // P1-4: 新工具加入前检查上限
    if (!this.records.has(execution.toolName) && this.records.size >= MAX_TRACKED_TOOLS) {
      this.evictHealthiestTool();
    }

    // 添加到记录列表
    let toolRecords = this.records.get(execution.toolName);
    if (!toolRecords) {
      toolRecords = [];
      this.records.set(execution.toolName, toolRecords);
    }
    toolRecords.push(record);

    // 限制记录数量
    if (toolRecords.length > MAX_RECORDS_PER_TOOL) {
      toolRecords.shift();
    }

    // 更新统计
    this.updateStats(execution.toolName);

    // 实时日志
    if (!record.success) {
      logger.warn(
        `[ToolStats] Tool execution failed: ${execution.toolName}, ` +
        `error=${record.errorType || 'unknown'}, ` +
        `duration=${durationMs}ms, ` +
        `retries=${record.retryCount}`
      );
    }
  }

  /**
   * P1-4: 淘汰 healthScore 最高的工具（最健康 = 最不需要监控）
   * 保留状态差的工具记录，便于持续诊断
   */
  private evictHealthiestTool(): void {
    let healthiestTool: string | null = null;
    let highestScore = -1;
    for (const [name, stats] of this.stats) {
      if (stats.healthScore > highestScore) {
        highestScore = stats.healthScore;
        healthiestTool = name;
      }
    }
    if (healthiestTool) {
      this.records.delete(healthiestTool);
      this.stats.delete(healthiestTool);
      logger.info(
        `[ToolStats] Evicted healthiest tool '${healthiestTool}' (score=${highestScore}) to stay within MAX_TRACKED_TOOLS=${MAX_TRACKED_TOOLS}`
      );
    }
  }

  /**
   * 更新工具统计
   */
  private updateStats(toolName: string): void {
    const records = this.records.get(toolName) || [];
    const now = Date.now();

    // 过滤掉过期的记录
    const validRecords = records.filter(r => now - r.startTime < STATS_WINDOW_MS);

    if (validRecords.length === 0) {
      return;
    }

    // 计算统计指标
    const successRecords = validRecords.filter(r => r.success);
    const failureRecords = validRecords.filter(r => !r.success);
    const timeoutRecords = validRecords.filter(r => r.timedOut);

    const durations = validRecords.map(r => r.durationMs).sort((a, b) => a - b);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // 计算百分位
    const p50 = this.percentile(durations, 50);
    const p90 = this.percentile(durations, 90);
    const p99 = this.percentile(durations, 99);

    // 错误类型分布
    const errorTypes: Record<string, number> = {};
    for (const r of failureRecords) {
      const type = r.errorType || 'unknown';
      errorTypes[type] = (errorTypes[type] || 0) + 1;
    }

    // 计算健康分数
    const successRate = successRecords.length / validRecords.length;
    const timeoutRate = timeoutRecords.length / validRecords.length;
    const healthScore = Math.max(0, Math.min(100, 
      successRate * 70 + 
      (1 - timeoutRate) * 20 + 
      (successRate > 0.9 ? 10 : 0)
    ));

    const lastRecord = validRecords[validRecords.length - 1];

    const stats: ToolStats = {
      toolName,
      totalCalls: validRecords.length,
      successCount: successRecords.length,
      failureCount: failureRecords.length,
      timeoutCount: timeoutRecords.length,
      retryCount: validRecords.reduce((sum, r) => sum + r.retryCount, 0),
      avgDurationMs: Math.round(avgDuration),
      p50DurationMs: p50,
      p90DurationMs: p90,
      p99DurationMs: p99,
      errorTypes,
      lastCallAt: lastRecord.startTime,
      lastErrorAt: failureRecords.length > 0 ? failureRecords[failureRecords.length - 1].endTime : undefined,
      lastError: failureRecords.length > 0 ? failureRecords[failureRecords.length - 1].errorMessage : undefined,
      healthScore: Math.round(healthScore),
    };

    this.stats.set(toolName, stats);
  }

  /**
   * 计算百分位
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * 获取工具统计
   */
  getStats(toolName: string): ToolStats | undefined {
    return this.stats.get(toolName);
  }

  /**
   * 获取所有工具统计
   */
  getAllStats(): ToolStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * 获取工具健康状态
   */
  getHealthStatus(toolName: string): ToolHealthStatus {
    const stats = this.stats.get(toolName);
    if (!stats) {
      return {
        toolName,
        status: 'healthy',
        healthScore: 100,
        consecutiveFailures: 0,
      };
    }

    // 计算连续失败次数
    const records = this.records.get(toolName) || [];
    let consecutiveFailures = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (!records[i].success) {
        consecutiveFailures++;
      } else {
        break;
      }
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let suggestion: string | undefined;

    if (stats.healthScore >= HEALTH_SCORE_THRESHOLD_DEGRADED) {
      status = 'healthy';
    } else if (stats.healthScore >= HEALTH_SCORE_THRESHOLD_UNHEALTHY) {
      status = 'degraded';
      suggestion = `工具 ${toolName} 执行成功率下降（${((stats.successCount / stats.totalCalls) * 100).toFixed(1)}%），建议检查`;
    } else {
      status = 'unhealthy';
      suggestion = `工具 ${toolName} 执行失败率过高（${((stats.failureCount / stats.totalCalls) * 100).toFixed(1)}%），建议禁用或检查`;
    }

    return {
      toolName,
      status,
      healthScore: stats.healthScore,
      consecutiveFailures,
      lastFailureAt: stats.lastErrorAt,
      suggestion,
    };
  }

  /**
   * 获取所有工具健康状态
   */
  getAllHealthStatus(): ToolHealthStatus[] {
    const toolNames = new Set([...this.stats.keys()]);
    // 添加有记录但无统计的工具
    for (const toolName of this.records.keys()) {
      toolNames.add(toolName);
    }
    return Array.from(toolNames).map(name => this.getHealthStatus(name));
  }

  /**
   * 清除指定工具的统计
   */
  clear(toolName: string): void {
    this.records.delete(toolName);
    this.stats.delete(toolName);
    logger.debug(`[ToolStats] Cleared stats for: ${toolName}`);
  }

  /**
   * 清除所有统计
   */
  clearAll(): void {
    this.records.clear();
    this.stats.clear();
    logger.debug('[ToolStats] Cleared all stats');
  }

  /**
   * 生成统计报告
   */
  generateReport(): string {
    const allStats = this.getAllStats();
    if (allStats.length === 0) {
      return 'No tool execution statistics available.';
    }

    const lines: string[] = [
      '# Tool Execution Statistics Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      `Total tools tracked: ${allStats.length}`,
      '',
    ];

    // 按健康分数排序
    const sortedStats = allStats.sort((a, b) => b.healthScore - a.healthScore);

    for (const stats of sortedStats) {
      const health = this.getHealthStatus(stats.toolName);
      const successRate = ((stats.successCount / stats.totalCalls) * 100).toFixed(1);

      lines.push(`## ${stats.toolName}`);
      lines.push(`- Status: ${health.status.toUpperCase()} (score: ${health.healthScore})`);
      lines.push(`- Calls: ${stats.totalCalls} (success: ${stats.successCount}, failure: ${stats.failureCount}, timeout: ${stats.timeoutCount})`);
      lines.push(`- Success Rate: ${successRate}%`);
      lines.push(`- Duration: avg=${stats.avgDurationMs}ms, p50=${stats.p50DurationMs}ms, p90=${stats.p90DurationMs}ms, p99=${stats.p99DurationMs}ms`);
      
      if (Object.keys(stats.errorTypes).length > 0) {
        lines.push(`- Error Types: ${Object.entries(stats.errorTypes).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
      
      if (stats.lastError) {
        lines.push(`- Last Error: ${stats.lastError.slice(0, 100)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ===================== 导出 =====================

export const toolExecutionStats = new ToolExecutionStatsManager();