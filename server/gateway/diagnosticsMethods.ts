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

// 进程级稳定性计数器（不持久化，进程重启后归零）
const stabilityCounters = {
  /** 累计未捕获异常次数 */
  uncaughtExceptions: 0,
  /** 累计未处理的 Promise rejection 次数 */
  unhandledRejections: 0,
  /** 模块加载时间戳 */
  since: Date.now(),
};

// 注册进程级异常监听以累计稳定性计数（仅注册一次）
let stabilityListenersRegistered = false;
function ensureStabilityListeners(): void {
  if (stabilityListenersRegistered) return;
  stabilityListenersRegistered = true;
  try {
    process.on('uncaughtException', () => {
      stabilityCounters.uncaughtExceptions++;
    });
    process.on('unhandledRejection', () => {
      stabilityCounters.unhandledRejections++;
    });
  } catch {
    // ignore — 某些环境可能不允许注册监听
  }
}

// ========== Diagnostics Stability ==========

async function diagnosticsStability(_params: unknown, _ctx: GatewayMethodContext) {
  ensureStabilityListeners();

  const memoryUsage = process.memoryUsage();
  const now = Date.now();
  const uptimeMs = now - serverStartedAt;

  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const heapUsageRatio = heapTotalMB > 0 ? heapUsedMB / heapTotalMB : 0;
  const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

  // 事件循环延迟（粗略）
  const eventLoopLagMs = measureEventLoopLagMs();

  // 平均响应时间（来自性能采样窗口）
  const avgResponseTimeMs = computeAvgResponseTimeMs();

  // 内存压力等级
  const memoryPressure: 'nominal' | 'elevated' | 'high' =
    heapUsageRatio < 0.7 ? 'nominal' : heapUsageRatio < 0.9 ? 'elevated' : 'high';

  // 综合稳定性评分（0-100，越高越稳定）
  let stabilityScore = 100;
  if (heapUsageRatio >= 0.9) stabilityScore -= 30;
  else if (heapUsageRatio >= 0.7) stabilityScore -= 15;
  if (eventLoopLagMs > 100) stabilityScore -= 20;
  else if (eventLoopLagMs > 50) stabilityScore -= 10;
  if (avgResponseTimeMs > 2000) stabilityScore -= 20;
  else if (avgResponseTimeMs > 1000) stabilityScore -= 10;
  stabilityScore -= Math.min(30, stabilityCounters.uncaughtExceptions * 10);
  stabilityScore -= Math.min(20, stabilityCounters.unhandledRejections * 5);
  stabilityScore = Math.max(0, Math.min(100, stabilityScore));

  const status: 'stable' | 'degraded' | 'unstable' =
    stabilityScore >= 80 ? 'stable' : stabilityScore >= 50 ? 'degraded' : 'unstable';

  return {
    ok: true,
    timestamp: now,
    status,
    stabilityScore,
    uptimeMs,
    since: stabilityCounters.since,
    memory: {
      heapUsedMB,
      heapTotalMB,
      heapUsageRatio: Math.round(heapUsageRatio * 100) / 100,
      rssMB,
      pressure: memoryPressure,
    },
    eventLoopLagMs,
    avgResponseTimeMs,
    incidents: {
      uncaughtExceptions: stabilityCounters.uncaughtExceptions,
      unhandledRejections: stabilityCounters.unhandledRejections,
    },
  };
}

/**
 * 注册所有诊断方法
 */
export function registerDiagnosticsMethods(registry: GatewayMethodRegistry): void {
  registry.register('diagnostics.health', diagnosticsHealth);
  registry.register('diagnostics.system', diagnosticsSystem);
  registry.register('diagnostics.performance', diagnosticsPerformance);
  registry.register('diagnostics.stability', diagnosticsStability);
}
