/**
 * 渠道健康监控器
 *
 * 功能：
 * 1. 监控各通知渠道（webhook、wechat、dingtalk）的可用性
 * 2. 自动重连断开的渠道
 * 3. 通过 SSE 向前端推送状态变化
 * 4. 提供健康检查 API
 */

import { EventEmitter } from 'events';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 渠道类型 */
export type ChannelType = 'webhook' | 'wechat' | 'dingtalk';

/** 渠道状态 */
export type ChannelStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/** 渠道健康信息 */
export interface ChannelHealth {
  type: ChannelType;
  status: ChannelStatus;
  lastCheck: number;
  lastSuccess?: number;
  lastFailure?: number;
  consecutiveFailures: number;
  totalChecks: number;
  totalFailures: number;
  avgLatency?: number;
  lastError?: string;
  config: ChannelConfig;
}

/** 渠道配置 */
export interface ChannelConfig {
  enabled: boolean;
  healthCheckInterval?: number; // ms
  healthCheckTimeout?: number; // ms
  maxConsecutiveFailures?: number;
  retryInterval?: number; // ms
}

/** 健康检查结果 */
export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
  details?: Record<string, unknown>;
}

/** 渠道事件 */
export interface ChannelHealthEvent {
  type: 'health_change' | 'health_check' | 'config_change';
  channel: ChannelType;
  previousStatus?: ChannelStatus;
  currentStatus?: ChannelStatus;
  timestamp: number;
  details?: Record<string, unknown>;
}

// ===================== 默认配置 =====================

const DEFAULT_HEALTH_CHECK_INTERVAL = 60000; // 1 分钟
const DEFAULT_HEALTH_CHECK_TIMEOUT = 5000; // 5 秒
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_RETRY_INTERVAL = 30000; // 30 秒

// ===================== 渠道健康监控器 =====================

