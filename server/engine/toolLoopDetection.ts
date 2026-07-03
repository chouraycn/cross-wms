/**
 * 工具循环检测器 — 防止 Agent 陷入工具调用死循环
 *
 * 检测策略：
 * 1. 连续调用上限：同一工具名连续调用超过 maxConsecutiveCalls 时判定为循环
 * 2. 相同参数重复：相同工具 + 相同参数调用超过 maxIdenticalCalls 时判定为循环
 * 3. 窗口限制：windowSize 窗口内同一工具调用占比超过 80% 时判定为循环
 *
 * 检测到循环后进入冷却期（cooldownMs），冷却期内所有工具调用被拒绝。
 */

import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 工具循环检测配置 */
export interface ToolLoopDetectionConfig {
  /** 是否启用检测 */
  enabled: boolean;
  /** 同一工具连续调用上限（默认 10） */
  maxConsecutiveCalls: number;
  /** 相同参数调用上限（默认 3） */
  maxIdenticalCalls: number;
  /** 检测窗口大小（默认 20） */
  windowSize: number;
  /** 冷却时间（默认 5000ms） */
  cooldownMs: number;
}

/** 工具调用记录 */
export interface ToolCallRecord {
  /** 工具名称 */
  toolName: string;
  /** 参数哈希值 */
  argsHash: string;
  /** 调用时间戳（毫秒） */
  timestamp: number;
}

/** 循环检测结果 */
export type LoopDetectionResult =
  | { isLoop: false }
  | {
      isLoop: true;
      reason: 'consecutive_limit' | 'identical_repeat' | 'window_limit';
      toolName: string;
      count: number;
    };

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: ToolLoopDetectionConfig = {
  enabled: true,
  maxConsecutiveCalls: 10,
  maxIdenticalCalls: 3,
  windowSize: 20,
  cooldownMs: 5000,
};

/** 窗口内同一工具占比阈值 */
const WINDOW_DOMINANCE_RATIO = 0.8;

/** 窗口占比检测的最小记录数（避免记录太少时误判） */
const WINDOW_MIN_RECORDS_FOR_DOMINANCE = 5;

// ===================== ToolLoopDetector 类 =====================

export class ToolLoopDetector {
  private config: ToolLoopDetectionConfig;
  private history: ToolCallRecord[] = [];
  /** 每个工具名对应的连续调用计数 */
  private consecutiveCount = new Map<string, number>();
  /** 每个工具+参数哈希对应的重复调用计数 */
  private identicalCount = new Map<string, number>();
  private lastToolName: string | null = null;
  /** 冷却期截止时间戳 */
  private cooldownUntil = 0;

