/**
 * 通道健康度监控
 *
 * 监控每个通道（channel）的关键运行指标，包括：
 * - 在线状态与心跳
 * - 消息发送成功率 / 失败计数
 * - 平均延迟、p50 / p95 / p99 分位
 * - 重试与死信情况
 * - 当前队列长度
 *
 * 借鉴 OpenClaw 的 channel health-check 模式，使用滑动窗口统计 + 抽样
 */

/** 通道状态 */
export type ChannelHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'offline';

/** 单次消息投递记录 */
export interface ChannelDeliveryRecord {
  /** 投递时间戳（ms） */
  timestamp: number;
  /** 投递耗时（ms） */
  durationMs: number;
  /** 是否成功 */
  success: boolean;
  /** 失败原因（如有） */
  error?: string;
  /** 是否经过重试 */
  retried: boolean;
}

/** 通道健康度快照 */
export interface ChannelHealthSnapshot {
  channelId: string;
  status: ChannelHealthStatus;
  /** 最近一次心跳时间戳 */
  lastHeartbeatAt?: number;
  /** 最近一次投递时间戳 */
  lastDeliveryAt?: number;
  /** 统计窗口（ms） */
  windowMs: number;
  /** 窗口内总投递数 */
  totalDeliveries: number;
  /** 窗口内成功数 */
  successfulDeliveries: number;
  /** 窗口内失败数 */
  failedDeliveries: number;
  /** 窗口内重试数 */
  retries: number;
  /** 窗口内死信数 */
  deadLetters: number;
  /** 平均延迟（ms） */
  avgLatencyMs: number;
  /** p50 延迟 */
  p50LatencyMs: number;
  /** p95 延迟 */
  p95LatencyMs: number;
  /** p99 延迟 */
  p99LatencyMs: number;
  /** 成功率（0-1） */
  successRate: number;
  /** 当前队列长度 */
  queueDepth: number;
  /** 连续失败次数 */
  consecutiveFailures: number;
}

/** 配置 */
export interface ChannelHealthMonitorOptions {
  /** 统计窗口长度（ms，默认 5 分钟） */
  windowMs?: number;
  /** 心跳超时阈值（ms，超过则标记 degraded，默认 60s） */
  heartbeatTimeoutMs?: number;
  /** 心跳严重超时阈值（ms，超过则标记 unhealthy，默认 5min） */
  heartbeatCriticalMs?: number;
  /** 连续失败达到该阈值时降级（默认 3） */
  degradedFailureThreshold?: number;
  /** 连续失败达到该阈值时标记 unhealthy（默认 10） */
  unhealthyFailureThreshold?: number;
  /** 成功率低于该值时降级（0-1，默认 0.9） */
  degradedSuccessRate?: number;
  /** 成功率低于该值时标记 unhealthy（0-1，默认 0.5） */
  unhealthySuccessRate?: number;
  /** 最大样本数（避免内存无限增长，默认 1000） */
  maxSamplesPerChannel?: number;
}

interface ChannelState {
  status: ChannelHealthStatus;
  lastHeartbeatAt?: number;
  lastDeliveryAt?: number;
  consecutiveFailures: number;
  queueDepth: number;
  deadLetters: number;
  records: ChannelDeliveryRecord[];
}

const DEFAULTS: Required<ChannelHealthMonitorOptions> = {
  windowMs: 5 * 60 * 1000,
  heartbeatTimeoutMs: 60 * 1000,
  heartbeatCriticalMs: 5 * 60 * 1000,
  degradedFailureThreshold: 3,
  unhealthyFailureThreshold: 10,
  degradedSuccessRate: 0.9,
  unhealthySuccessRate: 0.5,
  maxSamplesPerChannel: 1000,
};

export class ChannelHealthMonitor {
  private options: Required<ChannelHealthMonitorOptions>;
  private channels = new Map<string, ChannelState>();

