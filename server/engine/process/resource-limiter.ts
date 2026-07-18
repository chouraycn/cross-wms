/**
 * 资源限制器
 *
 * 检查资源使用是否在配置的限制内，违反时给出原因。
 */

import type { ResourceLimit, ResourceUsage, TerminationReason } from './types.js';

/** 默认限制（不限制） */
export const DEFAULT_RESOURCE_LIMIT: ResourceLimit = {};

/** 资源违规结果 */
export interface ResourceViolation {
  field: 'memory' | 'cpu' | 'handles' | 'time';
  limit: number;
  actual: number;
  reason: TerminationReason;
}

/** 资源检查结果 */
export interface ResourceCheckResult {
  ok: boolean;
  violations: ResourceViolation[];
}

/**
 * 资源限制器
 *
 * 不可变：限制配置在构造时确定，调用 check 比对一次使用快照。
 */
export class ResourceLimiter {
  readonly limit: ResourceLimit;

  constructor(limit: ResourceLimit = {}) {
    this.limit = { ...limit };
  }

  /**
   * 检查给定资源使用是否违规
   *
   * @param usage 当前资源使用快照
   * @param startedAtMs 进程启动时间（用于时间限制）
   * @param now 当前时间（用于测试）
   */
  check(
    usage: ResourceUsage,
    startedAtMs: number,
    now: number = Date.now(),
  ): ResourceCheckResult {
    const violations: ResourceViolation[] = [];

    if (this.limit.memoryMb !== undefined && usage.memoryMb > this.limit.memoryMb) {
      violations.push({
        field: 'memory',
        limit: this.limit.memoryMb,
        actual: usage.memoryMb,
        reason: 'resource-limit',
      });
    }
    if (this.limit.cpuPercent !== undefined && usage.cpuPercent > this.limit.cpuPercent) {
      violations.push({
        field: 'cpu',
        limit: this.limit.cpuPercent,
        actual: usage.cpuPercent,
        reason: 'resource-limit',
      });
    }
    if (this.limit.maxHandles !== undefined && usage.handles !== undefined && usage.handles > this.limit.maxHandles) {
      violations.push({
        field: 'handles',
        limit: this.limit.maxHandles,
        actual: usage.handles,
        reason: 'resource-limit',
      });
    }
    if (this.limit.maxTimeMs !== undefined) {
      const elapsed = Math.max(0, now - startedAtMs);
      if (elapsed > this.limit.maxTimeMs) {
        violations.push({
          field: 'time',
          limit: this.limit.maxTimeMs,
          actual: elapsed,
          reason: 'resource-limit',
        });
      }
    }
    return { ok: violations.length === 0, violations };
  }

  /** 合并两个限制（取更严格的） */
  merge(other: ResourceLimiter | ResourceLimit): ResourceLimiter {
    const otherLimit: ResourceLimit = other instanceof ResourceLimiter ? other.limit : other;
    const merged: ResourceLimit = { ...this.limit };
    for (const key of Object.keys(otherLimit) as Array<keyof ResourceLimit>) {
      const v = otherLimit[key];
      if (v === undefined) {
        continue;
      }
      const cur = merged[key];
      if (cur === undefined) {
        (merged[key] as unknown) = v;
      } else {
        (merged[key] as unknown) = Math.min(cur as number, v);
      }
    }
    return new ResourceLimiter(merged);
  }
}