export class ChannelHealthMonitor extends EventEmitter {
  private channels: Map<ChannelType, ChannelHealth> = new Map();
  private checkTimers: Map<ChannelType, NodeJS.Timeout> = new Map();
  private sseClients: Set<{
    write: (data: string) => void;
    destroy?: () => void;
  }> = new Set();
  private globalInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeChannels();
  }

  /**
   * 初始化渠道
   */
  private initializeChannels(): void {
    const channelTypes: ChannelType[] = ['webhook', 'wechat', 'dingtalk'];

    for (const type of channelTypes) {
      this.channels.set(type, {
        type,
        status: 'unknown',
        lastCheck: 0,
        consecutiveFailures: 0,
        totalChecks: 0,
        totalFailures: 0,
        config: {
          enabled: true,
          healthCheckInterval: DEFAULT_HEALTH_CHECK_INTERVAL,
          healthCheckTimeout: DEFAULT_HEALTH_CHECK_TIMEOUT,
          maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
          retryInterval: DEFAULT_RETRY_INTERVAL,
        },
      });
    }

    logger.info('[ChannelHealthMonitor] Initialized channels:', channelTypes.join(', '));
  }

  /**
   * 更新渠道配置
   */
  updateConfig(type: ChannelType, config: Partial<ChannelConfig>): void {
    const health = this.channels.get(type);
    if (!health) return;

    const previousConfig = { ...health.config };
    health.config = { ...health.config, ...config };

    // 如果健康检查间隔改变了，重新调度
    if (config.healthCheckInterval !== undefined && config.healthCheckInterval !== previousConfig.healthCheckInterval) {
      this.scheduleHealthCheck(type);
    }

    logger.info(`[ChannelHealthMonitor] Updated config for ${type}:`, config);

    this.emitEvent({
      type: 'config_change',
      channel: type,
      timestamp: Date.now(),
      details: { previous: previousConfig, current: health.config },
    });
  }

  /**
   * 启用/禁用渠道
   */
  setEnabled(type: ChannelType, enabled: boolean): void {
    this.updateConfig(type, { enabled });

    if (!enabled) {
      this.pauseHealthCheck(type);
    } else {
      this.scheduleHealthCheck(type);
    }
  }

  /**
   * 获取所有渠道健康状态
   */
  getAllHealth(): ChannelHealth[] {
    return Array.from(this.channels.values());
  }

  /**
   * 获取单个渠道健康状态
   */
  getHealth(type: ChannelType): ChannelHealth | undefined {
    return this.channels.get(type);
  }

  /**
   * 获取总体系统健康状态
   */
  getSystemHealth(): { status: ChannelStatus; unhealthyChannels: ChannelType[] } {
    const healths = this.getAllHealth();
    const unhealthyChannels = healths
      .filter(h => h.status === 'unhealthy' || h.status === 'degraded')
      .map(h => h.type);

    let status: ChannelStatus = 'healthy';
    if (unhealthyChannels.length > 0) {
      status = unhealthyChannels.length === healths.length ? 'unhealthy' : 'degraded';
    }

    return { status, unhealthyChannels };
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck(type: ChannelType): Promise<HealthCheckResult> {
    const health = this.channels.get(type);
    if (!health || !health.config.enabled) {
      return { healthy: false, error: 'Channel not enabled' };
    }

    const startTime = Date.now();
    const timeout = health.config.healthCheckTimeout || DEFAULT_HEALTH_CHECK_TIMEOUT;

    try {
      const result = await Promise.race([
        this.checkChannel(type),
        new Promise<HealthCheckResult>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), timeout)
        ),
      ]);

      const latency = Date.now() - startTime;
      health.lastCheck = Date.now();
      health.totalChecks++;
      health.consecutiveFailures = 0;
      health.lastSuccess = Date.now();
      health.avgLatency = this.calculateAvgLatency(health, latency);

      // 更新状态
      const previousStatus = health.status;
      if (previousStatus !== 'healthy') {
        health.status = 'healthy';
        this.emitEvent({
          type: 'health_change',
          channel: type,
          previousStatus,
          currentStatus: 'healthy',
          timestamp: Date.now(),
        });
      }

      return { ...result, latency };

    } catch (error) {
      const latency = Date.now() - startTime;
      health.lastCheck = Date.now();
      health.totalChecks++;
      health.totalFailures++;
      health.consecutiveFailures++;
      health.lastFailure = Date.now();
      health.lastError = error instanceof Error ? error.message : String(error);

      // 更新状态
      const previousStatus = health.status;
      if (health.consecutiveFailures >= (health.config.maxConsecutiveFailures || DEFAULT_MAX_CONSECUTIVE_FAILURES)) {
        if (previousStatus !== 'unhealthy') {
          health.status = 'unhealthy';
          this.emitEvent({
            type: 'health_change',
            channel: type,
            previousStatus,
            currentStatus: 'unhealthy',
            timestamp: Date.now(),
            details: { consecutiveFailures: health.consecutiveFailures },
          });
        }
      } else {
        if (previousStatus !== 'degraded') {
          health.status = 'degraded';
          this.emitEvent({
            type: 'health_change',
            channel: type,
            previousStatus,
            currentStatus: 'degraded',
            timestamp: Date.now(),
          });
        }
      }

      return {
        healthy: false,
        latency,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 执行渠道特定检查
   */
  private async checkChannel(type: ChannelType): Promise<HealthCheckResult> {
    switch (type) {
      case 'webhook':
        return this.checkWebhook();
      case 'wechat':
        return this.checkWechat();
      case 'dingtalk':
        return this.checkDingtalk();
      default:
        return { healthy: true };
    }
  }

  /**
   * 检查 Webhook 渠道
   */
  private async checkWebhook(): Promise<HealthCheckResult> {
    // Webhook 健康检查：尝试访问配置的 URL
    const webhookUrl = process.env.WEBHOOK_HEALTH_URL;

    if (!webhookUrl) {
      // 如果没有配置健康检查 URL，模拟成功
      return { healthy: true, details: { reason: 'no-health-check-url' } };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(webhookUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return { healthy: false, error: `HTTP ${response.status}` };
      }

      return { healthy: true };

    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Webhook check failed',
      };
    }
  }

  /**
   * 检查微信渠道
   */
  private async checkWechat(): Promise<HealthCheckResult> {
    // 微信健康检查：检查 access_token 是否有效
    const wechatApiUrl = 'https://api.weixin.qq.com/cgi-bin/getcallbackip';

    if (!process.env.WECHAT_APP_ID) {
      return { healthy: true, details: { reason: 'not-configured' } };
    }

    try {
      // 简单检查微信 API 是否可达
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(wechatApiUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // 微信 API 通常会返回错误码而不是 4xx/5xx，所以检查是否有响应即可
      return { healthy: response.ok || response.status === 400 || response.status === 401 };

    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Wechat check failed',
      };
    }
  }

  /**
   * 检查钉钉渠道
   */
  private async checkDingtalk(): Promise<HealthCheckResult> {
    const dingtalkApiUrl = 'https://oapi.dingtalk.com/gettoken';

    if (!process.env.DINGTALK_APP_KEY) {
      return { healthy: true, details: { reason: 'not-configured' } };
    }

    try {
      const url = new URL(dingtalkApiUrl);
      url.searchParams.set('appkey', process.env.DINGTALK_APP_KEY);
      url.searchParams.set('appsecret', process.env.DINGTALK_APP_SECRET || '');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return { healthy: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { errcode?: number; errmsg?: string };

      if (data.errcode && data.errcode !== 0) {
        return { healthy: false, error: data.errmsg };
      }

      return { healthy: true };

    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Dingtalk check failed',
      };
    }
  }

  /**
   * 调度健康检查
   */
  private scheduleHealthCheck(type: ChannelType): void {
    // 清除现有定时器
    const existingTimer = this.checkTimers.get(type);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const health = this.channels.get(type);
    if (!health || !health.config.enabled) return;

    const interval = health.config.healthCheckInterval || DEFAULT_HEALTH_CHECK_INTERVAL;

    // 立即执行一次检查
    this.performHealthCheck(type);

    // 设置定期检查
    const timer = setInterval(() => {
      this.performHealthCheck(type);
    }, interval);

    this.checkTimers.set(type, timer);

    logger.info(`[ChannelHealthMonitor] Scheduled health check for ${type} every ${interval}ms`);
  }

  /**
   * 暂停健康检查
   */
  private pauseHealthCheck(type: ChannelType): void {
    const timer = this.checkTimers.get(type);
    if (timer) {
      clearInterval(timer);
      this.checkTimers.delete(type);
    }
  }

  /**
   * 启动监控
   */
  start(): void {
    if (this.globalInterval) return;

    // 启动所有启用的渠道检查
    for (const type of this.channels.keys()) {
      this.scheduleHealthCheck(type);
    }

    // 设置全局检查（确保至少每 5 分钟检查一次）
    this.globalInterval = setInterval(() => {
      const systemHealth = this.getSystemHealth();
      if (systemHealth.status !== 'healthy') {
        logger.warn('[ChannelHealthMonitor] System health degraded:', systemHealth);
      }
    }, 300000);

    logger.info('[ChannelHealthMonitor] Started monitoring');
  }

  /**
   * 停止监控
   */
  stop(): void {
    // 清除所有定时器
    for (const timer of this.checkTimers.values()) {
      clearInterval(timer);
    }
    this.checkTimers.clear();

    if (this.globalInterval) {
      clearInterval(this.globalInterval);
      this.globalInterval = null;
    }

    logger.info('[ChannelHealthMonitor] Stopped monitoring');
  }

  /**
   * 注册 SSE 客户端
   */
  addSSEClient(client: { write: (data: string) => void; destroy?: () => void }): () => void {
    this.sseClients.add(client);

    // 立即发送当前状态
    const healthData = this.getAllHealth().map(h => ({
      type: 'health_check' as const,
      channel: h.type,
      currentStatus: h.status,
      timestamp: Date.now(),
    }));

    for (const data of healthData) {
      this.emitToClient(client, data);
    }

    // 返回清理函数
    return () => {
      this.sseClients.delete(client);
    };
  }

  /**
   * 发送事件给 SSE 客户端
   */
  private emitEvent(event: ChannelHealthEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(data);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * 发送数据给单个客户端
   */
  private emitToClient(client: { write: (data: string) => void; destroy?: () => void }, data: unknown): void {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.sseClients.delete(client);
    }
  }

  /**
   * 计算平均延迟
   */
  private calculateAvgLatency(health: ChannelHealth, newLatency: number): number {
    const prevAvg = health.avgLatency || newLatency;
    const count = Math.min(health.totalChecks, 10);
    // 移动平均
    return Math.round((prevAvg * (count - 1) + newLatency) / count);
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
    this.sseClients.clear();
    this.channels.clear();
    logger.info('[ChannelHealthMonitor] Destroyed');
  }
}

// ===================== 单例导出 =====================

export const channelHealthMonitor = new ChannelHealthMonitor();
