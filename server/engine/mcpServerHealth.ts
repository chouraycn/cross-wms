/**
 * MCP Server Health Check — MCP Server 状态监控和自动重连
 *
 * 监控 MCP Server 的健康状态：
 * 1. 定期心跳检测（ping/pong）
 * 2. 连接状态监控
 * 3. 自动重连机制（指数退避）
 * 4. 健康状态广播
 * 5. 故障恢复通知
 *
 * v11.1: 新增 MCP Server 健康检查
 */

import { logger } from '../logger.js';
import { mcpClientManager } from './mcpClientManager.js';
import type { McpServerState } from './mcpTypes.js';

// ===================== 类型定义 =====================

export interface McpServerHealth {
  serverId: string;
  serverName: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disconnected';
  lastCheckAt: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  consecutiveFailures: number;
  totalChecks: number;
  successCount: number;
  failureCount: number;
  uptime: number; // 百分比
  avgResponseTimeMs: number;
  lastError?: string;
  reconnectAttempts: number;
  nextReconnectAt?: number;
}

export interface HealthCheckConfig {
  intervalMs: number;
  timeoutMs: number;
  unhealthyThreshold: number;
  degradedThreshold: number;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
}

type HealthListener = (health: McpServerHealth) => void;

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: HealthCheckConfig = {
  intervalMs: 30000, // 30 秒
  timeoutMs: 5000, // 5 秒
  unhealthyThreshold: 3, // 连续失败 3 次
  degradedThreshold: 1, // 连续失败 1 次
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectBaseDelayMs: 5000, // 5 秒
  reconnectMaxDelayMs: 60000, // 1 分钟
};

// ===================== 状态 =====================

class McpServerHealthManager {
  private config: HealthCheckConfig = DEFAULT_CONFIG;
  private healthData: Map<string, McpServerHealth> = new Map();
  private listeners: Set<HealthListener> = new Set();
  private checkTimer?: ReturnType<typeof setInterval>;
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private responseTimes: Map<string, number[]> = new Map();

  /**
   * 启动健康检查
   */
  start(): void {
    if (this.checkTimer) return;

    // 立即执行一次
    this.checkAllServers();

    // 定时检查
    this.checkTimer = setInterval(() => {
      this.checkAllServers();
    }, this.config.intervalMs);

    logger.info('[McpHealth] Health check started');
  }

  /**
   * 停止健康检查
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }

    // 清除所有重连定时器
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    logger.info('[McpHealth] Health check stopped');
  }

  /**
   * 检查所有 MCP Server
   */
  private async checkAllServers(): Promise<void> {
    const serverStates = mcpClientManager.getServerStates();

    for (const state of serverStates) {
      if (!state.config.enabled) continue;
      await this.checkServer(state);
    }
  }

