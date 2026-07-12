/**
 * CircuitBreaker — 工具熔断器
 *
 * 按工具名维护熔断状态：closed → half_open → open
 * - 2 次连续失败 → half_open（注入备选工具建议）
 * - 3 次连续失败 → open（跳过该工具 + SSE 告警）
 * - 工具成功 → 重置为 closed
 * - open 状态 60 秒后自动降级为 half_open（冷却恢复，允许重试）
 * - half_open 状态下成功一次 → 重置为 closed
 *
 * v6.0: P0-2 工具熔断器
 * v6.1: 添加冷却恢复机制（OPEN_COOLDOWN_MS）
 * v11.1: 添加状态持久化 + half_open 并发探测接入
 */

import * as fs from 'fs';
import * as path from 'path';
import { AppPaths } from '../config/appPaths.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 熔断器状态 */
export type CircuitState = 'closed' | 'half_open' | 'open';

/** 单个工具的熔断记录 */
interface ToolCircuitRecord {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureReason: string;
  alternativeTool?: string;
  /** 进入 open 状态的时间戳（用于冷却恢复） */
  openedAt?: number;
}

/** 熔断器触发事件 */
export interface CircuitBreakerEvent {
  type: 'circuit_breaker_triggered';
  toolName: string;
  failureCount: number;
  state: CircuitState;
  alternativeTool?: string;
}

/**
 * 熔断器可配置阈值。
 * 所有字段可选，未提供的字段使用默认值。
 */
export interface CircuitBreakerConfig {
  /** 降级阈值：连续失败次数达到此值时降级为 half_open（默认 2） */
  halfOpenThreshold?: number;
  /** 熔断阈值：连续失败次数达到此值时熔断为 open（默认 3） */
  openThreshold?: number;
  /** open 状态冷却恢复时间（毫秒，默认 60_000） */
  openCooldownMs?: number;
  /** half_open 状态下允许的最大并发请求数（默认 1） */
  maxHalfOpenConcurrent?: number;
}

// ===================== 工具备选映射 =====================

/** 已知工具的备选映射（失败时建议替代） */
const TOOL_ALTERNATIVES: Record<string, string> = {
  'web_api_call': 'web_fetch',
  'web_fetch': 'web_search',
  'web_search': 'web_search_legacy',
  'web_fetch_legacy': 'web_fetch',
  'web_search_legacy': 'web_search',
  'browser_navigate': 'web_fetch',
  'file_readFile': 'shell_exec',
  'db_query': 'web_api_call',
  'desktop_screenshot': 'desktop_see',
};

// ===================== 默认常量 =====================

/** 默认降级阈值 */
const DEFAULT_HALF_OPEN_THRESHOLD = 2;

/** 默认熔断阈值 */
const DEFAULT_OPEN_THRESHOLD = 3;

/** 默认 open 状态冷却恢复时间（毫秒） */
const DEFAULT_OPEN_COOLDOWN_MS = 60_000;

/** half_open 状态下默认允许的最大并发请求数 */
const DEFAULT_MAX_HALF_OPEN_CONCURRENT = 1;

/** P1-4: 持久化快照文件 */
const SNAPSHOT_FILE = 'circuit-breaker-snapshot.json';
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

// ===================== CircuitBreaker 类 =====================

export class CircuitBreaker {
  private records: Map<string, ToolCircuitRecord> = new Map();

  /** half_open 状态下每个工具的当前并发请求计数 */
  private halfOpenConcurrent: Map<string, number> = new Map();

  /** 降级阈值：连续失败次数达到此值时降级为 half_open */
  private halfOpenThreshold: number;
  /** 熔断阈值：连续失败次数达到此值时熔断为 open */
  private openThreshold: number;
  /** open 状态冷却恢复时间（毫秒） */
  private openCooldownMs: number;
  /** half_open 状态下允许的最大并发请求数 */
  private maxHalfOpenConcurrent: number;