  constructor(options?: ChannelHealthMonitorOptions) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** 注册通道（初始状态为 offline） */
  registerChannel(channelId: string): void {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, {
        status: 'offline',
        consecutiveFailures: 0,
        queueDepth: 0,
        deadLetters: 0,
        records: [],
      });
    }
  }

  /** 注销通道 */
  unregisterChannel(channelId: string): void {
    this.channels.delete(channelId);
  }

  /** 标记通道在线 */
  markOnline(channelId: string): void {
    let state = this.channels.get(channelId);
    if (!state) {
      this.registerChannel(channelId);
      state = this.channels.get(channelId)!;
    }
    state.lastHeartbeatAt = Date.now();
    if (state.status === 'offline') {
      state.status = 'healthy';
    }
  }

  /** 标记通道离线 */
  markOffline(channelId: string): void {
    const state = this.channels.get(channelId);
    if (state) {
      state.status = 'offline';
    }
  }

  /** 记录心跳 */
  recordHeartbeat(channelId: string): void {
    this.markOnline(channelId);
  }

  /** 记录一次投递结果 */
  recordDelivery(channelId: string, record: Omit<ChannelDeliveryRecord, 'timestamp'> & Partial<Pick<ChannelDeliveryRecord, 'timestamp'>>): void {
    let state = this.channels.get(channelId);
    if (!state) {
      this.registerChannel(channelId);
      state = this.channels.get(channelId)!;
    }

    const fullRecord: ChannelDeliveryRecord = {
      timestamp: record.timestamp ?? Date.now(),
      durationMs: record.durationMs,
      success: record.success,
      error: record.error,
      retried: record.retried,
    };

    state.records.push(fullRecord);
    state.lastDeliveryAt = fullRecord.timestamp;

    if (fullRecord.success) {
      state.consecutiveFailures = 0;
    } else {
      state.consecutiveFailures++;
    }

    // 限长淘汰
    if (state.records.length > this.options.maxSamplesPerChannel) {
      const drop = state.records.length - this.options.maxSamplesPerChannel;
      state.records.splice(0, drop);
    }
  }

  /** 增加死信计数 */
  recordDeadLetter(channelId: string, count = 1): void {
    const state = this.channels.get(channelId);
    if (state) {
      state.deadLetters += count;
    }
  }

  /** 更新队列深度 */
  updateQueueDepth(channelId: string, depth: number): void {
    const state = this.channels.get(channelId);
    if (state) {
      state.queueDepth = Math.max(0, depth);
    }
  }

  /** 获取通道健康度快照 */
  getHealth(channelId: string): ChannelHealthSnapshot | undefined {
    const state = this.channels.get(channelId);
    if (!state) return undefined;

    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const recent = state.records.filter((r) => r.timestamp >= windowStart);

    const total = recent.length;
    const success = recent.filter((r) => r.success).length;
    const failed = total - success;
    const retries = recent.filter((r) => r.retried).length;

    const latencies = recent.map((r) => r.durationMs).sort((a, b) => a - b);
    const avgLatency = latencies.length > 0 ? latencies.reduce((s, n) => s + n, 0) / latencies.length : 0;
    const p50 = percentile(latencies, 0.5);
    const p95 = percentile(latencies, 0.95);
    const p99 = percentile(latencies, 0.99);

    const successRate = total > 0 ? success / total : 1;

    const status = this.computeStatus(state, now, successRate);

    return {
      channelId,
      status,
      lastHeartbeatAt: state.lastHeartbeatAt,
      lastDeliveryAt: state.lastDeliveryAt,
      windowMs: this.options.windowMs,
      totalDeliveries: total,
      successfulDeliveries: success,
      failedDeliveries: failed,
      retries,
      deadLetters: state.deadLetters,
      avgLatencyMs: avgLatency,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      successRate,
      queueDepth: state.queueDepth,
      consecutiveFailures: state.consecutiveFailures,
    };
  }

  /** 获取所有通道健康度 */
  getAllHealth(): ChannelHealthSnapshot[] {
    return Array.from(this.channels.keys())
      .map((id) => this.getHealth(id))
      .filter((s): s is ChannelHealthSnapshot => s !== undefined);
  }

  /** 获取不健康的通道列表 */
  getUnhealthyChannels(): ChannelHealthSnapshot[] {
    return this.getAllHealth().filter((s) => s.status !== 'healthy');
  }

  /** 清空所有通道的统计窗口（保留注册和状态） */
  resetStats(): void {
    for (const state of this.channels.values()) {
      state.records = [];
      state.consecutiveFailures = 0;
      state.queueDepth = 0;
      state.deadLetters = 0;
    }
  }

  /** 完全重置 */
  clear(): void {
    this.channels.clear();
  }

  /** 获取所有已注册通道 ID */
  getRegisteredChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  /** 根据当前状态计算 health status */
  private computeStatus(
    state: ChannelState,
    now: number,
    successRate: number,
  ): ChannelHealthStatus {
    // 已记录投递但通道仍标记为 offline（未心跳）→ 不健康
    if (state.status === 'offline' && state.lastDeliveryAt !== undefined) {
      return 'unhealthy';
    }

    // 真正离线（无任何投递记录、未心跳）→ offline
    if (state.status === 'offline') {
      return 'offline';
    }

    // 心跳超时检查
    if (state.lastHeartbeatAt !== undefined) {
      const sinceHeartbeat = now - state.lastHeartbeatAt;
      if (sinceHeartbeat >= this.options.heartbeatCriticalMs) {
        return 'unhealthy';
      }
      if (sinceHeartbeat >= this.options.heartbeatTimeoutMs) {
        return 'degraded';
      }
    } else {
      // 从未心跳 → 不健康
      return 'unhealthy';
    }

    // 连续失败检查
    if (state.consecutiveFailures >= this.options.unhealthyFailureThreshold) {
      return 'unhealthy';
    }
    if (state.consecutiveFailures >= this.options.degradedFailureThreshold) {
      return 'degraded';
    }

    // 成功率检查（仅在有足够样本时才生效）
    if (state.records.length >= 10) {
      if (successRate < this.options.unhealthySuccessRate) {
        return 'unhealthy';
      }
      if (successRate < this.options.degradedSuccessRate) {
        return 'degraded';
      }
    }

    return 'healthy';
  }
}

/** 计算分位数 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** 全局默认实例 */
export const channelHealthMonitor = new ChannelHealthMonitor();

/** 工具函数：从错误创建投递记录 */
export function failedDelivery(error: string, durationMs = 0, retried = false): Omit<ChannelDeliveryRecord, 'timestamp'> {
  return { success: false, error, durationMs, retried };
}

/** 工具函数：成功投递记录 */
export function successfulDelivery(durationMs: number, retried = false): Omit<ChannelDeliveryRecord, 'timestamp'> {
  return { success: true, durationMs, retried };
}
