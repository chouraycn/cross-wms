/**
 * 健康检查
 *
 * 支持心跳与探针：
 * - 心跳：进程在固定窗口内必须报告一次"活着"
 * - 探针：调用方主动运行检查函数
 * - 就绪：综合所有探针给出 ready 状态
 */

import { logger } from '../../logger.js';
import type { HealthCheckResult, HealthStatus } from './types.js';

/** 探针函数：返回 true=健康 / false=不健康 / 抛异常=不健康 */
export type ProbeFn = () => boolean | Promise<boolean>;

/** 探针配置 */
export interface ProbeConfig {
  name: string;
  /** 探针函数 */
  probe: ProbeFn;
  /** 超时（毫秒） */
  timeoutMs?: number;
  /** 严重级别：unhealthy 会让整体降级到 unhealthy；degraded 只降级到 degraded */
  severity?: 'degraded' | 'unhealthy';
}

/** 心跳配置 */
export interface HeartbeatConfig {
  /** 心跳窗口（毫秒）：超过未收到心跳，标记为 unhealthy */
  windowMs: number;
  /** 是否启用自动定时检查 */
  autoCheck?: boolean;
}

/** 心跳状态 */
export interface HeartbeatState {
  lastBeatAtMs: number | null;
  missedBeats: number;
  status: HealthStatus;
}

const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/**
 * 健康检查器
 *
 * 一个实例对应一个进程；维护心跳 + 一组探针。
 */
export class HealthChecker {
  readonly id: string;
  private readonly probes = new Map<string, ProbeConfig>();
  private readonly heartbeat?: HeartbeatConfig;
  private heartbeatState: HeartbeatState = {
    lastBeatAtMs: null,
    missedBeats: 0,
    status: 'unknown',
  };
  private lastResults: Map<string, HealthCheckResult> = new Map();

  constructor(id: string, heartbeat?: HeartbeatConfig) {
    this.id = id;
    this.heartbeat = heartbeat;
  }

  /** 添加一个探针（同名会覆盖） */
  addProbe(config: ProbeConfig): void {
    this.probes.set(config.name, { severity: 'unhealthy', ...config });
  }

  /** 移除探针 */
  removeProbe(name: string): boolean {
    return this.probes.delete(name);
  }

  /** 报告一次心跳 */
  beat(now: number = Date.now()): void {
    this.heartbeatState = {
      lastBeatAtMs: now,
      missedBeats: 0,
      status: 'healthy',
    };
  }

  /** 心跳检查：如果超过窗口未收到心跳，标记为 unhealthy */
  checkHeartbeat(now: number = Date.now()): HeartbeatState {
    if (!this.heartbeat) {
      return this.heartbeatState;
    }
    if (this.heartbeatState.lastBeatAtMs === null) {
      this.heartbeatState = {
        ...this.heartbeatState,
        status: 'unknown',
      };
      return this.heartbeatState;
    }
    const elapsed = now - this.heartbeatState.lastBeatAtMs;
    if (elapsed > this.heartbeat.windowMs) {
      this.heartbeatState = {
        lastBeatAtMs: this.heartbeatState.lastBeatAtMs,
        missedBeats: this.heartbeatState.missedBeats + 1,
        status: 'unhealthy',
      };
      logger.warn(
        `[Process:Health] ${this.id} heartbeat missed: elapsed=${elapsed}ms window=${this.heartbeat.windowMs}ms`,
      );
    } else {
      this.heartbeatState = { ...this.heartbeatState, status: 'healthy' };
    }
    return this.heartbeatState;
  }

  /** 运行所有探针，返回结果列表 */
  async runProbes(now: number = Date.now()): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    for (const [name, config] of this.probes.entries()) {
      const startedAt = now;
      let status: HealthStatus;
      let message: string | undefined;
      try {
        const ok = await this.runWithTimeout(config);
        if (ok) {
          status = 'healthy';
        } else {
          status = config.severity === 'degraded' ? 'degraded' : 'unhealthy';
          message = 'probe returned false';
        }
      } catch (err) {
        status = config.severity === 'degraded' ? 'degraded' : 'unhealthy';
        message = err instanceof Error ? err.message : String(err);
      }
      const result: HealthCheckResult = {
        name,
        status,
        message,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
      };
      this.lastResults.set(name, result);
      results.push(result);
    }
    return results;
  }

  /**
   * 综合判断：综合心跳 + 探针结果给出整体状态
   *
   * 优先级：unhealthy > degraded > healthy > unknown
   */
  async check(now: number = Date.now()): Promise<{ status: HealthStatus; results: HealthCheckResult[] }> {
    const hb = this.checkHeartbeat(now);
    const probeResults = await this.runProbes(now);

    let status: HealthStatus = hb.status;
    if (status === 'healthy' && this.heartbeat === undefined) {
      status = 'unknown';
    }
    const priorities: Record<HealthStatus, number> = { unknown: 0, healthy: 1, degraded: 2, unhealthy: 3 };
    for (const r of probeResults) {
      if (priorities[r.status] > priorities[status]) {
        status = r.status;
      }
    }
    return { status, results: probeResults };
  }

  /** 是否"就绪"：综合 ready 状态（status === 'healthy'） */
  async isReady(now: number = Date.now()): Promise<boolean> {
    const { status } = await this.check(now);
    return status === 'healthy';
  }

  /** 上一次的检查结果 */
  getLastResults(): HealthCheckResult[] {
    return Array.from(this.lastResults.values());
  }

  private async runWithTimeout(config: ProbeConfig): Promise<boolean> {
    const timeoutMs = config.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    if (timeoutMs <= 0) {
      return await Promise.resolve(config.probe());
    }
    return await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`probe "${config.name}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      Promise.resolve(config.probe())
        .then((v) => {
          clearTimeout(timer);
          resolve(v);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

/** 健康检查注册表（按 id） */
export class HealthCheckerRegistry {
  private readonly checkers = new Map<string, HealthChecker>();

  register(checker: HealthChecker): void {
    this.checkers.set(checker.id, checker);
  }

  get(id: string): HealthChecker | undefined {
    return this.checkers.get(id);
  }

  remove(id: string): boolean {
    return this.checkers.delete(id);
  }

  clear(): void {
    this.checkers.clear();
  }
}
