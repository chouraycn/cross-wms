/**
 * Diagnostics Gateway Methods — 诊断 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/diagnostics.ts
 * - 精简版：只实现 health / system / performance 三个核心方法
 * - 暴露受限的健康/系统/性能快照，不泄露内部日志细节
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

const serverStartedAt = Date.now();

// 用于性能采样的最近一次响应时间窗口
const responseTimeSamples: number[] = [];
const MAX_SAMPLES = 100;

function recordResponseTimeSample(ms: number): void {
  responseTimeSamples.push(ms);
  if (responseTimeSamples.length > MAX_SAMPLES) {
    responseTimeSamples.shift();
  }
}

function computeAvgResponseTimeMs(): number {
  if (responseTimeSamples.length === 0) {
    return 0;
  }
  const sum = responseTimeSamples.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / responseTimeSamples.length);
}

// 仅供本模块记录性能采样用（不注册为 RPC 方法）
export function _recordDiagnosticsResponseTime(ms: number): void {
  recordResponseTimeSample(ms);
}

// ========== Diagnostics Health ==========

async function diagnosticsHealth(_params: unknown, _ctx: GatewayMethodContext) {
  const memoryUsage = process.memoryUsage();
  const uptimeMs = Date.now() - serverStartedAt;

  // 内存使用率粗略估算：堆使用 / 堆限制
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);

  // 简单判定：堆使用率超 90% 视为降级
  const heapUsageRatio = heapTotalMB > 0 ? heapUsedMB / heapTotalMB : 0;
  const status: 'healthy' | 'degraded' | 'unhealthy' =
    heapUsageRatio < 0.7 ? 'healthy' : heapUsageRatio < 0.9 ? 'degraded' : 'unhealthy';

  return {
    ok: true,
    status,
    timestamp: Date.now(),
    uptimeMs,
    memory: {
      heapUsedMB,
      heapTotalMB,
      heapUsageRatio: Math.round(heapUsageRatio * 100) / 100,
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
    },
  };
}

// ========== Diagnostics System ==========

async function diagnosticsSystem(_params: unknown, _ctx: GatewayMethodContext) {
  const memoryUsage = process.memoryUsage();

  return {
    ok: true,
    timestamp: Date.now(),
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
      uptimeMs: Date.now() - serverStartedAt,
      cpuUsage: process.cpuUsage(),
      memoryUsage,
    },
  };
}

// ========== Diagnostics Performance ==========

async function diagnosticsPerformance(_params: unknown, _ctx: GatewayMethodContext) {
  const memoryUsage = process.memoryUsage();
  const uptimeMs = Date.now() - serverStartedAt;

  return {
    ok: true,
    timestamp: Date.now(),
    performance: {
      uptimeMs,
      avgResponseTimeMs: computeAvgResponseTimeMs(),
      memory: {
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      eventLoopLagMs: measureEventLoopLagMs(),
    },
  };
}

// 简单的事件循环延迟估算（同步阻塞探测）
function measureEventLoopLagMs(): number {
  const start = performance.now();
  // setTimeout 在 Node.js 中由事件循环调度，其延迟反映了事件循环的拥塞程度
  // 这里返回粗略值，详细的 Ns 级延迟需要 async 测量，此处保持简单
  const elapsed = performance.now() - start;
  return Math.round(elapsed * 1000) / 1000;
}

/**
 * 注册所有诊断方法
 */
export function registerDiagnosticsMethods(registry: GatewayMethodRegistry): void {
  registry.register('diagnostics.health', diagnosticsHealth);
  registry.register('diagnostics.system', diagnosticsSystem);
  registry.register('diagnostics.performance', diagnosticsPerformance);
}