  /** P1-4: 持久化 */
  private snapshotPath: string;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: CircuitBreakerConfig) {
    this.halfOpenThreshold = config?.halfOpenThreshold ?? DEFAULT_HALF_OPEN_THRESHOLD;
    this.openThreshold = config?.openThreshold ?? DEFAULT_OPEN_THRESHOLD;
    this.openCooldownMs = config?.openCooldownMs ?? DEFAULT_OPEN_COOLDOWN_MS;
    this.maxHalfOpenConcurrent = config?.maxHalfOpenConcurrent ?? DEFAULT_MAX_HALF_OPEN_CONCURRENT;
    this.snapshotPath = path.join(AppPaths.dataDir, SNAPSHOT_FILE);
    this.loadSnapshot();
  }

  /**
   * P1-4: 从磁盘加载熔断状态快照
   */
  private loadSnapshot(): void {
    try {
      if (!fs.existsSync(this.snapshotPath)) return;
      const content = fs.readFileSync(this.snapshotPath, 'utf8');
      const data = JSON.parse(content) as { records: [string, ToolCircuitRecord][] };
      if (data.records && Array.isArray(data.records)) {
        for (const [key, record] of data.records) {
          this.records.set(key, record);
        }
        logger.info(`[CircuitBreaker] Loaded ${data.records.length} records from snapshot`);
      }
    } catch (err) {
      logger.warn('[CircuitBreaker] Failed to load snapshot:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * P1-4: 持久化当前熔断状态到磁盘
   */
  saveSnapshot(): void {
    try {
      const data = {
        savedAt: Date.now(),
        records: Array.from(this.records.entries()),
      };
      fs.writeFileSync(this.snapshotPath, JSON.stringify(data), 'utf8');
      logger.debug(`[CircuitBreaker] Saved ${data.records.length} records to snapshot`);
    } catch (err) {
      logger.warn('[CircuitBreaker] Failed to save snapshot:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * P1-4: 启动定时持久化
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
   * P1-4: 停止定时持久化并保存最终快照
   */
  stopAutoSnapshot(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.saveSnapshot();
  }

  /**
   * 运行时调整熔断阈值。
   * 仅更新提供的字段，未提供的字段保持原值。
   * 注意：已存在的熔断记录不会因阈值变化而立即重新评估状态，
   * 新阈值在后续的 recordFailure / getState 调用中生效。
   *
   * @param config - 要更新的阈值配置（部分字段）
   */
  setThresholds(config: Partial<CircuitBreakerConfig>): void {
    if (config.halfOpenThreshold !== undefined) {
      this.halfOpenThreshold = config.halfOpenThreshold;
    }
    if (config.openThreshold !== undefined) {
      this.openThreshold = config.openThreshold;
    }
    if (config.openCooldownMs !== undefined) {
      this.openCooldownMs = config.openCooldownMs;
    }
    if (config.maxHalfOpenConcurrent !== undefined) {
      this.maxHalfOpenConcurrent = config.maxHalfOpenConcurrent;
    }
  }

  /** 获取当前生效的阈值配置（只读快照） */
  getThresholds(): Required<CircuitBreakerConfig> {
    return {
      halfOpenThreshold: this.halfOpenThreshold,
      openThreshold: this.openThreshold,
      openCooldownMs: this.openCooldownMs,
      maxHalfOpenConcurrent: this.maxHalfOpenConcurrent,
    };
  }

  /** 记录工具执行成功，重置熔断状态 */
  recordSuccess(toolName: string): void {
    this.records.delete(toolName);
    this.halfOpenConcurrent.delete(toolName);
  }

  /** 记录工具执行失败，更新熔断状态 */
  recordFailure(toolName: string, reason: string): CircuitState {
    const record = this.records.get(toolName) ?? {
      state: 'closed' as CircuitState,
      consecutiveFailures: 0,
      lastFailureReason: '',
    };

    record.consecutiveFailures++;
    record.lastFailureReason = reason;
    record.alternativeTool = TOOL_ALTERNATIVES[toolName];

    if (record.consecutiveFailures >= this.openThreshold) {
      record.state = 'open';
      record.openedAt = Date.now();
    } else if (record.consecutiveFailures >= this.halfOpenThreshold) {
      record.state = 'half_open';
    }

    this.records.set(toolName, record);
    return record.state;
  }

  /** 获取工具的当前熔断状态（含冷却恢复检查） */
  getState(toolName: string): CircuitState {
    const record = this.records.get(toolName);
    if (!record) return 'closed';

    // 冷却恢复：open 状态超过冷却时间后自动降级为 half_open
    if (record.state === 'open' && record.openedAt) {
      const elapsed = Date.now() - record.openedAt;
      if (elapsed >= this.openCooldownMs) {
        record.state = 'half_open';
        // 不清零 consecutiveFailures，half_open 仍需一次成功才能完全恢复
        this.records.set(toolName, record);
      }
    }

    return record.state;
  }

  /** 获取工具的熔断记录 */
  getRecord(toolName: string): ToolCircuitRecord | undefined {
    return this.records.get(toolName);
  }

  /** 判断工具是否已被熔断（open 状态） */
  isOpen(toolName: string): boolean {
    return this.getState(toolName) === 'open';
  }

  /** 判断工具是否处于降级状态（half_open） */
  isHalfOpen(toolName: string): boolean {
    return this.getState(toolName) === 'half_open';
  }

  /**
   * 检查工具在 half_open 状态下是否还能接受新的请求（并发限制）。
   *
   * half_open 状态下同时只允许有限数量的请求通过（默认 1），
   * 用于探测工具是否恢复。超出并发限制的请求应被拒绝。
   *
   * @param toolName - 工具名
   * @returns 是否允许新的请求通过
   */
  canAttemptHalfOpen(toolName: string): boolean {
    const state = this.getState(toolName);
    if (state !== 'half_open') {
      // 非 half_open 状态不受此限制（closed 全放行，open 全拒绝）
      return state === 'closed';
    }
    const current = this.halfOpenConcurrent.get(toolName) ?? 0;
    return current < this.maxHalfOpenConcurrent;
  }

  /**
   * 在 half_open 状态下占用一个并发请求槽位。
   * 应在工具调用前调用，配合 releaseHalfOpenSlot 使用。
   *
   * @param toolName - 工具名
   * @returns 是否成功占用槽位（false 表示已达并发上限或状态不允许）
   */
  acquireHalfOpenSlot(toolName: string): boolean {
    if (!this.canAttemptHalfOpen(toolName)) return false;
    const current = this.halfOpenConcurrent.get(toolName) ?? 0;
    this.halfOpenConcurrent.set(toolName, current + 1);
    return true;
  }

  /**
   * 释放 half_open 状态下的并发请求槽位。
   * 应在工具调用结束（无论成功/失败）后调用。
   *
   * @param toolName - 工具名
   */
  releaseHalfOpenSlot(toolName: string): void {
    const current = this.halfOpenConcurrent.get(toolName) ?? 0;
    if (current <= 1) {
      this.halfOpenConcurrent.delete(toolName);
    } else {
      this.halfOpenConcurrent.set(toolName, current - 1);
    }
  }

  /** 获取工具当前的 half_open 并发占用数（主要用于测试/监控） */
  getHalfOpenConcurrent(toolName: string): number {
    return this.halfOpenConcurrent.get(toolName) ?? 0;
  }

  /** 获取备选工具建议（用于 half_open 时注入 system message） */
  getAlternativeSuggestion(toolName: string): string | null {
    const record = this.records.get(toolName);
    if (!record || record.state === 'closed') return null;
    if (record.alternativeTool) {
      return `工具 ${toolName} 连续失败 ${record.consecutiveFailures} 次，建议改用 ${record.alternativeTool}`;
    }
    return `工具 ${toolName} 连续失败 ${record.consecutiveFailures} 次，建议换用其他工具或调整参数`;
  }

  /** 重置所有熔断状态 */
  reset(): void {
    this.records.clear();
    this.halfOpenConcurrent.clear();
  }

  // ===================== MCP Per-Server 熔断方法 =====================

  /**
   * 记录 MCP Server 级别失败。
   * 同一 mcp__{serverName}__ 前缀的工具失败计入同一熔断器。
   *
   * @param serverPrefix - sanitized server 前缀（如 "filesystem"）
   * @param reason - 失败原因
   * @returns 熔断状态
   */
  recordMcpServerFailure(serverPrefix: string, reason: string): CircuitState {
    const key = `mcp__${serverPrefix}__*`;
    return this.recordFailure(key, reason);
  }

  /**
   * 记录 MCP Server 级别成功。
   *
   * @param serverPrefix - sanitized server 前缀
   */
  recordMcpServerSuccess(serverPrefix: string): void {
    const key = `mcp__${serverPrefix}__*`;
    this.recordSuccess(key);
  }

  /**
   * 检查 MCP Server 级别是否已熔断。
   *
   * @param serverPrefix - sanitized server 前缀
   * @returns 是否已熔断（open 状态）
   */
  isMcpServerOpen(serverPrefix: string): boolean {
    const key = `mcp__${serverPrefix}__*`;
    return this.isOpen(key);
  }
}