  constructor(config?: Partial<ToolLoopDetectionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 记录工具调用并检测循环。
   *
   * @param toolName - 工具名称
   * @param args - 工具参数
   * @returns 循环检测结果
   */
  recordAndDetect(
    toolName: string,
    args: Record<string, unknown>,
  ): LoopDetectionResult {
    // 检测功能未启用 — 直接放行
    if (!this.config.enabled) {
      return { isLoop: false };
    }

    const now = Date.now();

    // 冷却期内所有调用被拒绝
    if (this.isInCooldown()) {
      const remaining = Math.max(0, this.cooldownUntil - now);
      logger.warn(
        `[toolLoopDetection] 工具 ${toolName} 在冷却期内被拒绝，剩余 ${remaining}ms`,
      );
      return {
        isLoop: true,
        reason: 'consecutive_limit',
        toolName,
        count: this.consecutiveCount.get(toolName) ?? 0,
      };
    }

    const argsHash = this.hashArgs(args);

    // 更新连续调用计数：与上一个工具名相同则累加，否则重置该工具的计数
    if (this.lastToolName === toolName) {
      this.consecutiveCount.set(
        toolName,
        (this.consecutiveCount.get(toolName) ?? 0) + 1,
      );
    } else {
      // 切换到新工具 — 重置新工具的连续计数为 1
      this.consecutiveCount.set(toolName, 1);
    }
    this.lastToolName = toolName;

    // 更新相同参数调用计数
    const identicalKey = `${toolName}::${argsHash}`;
    this.identicalCount.set(
      identicalKey,
      (this.identicalCount.get(identicalKey) ?? 0) + 1,
    );

    // 记录到历史
    const record: ToolCallRecord = {
      toolName,
      argsHash,
      timestamp: now,
    };
    this.history.push(record);

    // 历史记录超出窗口大小时滑出旧记录
    while (this.history.length > this.config.windowSize) {
      this.history.shift();
    }

    // ---- 规则 1：连续调用上限 ----
    const consecutive = this.consecutiveCount.get(toolName) ?? 0;
    if (consecutive > this.config.maxConsecutiveCalls) {
      this.triggerCooldown(now);
      logger.warn(
        `[toolLoopDetection] 工具 ${toolName} 连续调用 ${consecutive} 次超过上限 ${this.config.maxConsecutiveCalls}`,
      );
      return {
        isLoop: true,
        reason: 'consecutive_limit',
        toolName,
        count: consecutive,
      };
    }

    // ---- 规则 2：相同参数重复 ----
    const identical = this.identicalCount.get(identicalKey) ?? 0;
    if (identical > this.config.maxIdenticalCalls) {
      this.triggerCooldown(now);
      logger.warn(
        `[toolLoopDetection] 工具 ${toolName} 相同参数调用 ${identical} 次超过上限 ${this.config.maxIdenticalCalls}`,
      );
      return {
        isLoop: true,
        reason: 'identical_repeat',
        toolName,
        count: identical,
      };
    }

    // ---- 规则 3：窗口内同一工具占比超过 80% ----
    const windowDominance = this.checkWindowDominance(toolName);
    if (windowDominance.triggered) {
      this.triggerCooldown(now);
      logger.warn(
        `[toolLoopDetection] 工具 ${toolName} 在窗口内占比 ${windowDominance.ratio.toFixed(2)} 超过阈值 ${WINDOW_DOMINANCE_RATIO}`,
      );
      return {
        isLoop: true,
        reason: 'window_limit',
        toolName,
        count: windowDominance.count,
      };
    }

    return { isLoop: false };
  }

  /**
   * 触发冷却期。
   */
  private triggerCooldown(now: number): void {
    this.cooldownUntil = now + this.config.cooldownMs;
  }

  /**
   * 检查窗口内同一工具的占比是否超过阈值。
   * 只有当窗口记录数达到 windowSize 时才进行检测，避免窗口未满时误判。
   */
  private checkWindowDominance(toolName: string): {
    triggered: boolean;
    count: number;
    ratio: number;
  } {
    const window = this.history;
    // 窗口未填满时不检查，避免记录太少时误判
    if (window.length < this.config.windowSize) {
      return { triggered: false, count: 0, ratio: 0 };
    }
    let count = 0;
    for (const record of window) {
      if (record.toolName === toolName) {
        count += 1;
      }
    }
    const ratio = count / window.length;
    return {
      triggered: ratio > WINDOW_DOMINANCE_RATIO,
      count,
      ratio,
    };
  }

  /**
   * 计算参数的哈希值。
   * 使用 JSON.stringify + 简单散列（不需要加密强度）。
   */
  private hashArgs(args: Record<string, unknown>): string {
    try {
      const json = JSON.stringify(args, Object.keys(args).sort());
      return this.simpleHash(json);
    } catch {
      // JSON.stringify 失败时退化为字符串拼接
      return this.simpleHash(String(args));
    }
  }

  /**
   * 简单字符串哈希 — DJB2 变体。
   * 不需要加密强度，只用于检测重复参数。
   */
  private simpleHash(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) + hash + char) >>> 0; // 无符号 32 位
    }
    return hash.toString(16);
  }

  /**
   * 重置所有状态。
   */
  reset(): void {
    this.history = [];
    this.consecutiveCount.clear();
    this.identicalCount.clear();
    this.lastToolName = null;
    this.cooldownUntil = 0;
  }

  /**
   * 获取历史记录副本。
   */
  getHistory(): ToolCallRecord[] {
    return [...this.history];
  }

  /**
   * 检查是否在冷却期内。
   */
  isInCooldown(): boolean {
    return Date.now() < this.cooldownUntil;
  }
}

// ===================== 单例导出 =====================

export const toolLoopDetector = new ToolLoopDetector();
