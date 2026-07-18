/**
 * Subagent Telemetry — 遥测
 *
 * 记录每个 subagent 的开始/步骤/结束，并提供按 subagent 与全局维度的统计。
 */

import { randomUUID } from 'node:crypto';

// ============================================================================
// 类型定义
// ============================================================================

/** 单步记录 */
export interface SubagentStep {
  /** 步骤名称 */
  step: string;
  /** 步骤耗时（毫秒） */
  durationMs: number;
  /** 时间戳 */
  timestamp: number;
}

/** 单个 subagent 的统计 */
export interface SubagentStats {
  /** subagent ID */
  subagentId: string;
  /** 启动时元数据 */
  metadata: any;
  /** 启动时间戳 */
  startedAt: number;
  /** 结束时间戳（未结束时为空） */
  endedAt?: number;
  /** 总耗时（毫秒，未结束时为 undefined） */
  totalMs?: number;
  /** 是否成功（未结束时为 undefined） */
  success?: boolean;
  /** 步骤列表 */
  steps: SubagentStep[];
}

/** 聚合统计 */
export interface SubagentAggregate {
  /** 总数 */
  total: number;
  /** 成功数 */
  success: number;
  /** 失败数 */
  failed: number;
  /** 平均耗时（毫秒） */
  avgDurationMs: number;
}

// ============================================================================
// SubagentTelemetry 类
// ============================================================================

/**
 * 遥测记录器
 *
 * - 内存存储；同一 subagentId 多次 recordStart 会重置已有统计
 * - 步骤按 record 顺序记录
 * - recordEnd 只能调用一次；再次调用返回 false
 */
export class SubagentTelemetry {
  private readonly stats = new Map<string, SubagentStats>();

  /**
   * 记录 subagent 启动
   * @param subagentId - subagent 唯一标识
   * @param metadata - 启动元数据
   */
  recordStart(subagentId: string, metadata: any = null): void {
    this.stats.set(subagentId, {
      subagentId,
      metadata,
      startedAt: Date.now(),
      steps: [],
    });
  }

  /**
   * 记录单个步骤
   * @param subagentId - subagent 唯一标识
   * @param step - 步骤名
   * @param durationMs - 步骤耗时
   */
  recordStep(subagentId: string, step: string, durationMs: number): void {
    const stat = this.stats.get(subagentId);
    if (!stat) {
      // 自动初始化以简化调用方
      this.recordStart(subagentId, null);
    }
    const target = this.stats.get(subagentId)!;
    target.steps.push({
      step,
      durationMs,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录 subagent 结束
   * @param subagentId - subagent 唯一标识
   * @param success - 是否成功
   * @param totalMs - 总耗时（毫秒），不传则基于 startedAt 计算
   * @returns 是否成功记录（false 表示已结束过）
   */
  recordEnd(subagentId: string, success: boolean, totalMs?: number): boolean {
    const stat = this.stats.get(subagentId);
    if (!stat) return false;
    if (stat.endedAt !== undefined) return false;
    const now = Date.now();
    stat.endedAt = now;
    stat.totalMs = totalMs ?? now - stat.startedAt;
    stat.success = success;
    return true;
  }

  /**
   * 获取指定 subagent 的统计
   * @param subagentId - subagent 唯一标识
   * @returns 统计对象，若不存在则返回一个空统计
   */
  getStats(subagentId: string): SubagentStats {
    return (
      this.stats.get(subagentId) ?? {
        subagentId,
        metadata: null,
        startedAt: 0,
        steps: [],
      }
    );
  }

  /**
   * 获取所有 subagent 的统计
   * @returns 统计数组
   */
  getAllStats(): SubagentStats[] {
    return Array.from(this.stats.values()).sort(
      (a, b) => a.startedAt - b.startedAt,
    );
  }

  /**
   * 获取聚合统计
   *
   * 仅统计已结束的 subagent（endedAt 已设置）。
   * @returns 聚合数据
   */
  getAggregate(): SubagentAggregate {
    const all = Array.from(this.stats.values()).filter(
      (s) => s.endedAt !== undefined,
    );
    const total = all.length;
    let success = 0;
    let failed = 0;
    let totalMs = 0;
    for (const s of all) {
      if (s.success) success++;
      else failed++;
      totalMs += s.totalMs ?? 0;
    }
    return {
      total,
      success,
      failed,
      avgDurationMs: total === 0 ? 0 : totalMs / total,
    };
  }

  /**
   * 删除某个 subagent 的统计
   * @param subagentId - subagent 唯一标识
   * @returns 是否成功删除
   */
  forget(subagentId: string): boolean {
    return this.stats.delete(subagentId);
  }

  /** 清空所有统计（用于测试） */
  reset(): void {
    this.stats.clear();
  }

  /**
   * 生成遥测 ID（基于 UUID 简化）
   */
  static generateId(prefix = 'sa'): string {
    return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }
}

// ============================================================================
// 全局单例
// ============================================================================

let globalTelemetry: SubagentTelemetry | null = null;

/** 获取全局遥测单例 */
export function getSubagentTelemetry(): SubagentTelemetry {
  if (!globalTelemetry) {
    globalTelemetry = new SubagentTelemetry();
  }
  return globalTelemetry;
}

/** 重置全局遥测（用于测试） */
export function resetSubagentTelemetryForTests(): void {
  if (globalTelemetry) {
    globalTelemetry.reset();
  }
  globalTelemetry = null;
}