  /**
   * 检查单个 Server
   */
  private async checkServer(state: McpServerState): Promise<void> {
    const { id, name } = state.config;
    const now = Date.now();

    // 获取或初始化健康数据
    let health = this.healthData.get(id);
    if (!health) {
      health = {
        serverId: id,
        serverName: name,
        status: 'disconnected',
        lastCheckAt: now,
        consecutiveFailures: 0,
        totalChecks: 0,
        successCount: 0,
        failureCount: 0,
        uptime: 100,
        avgResponseTimeMs: 0,
        reconnectAttempts: 0,
      };
      this.healthData.set(id, health);
    }

    health.lastCheckAt = now;
    health.totalChecks++;

    // 执行健康检查
    const startTime = Date.now();
    let success = false;
    let errorMessage: string | undefined;

    try {
      if (state.connectionState === 'connected') {
        // 真实健康检查：通过 pingServer（listTools 真实调用）验证连接可用性
        // 超时时间内未返回则视为失败
        const pingResult = await Promise.race([
          mcpClientManager.pingServer(id),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), this.config.timeoutMs),
          ),
        ]);
        if (pingResult) {
          success = true;
        } else {
          errorMessage = 'Health check ping failed or timed out';
        }
      } else {
        errorMessage = `Server not connected: ${state.connectionState}`;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const responseTime = Date.now() - startTime;
    this.recordResponseTime(id, responseTime);
    health.avgResponseTimeMs = this.calculateAvgResponseTime(id);

    // 更新健康数据
    if (success) {
      health.successCount++;
      health.lastSuccessAt = now;
      health.consecutiveFailures = 0;
      health.reconnectAttempts = 0;

      // 更新状态
      if (health.status !== 'healthy') {
        logger.info(`[McpHealth] Server recovered: ${name}`);
        // 清除重连定时器
        this.clearReconnectTimer(id);
      }
      health.status = 'healthy';
    } else {
      health.failureCount++;
      health.lastFailureAt = now;
      health.consecutiveFailures++;
      health.lastError = errorMessage;

      // 更新状态
      if (health.consecutiveFailures >= this.config.unhealthyThreshold) {
        health.status = 'unhealthy';
      } else if (health.consecutiveFailures >= this.config.degradedThreshold) {
        health.status = 'degraded';
      } else if (state.connectionState === 'disconnected' || state.connectionState === 'error') {
        health.status = 'disconnected';
      }

      logger.warn(
        `[McpHealth] Health check failed: ${name}, ` +
        `status=${health.status}, ` +
        `failures=${health.consecutiveFailures}, ` +
        `error=${errorMessage}`
      );

      // 触发自动重连
      if (this.config.autoReconnect && health.status === 'unhealthy') {
        this.scheduleReconnect(state.config.id);
      }
    }

    // 计算可用性
    health.uptime = health.totalChecks > 0
      ? Math.round((health.successCount / health.totalChecks) * 100)
      : 100;

    // 广播健康状态
    this.notifyListeners(health);
  }

  /**
   * 记录响应时间
   */
  private recordResponseTime(serverId: string, timeMs: number): void {
    let times = this.responseTimes.get(serverId) || [];
    times.push(timeMs);
    // 只保留最近 10 次
    times = times.slice(-10);
    this.responseTimes.set(serverId, times);
  }

  /**
   * 计算平均响应时间
   */
  private calculateAvgResponseTime(serverId: string): number {
    const times = this.responseTimes.get(serverId) || [];
    if (times.length === 0) return 0;
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  }

  /**
   * 安排重连
   * v11.1: 达到 maxReconnectAttempts 后不永久放弃，改为降频重试（每 10 分钟一次）
   *        防止服务器短暂故障后永久卡死
   */
  private scheduleReconnect(serverId: string): void {
    const health = this.healthData.get(serverId);
    if (!health) return;

    // 清除已有的重连定时器
    this.clearReconnectTimer(serverId);

    let delay: number;
    if (health.reconnectAttempts < this.config.maxReconnectAttempts) {
      // 正常指数退避阶段
      delay = Math.min(
        this.config.reconnectBaseDelayMs * Math.pow(2, health.reconnectAttempts),
        this.config.reconnectMaxDelayMs
      );
    } else {
      // 降频重试阶段：固定 10 分钟一次，不放弃
      delay = 10 * 60 * 1000;
    }

    health.reconnectAttempts++;
    health.nextReconnectAt = Date.now() + delay;

    if (health.reconnectAttempts <= this.config.maxReconnectAttempts) {
      logger.info(
        `[McpHealth] Scheduling reconnect for ${health.serverName}: ` +
        `attempt=${health.reconnectAttempts}/${this.config.maxReconnectAttempts}, ` +
        `delay=${delay}ms`
      );
    } else if (health.reconnectAttempts === this.config.maxReconnectAttempts + 1) {
      logger.warn(
        `[McpHealth] Max reconnect attempts reached for ${health.serverName}, ` +
        `switching to low-frequency retry (every 10min)`
      );
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(serverId);
      try {
        await mcpClientManager.reconnectServer(serverId);
      } catch (error) {
        logger.error(`[McpHealth] Reconnect failed for ${health.serverName}:`, error);
      }
    }, delay);

    this.reconnectTimers.set(serverId, timer);
  }

  /**
   * 清除重连定时器
   */
  private clearReconnectTimer(serverId: string): void {
    const timer = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }
  }

  /**
   * 获取 Server 健康状态
   */
  getHealth(serverId: string): McpServerHealth | undefined {
    return this.healthData.get(serverId);
  }

  /**
   * 获取所有 Server 健康状态
   */
  getAllHealth(): McpServerHealth[] {
    return Array.from(this.healthData.values());
  }

  /**
   * 添加健康监听器
   */
  addListener(listener: HealthListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除健康监听器
   */
  removeListener(listener: HealthListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 通知监听器
   */
  private notifyListeners(health: McpServerHealth): void {
    for (const listener of this.listeners) {
      try {
        listener(health);
      } catch (error) {
        logger.error('[McpHealth] Listener error:', error);
      }
    }
  }

  /**
   * 强制重连
   */
  async forceReconnect(serverId: string): Promise<void> {
    this.clearReconnectTimer(serverId);
    const health = this.healthData.get(serverId);
    if (health) {
      health.reconnectAttempts = 0;
    }
    await mcpClientManager.reconnectServer(serverId);
  }

  /**
   * 生成健康报告
   */
  generateReport(): string {
    const allHealth = this.getAllHealth();
    if (allHealth.length === 0) {
      return 'No MCP servers configured.';
    }

    const lines: string[] = [
      '# MCP Server Health Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      `Total servers: ${allHealth.length}`,
      '',
    ];

    const statusOrder = { unhealthy: 0, degraded: 1, disconnected: 2, healthy: 3 };
    const sorted = allHealth.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    for (const health of sorted) {
      lines.push(`## ${health.serverName} (${health.serverId})`);
      lines.push(`- Status: **${health.status.toUpperCase()}**`);
      lines.push(`- Uptime: ${health.uptime}%`);
      lines.push(`- Checks: ${health.totalChecks} (success: ${health.successCount}, failure: ${health.failureCount})`);
      lines.push(`- Avg Response: ${health.avgResponseTimeMs}ms`);
      lines.push(`- Consecutive Failures: ${health.consecutiveFailures}`);
      
      if (health.lastError) {
        lines.push(`- Last Error: ${health.lastError.slice(0, 100)}`);
      }
      
      if (health.nextReconnectAt) {
        lines.push(`- Next Reconnect: ${new Date(health.nextReconnectAt).toISOString()}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ===================== 导出 =====================

export const mcpServerHealth = new McpServerHealthManager();

/**
 * 启动 MCP Server 健康检查
 */
export function startMcpHealthCheck(): void {
  mcpServerHealth.start();
}

/**
 * 停止 MCP Server 健康检查
 */
export function stopMcpHealthCheck(): void {
  mcpServerHealth.stop();
}